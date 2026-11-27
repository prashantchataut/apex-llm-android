"use client";

import { useSyncExternalStore } from "react";
import { assetUrl } from "@/lib/paths";
import { REPO } from "@/lib/site";
import type { ApexModel } from "@/lib/vault";
import ZEUS from "@/data/zeus-catalog.json";

/**
 * Apex Cloud Mesh — a multi-provider router for FREE, KEYLESS, browser-callable (CORS) OpenAI-compatible endpoints.
 *
 * Every built-in provider below was probed live with `curl` (see .agent/KEYLESS_PROVIDERS_RESEARCH.md): the model list and a real
 * chat completion answered with HTTP 200 and no API key, and (for `cors: true`) with `access-control-allow-origin: *`.
 * Nothing here is a secret. Owner-added providers live in `public/config/mesh.json` (edited from /admin) and must be keyless.
 *
 * Failover: the chat client walks `candidatesFor()` in order. A 429 / 5xx / timeout / network error puts that provider on a short
 * cooldown and the very next candidate is tried immediately (no waiting), so one flaky free tier does not surface as an error.
 */

export type MeshGroup = "Flagship" | "Reasoning" | "Coding" | "Uncensored" | "Live Web Search" | "Vision & Image";
export const MESH_GROUP_ORDER: MeshGroup[] = ["Flagship", "Reasoning", "Coding", "Uncensored", "Live Web Search", "Vision & Image"];

export interface MeshProvider {
  id: string;
  name: string;
  /** Full chat-completions URL. */
  chat: string;
  /** Full models-list URL. */
  models: string;
  /** Sent as `Authorization`. Public placeholder, never a real secret. */
  auth?: string;
  /** Browsers / WebViews can only call endpoints that send `access-control-allow-origin`. */
  cors: boolean;
  builtin: boolean;
  /** Lower runs first in the fallback chain. */
  priority: number;
  /** Model used when this provider is asked to stand in for another one. */
  fallbackModel?: string;
  note?: string;
}

export const BUILTIN_PROVIDERS: MeshProvider[] = [
  {
    id: "ovh",
    name: "OVHcloud AI Endpoints (anonymous)",
    chat: "https://oai.endpoints.kepler.ai.cloud.ovh.net/v1/chat/completions",
    models: "https://oai.endpoints.kepler.ai.cloud.ovh.net/v1/models",
    cors: true,
    builtin: true,
    priority: 1,
    fallbackModel: "Meta-Llama-3_3-70B-Instruct",
    note: "Anonymous tier, rate-limited per IP. Largest keyless catalog.",
  },
  {
    id: "llm7",
    name: "LLM7.io (keyless tier)",
    chat: "https://api.llm7.io/v1/chat/completions",
    models: "https://api.llm7.io/v1/models",
    auth: "Bearer unused",
    cors: true,
    builtin: true,
    priority: 2,
    fallbackModel: "codestral-latest",
    note: "Only models whose tier is not `pro` answer without a key.",
  },
  {
    id: "pollinations",
    name: "Pollinations (anonymous)",
    chat: "https://text.pollinations.ai/openai",
    models: "https://text.pollinations.ai/models",
    cors: true,
    builtin: true,
    priority: 3,
    fallbackModel: "openai-fast",
    note: "Anonymous tier currently serves one text model.",
  },
  {
    id: "kilo",
    name: "Kilo Gateway (free routes)",
    chat: "https://api.kilo.ai/api/gateway/chat/completions",
    models: "https://api.kilo.ai/api/gateway/models",
    auth: "Bearer anonymous",
    cors: false,
    builtin: true,
    priority: 9,
    fallbackModel: "kilo-auto/free",
    note: "Works keyless but sends no CORS header, so it is skipped in browsers and WebViews (server / native only).",
  },
];

