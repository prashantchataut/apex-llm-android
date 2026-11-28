"use client";

import { useSyncExternalStore } from "react";
import { assetUrl } from "./paths";
import { invokeNative, isNative } from "./native";
import { getGithubToken, setGithubTokenMemory } from "./github-token";
import { secureBackend, secureGet, secureRemove, secureSet } from "./secure-store";

/**
 * Per-user GitHub sign-in through GitHub's official OAuth **Device Flow**. Every person authorizes THEIR OWN account on
 * github.com; nothing here (or anywhere in the app, site or admin) contains an owner token, a client secret or any shared
 * account. Only the public OAuth/GitHub-App *Client ID* may ship (config/github-oauth.json).
 *
 *   1. POST /login/device/code (client_id + the scopes the user ticked) -> short user code
 *   2. the user opens github.com/login/device, signs in as themselves and approves the listed permissions
 *   3. we poll /login/oauth/access_token until GitHub returns that user's token
 *
 * Permissions are requested per consent: identity (`read:user`) always; `repo` (private repositories) and `gist`
 * (create Gists) only when the user explicitly ticks them. Token storage: secure-store.ts.
 */
export interface GhConsent {
  privateRepos: boolean;
  gists: boolean;
}
export const NO_EXTRA_CONSENT: GhConsent = { privateRepos: false, gists: false };
export const scopesFor = (c: GhConsent): string => ["read:user", c.privateRepos ? "repo" : "", c.gists ? "gist" : ""].filter(Boolean).join(" ");

