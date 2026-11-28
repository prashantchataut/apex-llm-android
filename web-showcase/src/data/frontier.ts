/**
 * Frontier Flagships registry.
 *
 * A flagship is a name the owner wants at the top of the catalog, mapped by pattern onto whatever the live gateways and
 * relays actually serve right now. Nothing here claims a model is reachable: reachability comes from real probes
 * (import-time catalog probe + the "Test Live" button in /admin). A flagship with no matching route is shown as
 * "No live route" instead of being faked.
 */

export type Family = "anthropic" | "openai" | "google" | "xai" | "deepseek-qwen" | "llama-mistral" | "uncensored" | "other";

export const FAMILY_LABEL: Record<Family, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  google: "Google",
  xai: "xAI Grok",
  "deepseek-qwen": "DeepSeek & Qwen",
  "llama-mistral": "Llama & Mistral",
  uncensored: "Uncensored",
  other: "Other",
};

/** Model id without gateway routing prefixes (`anthropic/open_router/anthropic/claude-opus-4.5` -> `claude-opus-4.5`). */
export const tailOf = (api: string): string => api.toLowerCase().replace(/:(batch|free)$/, "").split("/").pop() ?? api.toLowerCase();

const UNCENSORED = /uncensor|abliterat|dolphin|\bevil\b|hermes|unity/i;

export function familyOf(api: string): Family {
  const t = tailOf(api);
  if (UNCENSORED.test(api)) return "uncensored";
  if (/^claude/.test(t)) return "anthropic";
  if (/^(gpt|chatgpt|o[134](-|$))/.test(t)) return "openai";
  if (/^(gemini|gemma)/.test(t)) return "google";
  if (/^grok/.test(t)) return "xai";
  if (/deepseek|qwen|qwq/.test(t)) return "deepseek-qwen";
  if (/llama|mistral|mixtral|codestral|pixtral|devstral|magistral|ministral/.test(t)) return "llama-mistral";
  return "other";
}

export interface FlagshipEntry {
  key: string;
  label: string;
  family: Family;
  /** Tested against `tailOf(api)`. */
  rx: RegExp;
  /** Shown in the switcher's featured row. */
  featured?: boolean;
  capability?: "Reasoning" | "Vision" | "Code" | "Search";
}

const E = (key: string, label: string, family: Family, rx: RegExp, extra: Partial<FlagshipEntry> = {}): FlagshipEntry => ({ key, label, family, rx, ...extra });

