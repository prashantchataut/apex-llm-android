/**
 * TypeScript mirror of `cortex-hardware::recommend` + `cortex-hf-hub::scoring::score`.
 * Keep both in sync (see RULES.md). Used by the demo UI; the app calls the Rust crates.
 */
export const GIB = 1024 ** 3;
export const MIB = 1024 ** 2;
export const OS_RESERVE = 1.2 * GIB;

export type Compat = "optimal" | "heavy" | "incompatible";
export type QuantName = "Q3_K_M" | "IQ4_XS" | "Q4_K_M" | "Q5_K_M" | "Q6_K";

export interface DeviceProfile {
  label: string;
  totalGB: number;
  availGB: number;
  freeStorageGB: number;
  vulkan: boolean;
  dotprod: boolean;
  cores: number;
  /** Hexagon / QNN-class NPU available to apps. */
  npu: boolean;
  /** Relative CPU throughput, 1.0 = mid-range 8 GB phone (used only for ETAs). */
  speed: number;
}

export interface Recommendation {
  budgetBytes: number;
  maxGgufBytes: number;
  quant: QuantName;
  maxCtx: number;
  threads: number;
  cpuVariant: string;
}

export const DEVICES: DeviceProfile[] = [
  { label: "4 GB budget", totalGB: 4, availGB: 1.9, freeStorageGB: 18, vulkan: false, dotprod: false, cores: 8, npu: false, speed: 0.4 },
  { label: "8 GB mid", totalGB: 7.63, availGB: 4.6, freeStorageGB: 64, vulkan: true, dotprod: true, cores: 8, npu: false, speed: 1 },
  { label: "12 GB flagship", totalGB: 11.4, availGB: 7.8, freeStorageGB: 180, vulkan: true, dotprod: true, cores: 8, npu: true, speed: 1.9 },
];

export function recommend(d: DeviceProfile): Recommendation {
  const total = d.totalGB * GIB;
  const avail = d.availGB * GIB;
  const budget = Math.max(0, Math.min(0.55 * avail, 0.45 * total, avail - OS_RESERVE));
  let quant: QuantName;
  if (budget >= 6 * GIB && d.totalGB >= 11) quant = "Q5_K_M";
  else if (d.totalGB >= 5.5) quant = "Q4_K_M";
  else if (d.totalGB >= 3.5) quant = "IQ4_XS";
  else quant = "Q3_K_M";
  const maxCtx = budget >= 4 * GIB ? 8192 : budget >= 2.5 * GIB ? 4096 : budget >= 1.5 * GIB ? 2048 : 1024;
  const threads = Math.min(6, Math.max(2, Math.floor((Math.max(2, d.cores) + 1) / 2)));
  return {
    budgetBytes: budget,
    maxGgufBytes: budget * 0.88,
    quant,
    maxCtx,
    threads,
    cpuVariant: d.dotprod ? "armv8.2-a+dotprod+fp16" : "armv8-a",
  };
}

/** 2 · layers · ctx · kvHeads · headDim · bytesPerElem (f16 = 2) */
export function kvCacheBytes(layers: number, ctx: number, kvHeads: number, headDim: number, bytes = 2): number {
  return 2 * layers * ctx * kvHeads * headDim * bytes;
}

export function score(d: DeviceProfile, fileBytes: number, kvBytes: number): Compat {
  const rec = recommend(d);
  const need = fileBytes * 1.05 + kvBytes;
  if (fileBytes + GIB > d.freeStorageGB * GIB) return "incompatible";
  if (need <= rec.budgetBytes) return "optimal";
  if (need <= d.availGB * GIB * 0.85) return "heavy";
  return "incompatible";
}

export const BADGE: Record<Compat, { label: string; tone: string }> = {
  optimal: { label: "Fits well", tone: "text-ok bg-ok/10 border-ok/30" },
  heavy: { label: "Heavy · high RAM", tone: "text-warn bg-warn/10 border-warn/30" },
  incompatible: { label: "Won’t fit", tone: "text-bad bg-bad/10 border-bad/30" },
};

export function fmtBytes(b: number): string {
  return b >= GIB ? `${(b / GIB).toFixed(2)} GB` : `${Math.round(b / MIB)} MB`;
}
