import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createApp } from "../server.mjs";
import { isPublicIp, assertSafeUrl } from "../ssrf.mjs";

const PASS = "correct horse battery staple 42";
const salt = crypto.randomBytes(16);
const HASH = `scrypt$16384$8$1$${salt.toString("hex")}$${crypto.scryptSync(PASS, salt, 32, { N: 16384, r: 8, p: 1 }).toString("hex")}`;
const ORIGIN = "https://admin.example";
const UPSTREAM_SECRET = "upstream-secret-" + crypto.randomBytes(6).toString("hex");

const listen = (srv) => new Promise((r) => srv.listen(0, "127.0.0.1", () => r(srv.address().port)));

// mock provider: behaviour chosen by the requested model name; records the credentials it receives
const seen = [];
let trapHits = 0;
const trap = http.createServer((_q, s) => { trapHits++; s.end("trap"); });
const upstream = http.createServer((req, res) => {
  let b = "";
  req.on("data", (c) => (b += c));
  req.on("end", () => {
    const j = JSON.parse(b || "{}");
    seen.push({ model: j.model, auth: req.headers.authorization });
    if (j.model === "e401") return res.writeHead(401).end("{}");
    if (j.model === "e429") return res.writeHead(429).end("{}");
    if (j.model === "e500") return res.writeHead(500).end("{}");
    if (j.model === "redirect") return res.writeHead(302, { location: `http://127.0.0.1:${trap.address().port}/x` }).end();
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ choices: [{ message: { role: "assistant", content: `OK from ${j.model}` } }] }));
  });
});

let base, app, dir, upPort;
const call = async (method, p, body, headers = {}) => {
  const r = await fetch(base + p, { method, headers: { "content-type": "application/json", ...headers }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: r.status, json, headers: r.headers };
};
async function boot(extraEnv = {}, d = dir) {
  const srv = createApp({ dataDir: d, env: { ADMIN_PASSPHRASE_HASH: HASH, ALLOWED_ORIGINS: ORIGIN, ALLOW_PRIVATE_UPSTREAMS: "1", ...extraEnv } });
  const port = await listen(srv);
  base = `http://127.0.0.1:${port}`;
  return srv;
}
const login = async () => (await call("POST", "/admin/login", { passphrase: PASS }, { origin: ORIGIN })).json.token;
const adm = (t) => ({ authorization: `Bearer ${t}`, origin: ORIGIN });

test.before(async () => {
  upPort = await listen(upstream);
  await listen(trap);
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "apex-"));
  app = await boot();
});
test.after(() => { app.close(); upstream.close(); trap.close(); });

test("admin login is passphrase-only: a missing hash disables it, wrong passphrases fail, an Apex key is not a passphrase", async () => {
  const d2 = fs.mkdtempSync(path.join(os.tmpdir(), "apex-nohash-"));
  const bare = createApp({ dataDir: d2, env: { ADMIN_PASSPHRASE_HASH: "", ALLOW_PRIVATE_UPSTREAMS: "1" } });
  const p = await listen(bare);
  const r = await fetch(`http://127.0.0.1:${p}/admin/login`, { method: "POST", body: JSON.stringify({ passphrase: "apex-admin-2025" }) });
  assert.equal(r.status, 503); // no built-in default passphrase exists
  bare.close();
  assert.equal((await call("POST", "/admin/login", { passphrase: "apex-admin-2025" })).status, 401);
  assert.equal((await call("POST", "/admin/login", { passphrase: "APEX-PRO-2025" })).status, 401);
  assert.equal((await call("POST", "/admin/login", { passphrase: PASS })).status, 200);
});

