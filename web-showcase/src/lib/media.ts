import { GIB, OS_RESERVE, type Compat, type DeviceProfile } from "./compat";

/**
 * Image + video model catalog.
 *
 * `sizeGB` of the primary file was read from the Hugging Face tree API on 2026-11-24 (verified).
 * Companion files (text encoder / VAE), peak RAM and ETAs are ESTIMATES (unverified) and are
 * flagged as such in the UI. The Rust mirror is `cortex-hf-hub::media`.
 */
export type MediaKind = "image" | "video";
export type MediaEngine = "sd.cpp" | "mnn" | "qnn";

export interface Companion {
  label: string;
  gb: number;
  verified: boolean;
}

export interface MediaModel {
  id: string;
  kind: MediaKind;
  name: string;
  family: string;
  repo: string;
  file: string;
  /** Primary file size, GB. Verified against the HF API. */
  sizeGB: number;
  companions: Companion[];
  engine: MediaEngine;
  /** Needs a Snapdragon-class NPU (QNN). */
  needsNpu?: boolean;
  /** Estimated peak RAM while generating (GB). UNVERIFIED. */
  peakRamGB: number;
  /** Estimated seconds per output on a mid-range phone (speed = 1). UNVERIFIED. NPU models ignore device speed. */
  etaSec: number;
  /** Output spec shown to the user. */
  output: string;
  steps: number;
  /** 1–5, used to pick the best model that fits. */
  quality: number;
  note: string;
}

export const MEDIA_CATALOG: MediaModel[] = [
  {
    id: "sd-turbo-q8",
    kind: "image",
    name: "SD-Turbo",
    family: "Stable Diffusion",
    repo: "Green-Sky/SD-Turbo-GGUF",
    file: "sd_turbo-f16-q8_0.gguf",
    sizeGB: 2.02,
    companions: [],
    engine: "sd.cpp",
    peakRamGB: 3.1,
    etaSec: 22,
    output: "512×512 · 1–4 steps",
    steps: 4,
    quality: 2,
    note: "Fastest on CPU. Good for drafts.",
  },
  {
    id: "sd15-q4",
    kind: "image",
    name: "Stable Diffusion 1.5",
    family: "Stable Diffusion",
    repo: "second-state/stable-diffusion-v1-5-GGUF",
    file: "stable-diffusion-v1-5-pruned-emaonly-Q4_0.gguf",
    sizeGB: 1.57,
    companions: [],
    engine: "sd.cpp",
    peakRamGB: 2.6,
    etaSec: 150,
    output: "512×512 · 20 steps",
    steps: 20,
    quality: 2,
    note: "Small and widely compatible.",
  },
  {
    id: "sd15-mnn",
    kind: "image",
    name: "AbsoluteReality · MNN",
    family: "SD 1.5 tuned",
    repo: "xororz/sd-mnn",
    file: "AbsoluteReality.zip",
    sizeGB: 1.19,
    companions: [],
    engine: "mnn",
    peakRamGB: 2.0,
    etaSec: 70,
    output: "512×512 · 20 steps",
    steps: 20,
    quality: 3,
    note: "Photoreal tune, built for phone CPUs.",
  },
  {
    id: "sd15-qnn",
    kind: "image",
    name: "AbsoluteReality · NPU",
    family: "SD 1.5 tuned",
    repo: "xororz/sd-qnn",
    file: "AbsoluteReality_qnn2.28_8gen2.zip",
    sizeGB: 1.05,
    companions: [],
    engine: "qnn",
    needsNpu: true,
    peakRamGB: 2.2,
    etaSec: 6,
    output: "512×512 · 20 steps",
    steps: 20,
    quality: 3,
    note: "Snapdragon 8 Gen 2 NPU build. Seconds per image.",
  },
  {
    id: "sdxl-turbo-q8",
    kind: "image",
    name: "SDXL-Turbo",
    family: "Stable Diffusion XL",
    repo: "OlegSkutte/sdxl-turbo-GGUF",
    file: "sd_xl_turbo_1.0.q8_0.gguf",
    sizeGB: 4.1,
    companions: [],
    engine: "sd.cpp",
    peakRamGB: 6.0,
    etaSec: 95,
    output: "512×512 · 1–4 steps",
    steps: 4,
    quality: 4,
    note: "Sharper detail. Needs a flagship.",
  },
  {
    id: "flux-schnell-q3k",
    kind: "image",
    name: "FLUX.1 schnell",
    family: "FLUX",
    repo: "leejet/FLUX.1-schnell-gguf",
    file: "flux1-schnell-q3_k.gguf",
    sizeGB: 5.31,
    companions: [
      { label: "T5-XXL (quantised)", gb: 2.9, verified: false },
      { label: "CLIP-L + VAE", gb: 0.6, verified: false },
    ],
    engine: "sd.cpp",
    peakRamGB: 10,
    etaSec: 620,
    output: "512×512 · 4 steps",
    steps: 4,
    quality: 5,
    note: "Best quality. 16 GB phones only.",
  },
  {
    id: "wan21-13b-q4km",
    kind: "video",
    name: "Wan 2.1 · 1.3B",
    family: "Wan",
    repo: "samuelchristlie/Wan2.1-T2V-1.3B-GGUF",
    file: "Wan2.1-T2V-1.3B-Q4_K_M.gguf",
    sizeGB: 0.98,
    companions: [
      { label: "UMT5-XXL encoder (quantised)", gb: 3.4, verified: false },
      { label: "VAE", gb: 0.25, verified: false },
    ],
    engine: "sd.cpp",
    peakRamGB: 6.0,
    etaSec: 1500,
    output: "480×272 · 33 frames · ~2 s",
    steps: 20,
    quality: 3,
    note: "Text to video. Slow on a phone, runs offline.",
  },
  {
    id: "ltxv-2b-q4km",
    kind: "video",
    name: "LTX-Video 2B · distilled",
    family: "LTX-Video",
    repo: "city96/LTX-Video-0.9.6-distilled-gguf",
    file: "ltxv-2b-0.9.6-distilled-04-25-Q4_K_M.gguf",
    sizeGB: 1.33,
    companions: [
      { label: "VAE (BF16)", gb: 2.49, verified: true },
      { label: "T5-XXL encoder (quantised)", gb: 2.9, verified: false },
    ],
    engine: "sd.cpp",
    peakRamGB: 6.8,
    etaSec: 720,
    output: "512×320 · 49 frames · ~2 s",
    steps: 8,
    quality: 4,
    note: "Distilled for few steps. Fastest video option.",
  },
];

