import { kvCacheBytes } from "./compat";

/** Demo catalog. Sizes/architectures are APPROXIMATE (rounded from public model cards) — the app reads real values from the HF API. */
export interface CatalogModel {
  id: string;
  name: string;
  family: string;
  paramsB: number;
  quant: string;
  sizeGB: number;
  layers: number;
  kvHeads: number;
  headDim: number;
  reasoning?: boolean;
}

export const CATALOG: CatalogModel[] = [
  { id: "llama32-1b", name: "Llama 3.2 1B Instruct", family: "Llama", paramsB: 1.2, quant: "Q4_K_M", sizeGB: 0.81, layers: 16, kvHeads: 8, headDim: 64 },
  { id: "smollm2-17b", name: "SmolLM2 1.7B Instruct", family: "SmolLM2", paramsB: 1.7, quant: "Q4_K_M", sizeGB: 1.06, layers: 24, kvHeads: 32, headDim: 64 },
  { id: "gemma2-2b", name: "Gemma 2 2B it", family: "Gemma", paramsB: 2.6, quant: "Q4_K_M", sizeGB: 1.71, layers: 26, kvHeads: 4, headDim: 256 },
  { id: "llama32-3b", name: "Llama 3.2 3B Instruct", family: "Llama", paramsB: 3.2, quant: "Q4_K_M", sizeGB: 2.02, layers: 28, kvHeads: 8, headDim: 128 },
  { id: "qwen25-3b", name: "Qwen2.5 3B Instruct", family: "Qwen", paramsB: 3.1, quant: "Q4_K_M", sizeGB: 2.1, layers: 36, kvHeads: 2, headDim: 128 },
  { id: "phi4-mini", name: "Phi-4 mini Instruct", family: "Phi", paramsB: 3.8, quant: "Q4_K_M", sizeGB: 2.49, layers: 32, kvHeads: 8, headDim: 128 },
  { id: "r1-7b", name: "DeepSeek-R1-Distill-Qwen 7B", family: "DeepSeek", paramsB: 7.6, quant: "Q4_K_M", sizeGB: 4.68, layers: 28, kvHeads: 4, headDim: 128, reasoning: true },
  { id: "qwen3-8b", name: "Qwen3 8B", family: "Qwen", paramsB: 8.2, quant: "Q4_K_M", sizeGB: 5.03, layers: 36, kvHeads: 8, headDim: 128, reasoning: true },
  { id: "llama31-8b", name: "Llama 3.1 8B Instruct", family: "Llama", paramsB: 8.0, quant: "Q5_K_M", sizeGB: 5.73, layers: 32, kvHeads: 8, headDim: 128 },
];

export function kvFor(m: CatalogModel, ctx: number): number {
  return kvCacheBytes(m.layers, ctx, m.kvHeads, m.headDim);
}

export interface VoiceModelInfo {
  id: string;
  name: string;
  family: string;
  mb: number;
  note: string;
}

/** Mirrors cortex-voice::CATALOG (sizes unverified). */
export const VOICE_MODELS: VoiceModelInfo[] = [
  { id: "parakeet-ctc-int8", name: "Parakeet CTC · small", family: "Parakeet", mb: 25, note: "English · INT8 · streaming" },
  { id: "moonshine-tiny-int8", name: "Moonshine Tiny", family: "Moonshine", mb: 27, note: "English · INT8 · ultra-low latency" },
  { id: "whisper-tiny-int8", name: "Whisper Tiny", family: "Whisper", mb: 40, note: "99 languages · INT8" },
];
