import verified from "@/data/verified-models.json";
import { BUILTIN_PROVIDERS, type MeshProvider } from "@/services/apexCloudMesh";

export interface VerifiedStep {
  provider: MeshProvider;
  api: string;
  ms: number;
}

/** Reasoning models spend a small token budget on hidden thoughts, so they are a poor choice for titles / JSON extraction. */
const SLOW_THINKERS = /gpt-oss|nemotron|qwen3|deepseek-r1|olala/i;

/** Every model that passed the last live probe (HTTP 200 + real text in < 4 s), fastest first. */
export function verifiedChain(opts: { preferred?: { provider: string; api: string }; fastOnly?: boolean } = {}): VerifiedStep[] {
  const all = (verified.models as { provider: string; id: string; ms: number }[])
    .map((m) => ({ provider: BUILTIN_PROVIDERS.find((p) => p.id === m.provider), api: m.id, ms: m.ms }))
    .filter((m): m is VerifiedStep => !!m.provider && m.provider.cors)
    .filter((m) => !opts.fastOnly || !SLOW_THINKERS.test(m.api))
    .sort((a, b) => a.ms - b.ms);
  const pref = opts.preferred && all.find((m) => m.provider.id === opts.preferred!.provider && m.api === opts.preferred!.api);
  return pref ? [pref, ...all.filter((m) => m !== pref)] : all;
}

export const VERIFIED_AT: string = verified.verifiedAt;
export const VERIFIED_COUNT: number = verified.models.length;
export const VERIFIED_TESTED: number = verified.tested;
export const VERIFIED_MODELS = verified.models as { provider: string; id: string; ms: number }[];