export function mediaTotalGB(m: MediaModel): number {
  return m.sizeGB + m.companions.reduce((a, c) => a + c.gb, 0);
}

/** Diffusion does not share RAM with a loaded LLM, so it may use a larger share of free memory than text models. */
export function mediaBudgetBytes(d: DeviceProfile): number {
  const total = d.totalGB * GIB;
  const avail = d.availGB * GIB;
  return Math.max(0, Math.min(0.7 * avail, 0.6 * total, avail - OS_RESERVE));
}

/** Mirror of `cortex_hf_hub::media::score_media`. */
export function scoreMedia(d: DeviceProfile, m: MediaModel): Compat {
  if (m.needsNpu && !d.npu) return "incompatible";
  if (mediaTotalGB(m) * GIB + GIB > d.freeStorageGB * GIB) return "incompatible";
  const need = m.peakRamGB * GIB;
  if (need <= mediaBudgetBytes(d)) return "optimal";
  if (need <= d.availGB * GIB * 0.9) return "heavy";
  return "incompatible";
}

export function etaSeconds(d: DeviceProfile, m: MediaModel): number {
  return m.needsNpu ? m.etaSec : m.etaSec / d.speed;
}

export function fmtEta(sec: number): string {
  if (sec < 90) return `~${Math.max(1, Math.round(sec))} s`;
  if (sec < 5400) return `~${Math.round(sec / 60)} min`;
  return `~${(sec / 3600).toFixed(1)} h`;
}

/** Best model of `kind` that fits: highest quality among optimal, else among heavy. */
export function bestMedia(d: DeviceProfile, kind: MediaKind): MediaModel | null {
  const pool = MEDIA_CATALOG.filter((m) => m.kind === kind);
  const pick = (c: Compat) => pool.filter((m) => scoreMedia(d, m) === c).sort((a, b) => b.quality - a.quality || a.etaSec - b.etaSec)[0];
  return pick("optimal") ?? pick("heavy") ?? null;
}
