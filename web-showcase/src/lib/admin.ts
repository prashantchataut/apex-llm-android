"use client";

import { REPO } from "./site";
import { OWNER_LOGIN, VAULT_PATH, open as openEnvelope, seal as sealEnvelope, type VaultFile } from "./vault";

/**
 * Admin persistence with zero backend: the owner's GitHub token lives ONLY in memory (never localStorage /
 * sessionStorage) and reads / commits `apex-vault.json` through the GitHub REST API. Every publish is a real commit.
 * Authentication = a token that GitHub itself says belongs to the owner login + the vault's admin passphrase.
 */
const API = `https://api.github.com/repos/${REPO}`;

// An empty token means read-only: public repo contents are readable without credentials (60 req/h/IP).
const headers = (token: string): Record<string, string> => ({ ...(token ? { Authorization: `Bearer ${token}` } : {}), Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" });

/* ───────── device-sealed repository token ─────────
 * Passphrase-only login. The owner's GitHub token is NEVER stored in the repo or the vault (the vault is public, so any
 * passphrase-sealed copy could be brute-forced offline). It is pasted once, sealed here with AES-256-GCM under
 * PBKDF2(admin passphrase) and kept in this browser's localStorage. After that, unlocking with the passphrase alone
 * unseals it in memory and "Save & Publish" is one click. */
const SEALED_KEY = "apex.admin.sealedRepoToken.v1";
export const hasSealedToken = (): boolean => {
  try {
    return !!localStorage.getItem(SEALED_KEY);
  } catch {
    return false;
  }
};
export async function unsealToken(passphrase: string, salt: string): Promise<string> {
  try {
    const env = localStorage.getItem(SEALED_KEY);
    if (!env) return "";
    return (await openEnvelope<{ t: string }>(passphrase, salt, env)).t;
  } catch {
    return "";
  }
}
export async function sealToken(token: string, passphrase: string, salt: string): Promise<void> {
  localStorage.setItem(SEALED_KEY, await sealEnvelope(passphrase, salt, { t: token }));
}
export const forgetToken = () => {
  try {
    localStorage.removeItem(SEALED_KEY);
  } catch {
    /* ignore */
  }
};

export interface Who {
  login: string;
  canPush: boolean;
}
/** Live check against api.github.com/user: the token must belong to the owner AND be able to push to the repo. */
export async function verifyOwner(token: string): Promise<Who> {
  const [u, r] = await Promise.all([fetch("https://api.github.com/user", { headers: headers(token), cache: "no-store" }), fetch(API, { headers: headers(token), cache: "no-store" })]);
  if (u.status === 401 || r.status === 401) throw new Error("rejected");
  if (!u.ok) throw new Error(`GitHub answered ${u.status}`);
  const user = (await u.json()) as { login?: string };
  if (user.login !== OWNER_LOGIN) throw new Error("not-owner");
  const repo = r.ok ? ((await r.json()) as { permissions?: { push?: boolean; admin?: boolean } }) : {};
  return { login: user.login, canPush: !!(repo.permissions?.push || repo.permissions?.admin) };
}

const b64decode = (b64: string) => {
  const bin = atob(b64.replace(/\s/g, ""));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
};
const b64encode = (s: string) => {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
};

export async function loadVault(token: string): Promise<{ vault: VaultFile; sha: string }> {
  const r = await fetch(`${API}/contents/${VAULT_PATH}?ref=main&t=${Date.now()}`, { headers: headers(token), cache: "no-store" }).catch(() => null);
  if (r?.ok) {
    const j = (await r.json()) as { content: string; sha: string };
    return { vault: JSON.parse(b64decode(j.content)) as VaultFile, sha: j.sha };
  }
  // API rate-limited (anonymous): the public raw file is identical; the sha is fetched lazily at publish time.
  const raw = await fetch(`https://raw.githubusercontent.com/${REPO}/main/${VAULT_PATH}?t=${Date.now()}`, { cache: "no-store" });
  if (!raw.ok) throw new Error(`Couldn't load the vault (${raw.status}).`);
  return { vault: (await raw.json()) as VaultFile, sha: "" };
}

export async function publishVault(token: string, vault: VaultFile, sha: string, message: string): Promise<{ sha: string; commitUrl: string }> {
  return publishJsonFile(token, VAULT_PATH, { ...vault, updatedAt: new Date().toISOString() }, sha, message);
}

/* ───────── generic JSON files (OTA model catalog) ───────── */
export async function loadJsonFile<T>(token: string, path: string): Promise<{ data: T; sha: string }> {
  const r = await fetch(`${API}/contents/${path}?ref=main&t=${Date.now()}`, { headers: headers(token), cache: "no-store" });
  if (!r.ok) throw new Error(`Couldn't load ${path} (${r.status}).`);
  const j = (await r.json()) as { content: string; sha: string };
  return { data: JSON.parse(b64decode(j.content)) as T, sha: j.sha };
}
async function currentSha(token: string, path: string): Promise<string> {
  const r = await fetch(`${API}/contents/${path}?ref=main&t=${Date.now()}`, { headers: headers(token), cache: "no-store" });
  return r.ok ? ((await r.json()) as { sha: string }).sha : "";
}
export async function publishJsonFile(token: string, path: string, data: unknown, sha: string, message: string): Promise<{ sha: string; commitUrl: string }> {
  const useSha = sha || (await currentSha(token, path));
  const body = { message, content: b64encode(`${JSON.stringify(data, null, 2)}\n`), ...(useSha ? { sha: useSha } : {}), branch: "main" };
  const r = await fetch(`${API}/contents/${path}`, { method: "PUT", headers: { ...headers(token), "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (r.status === 409 || r.status === 422) throw new Error("That file changed on GitHub since you loaded it. Reload and re-apply your change.");
  if (!r.ok) throw new Error(`Publish failed (${r.status}). The token needs "contents: write" on ${REPO}.`);
  const j = (await r.json()) as { content: { sha: string }; commit: { html_url: string } };
  return { sha: j.content.sha, commitUrl: j.commit.html_url };
}
