"use client";

import { REPO } from "./site";
import { REGISTRY_PATH, type Registry } from "./access";

/**
 * Admin persistence with zero backend: the owner's GitHub token (kept only in this browser tab's sessionStorage)
 * reads and commits `keyless-registry.json` through the GitHub REST API. Every Publish is a real commit on `main`.
 */
const API = `https://api.github.com/repos/${REPO}`;
const TOKEN_KEY = "apex.admin.token";

export const getToken = () => {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};
export const setToken = (t: string | null) => {
  try {
    if (t) sessionStorage.setItem(TOKEN_KEY, t);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* blocked */
  }
};

const headers = (token: string) => ({ Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" });

export interface Who {
  login: string;
  canPush: boolean;
}
/** Confirms the token is valid and can push to the repository (that is what "admin" means here). */
export async function verifyAdmin(token: string): Promise<Who> {
  const [u, r] = await Promise.all([fetch("https://api.github.com/user", { headers: headers(token), cache: "no-store" }), fetch(API, { headers: headers(token), cache: "no-store" })]);
  if (u.status === 401 || r.status === 401) throw new Error("GitHub rejected this token (401).");
  if (!r.ok) throw new Error(`Can't see ${REPO} with this token (${r.status}).`);
  const repo = (await r.json()) as { permissions?: { push?: boolean; admin?: boolean } };
  const user = (await u.json()) as { login?: string };
  return { login: user.login ?? "unknown", canPush: !!(repo.permissions?.push || repo.permissions?.admin) };
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

export async function loadRegistry(token: string): Promise<{ registry: Registry; sha: string }> {
  const r = await fetch(`${API}/contents/${REGISTRY_PATH}?ref=main&t=${Date.now()}`, { headers: headers(token), cache: "no-store" });
  if (!r.ok) throw new Error(`Couldn't load the registry (${r.status}).`);
  const j = (await r.json()) as { content: string; sha: string };
  return { registry: JSON.parse(b64decode(j.content)) as Registry, sha: j.sha };
}

export async function publishRegistry(token: string, registry: Registry, sha: string, message: string): Promise<{ sha: string; commitUrl: string }> {
  const body = { message, content: b64encode(`${JSON.stringify({ ...registry, updatedAt: new Date().toISOString() }, null, 2)}\n`), sha, branch: "main" };
  const r = await fetch(`${API}/contents/${REGISTRY_PATH}`, { method: "PUT", headers: { ...headers(token), "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (r.status === 409 || r.status === 422) throw new Error("The registry changed on GitHub since you loaded it. Reload and re-apply your change.");
  if (!r.ok) throw new Error(`Publish failed (${r.status}). The token needs "contents: write" on ${REPO}.`);
  const j = (await r.json()) as { content: { sha: string }; commit: { html_url: string } };
  return { sha: j.content.sha, commitUrl: j.commit.html_url };
}
