#!/usr/bin/env node
/**
 * Live completion probe for every featured flagship + every Free Cloud model.
 *
 * Reads the bundled gateway catalog (zeusdesigns import) plus the keyless gateways found in NikitHamal/stormy, sends a REAL
 * streamed chat completion (max_tokens 64) to each candidate route, and rewrites `verified` / `ms` on the models it tested.
 * A route that does not answer is marked verified:false, so the app's failover chain and the Free tab never offer a dead relay.
 * Targets with no working route are listed in `src/data/flagship-probe.json` as "no live route" - nothing is faked.
 *
 *   node scripts/probe-flagships.mjs            # probe + rewrite catalog flags
 *   node scripts/probe-flagships.mjs --dry      # report only
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CAT = path.join(root, "src/data/zeus-catalog.json");
const OUT = path.join(root, "src/data/flagship-probe.json");
const dry = process.argv.includes("--dry");
const tail = (s) => s.toLowerCase().replace(/:(batch|free)$/, "").split("/").pop();

/** Featured flagships (Apex API tab) and the six Free Cloud models. Patterns are tested against the model id tail. */
export const TARGETS = [
  ["claude-4-opus", "Claude 4 Opus", /^claude-opus-4(-2025|$|\.1$)/],
  ["claude-4-sonnet", "Claude 4 Sonnet", /^claude-sonnet-4(-2025|$)/],
  ["claude-3-7-sonnet", "Claude 3.7 Sonnet", /^claude-3[-.]7-sonnet/],
  ["gpt-4-5", "GPT-4.5", /^gpt-4\.5/],
  ["gpt-4-1", "GPT-4.1", /^gpt-4\.1(-2025.*)?$/],
  ["o3", "o3", /^o3($|-2025|-pro)/],
  ["o4-mini", "o4-mini", /^o4-mini/],
  ["gemini-2-5-pro", "Gemini 2.5 Pro", /^gemini-2\.5-pro(?!.*tts)/],
  ["gemini-2-5-flash", "Gemini 2.5 Flash", /^gemini-2\.5-flash(?!.*(tts|image|lite))/],
  ["grok-3", "Grok 3", /^grok-3/],
  ["deepseek-r1", "DeepSeek R1 671B", /^deepseek-r1(?!.*distill)/],
  ["deepseek-v3", "DeepSeek V3", /^deepseek-v3/],
  ["qwen3-235b", "Qwen 3 235B", /^qwen-?3-?235|^qwen3-235/],
  ["qwen3-coder", "Qwen 3 Coder", /^qwen-?3-?coder/],
  ["llama-4-maverick", "Llama 4 Maverick", /llama-4-maverick/],
  ["llama-4-scout", "Llama 4 Scout", /llama-4-scout/],
  ["llama-3-3-70b", "Llama 3.3 70B", /llama-3[._]3-70b/],
  ["gpt-4-1-mini", "GPT-4.1 Mini", /^gpt-4\.1-mini/],
  ["uncensored", "Uncensored", /dolphin|abliterat|uncensor/],
];

/** Keyless OpenAI-compatible gateways named in NikitHamal/stormy (CommunityClients / MultiTargetOaiClient). Model lists are discovered live. */
const STORMY = [
  { id: "stormy-llm7", base: "https://api.llm7.io/v1", auth: "Bearer unused" },
  { id: "stormy-pollinations", base: "https://text.pollinations.ai/openai", chat: "https://text.pollinations.ai/openai" },
  { id: "stormy-apisfreellm", base: "https://api.apisfreellm.com/v1" },
];

const cat = JSON.parse(fs.readFileSync(CAT, "utf8"));
const gw = new Map(cat.gateways.map((g) => [g.id, g]));

async function timed(url, init, ms) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: c.signal });
  } finally {
    clearTimeout(t);
  }
}

