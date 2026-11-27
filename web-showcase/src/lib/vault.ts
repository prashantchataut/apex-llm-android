"use client";

import { REPO } from "./site";
import { assetUrl } from "./paths";

/**
 * Apex API vault — zero-plaintext cryptography (WebCrypto).
 *
 * `public/config/apex-vault.json` is public. It contains NO keys and NO provider URLs, only:
 *   - `salt`                       random hex salt
 *   - `keys[].keyHash`             SHA-256(salt + key)  -> lets the app tell a valid, active key from a wrong one
 *   - `keys[].encryptedCatalogEnvelope`  Envelope A: AES-256-GCM(catalog) under PBKDF2(key, salt, 200 000 × SHA-256)
 *   - `adminEnvelope`              the same catalog under PBKDF2(admin passphrase, salt) so the owner can mint keys
 *
 * The model catalog (labels, upstream ids AND the provider endpoints) is only ever decrypted in memory after the user
 * types a valid `sk-apex-…` key. Nothing in the repo, the bundle or the DOM reveals it before that.
 */

export const VAULT_PATH = "web-showcase/public/config/apex-vault.json";
export const VAULT_RAW = `https://raw.githubusercontent.com/${REPO}/main/${VAULT_PATH}`;
export const KDF_ITERATIONS = 200_000;
/** Keys are owner-chosen strings (any prefix). Anything shorter than this is refused client-side. */
export const MIN_KEY_LEN = 8;
export const KEY_PREFIX = "sk-apex-";
export const OWNER_LOGIN = "prashantchataut";

export type KeyStatus = "active" | "revoked";
export interface VaultKey {
  id: string;
  label: string;
  /** Display only, e.g. `sk-apex-••••9f2a`. */
  prefix: string;
  keyHash: string;
  /** Envelope A (app users). Empty when revoked. */
  encryptedCatalogEnvelope: string;
  /** Envelope B (admin console only): base64 AES-256-GCM of `KeySecret` under the admin passphrase. */
  adminEncryptedKeyString: string;
  /** Model ids this key may use; `["*"]` = everything. Enforced cryptographically: only that subset is sealed in Envelope A. */
  allowedModels: string[];
  status: KeyStatus;
  createdAt: string;
  expiresAt: string | null;
}
export interface VaultFile {
  schema: 3;
  salt: string;
  kdf: { name: "PBKDF2"; hash: "SHA-256"; iterations: number };
  /** Global kill-switch. */
  enabled: boolean;
  updatedAt: string;
  adminEnvelope: string;
  /** Extra accepted passphrases: each is AES-GCM({ pass: <canonical passphrase> }) under PBKDF2(alias, salt). Alias is matched trimmed + lower-case. */
  adminAliases?: string[];
  keys: VaultKey[];
}

export interface ApexModel {
  id: string;
  label: string;
  tag: string;
  group: string;
  kind: "text" | "image";
  /** Upstream model id on the wire. */
  api: string;
  desc?: string;
  reasoning?: boolean;
  vision?: boolean;
  uncensored?: boolean;
  /** Keyless-mesh provider id (set only for models discovered at runtime, never stored in the vault). */
  provider?: string;
}
export interface ApexCatalog {
  v: 1;
  endpoints: { text: string; models: string; image: string; imageModels: string };
  /** Always-on upstream used when a requested model is not served right now. */
  fallbackApi: string;
  models: ApexModel[];
}

/* ───────── primitives ───────── */
const enc = new TextEncoder();
const dec = new TextDecoder();

export const toHex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
export function toB64(b: Uint8Array): string {
  let s = "";
  b.forEach((x) => (s += String.fromCharCode(x)));
  return btoa(s);
}
export const fromB64 = (s: string): Uint8Array<ArrayBuffer> => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
export const randomHex = (bytes: number) => {
  const b = new Uint8Array(bytes);
  crypto.getRandomValues(b);
  return toHex(b);
};

function subtle(): SubtleCrypto {
  const s = globalThis.crypto?.subtle;
  if (!s) throw new Error("WebCrypto is unavailable in this context (needs https or localhost).");
  return s;
}

export async function sha256Hex(text: string): Promise<string> {
  return toHex(new Uint8Array(await subtle().digest("SHA-256", enc.encode(text))));
}
/** SHA-256(salt + key) — the only thing the public vault stores about a key. */
export const hashKey = (salt: string, key: string) => sha256Hex(salt + key.trim());