/* ───────── imported catalog (NikitHamal/zeusdesigns + live /models discovery, probed with real completions) ───────── */
interface ZeusModel { id: string; label: string; note?: string; reasoning?: boolean; vision?: boolean; ctx?: number; src: string; verified?: boolean; ms?: number }
interface ZeusGateway { id: string; name: string; base: string; auth?: string; cors: boolean; zeusProviders: string[]; models: ZeusModel[] }
const ZEUS_DATA = ZEUS as unknown as { generatedAt: string; gateways: ZeusGateway[] };
const covered = (g: ZeusGateway) => BUILTIN_PROVIDERS.some((b) => b.chat.startsWith(g.base));
const ZEUS_GATEWAYS = ZEUS_DATA.gateways.filter((g) => g.models.length > 0 && !covered(g));
const bestOf = (g: ZeusGateway) => g.models.filter((m) => m.verified).sort((a, b) => (a.ms ?? 1e9) - (b.ms ?? 1e9))[0];
export const isImported = (providerId: string) => providerId.startsWith("z-");
export const CATALOG_GENERATED_AT = ZEUS_DATA.generatedAt;
export const IMPORTED_PROVIDERS: MeshProvider[] = ZEUS_GATEWAYS.map((g) => {
  const best = bestOf(g);
  return {
    id: g.id,
    name: g.zeusProviders[0] ?? g.name,
    chat: `${g.base}/chat/completions`,
    models: `${g.base}/models`,
    auth: g.auth,
    cors: g.cors,
    builtin: true,
    priority: best ? 20 + Math.min(30, Math.round((best.ms ?? 0) / 300)) : 90,
    fallbackModel: best?.id,
    note: g.cors ? "Imported catalog gateway (keyless)." : "Imported catalog gateway (keyless). No CORS header: not callable from a browser or WebView.",
  };
});
export const ALL_BUILTIN: MeshProvider[] = [...BUILTIN_PROVIDERS, ...IMPORTED_PROVIDERS];

export interface MeshConfig {
  schema: 1;
  custom: Omit<MeshProvider, "builtin">[];
  /** Provider ids switched off by the owner. */
  disabled: string[];
  /** Individual models switched off by the owner, keyed `provider:api`. They vanish from the picker and the failover chain. */
  disabledModels?: string[];
  /** Owner display-name overrides, keyed `provider:api`. Shown verbatim in the app picker. */
  renames?: Record<string, string>;
  /** Imported models are hidden until they pass a live probe; the owner can force one on. Keyed `provider:api`. */
  enabledModels?: string[];
  /** Owner category overrides, keyed `provider:api`. */
  categories?: Record<string, MeshGroup>;
  updatedAt?: string;
}
export const MESH_CONFIG_PATH = "web-showcase/public/config/mesh.json";
const MESH_RAW = `https://raw.githubusercontent.com/${REPO}/main/${MESH_CONFIG_PATH}`;
export const EMPTY_CONFIG: MeshConfig = { schema: 1, custom: [], disabled: [], disabledModels: [], renames: {}, enabledModels: [], categories: {} };
/** Config key of a model: `provider:api`. */
export const modelKey = (provider: string, api: string) => `${provider}:${api}`;

export interface MeshModel {
  /** Unique app id: `mesh:<provider>:<api>`. */
  id: string;
  provider: string;
  api: string;
  label: string;
  group: MeshGroup;
  reasoning: boolean;
  vision: boolean;
  uncensored: boolean;
  /** True when the owner renamed it in /admin: `label` is then shown verbatim (no `Apex-` prefix). */
  renamed?: boolean;
  disabled?: boolean;
  /** Imported from the reference catalog (not discovered from a built-in provider's live list). */
  imported?: boolean;
  /** Result of the import-time real-completion probe. */
  verified?: boolean;
  ms?: number;
  note?: string;
  /** Label / category before owner overrides (the /admin editor derives its live view from these). */
  baseLabel?: string;
  baseGroup?: MeshGroup;
  /** Whether the model is on without any owner override. */
  defaultOn?: boolean;
  /** Provider sends no CORS header: not callable from a browser / WebView. */
  nativeOnly?: boolean;
}
export interface Health {
  ok: boolean;
  ms: number;
  count: number;
  at: number;
  error?: string;
}
export interface MeshState {
  synced: boolean;
  syncing: boolean;
  providers: MeshProvider[];
  /** Enabled models only: what the app picker and router see. */
  models: MeshModel[];
  /** Every discovered model including owner-disabled ones (the /admin table). */
  allModels: MeshModel[];
  health: Record<string, Health>;
  config: MeshConfig;
}