test("rate limiting locks the client after repeated failures, even for the right passphrase", async () => {
  const d2 = fs.mkdtempSync(path.join(os.tmpdir(), "apex-rl-"));
  const s = createApp({ dataDir: d2, env: { ADMIN_PASSPHRASE_HASH: HASH, MAX_LOGIN_FAILS: "3", LOGIN_LOCK_MS: "60000" } });
  const p = await listen(s);
  const post = (pw) => fetch(`http://127.0.0.1:${p}/admin/login`, { method: "POST", body: JSON.stringify({ passphrase: pw }) });
  for (let i = 0; i < 3; i++) assert.equal((await post("nope" + i)).status, 401);
  assert.equal((await post(PASS)).status, 429);
  s.close();
});

test("sessions are short-lived and cross-origin admin calls are refused", async () => {
  const d2 = fs.mkdtempSync(path.join(os.tmpdir(), "apex-ttl-"));
  const s = createApp({ dataDir: d2, env: { ADMIN_PASSPHRASE_HASH: HASH, SESSION_TTL_MIN: "0.0005", ALLOWED_ORIGINS: ORIGIN } });
  const p = await listen(s);
  const r = await fetch(`http://127.0.0.1:${p}/admin/login`, { method: "POST", body: JSON.stringify({ passphrase: PASS }) });
  const { token } = await r.json();
  assert.equal((await fetch(`http://127.0.0.1:${p}/admin/state`, { headers: { authorization: `Bearer ${token}` } })).status, 200);
  await new Promise((r2) => setTimeout(r2, 120));
  assert.equal((await fetch(`http://127.0.0.1:${p}/admin/state`, { headers: { authorization: `Bearer ${token}` } })).status, 401);
  assert.equal((await fetch(`http://127.0.0.1:${p}/admin/state`, { headers: { origin: "https://evil.example" } })).status, 403);
  s.close();
  assert.equal((await call("GET", "/admin/state", null, { origin: "https://evil.example" })).status, 403);
  assert.equal((await call("GET", "/admin/state")).status, 401);
});

let T, KEY, KEY_ID, PROV, M1;
test("provider + model: new models start disabled, health test reports a real Working state with latency", async () => {
  T = await login();
  PROV = (await call("POST", "/admin/providers", { name: "Mock", baseUrl: `http://127.0.0.1:${upPort}/v1`, credential: UPSTREAM_SECRET }, adm(T))).json;
  assert.ok(PROV.id);
  assert.equal(PROV.hasCredential, true);
  assert.equal(JSON.stringify((await call("GET", "/admin/state", null, adm(T))).json).includes(UPSTREAM_SECRET), false, "provider credential must never be returned");
  M1 = (await call("POST", "/admin/models", { displayName: "Mock One", upstreamId: "ok", providerId: PROV.id, category: "chat" }, adm(T))).json;
  assert.equal(M1.enabled, false);
  assert.equal(M1.health.state, "untested");
  const h = (await call("POST", `/admin/models/${M1.id}/test`, null, adm(T))).json;
  assert.equal(h.state, "working");
  assert.ok(typeof h.latencyMs === "number" && h.testedAt);
  assert.ok(seen.some((s) => s.model === "ok" && s.auth === `Bearer ${UPSTREAM_SECRET}`));
});

test("health states are accurate: auth required, rate limited, failed, redirect refused (and not followed)", async () => {
  const mk = async (up) => (await call("POST", "/admin/models", { displayName: up, upstreamId: up, providerId: PROV.id }, adm(T))).json;
  const expect = { e401: "auth_required", e429: "rate_limited", e500: "failed", redirect: "failed" };
  for (const [up, st] of Object.entries(expect)) {
    const m = await mk(up);
    assert.equal((await call("POST", `/admin/models/${m.id}/test`, null, adm(T))).json.state, st, up);
  }
  assert.equal(trapHits, 0, "redirect target must never be contacted");
});

