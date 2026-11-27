"use client";

import { useSyncExternalStore } from "react";
import { assetUrl } from "./paths";
import { invokeNative, isNative } from "./native";
import { getGithubToken, setGithubToken } from "./skills";

/**
 * "Continue with GitHub" via the official OAuth **Device Flow** (the flow GitHub designs for apps without a server):
 *   1. POST /login/device/code  -> 8-char user code + verification URL
 *   2. user opens github.com/login/device, types / pastes the code and taps "Authorize Apex"
 *   3. we poll /login/oauth/access_token until GitHub hands back a token.
 * github.com sends no CORS headers, so the Android app relays those two calls through a fixed-URL Rust command
 * (`github_oauth`); the browser build uses an optional owner-configured relay. A client secret is never involved.
 */
export const GH_SCOPE = "repo read:user gist";

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

async function oauthCall<T>(endpoint: "device_code" | "access_token", form: Record<string, string>): Promise<T> {
  const c = await loadOauthConfig();
  let text: string | null = null;
  if (isNative()) text = await invokeNative<string>("github_oauth", { endpoint, form: Object.entries(form) });
  else if (c.relay) text = await (await fetch(`${c.relay}/${endpoint}`, { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(form) })).text();
  else {
    // Direct call: works only where github.com allows the origin; surfaces a clear message otherwise.
    try {
      const url = endpoint === "device_code" ? "https://github.com/login/device/code" : "https://github.com/login/oauth/access_token";
      text = await (await fetch(url, { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(form) })).text();
    } catch {
      throw new Error("GitHub sign-in needs the Apex Android app (a browser cannot call GitHub's device endpoints directly).");
    }
  }
  if (!text) throw new Error("GitHub did not answer. Check your connection and try again.");
  return JSON.parse(text) as T;
}

export async function startDeviceFlow(): Promise<DeviceCode> {
  const { clientId } = await loadOauthConfig();
  if (!clientId) throw new Error("setup");
  const r = await oauthCall<DeviceCode & { error?: string; error_description?: string }>("device_code", { client_id: clientId, scope: GH_SCOPE });
  if (!r.device_code) throw new Error(r.error_description ?? r.error ?? "GitHub refused the sign-in request.");
  return r;
}

/** Polls until the user authorizes. Honors `slow_down`, stops on expiry / denial / abort. */
export async function pollDeviceFlow(d: DeviceCode, signal: AbortSignal): Promise<string> {
  const { clientId } = await loadOauthConfig();
  let wait = Math.max(5, d.interval) * 1000;
  const deadline = Date.now() + d.expires_in * 1000;
  while (Date.now() < deadline) {
    await new Promise((res) => setTimeout(res, wait));
    if (signal.aborted) throw new Error("cancelled");
    const r = await oauthCall<{ access_token?: string; error?: string }>("access_token", { client_id: clientId, device_code: d.device_code, grant_type: "urn:ietf:params:oauth:grant-type:device_code" }).catch(() => ({ error: "authorization_pending" }) as { access_token?: string; error?: string });
    if (r.access_token) return r.access_token;
    if (r.error === "slow_down") wait += 5000;
    else if (r.error === "expired_token") throw new Error("That code expired. Start again.");
    else if (r.error === "access_denied") throw new Error("Authorization was cancelled on GitHub.");
    else if (r.error && r.error !== "authorization_pending") throw new Error(r.error);
  }
  throw new Error("That code expired. Start again.");
}

const gh = (token: string) => ({ Accept: "application/vnd.github+json", Authorization: `Bearer ${token}` });
export async function fetchProfile(token: string): Promise<GhProfile> {
  const r = await fetch("https://api.github.com/user", { headers: gh(token) });
  if (!r.ok) throw new Error(r.status === 401 ? "That token is not valid." : `GitHub answered ${r.status}`);
  const j = (await r.json()) as GhProfile;
  return { login: j.login, name: j.name, avatar_url: j.avatar_url };
}
export const OWNER_PUBLIC_LOGIN = "prashantchataut";
const PUBLIC_KEY = "apex.github.public.v1";
const publicLogin = (): string => {
  try {
    return localStorage.getItem(PUBLIC_KEY) ?? "";
  } catch {
    return "";
  }
};
export async function fetchRepos(token: string): Promise<GhRepo[]> {
  const pub = !token ? publicLogin() : "";
  if (pub) {
    const r = await fetch(`https://api.github.com/users/${pub}/repos?sort=updated&per_page=30&type=owner`, { headers: { Accept: "application/vnd.github+json" } });
    if (!r.ok) return [];
    return ((await r.json()) as GhRepo[]).map((x) => ({ full_name: x.full_name, private: false, description: x.description, updated_at: x.updated_at }));
  }
  const r = await fetch("https://api.github.com/user/repos?sort=updated&per_page=30&affiliation=owner,collaborator,organization_member", { headers: gh(token) });
  if (!r.ok) return [];
  return ((await r.json()) as GhRepo[]).map((x) => ({ full_name: x.full_name, private: x.private, description: x.description, updated_at: x.updated_at }));
}

/* ───────── session store (token lives in the existing skills slot so every GitHub tool keeps working) ───────── */
const PROFILE_KEY = "apex.github.profile.v1";
const REPO_KEY = "apex.github.repo.v1";
interface Session {
  connected: boolean;
  profile: GhProfile | null;
  /** Connected to public data only (no token): private repositories need a real sign-in. */
  publicOnly: boolean;
}
const EMPTY: Session = { connected: false, profile: null, publicOnly: false };
let session: Session = EMPTY;
const subs = new Set<() => void>();
function read(): Session {
  try {
    const p = JSON.parse(localStorage.getItem(PROFILE_KEY) ?? "null") as GhProfile | null;
    return { connected: !!getGithubToken() || !!publicLogin(), profile: p, publicOnly: !getGithubToken() && !!publicLogin() };
  } catch {
    return EMPTY;
  }
}
if (typeof window !== "undefined") session = read();
const emit = () => {
  session = read();
  subs.forEach((f) => f());
};
export const useGithub = (): Session => useSyncExternalStore((cb) => (subs.add(cb), () => subs.delete(cb)), () => session, () => EMPTY);

export async function connectWithToken(token: string): Promise<GhProfile> {
  const p = await fetchProfile(token.trim());
  setGithubToken(token.trim());
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
  } catch {
    /* storage blocked */
  }
  emit();
  return p;
}
/** 1-tap connect to the owner's public GitHub profile and repositories. No token is stored or shipped. */
export async function connectPublic(login = OWNER_PUBLIC_LOGIN): Promise<GhProfile> {
  const r = await fetch(`https://api.github.com/users/${login}`, { headers: { Accept: "application/vnd.github+json" } });
  if (!r.ok) throw new Error(r.status === 403 ? "GitHub rate limit reached for this network. Try again in a few minutes." : `GitHub answered ${r.status}`);
  const j = (await r.json()) as GhProfile;
  const p = { login: j.login, name: j.name, avatar_url: j.avatar_url };
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
    localStorage.setItem(PUBLIC_KEY, login);
  } catch {
    /* storage blocked */
  }
  emit();
  return p;
}
export function signOutGithub() {
  setGithubToken("");
  try {
    localStorage.removeItem(PUBLIC_KEY);
    localStorage.removeItem(PROFILE_KEY);
    localStorage.removeItem(REPO_KEY);
  } catch {
    /* storage blocked */
  }
  emit();
}
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