async function deriveAes(secret: string, salt: string, iterations: number): Promise<CryptoKey> {
  const base = await subtle().importKey("raw", enc.encode(secret), "PBKDF2", false, ["deriveKey"]);
  return subtle().deriveKey({ name: "PBKDF2", salt: enc.encode(salt), iterations, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

/** AES-256-GCM envelope: base64( iv[12] ‖ ciphertext ‖ tag[16] ). */
export async function seal(secret: string, salt: string, data: unknown, iterations = KDF_ITERATIONS): Promise<string> {
  const key = await deriveAes(secret, salt, iterations);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await subtle().encrypt({ name: "AES-GCM", iv }, key, enc.encode(JSON.stringify(data))));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv);
  out.set(ct, iv.length);
  return toB64(out);
}
export async function open<T>(secret: string, salt: string, envelope: string, iterations = KDF_ITERATIONS): Promise<T> {
  const raw = fromB64(envelope);
  const key = await deriveAes(secret, salt, iterations);
  const pt = await subtle().decrypt({ name: "AES-GCM", iv: raw.slice(0, 12) }, key, raw.slice(12));
  return JSON.parse(dec.decode(pt)) as T;
}

/* ───────── fetching ───────── */
export async function fetchVault(): Promise<{ vault: VaultFile; source: "github" | "site" }> {
  const t = Date.now();
  const urls: [string, "github" | "site"][] = [
    [`${VAULT_RAW}?t=${t}`, "github"],
    [`${assetUrl("config/apex-vault.json")}?t=${t}`, "site"],
  ];
  let last: unknown = new Error("Vault unreachable");
  for (const [u, source] of urls) {
    try {
      const r = await fetch(u, { cache: "no-store" });
      if (!r.ok) throw new Error(`Vault answered ${r.status}`);
      const vault = (await r.json()) as VaultFile;
      if (!Array.isArray(vault?.keys) || typeof vault.salt !== "string") throw new Error("Malformed vault");
      return { vault, source };
    } catch (e) {
      last = e;
    }
  }
  throw last;
}

/* ───────── verification + unlock ───────── */
export type AccessState = "none" | "checking" | "active" | "invalid" | "revoked" | "expired" | "disabled" | "offline";
export interface Verdict {
  state: AccessState;
  message: string;
  record?: VaultKey;
  catalog?: ApexCatalog;
}

/** Hash check first (cheap, no plaintext), then PBKDF2 + AES-GCM decrypt of the catalog — all in memory. */
export async function evaluateKey(vault: VaultFile, key: string): Promise<Verdict> {
  const k = key.trim();
  if (k.length < MIN_KEY_LEN) return { state: "invalid", message: "Invalid key · too short." };
  if (!vault.enabled) return { state: "disabled", message: "Apex API is switched off by the admin right now." };
  const h = await hashKey(vault.salt, k);
  const rec = vault.keys.find((x) => x.keyHash === h);
  if (!rec) return { state: "invalid", message: "Invalid key · not recognised." };
  if (rec.status !== "active") return { state: "revoked", message: "Revoked by Admin.", record: rec };
  if (rec.expiresAt && Date.parse(rec.expiresAt) < Date.now()) return { state: "expired", message: "This key has expired.", record: rec };
  try {
    const catalog = await open<ApexCatalog>(k, vault.salt, rec.encryptedCatalogEnvelope, vault.kdf?.iterations ?? KDF_ITERATIONS);
    return { state: "active", message: "Active · Verified", record: rec, catalog };
  } catch {
    return { state: "invalid", message: "Key verified but the catalog could not be decrypted.", record: rec };
  }
}

/* ───────── owner tools (used by /admin only) ───────── */
export async function openAsAdmin(vault: VaultFile, passphrase: string): Promise<ApexCatalog> {
  return open<ApexCatalog>(passphrase, vault.salt, vault.adminEnvelope, vault.kdf?.iterations ?? KDF_ITERATIONS);
}

/** Candidate spellings of what the owner typed: exact, trimmed, trimmed + lower-case (stable order, de-duplicated). */
export const passphraseCandidates = (input: string): string[] => [...new Set([input, input.trim(), input.trim().toLowerCase()])].filter(Boolean);

/**
 * Passphrase-only login. Tries the typed text as the canonical passphrase, then as any registered alias (e.g. the master API key
 * `APEX-PRO-2025`). Case differences and stray whitespace are forgiven. Returns the CANONICAL passphrase (the one every envelope is
 * sealed under) together with the decrypted catalog, or throws when nothing matches.
 */
export async function unlockAdmin(vault: VaultFile, input: string): Promise<{ passphrase: string; catalog: ApexCatalog }> {
  const iter = vault.kdf?.iterations ?? KDF_ITERATIONS;
  for (const c of passphraseCandidates(input)) {
    try {
      return { passphrase: c, catalog: await open<ApexCatalog>(c, vault.salt, vault.adminEnvelope, iter) };
    } catch {
      /* not the canonical passphrase */
    }
    for (const env of vault.adminAliases ?? []) {
      try {
        const { pass } = await open<{ pass: string }>(c, vault.salt, env, iter);
        return { passphrase: pass, catalog: await open<ApexCatalog>(pass, vault.salt, vault.adminEnvelope, iter) };
      } catch {
        /* not this alias */
      }
    }
  }
  throw new Error("auth");
}

const B62 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
export function generateSecretKey(): string {
  const out: string[] = [];
  const buf = new Uint8Array(96);
  crypto.getRandomValues(buf);
  for (const b of buf) {
    if (b >= 248) continue; // rejection sampling (248 = 62 × 4): no modulo bias
    out.push(B62[b % 62]);
    if (out.length === 40) break;
  }
  return KEY_PREFIX + out.join("");
}
export function maskKey(key: string): string {
  const n = key.length >= 20 ? 4 : 2;
  return `${key.startsWith(KEY_PREFIX) ? KEY_PREFIX : ""}••••${key.slice(-n)}`;
}

/* ───────── key strength (advice only: the owner may still choose any string ≥ 8 chars) ───────── */
export interface Strength {
  bits: number;
  label: "Weak" | "Fair" | "Good" | "Strong";
  warn: boolean;
  note: string;
}
export function keyStrength(key: string): Strength {
  const k = key.trim();
  const pool = (/[a-z]/.test(k) ? 26 : 0) + (/[A-Z]/.test(k) ? 26 : 0) + (/[0-9]/.test(k) ? 10 : 0) + (/[^A-Za-z0-9]/.test(k) ? 20 : 0);
  let bits = pool ? Math.log2(pool) * k.length : 0;
  const guessable = /apex|pro|vip|admin|master|pass|key|2024|2025|2026|1234|qwerty|prashant/i.test(k);
  if (guessable) bits = Math.min(bits, 45);
  const label = bits < 60 ? "Weak" : bits < 80 ? "Fair" : bits < 100 ? "Good" : "Strong";
  const note = bits < 80
    ? "The vault file is public, so anyone can try guesses against it offline. A guessable key can be cracked and would unlock the catalog. Use 20+ random characters if the key is more than a personal convenience."
    : "Strong enough to resist offline guessing against the public vault.";
  return { bits: Math.round(bits), label, warn: bits < 80, note };
}

/* ───────── Envelope B ───────── */
export interface KeySecret {
  key: string;
  allowed: string[];
}
export const ALL_MODELS = ["*"];

export function filterCatalog(catalog: ApexCatalog, allowed: string[]): ApexCatalog {
  if (!allowed.length || allowed.includes("*")) return catalog;
  return { ...catalog, models: catalog.models.filter((m) => allowed.includes(m.id)) };
}

export async function sealKeySecret(passphrase: string, vault: Pick<VaultFile, "salt" | "kdf">, secret: KeySecret): Promise<string> {
  return seal(passphrase, vault.salt, secret, vault.kdf?.iterations ?? KDF_ITERATIONS);
}
/** Decrypts every key's Envelope B. Keys without one (or that fail to open) are simply absent from the map. */
export async function openKeySecrets(vault: VaultFile, passphrase: string): Promise<Record<string, KeySecret>> {
  const out: Record<string, KeySecret> = {};
  for (const k of vault.keys) {
    if (!k.adminEncryptedKeyString) continue;
    try {
      out[k.id] = await open<KeySecret>(passphrase, vault.salt, k.adminEncryptedKeyString, vault.kdf?.iterations ?? KDF_ITERATIONS);
    } catch {
      /* wrong passphrase would already have failed on adminEnvelope */
    }
  }
  return out;
}

export interface MintOpts {
  id?: string;
  allowed?: string[];
  status?: KeyStatus;
  createdAt?: string;
}
/**
 * Build a record for a key string:
 *   Envelope A = AES-GCM(filtered catalog) under PBKDF2(key)   + keyHash = SHA-256(salt+key)
 *   Envelope B = AES-GCM({key, allowed}) under PBKDF2(admin passphrase)
 * A revoked record keeps its hash (so apps say "Revoked") and Envelope B (so it can be re-activated) but has no Envelope A.
 */
export async function mintRecord(vault: VaultFile, catalog: ApexCatalog, secret: string, label: string, expiresAt: string | null, passphrase: string, opts: MintOpts = {}): Promise<VaultKey> {
  const key = secret.trim();
  const allowed = opts.allowed?.length ? opts.allowed : ALL_MODELS;
  const status = opts.status ?? "active";
  return {
    id: opts.id ?? `key-${Date.now().toString(36)}`,
    label: label.trim() || "Untitled key",
    prefix: maskKey(key),
    keyHash: await hashKey(vault.salt, key),
    encryptedCatalogEnvelope: status === "active" ? await seal(key, vault.salt, filterCatalog(catalog, allowed), vault.kdf?.iterations ?? KDF_ITERATIONS) : "",
    adminEncryptedKeyString: await sealKeySecret(passphrase, vault, { key, allowed }),
    allowedModels: allowed,
    status,
    createdAt: opts.createdAt ?? new Date().toISOString(),
    expiresAt,
  };
}

/** Change the admin passphrase: re-seal the catalog envelope and every Envelope B. Envelope A (user keys) is untouched. */
export async function rekeyAdmin(vault: VaultFile, catalog: ApexCatalog, secrets: Record<string, KeySecret>, nextPassphrase: string): Promise<VaultFile> {
  const keys: VaultKey[] = [];
  for (const k of vault.keys) {
    const sec = secrets[k.id];
    keys.push(sec ? { ...k, adminEncryptedKeyString: await sealKeySecret(nextPassphrase, vault, sec) } : k);
  }
  // Aliases point at the OLD canonical passphrase, so they are retired when the passphrase changes.
  return { ...vault, adminAliases: undefined, adminEnvelope: await seal(nextPassphrase, vault.salt, catalog, vault.kdf?.iterations ?? KDF_ITERATIONS), keys };
}
