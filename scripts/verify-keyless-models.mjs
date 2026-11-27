#!/usr/bin/env node
// Live verification of every keyless candidate. Fires a real "Reply with OK" completion at each model
// and keeps ONLY those that return HTTP 200 + non-empty text in < MAX_MS.
// Output: src/data/verified-models.json  (consumed by /api/models and the failover engine)
import { writeFileSync, mkdirSync } from "node:fs";

const MAX_MS = 4000;
const WATCH = new Set(["gemini-4-argon", "gemini-3.6-flash", "gemini-3.8-flash", "gemma-3-27b", "deepseek-v4.1-flash-uncensored", "glm-5.3-uncensored", "gemma-4-uncensored", "deepseek-v4.1-flash"]);
const PER_TRY_TIMEOUT = 9000;
const PROVIDERS = {
  llm7: { url: "https://api.llm7.io/v1/chat/completions", auth: "Bearer unused" },
  pollinations: { url: "https://text.pollinations.ai/openai", auth: null },
  ovh: { url: "https://oai.endpoints.kepler.ai.cloud.ovh.net/v1/chat/completions", auth: null },
  airforce: { url: "https://api.airforce/v1/chat/completions", auth: "Bearer unused" },
};

async function jget(url) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

async function probe(provider, model) {
  const p = PROVIDERS[provider];
  const t0 = performance.now();
  try {
    const r = await fetch(p.url, {
      method: "POST",
      headers: { "content-type": "application/json", ...(p.auth ? { authorization: p.auth } : {}) },
      body: JSON.stringify({ model, messages: [{ role: "user", content: "Reply with OK" }], max_tokens: 64, stream: false }),
      signal: AbortSignal.timeout(PER_TRY_TIMEOUT),
    });
    const ms = Math.round(performance.now() - t0);
    if (!r.ok) return { provider, model, ok: false, ms, status: r.status };
    const j = await r.json().catch(() => null);
    const text = j?.choices?.[0]?.message?.content?.trim?.() ?? "";
    return { provider, model, ok: !!text && ms <= MAX_MS, ms, status: 200, text: text.slice(0, 40), slow: !!text && ms > MAX_MS };
  } catch (e) {
    return { provider, model, ok: false, ms: Math.round(performance.now() - t0), status: 0, error: String(e.name || e) };
  }
}

async function pool(items, n, fn) {
  const out = [];
  let i = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (i < items.length) {
        const k = i++;
        out[k] = await fn(items[k]);
      }
    }),
  );
  return out;
}

const NON_CHAT = /(tts|whisper|solaria|embed|bge-|guard|stable-diffusion|sdxl|flux|rerank|moderation|nvr-|summaris|translate|suno|veo|sora|dall|imagen|image)/i;
const [polli, llm7, airforce, ovh] = await Promise.all([
  jget("https://text.pollinations.ai/models"),
  jget("https://api.llm7.io/v1/models"),
  jget("https://api.airforce/v1/models"),
  jget("https://oai.endpoints.kepler.ai.cloud.ovh.net/v1/models"),
]);

const candidates = [];
for (const m of polli ?? []) candidates.push({ provider: "pollinations", model: m.name, meta: { description: m.description, reasoning: !!m.reasoning } });
for (const m of llm7?.data ?? []) {
  if (m.model_type && m.model_type !== "chat") continue;
  // pro-tier models need a key (verified 401). Only the watch-list is re-probed each run.
  if (m.tier === "pro" && !WATCH.has(m.id)) continue;
  candidates.push({ provider: "llm7", model: m.id, meta: { tier: m.tier, ctx: m.context_window?.tokens ?? null, reasoning: !!m.reasoning } });
}
for (const m of ovh?.data ?? []) {
  if (!NON_CHAT.test(m.id)) candidates.push({ provider: "ovh", model: m.id, meta: { owned_by: m.owned_by } });
}
for (const m of airforce?.data ?? []) {
  if (!m.supports_chat || m.tier !== "free" || m.status === "major_outage") continue;
  candidates.push({ provider: "airforce", model: m.id, meta: { tier: m.tier, status: m.status } });
}
// Explicit extras from the brief (searched even if not listed in the registries).
for (const m of ["gemini", "gemini-argon", "gpt-4o-mini", "llama-3.3-70b", "deepseek-r1"]) {
  for (const provider of ["llm7"]) {
    if (!candidates.some((c) => c.provider === provider && c.model === m)) candidates.push({ provider, model: m, meta: { probe: "extra" } });
  }
}

console.log(`Probing ${candidates.length} candidates...`);
let polliLock = Promise.resolve();
const results = await pool(candidates, 2, async (c) => {
  let r;
  if (c.provider === "pollinations") {
    // anonymous tier: 1 reply / 45s / IP -> serialize, retry once after the window if rate limited
    polliLock = polliLock.then(async () => {
      r = await probe(c.provider, c.model);
      if (r.status === 402) { await new Promise((x) => setTimeout(x, 46000)); r = await probe(c.provider, c.model); }
    });
    await polliLock;
  } else {
    r = await probe(c.provider, c.model);
    if (r.status === 429) { await new Promise((x) => setTimeout(x, 3000)); r = await probe(c.provider, c.model); }
  }
  console.log(`${r.ok ? "PASS" : "FAIL"} ${c.provider.padEnd(12)} ${c.model.padEnd(36)} ${String(r.status).padEnd(4)} ${r.ms}ms ${r.text ?? r.error ?? ""}`);
  return { ...c, ...r };
});

const verified = results.filter((r) => r.ok).sort((a, b) => a.ms - b.ms);
mkdirSync("web-showcase/src/data", { recursive: true });
writeFileSync(
  "web-showcase/src/data/verified-models.json",
  JSON.stringify(
    {
      verifiedAt: new Date().toISOString(),
      maxMs: MAX_MS,
      tested: results.length,
      models: verified.map((v) => ({ provider: v.provider, id: v.model, ms: v.ms, meta: v.meta })),
      failed: results.filter((r) => !r.ok).map((r) => ({ provider: r.provider, id: r.model, status: r.status, ms: r.ms, slow: !!r.slow })),
    },
    null,
    2,
  ),
);
console.log(`\n${verified.length}/${results.length} verified -> web-showcase/src/data/verified-models.json`);