const INITIAL: MeshState = { synced: false, syncing: false, providers: ALL_BUILTIN, models: [], allModels: [], health: {}, config: EMPTY_CONFIG };
let state: MeshState = INITIAL;
const subs = new Set<() => void>();
const set = (patch: Partial<MeshState>) => {
  state = { ...state, ...patch };
  subs.forEach((f) => f());
};
export const getMesh = () => state;
export function useMesh(): MeshState {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => state,
    () => INITIAL,
  );
}

/* ───────── configuration ───────── */
const timed = async (url: string, ms: number, init?: RequestInit) => {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctl.signal, cache: "no-store" });
  } finally {
    clearTimeout(t);
  }
};

export function providersFrom(cfg: MeshConfig): MeshProvider[] {
  const custom: MeshProvider[] = cfg.custom.map((c) => ({ ...c, builtin: false, cors: c.cors !== false }));
  return [...ALL_BUILTIN, ...custom].filter((p) => !cfg.disabled.includes(p.id)).sort((a, b) => a.priority - b.priority);
}
/** Every provider including disabled ones (the /admin table shows them greyed out). */
export function allProviders(cfg: MeshConfig): MeshProvider[] {
  const custom: MeshProvider[] = cfg.custom.map((c) => ({ ...c, builtin: false, cors: c.cors !== false }));
  return [...ALL_BUILTIN, ...custom].sort((a, b) => a.priority - b.priority);
}

/** Owner config: raw GitHub first (OTA, no rebuild), the bundled copy as fallback. */
export async function loadMeshConfig(): Promise<MeshConfig> {
  for (const url of [MESH_RAW, assetUrl("config/mesh.json")]) {
    try {
      const r = await timed(url, 5000);
      if (r.ok) {
        const j = (await r.json()) as Partial<MeshConfig>;
        return {
          schema: 1,
          custom: Array.isArray(j.custom) ? j.custom : [],
          disabled: Array.isArray(j.disabled) ? j.disabled : [],
          disabledModels: Array.isArray(j.disabledModels) ? j.disabledModels : [],
          renames: j.renames && typeof j.renames === "object" ? j.renames : {},
          enabledModels: Array.isArray(j.enabledModels) ? j.enabledModels : [],
          categories: j.categories && typeof j.categories === "object" ? j.categories : {},
          updatedAt: j.updatedAt,
        };
      }
    } catch {
      /* try next */
    }
  }
  return EMPTY_CONFIG;
}

