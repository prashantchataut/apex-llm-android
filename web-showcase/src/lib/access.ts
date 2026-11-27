"use client";

import { useSyncExternalStore } from "react";
import { evaluateKey, fetchVault, type AccessState, type ApexCatalog, type Verdict } from "./vault";

export type { AccessState, Verdict } from "./vault";

/**
 * Apex API access control.
 *
 * Local models are always free and need nothing. The Apex API (cloud) tier is locked until the user enters a valid,
 * unrevoked `sk-apex-…` key. Verification is zero-plaintext: the public vault only stores SHA-256(salt+key) and an
 * AES-256-GCM catalog envelope (see `vault.ts`). The decrypted catalog (models + provider endpoints) lives only in
 * memory and is re-derived from the stored key on every start, so a revoked key locks the tier on the next check and
 * the app falls back to its local models.
 *
 * Honest limit: this is an app-level gate. Once a legitimate user has unlocked, the upstream endpoint is visible in
 * their own network traffic, and a modified client could bypass the check; it cannot be recovered from the repo.
 */

const STORE = "apex.access.v2";
const GRACE_MS = 24 * 3600 * 1000;

export interface Access {
  key: string | null;
  state: AccessState;
  label: string | null;
  keyId: string | null;
  prefix: string | null;
  /** In-memory only. */
  catalog: ApexCatalog | null;
  verifiedAt: number | null;
  checkedAt: number | null;
  message: string;
  /** Kept for the UI badges: all models of the catalog are included in every key. */
  allowedModels: string[];
  maxDailyRequests: number;
}

const NONE: Access = { key: null, state: "none", label: null, keyId: null, prefix: null, catalog: null, verifiedAt: null, checkedAt: null, message: "", allowedModels: [], maxDailyRequests: 0 };

function load(): Access {
  if (typeof window === "undefined") return NONE;
  try {
    const raw = JSON.parse(localStorage.getItem(STORE) ?? "null") as Partial<Access> | null;
    if (raw?.key) return { ...NONE, key: raw.key, label: raw.label ?? null, keyId: raw.keyId ?? null, prefix: raw.prefix ?? null, verifiedAt: raw.verifiedAt ?? null, state: "checking", message: "Checking…" };
  } catch {
    /* ignore */
  }
  return NONE;
}

let access: Access = load();
const subs = new Set<() => void>();

function commit(next: Access) {
  access = next;
  try {
    if (next.key) localStorage.setItem(STORE, JSON.stringify({ key: next.key, label: next.label, keyId: next.keyId, prefix: next.prefix, verifiedAt: next.verifiedAt }));
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
export const isUnlocked = (a: Access = access) => a.state === "active" && !!a.catalog;

function activeFrom(cur: Access, key: string, v: Verdict): Access {
  return { ...cur, key, state: "active", label: v.record?.label ?? cur.label, keyId: v.record?.id ?? null, prefix: v.record?.prefix ?? null, catalog: v.catalog ?? cur.catalog, allowedModels: ["*"], verifiedAt: Date.now(), checkedAt: Date.now(), message: v.message };
}

/** Verify a candidate key against the live vault; with `save` an active key is stored and unlocks the Apex API. */
export async function verifyKey(key: string, save = false): Promise<Verdict> {
  const k = key.trim();
  if (!k) return { state: "none", message: "Enter your Apex API key." };
  try {
    const { vault } = await fetchVault();
    const v = await evaluateKey(vault, k);
    if (save && v.state === "active") commit(activeFrom(access, k, v));
    return v.state === "active" ? { state: v.state, message: v.message, record: v.record } : v;
  } catch (e) {
    const m = e instanceof Error ? e.message : "";
    return { state: "offline", message: m.includes("WebCrypto") ? m : "Couldn't reach the vault. Check your connection and try again." };
  }
}

let inflight: Promise<Access> | null = null;
/** Re-check the stored key. A network failure keeps a recently-verified key (grace); otherwise it stays locked. */
export function revalidate(): Promise<Access> {
  if (!access.key) return Promise.resolve(access);
  inflight ??= (async () => {
    const cur = access;
    try {
      const { vault } = await fetchVault();
      const v = await evaluateKey(vault, cur.key as string);
      if (v.state === "active") commit(activeFrom(cur, cur.key as string, v));
      else commit({ ...cur, state: v.state, catalog: null, allowedModels: [], checkedAt: Date.now(), message: v.message });
    } catch {
      const fresh = cur.verifiedAt && Date.now() - cur.verifiedAt < GRACE_MS;
      commit({ ...cur, state: fresh && cur.catalog ? "active" : "offline", checkedAt: Date.now(), message: fresh && cur.catalog ? "Active · verified earlier (offline)" : "Offline · can't verify key" });
    }
    return access;
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}
export function removeKey() {
  commit({ ...NONE });
}

export interface Gate {
  ok: boolean;
  reason: string;
}
/** Run right before every Apex API request: fresh vault check (revoked -> lock + local fallback). */
export async function gateApex(): Promise<Gate> {
  if (!access.key) return { ok: false, reason: "Apex API is locked. Enter your Apex API key to unlock it." };
  const a = await revalidate();
  if (a.state !== "active" || !a.catalog) return { ok: false, reason: a.state === "revoked" ? "Your Apex API key was revoked by the admin. Switched to your local model." : a.message || "Apex API is locked." };
  return { ok: true, reason: "" };
}

/** UI badge only; the real gate is `gateApex`. */
export const modelUnlocked = (_modelId: string, a: Access = access) => isUnlocked(a);

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
