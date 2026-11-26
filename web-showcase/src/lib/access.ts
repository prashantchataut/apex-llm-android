"use client";

import { useSyncExternalStore } from "react";
import { REPO } from "./site";
import { assetUrl } from "./paths";

/**
 * Keyless Cloud access control.
 *
 * Local models are always free and need nothing. Keyless *Cloud* models are locked until the user enters an access
 * key that the owner manages from `/admin`. The owner's registry is a JSON file in the repo
 * (`web-showcase/public/config/keyless-registry.json`) that the app re-fetches (`cache: "no-store"` + `?t=` buster)
 * on start-up, when the app returns to the foreground, on a timer, and right before every keyless request. Revoking a
 * key (or flipping the global kill-switch) therefore locks every device on its next check and the app falls back to
 * its local models.
 *
 * Honest limits: the registry is public, so it stores SHA-256 hashes (never plaintext keys) — use long random keys;
 * and because the upstream cloud endpoint is anonymous, this is an app-level gate, not server-side enforcement.
 */

export const REGISTRY_PATH = "web-showcase/public/config/keyless-registry.json";
export const REGISTRY_RAW = `https://raw.githubusercontent.com/${REPO}/main/${REGISTRY_PATH}`;
const REGISTRY_LOCAL = assetUrl("config/keyless-registry.json");
/** Default key documented in the PR and /admin so the owner can test immediately; revoke or rotate it any time. */
export const DEFAULT_KEY = "APEX-PRO-2025";

export type KeyStatus = "active" | "revoked";
export interface KeyRecord {
  id: string;
  /** `sha256:<hex>` of the key (a legacy plaintext value is also accepted). */
  keyHashOrValue: string;
  hint?: string;
  label: string;
  status: KeyStatus;
  createdAt: string;
  expiresAt: string | null;
  /** 0 = unlimited. Enforced per device per UTC day. */
  maxDailyRequests: number;
  /** Keyless model ids, or `["*"]` for all. */
  allowedModels: string[];
}
export interface Registry {
  schema: number;
  keylessEnabled: boolean;
  updatedAt: string;
  keys: KeyRecord[];
}

/* ───────── SHA-256 (pure JS: works in insecure contexts / old WebViews where crypto.subtle is missing) ───────── */
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);
export function sha256Hex(text: string): string {
  const msg = new TextEncoder().encode(text);
  const len = msg.length;
  const total = ((len + 9 + 63) >> 6) << 6;
  const buf = new Uint8Array(total);
  buf.set(msg);
  buf[len] = 0x80;
  const dv = new DataView(buf.buffer);
  dv.setUint32(total - 8, Math.floor((len * 8) / 0x100000000));
  dv.setUint32(total - 4, (len * 8) >>> 0);
  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const w = new Uint32Array(64);
  const rr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  for (let o = 0; o < total; o += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(o + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rr(w[i - 15], 7) ^ rr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rr(w[i - 2], 17) ^ rr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];
    for (let i = 0; i < 64; i++) {
      const t1 = (hh + (rr(e, 6) ^ rr(e, 11) ^ rr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) >>> 0;
      const t2 = ((rr(a, 2) ^ rr(a, 13) ^ rr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h[0] += a; h[1] += b; h[2] += c; h[3] += d; h[4] += e; h[5] += f; h[6] += g; h[7] += hh;
  }
  return [...h].map((x) => x.toString(16).padStart(8, "0")).join("");
}
export const hashKey = (key: string) => `sha256:${sha256Hex(key.trim())}`;
export function hintFor(key: string): string {
  const k = key.trim();
  return k.length <= 6 ? `${k.slice(0, 1)}…` : `${k.slice(0, 4)}…${k.slice(-2)}`;
}
export const randomKey = () => {
  const b = new Uint8Array(12);
  crypto.getRandomValues(b);
  return `apex-key-${[...b].map((x) => x.toString(36).padStart(2, "0")).join("").slice(0, 18)}`;
};

/* ───────── registry fetch ───────── */
export async function fetchRegistry(): Promise<{ registry: Registry; source: "github" | "site" }> {
  const t = Date.now();
  const urls: [string, "github" | "site"][] = [
    [`${REGISTRY_RAW}?t=${t}`, "github"],
    [`${REGISTRY_LOCAL}?t=${t}`, "site"],
  ];
  let last: unknown = new Error("registry unreachable");
  for (const [u, source] of urls) {
    try {
      const c = new AbortController();
      const timer = setTimeout(() => c.abort(), 8000);
      const r = await fetch(u, { cache: "no-store", signal: c.signal });
      clearTimeout(timer);
      if (!r.ok) throw new Error(`registry ${r.status}`);
      const j = (await r.json()) as Registry;
      if (!Array.isArray(j.keys)) throw new Error("registry malformed");
      return { registry: j, source };
    } catch (e) {
      last = e;
    }
  }
  throw last;
}

/* ───────── verification ───────── */
export type AccessState = "none" | "checking" | "active" | "invalid" | "revoked" | "expired" | "disabled" | "offline";
export interface Access {
  key: string | null;
  state: AccessState;
  label?: string;
  keyId?: string;
  allowedModels: string[];
  maxDailyRequests: number;
  verifiedAt: number;
  checkedAt: number;
  message: string;
}
const STORE = "apex.access.v1";
/** Offline grace: a key verified in the last 24h keeps working if the registry cannot be reached. */
const GRACE_MS = 24 * 3600 * 1000;
const NONE: Access = { key: null, state: "none", allowedModels: [], maxDailyRequests: 0, verifiedAt: 0, checkedAt: 0, message: "Locked · Requires Access Key" };
let access: Access = NONE;
const subs = new Set<() => void>();
if (typeof window !== "undefined") {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE) ?? "null") as Access | null;
    // A stored key starts "checking": nothing is unlocked until the first registry check has confirmed it.
    if (raw?.key) access = { ...raw, state: "checking", message: "Checking your key…" };
  } catch {
    /* corrupt */
  }
}
function commit(next: Access) {
  access = next;
  try {
    if (next.key) localStorage.setItem(STORE, JSON.stringify(next));
    else localStorage.removeItem(STORE);
  } catch {
    /* storage blocked */
  }
  subs.forEach((f) => f());
}
export const getAccess = () => access;
export function useAccess(): Access {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => access,
    () => NONE,
  );
}
export const isUnlocked = (a: Access = access) => a.state === "active";

