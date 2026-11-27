import verified from "@/data/verified-models.json";
import { isModelDisabled } from "@/services/apexCloudMesh";

/**
 * Apex Auto: a deterministic, zero-network intent router. No LLM call ever decides the route, so it adds no latency:
 * it is a handful of anchored regexes over the prompt and measures itself with `performance.now()` (typically 0.0x ms).
 *
 * Priority: offline / Local-Only -> local model (0 ms, no network probe) -> image -> code -> reasoning -> creative -> general.
 */
export type Intent = "local" | "image" | "code" | "reason" | "creative" | "general";

export interface RouteContext {
  offline: boolean;
  localOnly: boolean;
  /** The on-device model mounted (or most recently used). */
  localId?: string;
  localLabel?: string;
}
export interface RouteDecision {
  intent: Intent;
  kind: "local" | "cloud" | "image";
  /** Mesh target (cloud only). The failover chain still protects it. */
  provider?: string;
  api?: string;
  label: string;
  reason: string;
  /** Wall-clock cost of the decision in milliseconds. */
  ms: number;
  localId?: string;
}

const IMAGE = /^\s*\/(?:image|imagine|img)\b|^\s*(?:please\s+)?(?:draw|sketch|paint|illustrate|render)\b|\b(?:generate|create|make|produce)\s+(?:me\s+)?(?:an?\s+)?(?:\w+\s+){0,2}(?:image|picture|photo|illustration|logo|wallpaper|artwork)\b/i;
const CODE = /```|\.(?:rs|py|ts|tsx|js|jsx|kt|java|go|cpp|c|h|cs|rb|php|swift|sql|sh|toml|yaml|yml|json|html|css)\b|\b(?:traceback|stack\s?trace|segfault|panic!|undefined is not|cannot find module|compile error|syntax error|npm|cargo|pip install|git (?:commit|rebase|merge)|regex|refactor|function|class|async|await|api endpoint|unit test|debug|bug|implement|rewrite (?:that |this |it )?in (?:rust|python|go|c\+\+|kotlin|typescript|javascript))\b|[{};]\s*$|=>|::|\bfn\s+\w+\(|\bdef\s+\w+\(/i;
const REASON = /\\frac|\\sum|\\int|\$\$|\bprove\b|\bproof\b|\btheorem\b|\bderive\b|\bsolve\b|\bequation\b|\bintegral\b|\bderivative\b|\bprobability\b|\bpuzzle\b|\briddle\b|think step[- ]by[- ]step|step[- ]by[- ]step|\bcalculate\b|\blogic\b|\bwhich is (?:bigger|larger|greater)\b|\d\s*[+\-*/^=]\s*\d.*=|\bhow many\b.*\b(?:if|when)\b/i;
const CREATIVE = /\b(?:story|poem|poetry|roleplay|role-play|role play|pretend (?:to be|you)|fiction|fanfic|lyrics|screenplay|dialogue|villain|uncensored|unfiltered|no filter|without restrictions|dark humou?r|nsfw|erotic|brainstorm)\b/i;

export function classifyIntent(text: string): Exclude<Intent, "local"> {
  const t = text.length > 4000 ? text.slice(0, 4000) : text;
  if (IMAGE.test(t)) return "image";
  if (CODE.test(t)) return "code";
  if (REASON.test(t)) return "reason";
  if (CREATIVE.test(t)) return "creative";
  return "general";
}

interface V {
  provider: string;
  id: string;
  ms: number;
}
const LIVE: V[] = (verified.models as V[]).slice().sort((a, b) => a.ms - b.ms);
/** Verified models the owner has not switched off in /admin. */
const liveNow = () => LIVE.filter((m) => !isModelDisabled(m.provider, m.id));
const has = (provider: string, id: string) => liveNow().some((m) => m.provider === provider && m.id === id);

/** Preference lists. Each entry is only used if the last live verification run (`scripts/verify-keyless-models.mjs`) passed it. */
const PREFS: Record<Exclude<Intent, "local" | "image">, { provider: string; id: string; label: string }[]> = {
  code: [
    { provider: "llm7", id: "codestral-latest", label: "Codestral" },
    { provider: "ovh", id: "Qwen3.8-27B", label: "Qwen 3.8 27B" },
  ],
  reason: [
    { provider: "ovh", id: "gpt-oss-120b", label: "GPT-OSS 120B" },
    { provider: "llm7", id: "gpt-oss:20b", label: "GPT-OSS 20B" },
    { provider: "ovh", id: "gpt-oss-20b", label: "GPT-OSS 20B" },
  ],
  creative: [
    { provider: "ovh", id: "Meta-Llama-3_3-70B-Instruct", label: "Llama 3.3 70B" },
    { provider: "ovh", id: "Mistral-Small-3.2-24B-Instruct-2506", label: "Mistral Small 3.2" },
  ],
  general: [
    { provider: "ovh", id: "Mistral-Small-3.2-24B-Instruct-2506", label: "Mistral Small 3.2" },
    { provider: "ovh", id: "Meta-Llama-3_3-70B-Instruct", label: "Llama 3.3 70B" },
    { provider: "ovh", id: "DeepSeek-V4.1-Flash-1017", label: "DeepSeek V4.1 Flash" },
  ],
};

const WHY: Record<Exclude<Intent, "local">, string> = {
  image: "image request",
  code: "code detected",
  reason: "math / logic detected",
  creative: "creative writing",
  general: "general chat, fastest verified model",
};

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
const fmt = (ms: number) => (ms < 0.01 ? "<0.01" : ms.toFixed(ms < 1 ? 2 : 1));

export function routeAuto(text: string, ctx: RouteContext): RouteDecision {
  const t0 = now();
  // Rule 1: offline or Local-Only -> the mounted local model, no classification, no network.
  if (ctx.offline || ctx.localOnly) {
    return { intent: "local", kind: "local", localId: ctx.localId, label: ctx.localLabel ?? "On-device model", reason: ctx.localOnly ? "Local-Only mode" : "offline", ms: now() - t0 };
  }
  const intent = classifyIntent(text);
  if (intent === "image") return { intent, kind: "image", label: "Apex Flux", reason: WHY.image, ms: now() - t0 };
  const pick = PREFS[intent].find((p) => has(p.provider, p.id)) ?? (liveNow()[0] && { provider: liveNow()[0].provider, id: liveNow()[0].id, label: liveNow()[0].id });
  if (!pick) return { intent: "local", kind: "local", localId: ctx.localId, label: ctx.localLabel ?? "On-device model", reason: "no verified cloud model", ms: now() - t0 };
  return { intent, kind: "cloud", provider: pick.provider, api: pick.id, label: pick.label, reason: WHY[intent], ms: now() - t0 };
}

/** The footer badge: "Routed by Apex Auto -> Codestral · code detected · 0.12ms routing". */
export function routeBadge(d: RouteDecision): string {
  return `Routed by Apex Auto to ${d.label} · ${d.reason} · ${fmt(d.ms)}ms routing`;
}

/** Image prompt out of "/image a cat", "draw a cat", "generate an image of a cat". */
export function imagePromptOf(text: string): string {
  return text
    .replace(/^\s*\/(?:image|imagine|img)\s*/i, "")
    .replace(/^\s*(?:please\s+)?(?:draw|sketch|paint|illustrate|render)\s+(?:me\s+)?/i, "")
    .replace(/^\s*(?:please\s+)?(?:generate|create|make|produce)\s+(?:me\s+)?(?:an?\s+)?(?:image|picture|photo|illustration)\s+(?:of\s+)?/i, "")
    .trim() || text.trim();
}

/* ───────── Local-Only privacy mode ───────── */
const LOCAL_ONLY_KEY = "apex.localonly.v1";
export const getLocalOnly = (): boolean => {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(LOCAL_ONLY_KEY) === "1";
  } catch {
    return false;
  }
};
export function setLocalOnly(v: boolean) {
  try {
    localStorage.setItem(LOCAL_ONLY_KEY, v ? "1" : "0");
  } catch {
    /* storage blocked */
  }
}