test("batch tests are bounded", async () => {
  const d2 = fs.mkdtempSync(path.join(os.tmpdir(), "apex-batch-"));
  const s = createApp({ dataDir: d2, env: { ADMIN_PASSPHRASE_HASH: HASH, ALLOW_PRIVATE_UPSTREAMS: "1", BATCH_MAX: "2" } });
  const p = await listen(s);
  const c = async (m, pth, b, t) => (await fetch(`http://127.0.0.1:${p}${pth}`, { method: m, headers: t ? { authorization: `Bearer ${t}` } : {}, body: b ? JSON.stringify(b) : undefined })).json();
  const { token } = await c("POST", "/admin/login", { passphrase: PASS });
  const pr = await c("POST", "/admin/providers", { name: "m", baseUrl: `http://127.0.0.1:${upPort}/v1` }, token);
  for (let i = 0; i < 4; i++) await c("POST", "/admin/models", { displayName: "m" + i, upstreamId: "ok", providerId: pr.id }, token);
  const r = await c("POST", "/admin/models/test-batch", {}, token);
  assert.equal(r.tested, 2);
  assert.equal(r.capped, true);
  s.close();
});

test("key lifecycle: disabled model is unusable; enable -> works; rotate -> old key 401 immediately, after reload, and new key works", async () => {
  const created = (await call("POST", "/admin/keys", { label: "Phone" }, adm(T))).json;
  KEY = created.secret; KEY_ID = created.id;
  assert.match(KEY, /^sk-apex-/);
  assert.equal(JSON.stringify((await call("GET", "/admin/state", null, adm(T))).json).includes(KEY), false, "list must be masked");
  const chat = (k, model = M1.id) => call("POST", "/v1/chat/completions", { model, messages: [{ role: "user", content: "hi" }] }, { authorization: `Bearer ${k}` });
  // model still disabled: not listed, not callable through the managed API
  assert.equal((await call("GET", "/v1/models", null, { authorization: `Bearer ${KEY}` })).json.data.length, 0);
  assert.equal((await chat(KEY)).status, 404);
  await call("PATCH", `/admin/models/${M1.id}`, { enabled: true, displayName: "Renamed One" }, adm(T));
  const list = (await call("GET", "/v1/models", null, { authorization: `Bearer ${KEY}` })).json;
  assert.deepEqual(list.data.map((m) => m.label), ["Renamed One"]);
  const ok = await chat(KEY);
  assert.equal(ok.status, 200);
  assert.match(JSON.stringify(ok.json), /OK from ok/);

  const rotated = (await call("POST", `/admin/keys/${KEY_ID}/rotate`, null, adm(T))).json;
  assert.notEqual(rotated.secret, KEY);
  assert.equal((await chat(KEY)).status, 401, "old key must be rejected right after rotation");
  assert.equal((await chat(rotated.secret)).status, 200, "new key works");
  assert.equal((await call("GET", "/v1/models", null, { authorization: `Bearer ${KEY}` })).status, 401);

  // "another device / after reload": a brand-new server process over the same data directory
  app.close();
  app = await boot();
  assert.equal((await chat(KEY)).status, 401, "old key still rejected after reload");
  assert.equal((await chat(rotated.secret)).status, 200, "new key still works after reload");
  const old = KEY; KEY = rotated.secret;

  // reveal needs the passphrase again
  T = await login();
  assert.equal((await call("POST", `/admin/keys/${KEY_ID}/reveal`, { passphrase: "wrong" }, adm(T))).status, 401);
  assert.equal((await call("POST", `/admin/keys/${KEY_ID}/reveal`, { passphrase: PASS }, adm(T))).json.secret, KEY);
  assert.notEqual(old, KEY);

  // revoke, then restore, then disable model
  await call("PATCH", `/admin/keys/${KEY_ID}`, { status: "revoked" }, adm(T));
  assert.equal((await chat(KEY)).status, 401);
  await call("PATCH", `/admin/keys/${KEY_ID}`, { status: "active" }, adm(T));
  assert.equal((await chat(KEY)).status, 200);
  await call("PATCH", `/admin/models/${M1.id}`, { enabled: false }, adm(T));
  assert.equal((await chat(KEY)).status, 404, "disabling a model blocks it in the managed API");
  assert.equal((await call("GET", "/v1/models", null, { authorization: `Bearer ${KEY}` })).json.data.length, 0);
  await call("PATCH", `/admin/models/${M1.id}`, { enabled: true }, adm(T));
});