export interface GhProfile {
  login: string;
  name: string | null;
  avatar_url: string;
}
export interface GhRepo {
  full_name: string;
  private: boolean;
  description: string | null;
  updated_at: string;
}
export interface DeviceCode {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

interface OauthConfig {
  clientId: string;
  relay: string;
}
let cfg: OauthConfig | null = null;
export async function loadOauthConfig(): Promise<OauthConfig> {
  if (cfg) return cfg;
  const env = process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID ?? "";
  try {
    const j = (await (await fetch(assetUrl("config/github-oauth.json"), { cache: "no-store" })).json()) as Partial<OauthConfig>;
    cfg = { clientId: (env || j.clientId || "").trim(), relay: (j.relay ?? "").trim().replace(/\/+$/, "") };
  } catch {
    cfg = { clientId: env.trim(), relay: "" };
  }
  return cfg;
}
/** Test hook: drop the cached config. */
export const resetOauthConfigCache = () => {
  cfg = null;
};

async function oauthCall<T>(endpoint: "device_code" | "access_token", form: Record<string, string>): Promise<T> {
  const c = await loadOauthConfig();
  let text: string | null = null;
  if (isNative()) text = await invokeNative<string>("github_oauth", { endpoint, form: Object.entries(form) });
  else {
    // github.com sends no CORS headers: the browser build needs the owner's stateless relay (it only forwards these two
    // POSTs and holds no secret). Without one, sign-in is available in the Android app only.
    if (!c.relay) throw new Error("GitHub sign-in needs the Apex Android app, or a relay URL configured by the site owner.");
    text = await (await fetch(`${c.relay}/${endpoint}`, { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(form) })).text();
  }
  if (!text) throw new Error("GitHub did not answer. Check your connection and try again.");
  return JSON.parse(text) as T;
}

export async function startDeviceFlow(consent: GhConsent = NO_EXTRA_CONSENT): Promise<DeviceCode> {
  const { clientId } = await loadOauthConfig();
  if (!clientId) throw new Error("setup");
  const r = await oauthCall<DeviceCode & { error?: string; error_description?: string }>("device_code", { client_id: clientId, scope: scopesFor(consent) });
  if (!r.device_code) throw new Error(r.error_description ?? r.error ?? "GitHub refused the sign-in request.");
  return r;
}

/** Polls until the user authorizes. Honors `slow_down`, stops on expiry / denial / abort. Returns THAT user's token. */
export async function pollDeviceFlow(d: DeviceCode, signal: AbortSignal): Promise<string> {
  const { clientId } = await loadOauthConfig();
  let wait = Math.max(5, d.interval) * 1000;
  const deadline = Date.now() + d.expires_in * 1000;
  while (Date.now() < deadline) {
    await new Promise((res) => setTimeout(res, wait));
    if (signal.aborted) throw new Error("cancelled");
    const r = await oauthCall<{ access_token?: string; error?: string }>("access_token", { client_id: clientId, device_code: d.device_code, grant_type: "urn:ietf:params:oauth:grant-type:device_code" });
    if (r.access_token) return r.access_token;
    if (r.error === "slow_down") wait += 5000;
    else if (r.error === "expired_token") throw new Error("That code expired. Start again.");
    else if (r.error === "access_denied") throw new Error("Authorization was cancelled on GitHub.");
    else if (r.error && r.error !== "authorization_pending") throw new Error(r.error);
  }
  throw new Error("That code expired. Start again.");
}

const gh = (token: string) => ({ Accept: "application/vnd.github+json", Authorization: `Bearer ${token}` });
export async function fetchProfile(token: string): Promise<{ profile: GhProfile; scopes: string[] }> {
  const r = await fetch("https://api.github.com/user", { headers: gh(token) });
  if (!r.ok) throw new Error(r.status === 401 ? "That GitHub session is no longer valid." : `GitHub answered ${r.status}`);
  const j = (await r.json()) as GhProfile;
  const scopes = (r.headers.get("x-oauth-scopes") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return { profile: { login: j.login, name: j.name, avatar_url: j.avatar_url }, scopes };
}
/** The signed-in user's own repositories. Private ones appear only if the user granted `repo`. */
export async function fetchRepos(token: string, includePrivate: boolean): Promise<GhRepo[]> {
  if (!token) return [];
  const q = includePrivate ? "affiliation=owner,collaborator,organization_member" : "visibility=public&affiliation=owner";
  const r = await fetch(`https://api.github.com/user/repos?sort=updated&per_page=30&${q}`, { headers: gh(token) });
  if (!r.ok) return [];
  return ((await r.json()) as GhRepo[]).map((x) => ({ full_name: x.full_name, private: x.private, description: x.description, updated_at: x.updated_at }));
}

/* ───────── session ───────── */
const TOKEN_NAME = "github.token.v1";
const PROFILE_KEY = "apex.github.profile.v2";
const REPO_KEY = "apex.github.repo.v1";
/** Keys written by earlier builds. The shared-account era stored a token and a "public owner" marker in localStorage. */
const LEGACY_KEYS = ["apex.github.pat.v1", "apex.github.public.v1", "apex.github.profile.v1", "apex.admin.sealedRepoToken.v1"];

export interface Session {
  status: "loading" | "signed-out" | "signed-in";
  connected: boolean;
  profile: GhProfile | null;
  scopes: string[];
  canReadPrivate: boolean;
  canCreateGists: boolean;
  storage: "android-keystore" | "session";
}
const base = (status: Session["status"]): Session => ({ status, connected: false, profile: null, scopes: [], canReadPrivate: false, canCreateGists: false, storage: secureBackend() });
const SSR: Session = { status: "loading", connected: false, profile: null, scopes: [], canReadPrivate: false, canCreateGists: false, storage: "session" };
let session: Session = SSR;
const subs = new Set<() => void>();
const publish = (s: Session) => {
  session = s;
  subs.forEach((f) => f());
};
const signedIn = (profile: GhProfile, scopes: string[]): Session => ({
  status: "signed-in",
  connected: true,
  profile,
  scopes,
  canReadPrivate: scopes.includes("repo"),
  canCreateGists: scopes.includes("gist"),
  storage: secureBackend(),
});
export const useGithub = (): Session => useSyncExternalStore((cb) => (subs.add(cb), () => subs.delete(cb)), () => session, () => SSR);

/**
 * Migration: delete every credential an earlier build could have stored (including the shared owner connection and any
 * token pasted by hand), then restore only this user's own Keystore/session token. Idempotent.
 */
export function clearLegacyGithubState() {
  try {
    LEGACY_KEYS.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* storage blocked */
  }
}
let booted: Promise<void> | null = null;
export function initGithubSession(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  booted ??= (async () => {
    clearLegacyGithubState();
    const t = await secureGet(TOKEN_NAME);
    if (!t) return publish(base("signed-out"));
    try {
      const { profile, scopes } = await fetchProfile(t);
      setGithubTokenMemory(t);
      publish(signedIn(profile, scopes));
    } catch (e) {
      // Offline keeps the token for later; an invalid/revoked one is deleted.
      if (e instanceof Error && /no longer valid/.test(e.message)) {
        await secureRemove(TOKEN_NAME);
        publish(base("signed-out"));
      } else {
        publish(base("signed-out"));
      }
    }
  })();
  return booted;
}

/** Verifies a token that GitHub just issued to the signed-in user, stores it securely, and publishes the real username. */
export async function connectWithToken(token: string): Promise<GhProfile> {
  const { profile, scopes } = await fetchProfile(token.trim());
  const ok = await secureSet(TOKEN_NAME, token.trim());
  if (!ok) throw new Error("Could not store the token securely on this device.");
  setGithubTokenMemory(token.trim());
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify({ login: profile.login }));
  } catch {
    /* storage blocked */
  }
  publish(signedIn(profile, scopes));
  return profile;
}
/** Disconnect: forget the token everywhere on this device. (Revoking it on GitHub is done at github.com/settings/applications.) */
export async function signOutGithub(): Promise<void> {
  setGithubTokenMemory("");
  await secureRemove(TOKEN_NAME);
  clearLegacyGithubState();
  try {
    localStorage.removeItem(PROFILE_KEY);
    localStorage.removeItem(REPO_KEY);
  } catch {
    /* storage blocked */
  }
  publish(base("signed-out"));
}
export const hasGithubToken = () => !!getGithubToken();

export const getSelectedRepo = (): string => {
  try {
    return localStorage.getItem(REPO_KEY) ?? "";
  } catch {
    return "";
  }
};
export const setSelectedRepo = (r: string) => {
  try {
    localStorage.setItem(REPO_KEY, r);
  } catch {
    /* storage blocked */
  }
};

export function openExternal(url: string) {
  const b = (window as unknown as { ApexOpen?: { url: (u: string) => boolean } }).ApexOpen;
  if (b?.url?.(url)) return;
  window.open(url, "_blank", "noopener,noreferrer");
}