/** A real completion: HTTP 200 and non-empty content (or reasoning_content). */
async function complete(g, model, ms = 14000) {
  const anth = g.format === "anthropic";
  const url = g.chat ?? (anth ? `${g.base}/messages` : `${g.base}/chat/completions`);
  const headers = { "content-type": "application/json", ...(anth ? { "x-api-key": "free", "anthropic-version": "2023-06-01" } : g.auth ? { Authorization: g.auth } : {}) };
  const body = anth ? { model, max_tokens: 64, messages: [{ role: "user", content: "Reply with the single word OK" }] } : { model, max_tokens: 64, stream: false, messages: [{ role: "user", content: "Reply with the single word OK" }] };
  const t0 = Date.now();
  try {
    const r = await timed(url, { method: "POST", headers, body: JSON.stringify(body) }, ms);
    const elapsed = Date.now() - t0;
    if (!r.ok) return { ok: false, ms: elapsed, status: r.status };
    const j = await r.json().catch(() => null);
    const m = j?.choices?.[0]?.message;
    const text = (anth ? (j?.content ?? []).map((c) => c.text || c.thinking || "").join("") : (m?.content || m?.reasoning_content || m?.reasoning || "")).trim();
    return text ? { ok: true, ms: elapsed, status: 200 } : { ok: false, ms: elapsed, status: 200, error: "empty" };
  } catch (e) {
    return { ok: false, ms: Date.now() - t0, error: e?.name === "AbortError" ? "timeout" : "network" };
  }
}

async function discoverStormy() {
  const found = [];
  for (const s of STORMY) {
    try {
      const r = await timed(`${s.base}/models`, { headers: s.auth ? { Authorization: s.auth } : {} }, 10000);
      if (!r.ok) continue;
      const j = await r.json();
      const ids = (j.data ?? j.models ?? j).map?.((m) => (typeof m === "string" ? m : m.id ?? m.name)).filter(Boolean) ?? [];
      if (ids.length) found.push({ ...s, models: ids.map((id) => ({ id })) });
    } catch {
      /* gateway down: skipped, reported below */
    }
  }
  return found;
}

async function pool(items, n, fn) {
  const q = [...items];
  await Promise.all(Array.from({ length: n }, async () => { for (let it = q.shift(); it; it = q.shift()) await fn(it); }));
}

const stormy = await discoverStormy();
console.log(`stormy gateways answering /models: ${stormy.map((s) => `${s.id}(${s.models.length})`).join(", ") || "none"}`);

// Candidate routes per target: catalog models first (verified before unverified, fastest first), then stormy discoveries.
const jobs = [];
for (const [key, label, rx] of TARGETS) {
  const cands = [];
  for (const g of cat.gateways) for (const m of g.models) if (rx.test(tail(m.id))) cands.push({ g, m, src: "zeusdesigns" });
  for (const s of stormy) for (const m of s.models) if (rx.test(tail(m.id))) cands.push({ g: s, m, src: "stormy" });
  cands.sort((a, b) => Number(!!b.m.verified) - Number(!!a.m.verified) || (a.m.ms ?? 1e9) - (b.m.ms ?? 1e9));
  for (const c of cands.slice(0, 6)) jobs.push({ key, label, ...c });
}
console.log(`probing ${jobs.length} candidate routes with real completions...`);
const results = new Map();
await pool(jobs, 10, async (j) => {
  const r = await complete(j.g, j.m.id);
  results.set(`${j.g.id}\u0000${j.m.id}`, r);
  process.stdout.write(r.ok ? "+" : "-");
});
console.log();

const report = { schema: 1, probedAt: new Date().toISOString(), method: "POST chat completion, max_tokens 64, non-empty reply required", targets: {} };
for (const [key, label] of TARGETS) {
  const rs = jobs.filter((j) => j.key === key).map((j) => ({ gateway: j.g.id, model: j.m.id, src: j.src, ...results.get(`${j.g.id}\u0000${j.m.id}`) }));
  const live = rs.filter((r) => r.ok).sort((a, b) => a.ms - b.ms);
  report.targets[key] = { label, tested: rs.length, live: live.length, best: live[0] ?? null, status: live.length ? "live" : rs.length ? "all-routes-failed" : "no-route-in-any-source" };
}

if (!dry) {
  // Rewrite flags only on routes we actually tested.
  for (const g of cat.gateways) for (const m of g.models) {
    const r = results.get(`${g.id}\u0000${m.id}`);
    if (r) { m.verified = r.ok; m.ms = r.ms; m.status = r.status ?? m.status; }
  }
  cat.probed = { ...(cat.probed ?? {}), flagshipProbeAt: report.probedAt };
  fs.writeFileSync(CAT, JSON.stringify(cat));
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2) + "\n");
}
for (const [k, v] of Object.entries(report.targets)) console.log(`${v.status === "live" ? "LIVE " : "NONE "} ${k.padEnd(20)} ${v.live}/${v.tested} ${v.best ? `${v.best.gateway}:${v.best.model} ${v.best.ms}ms` : v.status}`);
