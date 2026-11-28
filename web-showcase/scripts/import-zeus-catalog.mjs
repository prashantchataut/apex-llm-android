// Imports the keyless provider/model catalog from a READ-ONLY checkout of NikitHamal/zeusdesigns, adds live /models discovery,
// and probes every model with a real chat completion. Output: src/data/zeus-catalog.json (public, secret-free).
//
//   ZEUS_DIR=/tmp/ref/zeusdesigns node scripts/import-zeus-catalog.mjs [--no-probe]
//
// SAFETY: the reference repo contains hard-coded third-party API keys. Any (provider, model) whose resolved key is not an obvious
// public placeholder is SKIPPED and listed under `skipped` (never copied). Nothing secret is written to the output.
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const here = dirname(fileURLToPath(import.meta.url));
const ZEUS = process.env.ZEUS_DIR || "/tmp/ref/zeusdesigns";
const OUT = join(here, "..", "src", "data", "zeus-catalog.json");
const PROBE = !process.argv.includes("--no-probe");
const work = join(tmpdir(), "apex-zeus-import");
mkdirSync(work, { recursive: true });

const load = (rel, patch = (s) => s) => {
  const src = patch(readFileSync(join(ZEUS, rel), "utf8"));
  const js = ts.transpileModule(src, { compilerOptions: { module: "commonjs", target: "es2020" } }).outputText;
  const f = join(work, rel.replace(/[\\/]/g, "_") + ".cjs");
  writeFileSync(f, js);
  return require(f);
};

const { PROVIDERS } = load("src/lib/providers.ts", (s) => s.replace(/import .*ctxVerified.*\n/, "const CTX_VERIFIED = {};\n"));
const { resolveBrowserGatewayConfig } = load("src/lib/browserProviders.ts");

// A key is a "public placeholder" only if it is empty or one of these well-known no-secret words.
const PLACEHOLDER = /^(|free|public|anonymous|unused|none|no-key|sk-antigravity)$/i;
const SKIP_ID = /embed|whisper|tts|guard|rerank|moderation|image|flux|video|audio|music|seedance|banana|para-|dall|imagen|sora|veo/i;

// Frontier flagship families the owner wants surfaced first (also probed first so the per-gateway cap never hides them).
const FRONTIER = /opus|sonnet-?[345]|claude-3-?7|claude-3-?5|haiku|gpt-?4\.?[15]|gpt-?5|gpt-4o|(^|[^a-z])o[134](-|$)|gemini-?[23]\.?[05]-(pro|flash)|grok|deepseek-?(r1|v3)|qwen-?3-?235|qwq|qwen-?2\.?5-(max|coder)|llama-?4|llama-?3\.?[13]|mistral-large|codestral|pixtral|sonar|abliterat|uncensor|dolphin/i;
const gateways = new Map(); // base -> gw
const skipped = [];
const gw = (base, auth, name, format) => {
  const key = base.replace(/\/+$/, "");
  if (!gateways.has(key)) {
    const host = new URL(key).hostname;
    gateways.set(key, { id: "z-" + host.replace(/\.hf\.space$/, "").replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 40), name: name || host, base: key, auth: auth || "", format: format || "openai", models: new Map(), zeusProviders: new Set() });
  }
  return gateways.get(key);
};

for (const p of PROVIDERS) {
  for (const m of p.models) {
    let cfg;
    try {
      cfg = resolveBrowserGatewayConfig(p.id, m.id);
    } catch {
      continue;
    }
    if (!cfg?.baseUrl) continue;
    if (!PLACEHOLDER.test(cfg.apiKey || "")) {
      skipped.push({ provider: p.id, model: m.id, why: "needs an embedded API key in the reference repo (not copied)" });
      continue;
    }
    if (SKIP_ID.test(m.id)) continue;
    const anth = cfg.format === "anthropic";
    const g = anth ? gw(cfg.baseUrl.replace(/\/+$/, "") + "/v1", "", p.name, "anthropic") : gw(cfg.baseUrl, cfg.apiKey && cfg.apiKey !== "" ? `Bearer ${cfg.apiKey}` : "", p.name);
    g.zeusProviders.add(p.name);
    g.models.set(m.id, { id: m.id, label: m.label || m.id, note: m.note, reasoning: !!m.reasoning, vision: !!m.vision, ctx: m.contextWindow, src: "zeusdesigns" });
  }
}

// Well-known public OpenAI-compatible endpoints requested by the owner.
gw("https://api.llm7.io/v1", "Bearer unused", "LLM7.io");
gw("https://oai.endpoints.kepler.ai.cloud.ovh.net/v1", "", "OVHcloud AI Endpoints");
// text.pollinations.ai/models is a bare array and chat lives at /openai, handled by the mesh's built-in provider.

const timed = async (url, ms, init) => {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctl.signal });
  } finally {
    clearTimeout(t);
  }
};

