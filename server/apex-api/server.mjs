// Apex managed API + admin backend. Zero dependencies (Node >= 20).
//
//  * Admin login is PASSPHRASE-ONLY: verified with scrypt against ADMIN_PASSPHRASE_HASH (env, never in the repo or any client
//    file). No default passphrase exists: without the env var, login is disabled (503). Failed logins are rate-limited per IP.
//    A successful login returns a short-lived random session token (kept in memory) that the page sends as a Bearer header.
//    No cookies => no ambient credentials => classic CSRF does not apply; an Origin allow-list additionally blocks other sites.
//  * Apex API keys are validated on EVERY /v1 request against this server's own store. There is no client-side or cached
//    validation path: a rotated/revoked key is rejected on the very next request, from any device.
//  * Provider credentials stay on the server (AES-256-GCM at rest under DATA_KEY) and are only sent to their validated host.
import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { assertSafeUrl, safeRequest } from "./ssrf.mjs";

export function createApp(opts = {}) {
  const env = { ...process.env, ...opts.env };
  const DATA_DIR = opts.dataDir ?? env.DATA_DIR ?? path.resolve("data");
  fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
  const ORIGINS = (env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const SESSION_TTL = Number(env.SESSION_TTL_MIN ?? 20) * 60_000;
  const HASH = env.ADMIN_PASSPHRASE_HASH ?? "";
  const ALLOW_PRIVATE = env.ALLOW_PRIVATE_UPSTREAMS === "1"; // tests only; never set in production

  /* ───── secrets at rest ───── */
  const keyFile = path.join(DATA_DIR, ".data-key");
  let dataKey;
  if (env.DATA_KEY) dataKey = crypto.createHash("sha256").update(env.DATA_KEY).digest();
  else if (fs.existsSync(keyFile)) dataKey = Buffer.from(fs.readFileSync(keyFile, "utf8"), "hex");
  else {
    dataKey = crypto.randomBytes(32);
    fs.writeFileSync(keyFile, dataKey.toString("hex"), { mode: 0o600 });
  }
  const seal = (txt) => {
    const iv = crypto.randomBytes(12);
    const c = crypto.createCipheriv("aes-256-gcm", dataKey, iv);
    const ct = Buffer.concat([c.update(txt, "utf8"), c.final()]);
    return Buffer.concat([iv, c.getAuthTag(), ct]).toString("base64");
  };
  const unseal = (b64) => {
    const b = Buffer.from(b64, "base64");
    const d = crypto.createDecipheriv("aes-256-gcm", dataKey, b.subarray(0, 12));
    d.setAuthTag(b.subarray(12, 28));
    return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString("utf8");
  };

  /* ───── store ───── */
  const dbFile = path.join(DATA_DIR, "db.json");
  let db = { enabled: true, keys: [], providers: [], models: [] };
  if (fs.existsSync(dbFile)) db = { ...db, ...JSON.parse(fs.readFileSync(dbFile, "utf8")) };
  const save = () => {
    const tmp = dbFile + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(db), { mode: 0o600 });
    fs.renameSync(tmp, dbFile);
  };
  const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");
  const newId = (p) => `${p}_${crypto.randomBytes(5).toString("hex")}`;
  const newKey = () => "sk-apex-" + crypto.randomBytes(30).toString("base64url");
  const mask = (k) => `sk-apex-••••${k.slice(-4)}`;
  const tsEq = (a, b) => {
    const x = Buffer.from(a), y = Buffer.from(b);
    return x.length === y.length && crypto.timingSafeEqual(x, y);
  };

  /* ───── admin auth ───── */
  function verifyPassphrase(pass) {
    const m = /^scrypt\$(\d+)\$(\d+)\$(\d+)\$([0-9a-f]+)\$([0-9a-f]+)$/.exec(HASH);
    if (!m) return false;
    const [, N, r, p, salt, hash] = m;
    const out = crypto.scryptSync(String(pass), Buffer.from(salt, "hex"), hash.length / 2, { N: +N, r: +r, p: +p, maxmem: 256 * 1024 * 1024 });
    return crypto.timingSafeEqual(out, Buffer.from(hash, "hex"));
  }
  const sessions = new Map(); // token -> { exp }
  const fails = new Map(); // ip -> { n, until }
  const MAX_FAILS = Number(env.MAX_LOGIN_FAILS ?? 5);
  const LOCK_MS = Number(env.LOGIN_LOCK_MS ?? 15 * 60_000);
  const adminOk = (req) => {
    const t = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
    const s = t && sessions.get(sha(t));
    if (!s) return false;
    if (s.exp < Date.now()) { sessions.delete(sha(t)); return false; }
    return true;
  };

  /* ───── http helpers ───── */
  const originAllowed = (o) => !o || ORIGINS.includes(o);
  function cors(req, res, admin) {
    const o = req.headers.origin;
    if (admin) {
      if (o && ORIGINS.includes(o)) res.setHeader("access-control-allow-origin", o);
    } else res.setHeader("access-control-allow-origin", "*");
    res.setHeader("vary", "origin");
    res.setHeader("access-control-allow-headers", "authorization, content-type");
    res.setHeader("access-control-allow-methods", "GET, POST, PATCH, DELETE, OPTIONS");
    res.setHeader("access-control-expose-headers", "x-apex-served-by");
    res.setHeader("cache-control", "no-store");
    res.setHeader("x-content-type-options", "nosniff");
  }
  const send = (res, code, obj) => {
    res.writeHead(code, { "content-type": "application/json" });
    res.end(JSON.stringify(obj));
  };
  const readJson = (req, limit = 2_000_000) =>
    new Promise((resolve, reject) => {
      let n = 0;
      const chunks = [];
      req.on("data", (c) => {
        n += c.length;
        if (n > limit) { reject(Object.assign(new Error("Body too large"), { code: 413 })); req.destroy(); } else chunks.push(c);
      });
      req.on("end", () => {
        try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {}); } catch { reject(Object.assign(new Error("Invalid JSON"), { code: 400 })); }
      });
    });
  const err = (code, message) => Object.assign(new Error(message), { code });

  /* ───── views ───── */
  const keyView = (k) => ({ id: k.id, label: k.label, masked: k.masked, status: k.status, createdAt: k.createdAt, rotatedAt: k.rotatedAt ?? null, expiresAt: k.expiresAt ?? null, allowedModels: k.allowedModels, lastUsedAt: k.lastUsedAt ?? null });
  const providerView = (p) => ({ id: p.id, name: p.name, baseUrl: p.baseUrl, enabled: p.enabled, hasCredential: !!p.authEnc, authHeader: p.authHeader });
  const modelView = (m) => m;
  const state = () => ({ enabled: db.enabled, keys: db.keys.map(keyView), providers: db.providers.map(providerView), models: db.models.map(modelView) });

  /* ───── model + provider validation ───── */
  const CATEGORIES = ["chat", "reasoning", "code", "vision", "image", "other"];
  const CAPS = ["text", "vision", "reasoning", "tools", "json", "image"];
  const norm = (s) => String(s).trim().toLowerCase();
  async function checkProviderInput(b, existing) {
    const out = { ...(existing ?? {}) };
    if (b.name !== undefined) out.name = String(b.name).trim().slice(0, 60);
    if (b.baseUrl !== undefined) {
      const u = String(b.baseUrl).trim().replace(/\/+$/, "");
      try { await assertSafeUrl(u, ALLOW_PRIVATE); } catch (e) { throw err(400, e.message); }
      out.baseUrl = u;
    }
    if (b.enabled !== undefined) out.enabled = !!b.enabled;
    if (b.authHeader !== undefined) {
      if (!/^(authorization|x-api-key)$/i.test(String(b.authHeader))) throw err(400, "authHeader must be Authorization or x-api-key.");
      out.authHeader = String(b.authHeader);
    }
    if (b.credential !== undefined) out.authEnc = b.credential ? seal(String(b.credential)) : "";
    if (!out.name || !out.baseUrl) throw err(400, "name and baseUrl are required.");
    out.authHeader ??= "Authorization";
    out.enabled ??= true;
    return out;
  }
  function checkModelInput(b, existing) {
    const m = { ...(existing ?? {}) };
    if (b.displayName !== undefined) m.displayName = String(b.displayName).trim().slice(0, 80);
    if (b.upstreamId !== undefined) m.upstreamId = String(b.upstreamId).trim().slice(0, 200);
    if (b.providerId !== undefined) m.providerId = b.providerId;
    if (b.category !== undefined) {
      if (!CATEGORIES.includes(b.category)) throw err(400, `category must be one of ${CATEGORIES.join(", ")}`);
      m.category = b.category;
    }
    if (b.capabilities !== undefined) {
      if (!Array.isArray(b.capabilities) || b.capabilities.some((c) => !CAPS.includes(c))) throw err(400, `capabilities must be from ${CAPS.join(", ")}`);
      m.capabilities = [...new Set(b.capabilities)];
    }
    if (b.enabled !== undefined) m.enabled = !!b.enabled;
    if (b.fallbacks !== undefined) m.fallbacks = b.fallbacks;
    if (!m.displayName || !m.upstreamId || !db.providers.some((p) => p.id === m.providerId)) throw err(400, "displayName, upstreamId and a valid providerId are required.");
    m.category ??= "chat";
    m.capabilities ??= ["text"];
    m.enabled ??= false; // new models start OFF until tested and enabled by the owner
    m.fallbacks ??= [];
    // compatible fallbacks only: the SAME upstream model and category, on a different provider route
    if (!Array.isArray(m.fallbacks)) throw err(400, "fallbacks must be an array of model ids.");
    for (const fid of m.fallbacks) {
      const f = db.models.find((x) => x.id === fid);
      if (!f || f.id === m.id) throw err(400, `Unknown fallback ${fid}.`);
      if (norm(f.upstreamId) !== norm(m.upstreamId) || f.category !== m.category) throw err(400, `Fallback ${fid} is a different model; fallbacks must serve the same model.`);
    }
    m.health ??= { state: "untested", testedAt: null, latencyMs: null, detail: "" };
    return m;
  }

  /* ───── upstream calls ───── */
  function upstreamHeaders(p) {
    const h = { "content-type": "application/json", accept: "application/json, text/event-stream" };
    if (p.authEnc) {
      const secret = unseal(p.authEnc);
      if (/^x-api-key$/i.test(p.authHeader)) h["x-api-key"] = secret;
      else h.authorization = /^bearer /i.test(secret) ? secret : `Bearer ${secret}`;
    }
    return h;
  }
  const chatUrl = (p) => (/\/chat\/completions$/.test(p.baseUrl) ? p.baseUrl : `${p.baseUrl}/chat/completions`);

  async function testModel(m) {
    const p = db.providers.find((x) => x.id === m.providerId);
    const t0 = Date.now();
    let health;
    try {
      const res = await safeRequest(chatUrl(p), { headers: upstreamHeaders(p), body: JSON.stringify({ model: m.upstreamId, max_tokens: 8, stream: false, messages: [{ role: "user", content: "Reply with the single word OK." }] }), timeoutMs: 20000, allowPrivate: ALLOW_PRIVATE });
      const chunks = [];
      for await (const c of res) { chunks.push(c); if (chunks.length > 64) break; }
      const text = Buffer.concat(chunks).toString("utf8");
      const latencyMs = Date.now() - t0;
      const code = res.statusCode;
      if (code >= 200 && code < 300) {
        let ok = false;
        try { const j = JSON.parse(text); ok = !!(j.choices?.[0]?.message || j.choices?.[0]?.text !== undefined); } catch { /* not JSON */ }
        health = ok ? { state: "working", detail: "Completion succeeded", latencyMs } : { state: "failed", detail: "Answered 2xx without a completion", latencyMs };
      } else if (code === 401 || code === 403) health = { state: "auth_required", detail: `HTTP ${code}`, latencyMs };
      else if (code === 429) health = { state: "rate_limited", detail: "HTTP 429", latencyMs };
      else health = { state: "failed", detail: code >= 300 && code < 400 ? `Redirect refused (HTTP ${code})` : `HTTP ${code}`, latencyMs };
    } catch (e) {
      health = { state: "failed", detail: String(e.message).slice(0, 120), latencyMs: Date.now() - t0 };
    }
    m.health = { ...health, testedAt: new Date().toISOString() };
    save();
    return m.health;
  }

  /* ───── managed API ───── */
  function authKey(req) {
    const t = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "").trim();
    if (!t) return { error: "Missing Apex API key.", code: 401 };
    if (!db.enabled) return { error: "Apex API is switched off by the admin.", code: 503 };
    const h = sha(t);
    const k = db.keys.find((x) => tsEq(x.hash, h));
    if (!k) return { error: "Invalid API key.", code: 401 };
    if (k.status !== "active") return { error: "This API key was revoked.", code: 401 };
    if (k.expiresAt && Date.parse(k.expiresAt) < Date.now()) return { error: "This API key has expired.", code: 401 };
    k.lastUsedAt = new Date().toISOString();
    return { key: k };
  }
  const usable = (k, m) => m.enabled && db.providers.find((p) => p.id === m.providerId)?.enabled && (k.allowedModels.includes("*") || k.allowedModels.includes(m.id));

  async function chat(req, res) {
    const a = authKey(req);
    if (a.error) return send(res, a.code, { error: { message: a.error, type: "invalid_request_error", code: "unauthorized" } });
    const body = await readJson(req);
    const m = db.models.find((x) => x.id === body.model);
    if (!m || !usable(a.key, m)) return send(res, 404, { error: { message: "Model not available.", code: "model_not_found" } });
    // Same model only: configured fallbacks that are enabled, allowed for this key AND currently verified Working.
    const chain = [m, ...m.fallbacks.map((id) => db.models.find((x) => x.id === id)).filter((f) => f && usable(a.key, f) && f.health.state === "working")];
    let last = { code: 502, msg: "No upstream answered." };
    for (const c of chain) {
      const p = db.providers.find((x) => x.id === c.providerId);
      let up;
      try {
        up = await safeRequest(chatUrl(p), { headers: upstreamHeaders(p), body: JSON.stringify({ ...body, model: c.upstreamId }), timeoutMs: Number(env.UPSTREAM_TIMEOUT_MS ?? 60000), allowPrivate: ALLOW_PRIVATE });
      } catch (e) {
        last = { code: 502, msg: "Upstream unreachable." };
        continue;
      }
      if (up.statusCode === 429 || up.statusCode >= 500 || (up.statusCode >= 300 && up.statusCode < 400)) {
        up.resume();
        last = { code: up.statusCode >= 500 || up.statusCode < 400 ? 502 : 429, msg: `Upstream answered ${up.statusCode}.` };
        continue;
      }
      res.writeHead(up.statusCode, { "content-type": up.headers["content-type"] ?? "application/json", "x-apex-served-by": c.id });
      up.pipe(res);
      res.on("close", () => up.destroy());
      return;
    }
    send(res, last.code, { error: { message: last.msg, code: "upstream_failed" } });
  }

  /* ───── router ───── */
  async function handle(req, res) {
    const url = new URL(req.url, "http://x");
    const p = url.pathname;
    const isAdmin = p.startsWith("/admin");
    cors(req, res, isAdmin);
    if (req.method === "OPTIONS") {
      if (isAdmin && !originAllowed(req.headers.origin)) return send(res, 403, { error: "Origin not allowed." });
      res.writeHead(204);
      return res.end();
    }
    if (p === "/healthz") return send(res, 200, { ok: true, adminConfigured: !!HASH });
    if (isAdmin && req.headers.origin && !originAllowed(req.headers.origin)) return send(res, 403, { error: "Origin not allowed." });

    /* public, key-authenticated */
    if (p === "/v1/models" && req.method === "GET") {
      const a = authKey(req);
      if (a.error) return send(res, a.code, { error: { message: a.error, code: "unauthorized" } });
      const data = db.models.filter((m) => usable(a.key, m)).map((m) => ({ id: m.id, object: "model", label: m.displayName, kind: m.category === "image" ? "image" : "text", category: m.category, capabilities: m.capabilities, keyLabel: a.key.label }));
      return send(res, 200, { object: "list", data, key: { label: a.key.label, masked: a.key.masked, expiresAt: a.key.expiresAt ?? null } });
    }
    if (p === "/v1/chat/completions" && req.method === "POST") return chat(req, res);

    /* admin */
    if (p === "/admin/login" && req.method === "POST") {
      if (!HASH) return send(res, 503, { error: "Admin login is not configured on this server (ADMIN_PASSPHRASE_HASH is unset)." });
      const ip = req.socket.remoteAddress ?? "?";
      const f = fails.get(ip);
      if (f && f.until > Date.now()) return send(res, 429, { error: "Too many attempts. Try again later.", retryAfterSec: Math.ceil((f.until - Date.now()) / 1000) });
      const b = await readJson(req, 4096);
      if (typeof b.passphrase === "string" && verifyPassphrase(b.passphrase)) {
        fails.delete(ip);
        const token = crypto.randomBytes(32).toString("base64url");
        const exp = Date.now() + SESSION_TTL;
        sessions.set(sha(token), { exp });
        return send(res, 200, { token, expiresAt: new Date(exp).toISOString() });
      }
      const n = (f?.n ?? 0) + 1;
      fails.set(ip, { n, until: n >= MAX_FAILS ? Date.now() + LOCK_MS : 0 });
      return send(res, 401, { error: "Wrong passphrase." });
    }
    if (isAdmin) {
      if (!adminOk(req)) return send(res, 401, { error: "Admin session missing or expired." });
      if (p === "/admin/logout") { sessions.delete(sha((req.headers.authorization ?? "").replace(/^Bearer\s+/i, ""))); return send(res, 200, { ok: true }); }
      if (p === "/admin/state" && req.method === "GET") return send(res, 200, state());
      if (p === "/admin/enabled" && req.method === "POST") { db.enabled = !!(await readJson(req)).enabled; save(); return send(res, 200, { enabled: db.enabled }); }

      /* keys */
      if (p === "/admin/keys" && req.method === "POST") {
        const b = await readJson(req);
        const key = newKey();
        const k = { id: newId("key"), label: String(b.label ?? "Untitled key").slice(0, 60), hash: sha(key), enc: seal(key), masked: mask(key), status: "active", createdAt: new Date().toISOString(), expiresAt: b.expiresAt ?? null, allowedModels: Array.isArray(b.allowedModels) && b.allowedModels.length ? b.allowedModels : ["*"] };
        db.keys.push(k); save();
        return send(res, 201, { ...keyView(k), secret: key }); // the only time it is shown without re-auth
      }
      const km = /^\/admin\/keys\/([\w-]+)(?:\/(rotate|reveal))?$/.exec(p);
      if (km) {
        const k = db.keys.find((x) => x.id === km[1]);
        if (!k) return send(res, 404, { error: "Unknown key." });
        if (km[2] === "rotate" && req.method === "POST") {
          const key = newKey();
          k.hash = sha(key); k.enc = seal(key); k.masked = mask(key); k.status = "active"; k.rotatedAt = new Date().toISOString();
          save(); // the old hash is gone: the old key is rejected from this moment on
          return send(res, 200, { ...keyView(k), secret: key });
        }
        if (km[2] === "reveal" && req.method === "POST") {
          const b = await readJson(req, 4096); // re-authentication: the passphrase again
          if (typeof b.passphrase !== "string" || !verifyPassphrase(b.passphrase)) return send(res, 401, { error: "Wrong passphrase." });
          return send(res, 200, { secret: unseal(k.enc) });
        }
        if (req.method === "PATCH") {
          const b = await readJson(req);
          if (b.label !== undefined) k.label = String(b.label).slice(0, 60);
          if (b.allowedModels !== undefined) k.allowedModels = Array.isArray(b.allowedModels) && b.allowedModels.length ? b.allowedModels : ["*"];
          if (b.expiresAt !== undefined) k.expiresAt = b.expiresAt || null;
          if (b.status !== undefined && ["active", "revoked"].includes(b.status)) k.status = b.status;
          save();
          return send(res, 200, keyView(k));
        }
        if (req.method === "DELETE") { db.keys = db.keys.filter((x) => x !== k); save(); return send(res, 200, { ok: true }); }
      }

      /* providers */
      if (p === "/admin/providers" && req.method === "POST") {
        const prov = await checkProviderInput(await readJson(req));
        prov.id = newId("prov");
        db.providers.push(prov); save();
        return send(res, 201, providerView(prov));
      }
      const pm = /^\/admin\/providers\/([\w-]+)$/.exec(p);
      if (pm) {
        const prov = db.providers.find((x) => x.id === pm[1]);
        if (!prov) return send(res, 404, { error: "Unknown provider." });
        if (req.method === "PATCH") { Object.assign(prov, await checkProviderInput(await readJson(req), prov)); save(); return send(res, 200, providerView(prov)); }
        if (req.method === "DELETE") { db.models = db.models.filter((m) => m.providerId !== prov.id); db.providers = db.providers.filter((x) => x !== prov); save(); return send(res, 200, { ok: true }); }
      }

      /* models */
      if (p === "/admin/models" && req.method === "POST") {
        const m = checkModelInput(await readJson(req));
        m.id = newId("mdl");
        db.models.push(m); save();
        return send(res, 201, modelView(m));
      }
      if (p === "/admin/models/test-batch" && req.method === "POST") {
        const b = await readJson(req);
        const max = Number(env.BATCH_MAX ?? 10);
        const ids = (Array.isArray(b.ids) && b.ids.length ? b.ids : db.models.map((m) => m.id)).slice(0, max);
        const list = ids.map((id) => db.models.find((m) => m.id === id)).filter(Boolean);
        const results = {};
        let i = 0;
        await Promise.all(Array.from({ length: Math.min(3, list.length) }, async () => { while (i < list.length) { const m = list[i++]; results[m.id] = await testModel(m); } }));
        return send(res, 200, { tested: list.length, capped: ids.length < (Array.isArray(b.ids) ? b.ids.length : db.models.length), results });
      }
      const mm = /^\/admin\/models\/([\w-]+)(?:\/(test))?$/.exec(p);
      if (mm) {
        const m = db.models.find((x) => x.id === mm[1]);
        if (!m) return send(res, 404, { error: "Unknown model." });
        if (mm[2] === "test" && req.method === "POST") return send(res, 200, await testModel(m));
        if (req.method === "PATCH") { Object.assign(m, checkModelInput(await readJson(req), m)); save(); return send(res, 200, modelView(m)); }
        if (req.method === "DELETE") { db.models = db.models.filter((x) => x !== m); db.models.forEach((x) => (x.fallbacks = x.fallbacks.filter((f) => f !== m.id))); save(); return send(res, 200, { ok: true }); }
      }
    }
    send(res, 404, { error: "Not found." });
  }

  const server = http.createServer((req, res) => {
    handle(req, res).catch((e) => {
      if (res.headersSent) return res.destroy();
      send(res, e.code >= 400 && e.code < 600 ? e.code : 500, { error: e.code ? e.message : "Internal error." });
    });
  });
  server.keepAliveTimeout = 1500;
  server.headersTimeout = 10_000;
  server.requestTimeout = 120_000;
  const sweep = setInterval(() => { const n = Date.now(); for (const [k, v] of sessions) if (v.exp < n) sessions.delete(k); }, 60_000);
  sweep.unref();
  return server;
}

if (process.argv[1] && import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href) {
  const port = Number(process.env.PORT ?? 8787);
  createApp().listen(port, () => console.log(`apex-api listening on :${port} (admin ${process.env.ADMIN_PASSPHRASE_HASH ? "configured" : "NOT configured"})`));
}
