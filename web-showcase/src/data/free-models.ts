import { tailOf } from "./frontier";

export type Cap = "Reasoning" | "Fast" | "Code" | "Vision";

export interface Target {
  key: string;
  label: string;
  rx: RegExp;
  cap?: Cap;
}

/** Free Cloud Models (Instant): no key, no download. Each resolves to the fastest route that passed the live completion probe. */
export const FREE_MODELS: Target[] = [
  { key: "gpt-4-1-mini", label: "GPT-4.1 Mini Free", rx: /^gpt-4\.1-mini/, cap: "Fast" },
  { key: "gemini-2-5-flash", label: "Gemini 2.5 Flash Free", rx: /^gemini-2\.5-flash(?!.*(tts|image|lite))/, cap: "Fast" },
  { key: "deepseek-v3", label: "DeepSeek V3 Free", rx: /^deepseek-v3/, cap: "Fast" },
  { key: "qwen3-coder", label: "Qwen 3 Coder Free", rx: /^qwen-?3-?coder/, cap: "Code" },
  { key: "llama-3-3-70b", label: "Llama 3.3 70B Free", rx: /llama-3[._]3-70b/, cap: "Fast" },
];

/** Apex API flagships (from stormy + zeusdesigns). A target without a live route is listed as "No live route", never faked. */
export const API_FLAGSHIPS: Target[] = [
  { key: "claude-4-opus", label: "Claude 4 Opus", rx: /^claude-opus-4(-2025|$|\.1$)/, cap: "Reasoning" },
  { key: "claude-4-sonnet", label: "Claude 4 Sonnet", rx: /^claude-sonnet-4(-2025|$)/, cap: "Code" },
  { key: "claude-3-7-sonnet", label: "Claude 3.7 Sonnet", rx: /^claude-3[-.]7-sonnet/, cap: "Code" },
  { key: "gpt-4-5", label: "GPT-4.5", rx: /^gpt-4\.5/, cap: "Fast" },
  { key: "gpt-4-1", label: "GPT-4.1", rx: /^gpt-4\.1(-2025.*)?$/, cap: "Fast" },
  { key: "o3", label: "o3", rx: /^o3($|-2025|-pro)/, cap: "Reasoning" },
  { key: "o4-mini", label: "o4-mini", rx: /^o4-mini/, cap: "Reasoning" },
  { key: "gemini-2-5-pro", label: "Gemini 2.5 Pro", rx: /^gemini-2\.5-pro(?!.*tts)/, cap: "Reasoning" },
  { key: "grok-3", label: "Grok 3", rx: /^grok-3/, cap: "Fast" },
  { key: "deepseek-r1", label: "DeepSeek R1 671B", rx: /^deepseek-r1(?!.*distill)/, cap: "Reasoning" },
  { key: "qwen3-235b", label: "Qwen 3 235B", rx: /^qwen-?3-?235|^qwen3-235/, cap: "Reasoning" },
  { key: "llama-4-maverick", label: "Llama 4 Maverick", rx: /llama-4-maverick/, cap: "Fast" },
  { key: "llama-4-scout", label: "Llama 4 Scout", rx: /llama-4-scout/, cap: "Fast" },
];

interface R {
  id: string;
  api: string;
  verified?: boolean;
  ms?: number;
  disabled?: boolean;
  nativeOnly?: boolean;
}

/** Best live route for a target: probe-verified first, then fastest. `live` is false when nothing answered the probe. */
export function resolveTarget<M extends R>(models: M[], t: Target): { model: M | undefined; live: boolean } {
  const routes = models.filter((m) => !m.nativeOnly && !m.disabled && t.rx.test(tailOf(m.api))).sort((a, b) => Number(!!b.verified) - Number(!!a.verified) || (a.ms ?? 1e9) - (b.ms ?? 1e9));
  const best = routes[0];
  return { model: best, live: !!best?.verified };
}