test("fallbacks: only the same model; used only when the primary fails and the backup is verified Working", async () => {
  const prov2 = (await call("POST", "/admin/providers", { name: "Backup", baseUrl: `http://127.0.0.1:${upPort}/v1` }, adm(T))).json;
  const primary = (await call("POST", "/admin/models", { displayName: "Flaky", upstreamId: "e500", providerId: PROV.id, enabled: true }, adm(T))).json;
  const other = (await call("POST", "/admin/models", { displayName: "Different", upstreamId: "ok", providerId: prov2.id, enabled: true }, adm(T))).json;
  const bad = await call("PATCH", `/admin/models/${primary.id}`, { fallbacks: [other.id] }, adm(T));
  assert.equal(bad.status, 400, "a different model may not be a fallback");
  // same model id on another route (named "e500" upstream here would also fail, so use a model that flips): create a twin
  const twin = (await call("POST", "/admin/models", { displayName: "Twin", upstreamId: "e500", providerId: prov2.id, enabled: true }, adm(T))).json;
  assert.equal((await call("PATCH", `/admin/models/${primary.id}`, { fallbacks: [twin.id] }, adm(T))).status, 200);
  const r = await call("POST", "/v1/chat/completions", { model: primary.id, messages: [] }, { authorization: `Bearer ${KEY}` });
  assert.equal(r.status, 502, "twin is untested/failing so it is not used and the error is honest");
});

test("SSRF: private, loopback, metadata, non-https, credentialed and odd-port endpoints are rejected (guard ON)", async () => {
  const d2 = fs.mkdtempSync(path.join(os.tmpdir(), "apex-ssrf-"));
  const s = createApp({ dataDir: d2, env: { ADMIN_PASSPHRASE_HASH: HASH, ALLOW_PRIVATE_UPSTREAMS: "0" } });
  const p = await listen(s);
  const c = async (m, pth, b, t) => { const r = await fetch(`http://127.0.0.1:${p}${pth}`, { method: m, headers: t ? { authorization: `Bearer ${t}` } : {}, body: b ? JSON.stringify(b) : undefined }); return { status: r.status, json: await r.json() }; };
  const { json: { token } } = await c("POST", "/admin/login", { passphrase: PASS });
  const bad = ["http://example.com/v1", "https://127.0.0.1/v1", "https://localhost/v1", "https://169.254.169.254/latest/meta-data", "https://10.0.0.5/v1", "https://192.168.1.1/v1", "https://[::1]/v1", "https://[::ffff:127.0.0.1]/v1", "https://user:pw@8.8.8.8/v1", "https://8.8.8.8:8443/v1", "https://100.64.0.1/v1", "ftp://8.8.8.8/v1", "not a url"];
  for (const u of bad) assert.equal((await c("POST", "/admin/providers", { name: "x", baseUrl: u }, token)).status, 400, u);
  assert.equal((await c("POST", "/admin/providers", { name: "ok", baseUrl: "https://8.8.8.8/v1" }, token)).status, 201);
  s.close();
});

test("IP classifier", () => {
  for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.0.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "::1", "fd00::1", "fe80::1", "::ffff:10.0.0.1"]) assert.equal(isPublicIp(ip), false, ip);
  for (const ip of ["8.8.8.8", "1.1.1.1", "172.32.0.1", "2606:4700:4700::1111"]) assert.equal(isPublicIp(ip), true, ip);
});
test("assertSafeUrl rejects hostnames resolving to loopback", async () => {
  const prev = process.env.ALLOW_PRIVATE_UPSTREAMS; delete process.env.ALLOW_PRIVATE_UPSTREAMS;
  await assert.rejects(() => assertSafeUrl("https://localhost/v1"));
  if (prev) process.env.ALLOW_PRIVATE_UPSTREAMS = prev;
});