export const FLAGSHIPS: FlagshipEntry[] = [
  // Anthropic
  E("claude-4-opus", "Claude 4 Opus", "anthropic", /^claude-opus-4(-2025|$|\.1$)/, { featured: true, capability: "Reasoning" }),
  E("claude-opus-5", "Claude Opus 4.5 / 5.x", "anthropic", /^claude-opus-(4\.[5-9]|5)/, { capability: "Reasoning" }),
  E("claude-3-opus", "Claude 3 Opus", "anthropic", /^claude-3-opus/),
  E("claude-4-sonnet", "Claude 4 Sonnet", "anthropic", /^claude-sonnet-4(-2025|$)/, { featured: true }),
  E("claude-3-7-sonnet", "Claude 3.7 Sonnet", "anthropic", /^claude-3[-.]7-sonnet(?!.*think)/, { featured: true }),
  E("claude-3-7-thinking", "Claude 3.7 Sonnet Thinking", "anthropic", /^claude-3[-.]7-sonnet.*think/, { capability: "Reasoning" }),
  E("claude-3-5-sonnet", "Claude 3.5 Sonnet", "anthropic", /^claude-3[-.]5-sonnet/),
  E("claude-3-5-haiku", "Claude 3.5 Haiku", "anthropic", /^claude-3[-.]5-haiku/),
  // OpenAI
  E("gpt-4-5", "GPT-4.5 Preview", "openai", /^gpt-4\.5/, { featured: true }),
  E("gpt-4-1", "GPT-4.1", "openai", /^gpt-4\.1$|^gpt-4\.1-2025/, { featured: true }),
  E("gpt-4-1-mini", "GPT-4.1 Mini", "openai", /^gpt-4\.1-mini/),
  E("gpt-4o", "GPT-4o", "openai", /^gpt-4o$|^gpt-4o-2024/),
  E("o3", "OpenAI o3", "openai", /^o3$|^o3-2025|^o3-pro/, { featured: true, capability: "Reasoning" }),
  E("o4-mini", "OpenAI o4-mini", "openai", /^o4-mini/, { capability: "Reasoning" }),
  E("o3-mini-high", "OpenAI o3-mini High", "openai", /^o3-mini/, { capability: "Reasoning" }),
  E("o1", "OpenAI o1 / o1-pro", "openai", /^o1($|-pro|-2024|-preview)/, { capability: "Reasoning" }),
  // Google
  E("gemini-2-5-pro", "Gemini 2.5 Pro", "google", /^gemini-2\.5-pro(?!.*tts)/, { featured: true, capability: "Reasoning" }),
  E("gemini-2-5-flash", "Gemini 2.5 Flash", "google", /^gemini-2\.5-flash(?!.*(think|tts|lite))/),
  E("gemini-2-5-flash-thinking", "Gemini 2.5 Flash Thinking", "google", /^gemini-2\.5-flash.*think/, { capability: "Reasoning" }),
  E("gemini-2-0-pro", "Gemini 2.0 Pro Experimental", "google", /^gemini-2\.0-pro/),
  // xAI
  E("grok-3", "Grok 3", "xai", /^grok-3$|^grok-3-(beta|latest|fast)/, { featured: true }),
  E("grok-3-thinking", "Grok 3 Thinking", "xai", /^grok-3.*(think|reason)/, { capability: "Reasoning" }),
  E("grok-3-mini", "Grok 3 Mini", "xai", /^grok-3-mini/),
  E("grok-2", "Grok 2", "xai", /^grok-2/),
  // DeepSeek and Qwen
  E("deepseek-r1", "DeepSeek R1 (671B)", "deepseek-qwen", /^deepseek-r1(?!.*(distill|[0-9]b))/, { featured: true, capability: "Reasoning" }),
  E("deepseek-v3", "DeepSeek V3 (0324)", "deepseek-qwen", /^deepseek-v3(?!\.[2-9])/),
  E("qwen3-235b", "Qwen 3 235B A22B", "deepseek-qwen", /qwen-?3[-.]?235/, { featured: true }),
  E("qwq-32b", "QwQ 32B Reasoning", "deepseek-qwen", /^qwq/, { capability: "Reasoning" }),
  E("qwen-2-5-max", "Qwen 2.5 Max", "deepseek-qwen", /^qwen-?2\.5-max/),
  E("qwen-2-5-coder", "Qwen 2.5 Coder 32B", "deepseek-qwen", /^qwen-?2\.5-coder/, { capability: "Code" }),
  // Meta and Mistral
  E("llama-4-maverick", "Llama 4 Maverick (17B-128E)", "llama-mistral", /llama-4-maverick/, { featured: true }),
  E("llama-4-scout", "Llama 4 Scout", "llama-mistral", /llama-4-scout/),
  E("llama-3-3-70b", "Llama 3.3 70B", "llama-mistral", /llama-3[._-]3-70b/),
  E("llama-3-1-405b", "Llama 3.1 405B", "llama-mistral", /llama-3[._-]1-405b/),
  E("mistral-large", "Mistral Large", "llama-mistral", /^mistral-large/),
  E("codestral", "Codestral", "llama-mistral", /^codestral/, { capability: "Code" }),
  E("pixtral-large", "Pixtral Large", "llama-mistral", /^pixtral-large/, { capability: "Vision" }),
  E("sonar-reasoning-pro", "Perplexity Sonar Reasoning Pro", "other", /sonar-reasoning/, { capability: "Search" }),
];

/** A model matching any flagship pattern lands in the "Frontier Flagships" tier. */
export const isFrontier = (api: string): boolean => {
  const t = tailOf(api);
  return FLAGSHIPS.some((f) => f.rx.test(t));
};
export const flagshipOf = (api: string): FlagshipEntry | undefined => {
  const t = tailOf(api);
  return FLAGSHIPS.find((f) => f.rx.test(t));
};

interface Routable {
  id: string;
  provider: string;
  api: string;
  label: string;
  verified?: boolean;
  ms?: number;
  disabled?: boolean;
  nativeOnly?: boolean;
}

export interface FlagshipRoute<M extends Routable = Routable> {
  entry: FlagshipEntry;
  /** Best route first: live-verified, then fastest. */
  routes: M[];
  best?: M;
}

const rankRoute = (a: Routable, b: Routable) => Number(!!b.verified) - Number(!!a.verified) || (a.ms ?? 1e9) - (b.ms ?? 1e9);

/** Map every flagship onto the routes that currently exist (multi-provider failover order). */
export function resolveFlagships<M extends Routable>(models: M[]): FlagshipRoute<M>[] {
  return FLAGSHIPS.map((entry) => {
    const routes = models.filter((m) => !m.nativeOnly && entry.rx.test(tailOf(m.api))).sort(rankRoute);
    return { entry, routes, best: routes.find((r) => !r.disabled) ?? routes[0] };
  });
}