export interface Verdict {
  state: AccessState;
  message: string;
  record?: KeyRecord;
}
export function evaluate(reg: Registry, key: string): Verdict {
  if (!reg.keylessEnabled) return { state: "disabled", message: "Keyless Cloud is switched off by the admin right now." };
  const h = hashKey(key);
  const rec = reg.keys.find((k) => k.keyHashOrValue === h || k.keyHashOrValue === key.trim());
  if (!rec) return { state: "invalid", message: "Invalid key · not found in the registry." };
  if (rec.status !== "active") return { state: "revoked", message: "Revoked by Admin.", record: rec };
  if (rec.expiresAt && Date.parse(rec.expiresAt) < Date.now()) return { state: "expired", message: "This key has expired.", record: rec };
  return { state: "active", message: "Active · Verified", record: rec };
}

/** Verify a candidate key against the live registry; with `save` an active key is stored and unlocks Keyless Cloud. */
export async function verifyKey(key: string, save = false): Promise<Verdict> {
  const k = key.trim();
  if (!k) return { state: "none", message: "Enter your access key." };
  try {
    const { registry } = await fetchRegistry();
    const v = evaluate(registry, k);
    if (save && v.state === "active" && v.record) {
      commit({ key: k, state: "active", label: v.record.label, keyId: v.record.id, allowedModels: v.record.allowedModels, maxDailyRequests: v.record.maxDailyRequests, verifiedAt: Date.now(), checkedAt: Date.now(), message: v.message });
    }
    return v;
  } catch {
    return { state: "offline", message: "Couldn't reach the registry. Check your connection and try again." };
  }
}

/** Re-check the stored key. A network failure keeps a recently-verified key (grace); otherwise it stays locked. */
export async function revalidate(): Promise<Access> {
  const cur = access;
  if (!cur.key) return cur;
  try {
    const { registry } = await fetchRegistry();
    const v = evaluate(registry, cur.key);
    if (v.state === "active" && v.record) {
      commit({ ...cur, state: "active", label: v.record.label, keyId: v.record.id, allowedModels: v.record.allowedModels, maxDailyRequests: v.record.maxDailyRequests, verifiedAt: Date.now(), checkedAt: Date.now(), message: v.message });
    } else {
      commit({ ...cur, state: v.state, allowedModels: [], checkedAt: Date.now(), message: v.message });
    }
  } catch {
    const fresh = cur.verifiedAt && Date.now() - cur.verifiedAt < GRACE_MS;
    commit({ ...cur, state: fresh ? "active" : "offline", checkedAt: Date.now(), message: fresh ? "Active · verified earlier (offline)" : "Offline · can't verify key" });
  }
  return access;
}
export function removeKey() {
  commit({ ...NONE });
}

/* ───────── per-device daily quota ───────── */
const usageKey = () => `apex.access.use.${new Date().toISOString().slice(0, 10)}`;
export function usedToday(): number {
  try {
    return Number(localStorage.getItem(usageKey()) ?? 0) || 0;
  } catch {
    return 0;
  }
}
function bump() {
  try {
    localStorage.setItem(usageKey(), String(usedToday() + 1));
  } catch {
    /* ignore */
  }
}

export interface Gate {
  ok: boolean;
  reason: string;
}
/** Run right before every keyless request: fresh registry check, model allow-list, daily quota. */
export async function gateKeyless(modelId: string): Promise<Gate> {
  if (!access.key) return { ok: false, reason: "Keyless Cloud is locked. Enter an access key to unlock it." };
  const a = await revalidate();
  if (a.state !== "active") return { ok: false, reason: a.state === "revoked" ? "Your access key was revoked by the admin. Switched to your local model." : a.message };
  if (!a.allowedModels.includes("*") && !a.allowedModels.includes(modelId)) return { ok: false, reason: "Your key doesn't include this cloud model." };
  if (a.maxDailyRequests > 0 && usedToday() >= a.maxDailyRequests) return { ok: false, reason: `Daily limit reached (${a.maxDailyRequests} requests for this key).` };
  bump();
  return { ok: true, reason: "" };
}

/** Whether a keyless model is unlocked by the current key (UI badge only; the real gate is `gateKeyless`). */
export const modelUnlocked = (modelId: string, a: Access = access) => a.state === "active" && (a.allowedModels.includes("*") || a.allowedModels.includes(modelId));

let timer: number | null = null;
/** Background re-check loop: on start, on foreground return, and every 90 s while a key is stored. Idempotent. */
export function startAccessWatch(onChange?: (a: Access) => void) {
  if (typeof window === "undefined" || timer !== null) return;
  const run = () => {
    if (access.key) void revalidate().then((a) => onChange?.(a));
  };
  run();
  timer = window.setInterval(run, 90_000);
  document.addEventListener("visibilitychange", () => !document.hidden && run());
}