// Live discovery: union with whatever each gateway actually serves today.
await Promise.all(
  [...gateways.values()].map(async (g) => {
    try {
      const r = await timed(`${g.base}/models`, 25000, { headers: { Origin: "https://prashantchataut.github.io", ...(g.format === "anthropic" ? { "x-api-key": "free", "anthropic-version": "2023-06-01" } : g.auth ? { Authorization: g.auth } : {}) } });
      g.cors = r.headers.get("access-control-allow-origin") ? true : false;
      g.listStatus = r.status;
      if (!r.ok) return;
      const j = await r.json();
      g.liveCount = Array.isArray(j?.data) ? j.data.length : Array.isArray(j) ? j.length : 0;
      const arr = Array.isArray(j?.data) ? j.data : Array.isArray(j) ? j : [];
      for (const m of arr) {
        const id = typeof m === "string" ? m : m?.id;
        if (!id || SKIP_ID.test(id)) continue;
        if (g.base.includes("api.kilo.ai") && m?.isFree !== true) continue; // paid routes
        if (g.base.includes("blockrun.ai") && !/^(nvidia|cohere|poolside)\//.test(id)) continue; // the rest is pay-per-call
        if (g.base.includes("llm7.io") && !(m.model_type === "chat" && ["turbo", "free"].includes(String(m.tier)))) continue;
        if (g.format === "anthropic" && /:batch$/.test(id)) continue; // batch-queue duplicates of the same route
        if (!g.models.has(id)) g.models.set(id, { id, label: (m?.display_name || id.replace(/^.*\//, "")).replace(/:free$/, ""), reasoning: !!m?.capabilities?.reasoning || /r1|think|reason/i.test(id), vision: !!m?.capabilities?.vision, src: "live" });
      }
    } catch (e) {
      g.listStatus = 0;
      g.listError = e.name === "AbortError" ? "timeout" : String(e.message || e).slice(0, 60);
    }
  }),
);

// Real chat-completion probe. One worker per gateway; stop probing a gateway after 6 consecutive failures (sleeping / dead space).
const probe = async (g, id) => {
  const t0 = Date.now();
  try {
    const anth = g.format === "anthropic";
    const r = await timed(anth ? `${g.base}/messages` : `${g.base}/chat/completions`, anth ? 40000 : 15000, {
      method: "POST",
      headers: { "content-type": "application/json", ...(anth ? { "x-api-key": "free", "anthropic-version": "2023-06-01", Origin: "https://prashantchataut.github.io" } : g.auth ? { Authorization: g.auth } : {}) },
      body: JSON.stringify(anth ? { model: id, messages: [{ role: "user", content: "Reply with OK" }], max_tokens: 64 } : { model: id, messages: [{ role: "user", content: "Reply with OK" }], max_tokens: 24, stream: false }),
    });
    const ms = Date.now() - t0;
    if (!r.ok) return { ok: false, ms, status: r.status };
    const j = await r.json().catch(() => null);
    const m = j?.choices?.[0]?.message;
    const text = anth ? (j?.content || []).map((c) => c.text || c.thinking || "").join("") : String(m?.content ?? m?.reasoning_content ?? "");
    return { ok: text.trim().length > 0, ms, status: 200 };
  } catch {
    return { ok: false, ms: Date.now() - t0, status: 0 };
  }
};
if (PROBE) {
  await Promise.all(
    [...gateways.values()].map(async (g) => {
      const anth = g.format === "anthropic";
      const CAP = anth ? 140 : 60;
      const order = [...g.models.values()].sort((a, b) => (FRONTIER.test(b.id) ? 1 : 0) - (FRONTIER.test(a.id) ? 1 : 0) || (a.src === "zeusdesigns" ? 0 : 1) - (b.src === "zeusdesigns" ? 0 : 1));
      const todo = order.slice(0, CAP);
      for (const m of order.slice(CAP)) m.why = "not probed (use Test Live in /admin)";
      let streak = 0;
      let idx = 0;
      const worker = async () => {
        while (idx < todo.length) {
          const m = todo[idx++];
          if (streak >= (anth ? 40 : 6)) {
            m.verified = false;
            m.why = "gateway not answering";
            continue;
          }
          const r = await probe(g, m.id);
          m.verified = r.ok;
          m.ms = r.ms;
          m.status = r.status;
          streak = r.ok ? 0 : streak + 1;
          await new Promise((res) => setTimeout(res, anth ? 100 : 250));
        }
      };
      await Promise.all(Array.from({ length: anth ? 6 : 1 }, worker));
    }),
  );
}

const out = {
  schema: 1,
  generatedAt: new Date().toISOString(),
  source: "NikitHamal/zeusdesigns (read-only) + live /models discovery",
  probed: PROBE,
  stats: { zeusProviders: PROVIDERS.length, zeusDeclaredModels: PROVIDERS.reduce((a, p) => a + p.models.length, 0), skippedEmbeddedKeyModels: skipped.length },
  gateways: [...gateways.values()]
    .map((g) => ({
      id: g.id,
      name: g.name,
      base: g.base,
      auth: g.auth || undefined,
      format: g.format,
      liveCount: g.liveCount ?? 0,
      cors: !!g.cors,
      listStatus: g.listStatus ?? 0,
      zeusProviders: [...g.zeusProviders],
      models: [...g.models.values()],
    }))
    .sort((a, b) => b.models.filter((m) => m.verified).length - a.models.filter((m) => m.verified).length || b.models.length - a.models.length),
  skipped: Object.values(Object.fromEntries(skipped.map((s) => [s.provider, { provider: s.provider, why: s.why, models: skipped.filter((x) => x.provider === s.provider).length }]))),
};
writeFileSync(OUT, JSON.stringify(out));
const total = out.gateways.reduce((a, g) => a + g.models.length, 0);
const ok = out.gateways.reduce((a, g) => a + g.models.filter((m) => m.verified).length, 0);
console.log(`gateways ${out.gateways.length}, models ${total}, verified ${ok}, skipped providers ${out.skipped.length} (${skipped.length} models)`);
