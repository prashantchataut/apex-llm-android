import { kvCacheBytes } from "./compat";

/** Text-model catalog. `repo`/`file`/size verified against the Hugging Face tree API on 2026-11-24; layer/head counts are rounded from model cards. */
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
  /** Hugging Face repo + GGUF filename the app downloads. */
  repo: string;
  file: string;
  /** Starter preset small enough to download in seconds. */
  nano?: boolean;
}

export const CATALOG: CatalogModel[] = [
  { id: "smollm2-135m", name: "SmolLM2 135M · Instant Nano", family: "SmolLM2", paramsB: 0.135, quant: "Q3_K_M", sizeGB: 0.0935, layers: 30, kvHeads: 3, headDim: 64, repo: "bartowski/SmolLM2-135M-Instruct-GGUF", file: "SmolLM2-135M-Instruct-Q3_K_M.gguf", nano: true },
  { id: "qwen25-05b", name: "Qwen2.5 0.5B Instruct", family: "Qwen", paramsB: 0.5, quant: "Q4_K_M", sizeGB: 0.49, layers: 24, kvHeads: 2, headDim: 64, repo: "Qwen/Qwen2.5-0.5B-Instruct-GGUF", file: "qwen2.5-0.5b-instruct-q4_k_m.gguf" },
  { id: "llama32-1b", name: "Llama 3.2 1B Instruct", family: "Llama", paramsB: 1.2, quant: "Q4_K_M", sizeGB: 0.81, layers: 16, kvHeads: 8, headDim: 64, repo: "bartowski/Llama-3.2-1B-Instruct-GGUF", file: "Llama-3.2-1B-Instruct-Q4_K_M.gguf" },
  { id: "smollm2-17b", name: "SmolLM2 1.7B Instruct", family: "SmolLM2", paramsB: 1.7, quant: "Q4_K_M", sizeGB: 1.06, layers: 24, kvHeads: 32, headDim: 64, repo: "bartowski/SmolLM2-1.7B-Instruct-GGUF", file: "SmolLM2-1.7B-Instruct-Q4_K_M.gguf" },
  { id: "gemma2-2b", name: "Gemma 2 2B it", family: "Gemma", paramsB: 2.6, quant: "Q4_K_M", sizeGB: 1.71, layers: 26, kvHeads: 4, headDim: 256, repo: "bartowski/gemma-2-2b-it-GGUF", file: "gemma-2-2b-it-Q4_K_M.gguf" },
  { id: "llama32-3b", name: "Llama 3.2 3B Instruct", family: "Llama", paramsB: 3.2, quant: "Q4_K_M", sizeGB: 2.02, layers: 28, kvHeads: 8, headDim: 128, repo: "bartowski/Llama-3.2-3B-Instruct-GGUF", file: "Llama-3.2-3B-Instruct-Q4_K_M.gguf" },
  { id: "qwen25-3b", name: "Qwen2.5 3B Instruct", family: "Qwen", paramsB: 3.1, quant: "Q4_K_M", sizeGB: 2.1, layers: 36, kvHeads: 2, headDim: 128, repo: "Qwen/Qwen2.5-3B-Instruct-GGUF", file: "qwen2.5-3b-instruct-q4_k_m.gguf" },
  { id: "phi4-mini", name: "Phi-4 mini Instruct", family: "Phi", paramsB: 3.8, quant: "Q4_K_M", sizeGB: 2.49, layers: 32, kvHeads: 8, headDim: 128, repo: "bartowski/microsoft_Phi-4-mini-instruct-GGUF", file: "microsoft_Phi-4-mini-instruct-Q4_K_M.gguf" },
  { id: "r1-7b", name: "DeepSeek-R1-Distill-Qwen 7B", family: "DeepSeek", paramsB: 7.6, quant: "Q4_K_M", sizeGB: 4.68, layers: 28, kvHeads: 4, headDim: 128, reasoning: true, repo: "bartowski/DeepSeek-R1-Distill-Qwen-7B-GGUF", file: "DeepSeek-R1-Distill-Qwen-7B-Q4_K_M.gguf" },
  { id: "qwen3-8b", name: "Qwen3 8B", family: "Qwen", paramsB: 8.2, quant: "Q4_K_M", sizeGB: 5.03, layers: 36, kvHeads: 8, headDim: 128, reasoning: true, repo: "Qwen/Qwen3-8B-GGUF", file: "Qwen3-8B-Q4_K_M.gguf" },
  { id: "llama31-8b", name: "Llama 3.1 8B Instruct", family: "Llama", paramsB: 8.0, quant: "Q5_K_M", sizeGB: 5.73, layers: 32, kvHeads: 8, headDim: 128, repo: "bartowski/Meta-Llama-3.1-8B-Instruct-GGUF", file: "Meta-Llama-3.1-8B-Instruct-Q5_K_M.gguf" },
];

/** The 1-tap starter: <100 MB, verified. Tiny model — fast and private, not a flagship. */
export const NANO_MODEL = CATALOG.find((m) => m.nano) as CatalogModel;

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