/** Turn an OpenAI-style base URL (`https://host/v1`) into a provider record. */
export function customProvider(name: string, base: string, fallbackModel?: string): Omit<MeshProvider, "builtin"> {
  const b = base.trim().replace(/\/+$/, "");
  const u = new URL(b);
  if (u.protocol !== "https:") throw new Error("Use an https:// base URL (WebViews block plain http).");
  const id = `c-${u.hostname.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
  return { id, name: name.trim() || u.hostname, chat: `${b}/chat/completions`, models: `${b}/models`, auth: "Bearer unused", cors: true, priority: 5, fallbackModel };
}

/* ───────── model discovery ───────── */
const NON_CHAT = /(tts|whisper|solaria|embed|bge-|guard|stable-diffusion|sdxl|flux|rerank|moderation|nvr-|summaris|translate|suno|veo|sora|dall|imagen|image)/i;
const pretty = (n: string) => n.replace(/^.*\//, "").replace(/:free$/, "").replace(/_/g, ".").replace(/-+/g, "-");

interface Raw {
  id: string;
  reasoning?: boolean;
  vision?: boolean;
}
function rawModels(providerId: string, json: unknown): Raw[] {
  if (Array.isArray(json)) {
    // Pollinations: [{ name, tier, reasoning, vision }]
    return (json as { name: string; tier?: string; reasoning?: boolean; vision?: boolean }[]).filter((m) => m.name && (m.tier ?? "anonymous") === "anonymous").map((m) => ({ id: m.name, reasoning: m.reasoning, vision: m.vision }));
  }
  const data = (json as { data?: Record<string, unknown>[] })?.data ?? [];
  const out: Raw[] = [];
  for (const m of data) {
    const id = String(m.id ?? "");
    if (!id) continue;
    if (providerId === "llm7") {
      const caps = (m.capabilities ?? {}) as { vision?: boolean; reasoning?: boolean };
      // `pro` models and the ones without a tier answer 401 without a key (verified live).
      if (m.model_type !== "chat" || !["turbo", "free"].includes(String(m.tier))) continue;
      out.push({ id, reasoning: caps.reasoning, vision: caps.vision });
    } else if (providerId === "kilo") {
      if (m.isFree !== true) continue;
      const arch = (m.architecture ?? {}) as { input_modalities?: string[] };
      out.push({ id, reasoning: Array.isArray(m.supported_parameters) && (m.supported_parameters as string[]).includes("reasoning"), vision: arch.input_modalities?.includes("image") });
    } else {
      out.push({ id });
    }
  }
  return out;
}

export function classify(id: string, r: { reasoning?: boolean; vision?: boolean }): { group: MeshGroup; reasoning: boolean; vision: boolean; uncensored: boolean } {
  const n = id.toLowerCase();
  const uncensored = /uncensor|abliterat|dolphin|\bevil\b|unity|hermes/.test(n);
  const reasoning = !!r.reasoning || /r1|reason|think|gpt-oss|nemotron|qwen3/.test(n);
  const vision = !!r.vision || /(^|[-_.])(vl|vision|omni)|pixtral/.test(n);
  const group: MeshGroup = uncensored ? "Uncensored" : /search/.test(n) ? "Live Web Search" : /coder|code|codestral/.test(n) ? "Coding" : vision ? "Vision & Image" : reasoning ? "Reasoning" : "Flagship";
  return { group, reasoning, vision, uncensored };
}

async function fetchProviderModels(p: MeshProvider): Promise<{ health: Health; models: MeshModel[] }> {
  const t0 = performance.now();
  try {
    const r = await timed(p.models, 8000, p.auth ? { headers: { Authorization: p.auth } } : undefined);
    const ms = Math.round(performance.now() - t0);
    if (!r.ok) return { health: { ok: false, ms, count: 0, at: Date.now(), error: `HTTP ${r.status}` }, models: [] };
    const raw = rawModels(p.id, await r.json()).filter((m) => !NON_CHAT.test(m.id));
    const models = raw.map<MeshModel>((m) => ({ id: `mesh:${p.id}:${m.id}`, provider: p.id, api: m.id, label: pretty(m.id), ...classify(m.id, m) }));
    return { health: { ok: true, ms, count: models.length, at: Date.now() }, models };
  } catch (e) {
    return { health: { ok: false, ms: Math.round(performance.now() - t0), count: 0, at: Date.now(), error: e instanceof Error && e.name === "AbortError" ? "timeout" : "unreachable (CORS or network)" }, models: [] };
  }
}

const NO_CORS: Health = { ok: false, ms: 0, count: 0, at: 0, error: "no CORS: native/server only" };

/** Health only (no model list change), used by the /admin table. */
export async function probeAll(providers: MeshProvider[]): Promise<Record<string, Health>> {
  const res = await Promise.all(providers.map(async (p) => [p.id, p.cors ? (await fetchProviderModels(p)).health : { ...NO_CORS, at: Date.now() }] as const));
  const health = Object.fromEntries(res);
  set({ health: { ...getMesh().health, ...health } });
  return health;
}

export interface ModelPing {
  ok: boolean;
  ms: number;
  status?: number;
  text?: string;
  error?: string;
  at: number;
}
/** A real chat completion ("Reply with OK") against one model: the same request the app sends, not a /models listing. */
export async function pingModel(p: MeshProvider, api: string, timeoutMs = 12_000): Promise<ModelPing> {
  const t0 = performance.now();
  try {
    const r = await timed(p.chat, timeoutMs, {
      method: "POST",
      headers: { "content-type": "application/json", ...(p.auth ? { Authorization: p.auth } : {}) },
      body: JSON.stringify({ model: api, messages: [{ role: "user", content: "Reply with OK" }], max_tokens: 48, stream: false }),
    });
    const ms = Math.round(performance.now() - t0);
    if (!r.ok) return { ok: false, ms, status: r.status, error: `HTTP ${r.status}`, at: Date.now() };
    const j = (await r.json().catch(() => null)) as { choices?: { message?: { content?: string; reasoning_content?: string } }[] } | null;
    const m = j?.choices?.[0]?.message;
    const text = (m?.content ?? m?.reasoning_content ?? "").trim();
    return text ? { ok: true, ms, status: 200, text: text.slice(0, 40), at: Date.now() } : { ok: false, ms, status: 200, error: "empty reply", at: Date.now() };
  } catch (e) {
    return { ok: false, ms: Math.round(performance.now() - t0), error: e instanceof Error && e.name === "AbortError" ? "timeout" : "unreachable (CORS or network)", at: Date.now() };
  }
}

/** Probe one candidate endpoint (used by "Test" before an owner adds a custom provider). */
export async function probeOne(p: MeshProvider): Promise<{ health: Health; models: MeshModel[] }> {
  return fetchProviderModels(p);
}

/* ───────── owner overrides (apply to the bundled verified registry too) ───────── */
let configLoad: Promise<void> | null = null;
/** Load the owner's mesh.json once (raw GitHub, bundled copy as fallback) so toggles / renames apply before any model sync. */
export function ensureMeshConfig(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  configLoad ??= loadMeshConfig().then((config) => {
    if (!state.synced) set({ config });
  });
  return configLoad;
}
export const isModelDisabled = (provider: string, api: string): boolean => (state.config.disabledModels ?? []).includes(modelKey(provider, api));
export const modelDisplayName = (provider: string, api: string, fallback: string): string => state.config.renames?.[modelKey(provider, api)]?.trim() || fallback;

/** Pull the live `/models` of every enabled, browser-callable provider and publish them to the app. */
export async function syncMesh(cfg?: MeshConfig): Promise<MeshState> {
  if (typeof window === "undefined") return state;
  set({ syncing: true });
  const config = cfg ?? (await loadMeshConfig());
  const providers = providersFrom(config);
  const results = await Promise.all(providers.filter((p) => p.cors && !isImported(p.id)).map(async (p) => [p, await fetchProviderModels(p)] as const));
  const health: Record<string, Health> = {};
  const models: MeshModel[] = [];
  for (const p of providers) if (!p.cors && !isImported(p.id)) health[p.id] = { ...NO_CORS, at: Date.now() };
  for (const [p, r] of results) {
    health[p.id] = r.health;
    models.push(...r.models);
  }
  // Imported gateways: seeded from the bundled catalog (no 40 extra requests at launch). Health = the import-time probe.
  const stamp = Date.parse(CATALOG_GENERATED_AT) || Date.now();
  for (const g of ZEUS_GATEWAYS) {
    const p = providers.find((x) => x.id === g.id);
    if (!p) continue;
    const best = bestOf(g);
    health[g.id] = best ? { ok: true, ms: best.ms ?? 0, count: g.models.length, at: stamp } : { ok: false, ms: 0, count: g.models.length, at: stamp, error: "no model answered at import" };
    for (const m of g.models) {
      models.push({
        id: `mesh:${g.id}:${m.id}`,
        provider: g.id,
        api: m.id,
        label: m.label || pretty(m.id),
        note: m.note,
        imported: true,
        verified: m.verified,
        ms: m.ms,
        nativeOnly: !g.cors,
        ...classify(m.id, m),
      });
    }
  }
  const rank = (g: MeshGroup) => MESH_GROUP_ORDER.indexOf(g);
  const off = new Set(config.disabledModels ?? []);
  const names = config.renames ?? {};
  const forced = new Set(config.enabledModels ?? []);
  const cats = config.categories ?? {};
  const all = models.map<MeshModel>((m) => {
    const k = modelKey(m.provider, m.api);
    const rn = names[k]?.trim();
    // Imported models are on by default only when they answered a real completion AND the browser can reach them.
    const defaultOn = m.imported ? !!m.verified && !m.nativeOnly : true;
    const enabled = !off.has(k) && (defaultOn || forced.has(k));
    return { ...m, baseLabel: m.label, baseGroup: m.group, group: cats[k] ?? m.group, label: rn || m.label, renamed: !!rn, defaultOn, disabled: !enabled };
  });
  all.sort((a, b) => rank(a.group) - rank(b.group) || a.label.localeCompare(b.label));
  set({ synced: true, syncing: false, providers, models: all.filter((m) => !m.disabled), allModels: all, health, config });
  return state;
}

/** Mesh models shaped for the Apex model switcher. Provider health is shown in the row tag. */
export function meshAsApexModels(skipApi: Set<string>): ApexModel[] {
  const { models, providers, health } = state;
  const name = (id: string) => providers.find((p) => p.id === id)?.name.replace(/\s*\(.*\)$/, "") ?? id;
  return models
    .filter((m) => !(m.provider === "pollinations" && skipApi.has(m.api)))
    .map((m) => ({
      id: m.id,
      label: m.renamed ? m.label : `Apex-${m.label}`,
      tag: `${name(m.provider)}${health[m.provider]?.ok ? ` · ${health[m.provider].ms}ms` : ""}`,
      group: `${m.group} · keyless mesh`,
      kind: "text" as const,
      api: m.api,
      reasoning: m.reasoning,
      vision: m.vision,
      uncensored: m.uncensored,
      provider: m.provider,
    }));
}

/* ───────── failover ───────── */
const cooldown = new Map<string, number>();
const COOLDOWN_MS = 25_000;
// Anonymous tiers rate-limit per model (OVH: verified live, one model answered 429 while another answered 200), so cool down provider+model.
const ck = (providerId: string, api: string) => `${providerId}:${api}`;
export const markFailure = (providerId: string, api: string) => cooldown.set(ck(providerId, api), Date.now() + COOLDOWN_MS);
export const markSuccess = (providerId: string, api: string) => cooldown.delete(ck(providerId, api));
const cooling = (id: string, api: string) => (cooldown.get(ck(id, api)) ?? 0) > Date.now();

export interface Candidate {
  provider: MeshProvider;
  api: string;
}
/** Preferred provider/model first, then every other healthy browser-callable provider's stand-in model by priority. */
export function candidatesFor(preferred?: { provider: string; api: string }): Candidate[] {
  const { providers, models, config } = state;
  const off = new Set(config.disabledModels ?? []);
  const usable = providers.filter((p) => p.cors);
  const out: Candidate[] = [];
  const pref = preferred && usable.find((p) => p.id === preferred.provider);
  if (pref && preferred && !off.has(modelKey(pref.id, preferred.api))) out.push({ provider: pref, api: preferred.api });
  let importedUsed = 0;
  for (const p of usable) {
    if (isImported(p.id)) {
      if (!p.fallbackModel || importedUsed >= 6) continue; // last-resort breadth: the six fastest verified imported gateways
      importedUsed++;
    }
    const own = models.filter((m) => m.provider === p.id).map((m) => m.api);
    const apis = [p.fallbackModel, ...own].filter((a): a is string => !!a && !off.has(modelKey(p.id, a)));
    // up to two distinct stand-in models per provider (a second model on the same host has its own anonymous quota)
    const take = [...new Set(apis)].filter((a) => !(p.id === pref?.id && a === preferred?.api)).slice(0, 2);
    for (const api of take) out.push({ provider: p, api });
  }
  // an endpoint that just failed goes last instead of being dropped, so a total outage still gets one more try
  return [...out.filter((c) => !cooling(c.provider.id, c.api)), ...out.filter((c) => cooling(c.provider.id, c.api))];
}

export function isMeshId(id: string): boolean {
  return id.startsWith("mesh:");
}
export function parseMeshId(id: string): { provider: string; api: string } | null {
  const m = /^mesh:([^:]+):(.+)$/.exec(id);
  return m ? { provider: m[1], api: m[2] } : null;
}

/** Toggle a model with the right override list: default-off imports need `enabledModels`, everything else uses `disabledModels`. */
export function setModelEnabled(cfg: MeshConfig, m: Pick<MeshModel, "provider" | "api" | "defaultOn">, enabled: boolean): MeshConfig {
  const k = modelKey(m.provider, m.api);
  const off = new Set(cfg.disabledModels ?? []);
  const on = new Set(cfg.enabledModels ?? []);
  if (enabled) {
    off.delete(k);
    if (!m.defaultOn) on.add(k);
  } else {
    on.delete(k);
    if (m.defaultOn) off.add(k);
    else off.add(k);
  }
  return { ...cfg, disabledModels: [...off], enabledModels: [...on] };
}
