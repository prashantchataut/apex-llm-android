/**
 * Apex HapticsEngine — one tactile vocabulary for the whole product.
 *
 * Delivery order:
 *   1. Android native bridge `window.ApexHaptics` (MainActivity.kt → VibrationEffect: amplitude control + the
 *      system's tuned TICK / CLICK / HEAVY_CLICK primitives).
 *   2. `navigator.vibrate` (Android WebView / Chrome).
 *   3. Nothing (iOS Safari, desktop) — events are still emitted so the website can draw the waveform.
 *
 * Canonical source: packages/design-system/haptics/haptics.ts (copied to web-showcase/src/lib by scripts/sync-tokens.sh).
 */
export type HapticLevel = "off" | "subtle" | "crisp";
export type HapticName = "tokenTick" | "reasoningPulse" | "reasoningDone" | "detentClick" | "siliconScanSweep" | "heavyLock";

/** Signature patterns, navigator.vibrate semantics: on, off, on, … in ms. */
export const SIGNATURES: Record<HapticName, number[]> = {
  tokenTick: [3],
  reasoningPulse: [8, 60, 12],
  reasoningDone: [15],
  detentClick: [6],
  siliconScanSweep: [4],
  heavyLock: [20, 40, 35],
};

/** System primitive that best matches a signature on Android (used on crisp only). */
const PRIMITIVE: Partial<Record<HapticName, "tick" | "click" | "heavy">> = { tokenTick: "tick", detentClick: "click", siliconScanSweep: "tick" };

const AMPLITUDE: Record<Exclude<HapticLevel, "off">, number> = { subtle: 80, crisp: 255 };
const KEY = "apex.haptics.v1";
/** One tick per this many generated tokens while streaming (halved density on Subtle). */
export const TOKEN_TICK_EVERY = 6;

export interface HapticEvent {
  name: HapticName;
  pattern: number[];
  level: Exclude<HapticLevel, "off">;
  /** true when a vibration motor was actually driven. */
  delivered: boolean;
  at: number;
}

interface NativeBridge {
  play(pattern: string, amplitude: number): void;
  predefined(name: string): boolean;
  available(): boolean;
}

const listeners = new Set<(e: HapticEvent) => void>();
const levelListeners = new Set<() => void>();
let level: HapticLevel | null = null;

function native(): NativeBridge | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { ApexHaptics?: NativeBridge }).ApexHaptics ?? null;
}

export function hapticsSupported(): boolean {
  if (typeof navigator === "undefined") return false;
  const n = native();
  return (n?.available() ?? false) || typeof navigator.vibrate === "function";
}

export function getHapticLevel(): HapticLevel {
  if (level) return level;
  let v: HapticLevel = "off"; // app-controlled haptics are OFF unless the user opts in
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(KEY) : null;
    if (raw === "off" || raw === "subtle" || raw === "crisp") v = raw;
  } catch {
    /* storage blocked */
  }
  level = v;
  return v;
}

export function setHapticLevel(next: HapticLevel): void {
  level = next;
  try {
    localStorage.setItem(KEY, next);
  } catch {
    /* storage blocked */
  }
  levelListeners.forEach((f) => f());
  if (next !== "off") haptic("detentClick");
}

export function subscribeHapticLevel(f: () => void): () => void {
  levelListeners.add(f);
  return () => levelListeners.delete(f);
}

/** Visual listeners (website waveform). Fires for every haptic, even where no motor exists. */
export function onHaptic(f: (e: HapticEvent) => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}

function scaled(pattern: number[], lv: "subtle" | "crisp"): number[] {
  if (lv === "crisp") return pattern;
  // Subtle: shorter pulses (min 2 ms) — navigator.vibrate has no amplitude.
  return pattern.map((ms, i) => (i % 2 === 0 ? Math.max(2, Math.round(ms * 0.6)) : ms));
}

export function haptic(name: HapticName): void {
  const lv = getHapticLevel();
  if (lv === "off") return;
  const pattern = scaled(SIGNATURES[name], lv);
  let delivered = false;
  try {
    const n = native();
    if (n && n.available()) {
      const prim = PRIMITIVE[name];
      if (lv === "crisp" && prim && n.predefined(prim)) delivered = true;
      else {
        n.play(pattern.join(","), AMPLITUDE[lv]);
        delivered = true;
      }
    } else if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      delivered = navigator.vibrate(pattern);
    }
  } catch {
    delivered = false;
  }
  const ev: HapticEvent = { name, pattern, level: lv, delivered, at: Date.now() };
  listeners.forEach((f) => f(ev));
}

/** Call once per generated token; emits `tokenTick` every {@link TOKEN_TICK_EVERY} tokens (every 12 on Subtle). */
export function createTokenTicker(): () => void {
  let n = 0;
  return () => {
    n += 1;
    const every = getHapticLevel() === "subtle" ? TOKEN_TICK_EVERY * 2 : TOKEN_TICK_EVERY;
    if (n % every === 0) haptic("tokenTick");
  };
}

/** Geiger-like sweep: `count` ticks with accelerating spacing (siliconScanSweep). Returns a cancel fn. */
export function scanSweep(count: number, startMs = 160, endMs = 45): () => void {
  const ids: number[] = [];
  let t = 0;
  for (let i = 0; i < count; i++) {
    const frac = count <= 1 ? 1 : i / (count - 1);
    t += startMs + (endMs - startMs) * frac;
    ids.push(window.setTimeout(() => haptic("siliconScanSweep"), t));
  }
  return () => ids.forEach((id) => window.clearTimeout(id));
}
