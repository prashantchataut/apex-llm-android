"use client";

import { useSyncExternalStore } from "react";
import { REPO } from "./site";
import { assetUrl } from "./paths";
import { APP_VERSION } from "./version";

/**
 * AutoUpdater (v1.0.0 rewrite). Why the old one never showed "Update available":
 *  1. `/releases/latest` ignores pre-releases and answers 404 when only pre-releases exist.
 *  2. It was a single unauthenticated GitHub API call: 60 req/h per IP, shared by whole mobile carriers (403 → "error").
 *  3. The comparison split on `.` and `-` and counted suffix numbers, so `v0.9.0-beta` vs `0.9.0` misfired.
 *  4. The app shipped as 0.9.0 while the newest published release was v0.7.0 → "remote > local" was never true.
 *  5. The result only surfaced inside Settings; there was no banner or badge anywhere else.
 * Fix: a canonical `version.json` (raw GitHub, cache-busted) is checked TOGETHER with the 5 newest releases, with
 * `cache: "no-store"`; the highest version wins; versions compare numerically with `v` and pre-release suffixes stripped.
 */

export const VERSION_JSON_RAW = `https://raw.githubusercontent.com/${REPO}/main/web-showcase/public/version.json`;
export const RELEASES_API = `https://api.github.com/repos/${REPO}/releases?per_page=5`;

export interface ApkAsset {
  name: string;
  size: number;
  url: string;
}
export interface ReleaseInfo {
  version: string;
  tag: string;
  apkUrl: string;
  releaseUrl: string;
  publishedAt: string;
  changelog: string[];
  apkSize: number;
  source: "version.json" | "github-api" | "simulated";
}
export type UpdateState =
  | { s: "idle" }
  | { s: "checking" }
  | { s: "uptodate"; at: number; latest: string; release: ReleaseInfo | null }
  | { s: "available"; at: number; latest: string; release: ReleaseInfo; simulated?: boolean; notes: string; apk: ApkAsset | null; page: string }
  | { s: "error"; at: number; msg: string };

const IDLE: UpdateState = { s: "idle" };
let state: UpdateState = IDLE;
const subs = new Set<() => void>();
const set = (s: UpdateState) => {
  state = s;
  subs.forEach((f) => f());
};

/** Numeric [major, minor, patch]; strips a leading `v`/`V` and any `-pre` / `+build` suffix. */
export function parseSemver(v: string): [number, number, number] {
  const core = v.trim().replace(/^[vV]/, "").split(/[-+]/)[0];
  const p = core.split(".").map((x) => (/^\d+$/.test(x) ? parseInt(x, 10) : 0));
  return [p[0] ?? 0, p[1] ?? 0, p[2] ?? 0];
}
/** > 0 when `a` is newer than `b`. */
export function compareSemver(a: string, b: string): number {
  const x = parseSemver(a);
  const y = parseSemver(b);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}
export const cmpVersion = compareSemver;

const apkNameFor = (tag: string) => `apex-llm-${tag}-arm64-v8a.apk`;
const norm = (r: Partial<ReleaseInfo> & { version: string }, source: ReleaseInfo["source"]): ReleaseInfo => {
  const tag = r.tag ?? `v${r.version.replace(/^[vV]/, "")}`;
  return {
    version: r.version.replace(/^[vV]/, ""),
    tag,
    apkUrl: r.apkUrl ?? `https://github.com/${REPO}/releases/download/${tag}/${apkNameFor(tag)}`,
    releaseUrl: r.releaseUrl ?? `https://github.com/${REPO}/releases/tag/${tag}`,
    publishedAt: r.publishedAt ?? "",
    changelog: r.changelog ?? [],
    apkSize: r.apkSize ?? 0,
    source,
  };
};

async function fromVersionJson(): Promise<ReleaseInfo[]> {
  const t = Date.now();
  const urls = [`${VERSION_JSON_RAW}?t=${t}`, `${assetUrl("version.json")}?t=${t}`];
  const out: ReleaseInfo[] = [];
  for (const u of urls) {
    try {
      const r = await fetch(u, { cache: "no-store" });
      if (!r.ok) continue;
      const j = (await r.json()) as Partial<ReleaseInfo> & { version?: string };
      if (j.version) out.push(norm(j as Partial<ReleaseInfo> & { version: string }, "version.json"));
    } catch {
      /* next */
    }
  }
  if (!out.length) throw new Error("version.json unreachable");
  return out;
}

async function fromGithubApi(): Promise<ReleaseInfo[]> {
  const r = await fetch(RELEASES_API, { cache: "no-store", headers: { Accept: "application/vnd.github+json" } });
  if (!r.ok) throw new Error(`GitHub answered ${r.status}`);
  const list = (await r.json()) as { tag_name: string; draft?: boolean; body?: string; html_url: string; published_at?: string; assets?: { name: string; size: number; browser_download_url: string }[] }[];
  return list
    .filter((x) => !x.draft)
    .map((x) => {
      const a = x.assets?.find((y) => y.name.endsWith(".apk"));
      return norm(
        { version: x.tag_name, tag: x.tag_name, releaseUrl: x.html_url, publishedAt: x.published_at, apkUrl: a?.browser_download_url, apkSize: a?.size, changelog: (x.body ?? "").split(/\n+/).map((l) => l.replace(/^[-*\s]+/, "").trim()).filter(Boolean).slice(0, 8) },
        "github-api",
      );
    });
}

const toAvailable = (rel: ReleaseInfo, simulated = false): UpdateState => ({
  s: "available",
  at: Date.now(),
  latest: rel.tag,
  release: rel,
  simulated,
  notes: rel.changelog.join("\n"),
  apk: { name: apkNameFor(rel.tag), size: rel.apkSize, url: rel.apkUrl },
  page: rel.releaseUrl,
});

/** Checks BOTH version.json and the GitHub releases list (no-store); the highest version wins. Safe to call often. */
export async function checkForUpdate(): Promise<void> {
  if (state.s === "checking") return;
  const keep = state.s === "available" && state.simulated ? state : null;
  set({ s: "checking" });
  const [a, b] = await Promise.allSettled([fromVersionJson(), fromGithubApi()]);
  if (a.status === "rejected" && b.status === "rejected") {
    if (keep) return set(keep);
    return set({ s: "error", at: Date.now(), msg: "Couldn't reach GitHub to check for updates. Check your connection and try again." });
  }
  const all = [...(a.status === "fulfilled" ? a.value : []), ...(b.status === "fulfilled" ? b.value : [])];
  // Highest version wins; on a tie prefer the entry that carries a changelog (version.json) and a known APK size (API).
  all.sort((x, y) => compareSemver(y.version, x.version));
  const top = all[0];
  const same = all.filter((x) => compareSemver(x.version, top.version) === 0);
  const best: ReleaseInfo = { ...top, changelog: same.find((x) => x.changelog.length && x.source === "version.json")?.changelog ?? same.find((x) => x.changelog.length)?.changelog ?? [], apkSize: same.find((x) => x.apkSize)?.apkSize ?? 0, publishedAt: same.find((x) => x.publishedAt)?.publishedAt ?? "" };
  if (compareSemver(best.version, APP_VERSION) > 0) {
    set(toAvailable(best));
    dismissed = null;
    uiEmit();
  } else set({ s: "uptodate", at: Date.now(), latest: best.tag, release: best });
}

/** "Simulate Update Banner": shows the full update UX with the newest known release (or a placeholder). */
export function simulateUpdate(): void {
  const known = state.s === "uptodate" ? state.release : state.s === "available" ? state.release : null;
  const rel = norm(
    known ? { ...known, version: known.version } : { version: "1.0.0", changelog: ["Encrypted Apex API with 25+ Cloud Models", "Fixed In-App Auto-Updater", "Hardened Admin Vault", "Local GGUF & Live Voice Polish"] },
    "simulated",
  );
  set(toAvailable(rel, true));
  dismissed = null;
  ui = { ...ui, modal: true };
  uiEmit();
}

export function useUpdater(): UpdateState {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => state,
    () => IDLE,
  );
}

/* ───────── shared UI state: banner dismissal + release modal ───────── */
let dismissed: string | null = null;
let ui = { modal: false, dismissed: null as string | null };
const uiSubs = new Set<() => void>();
function uiEmit() {
  ui = { modal: ui.modal, dismissed };
  uiSubs.forEach((f) => f());
}
export const dismissBanner = () => {
  dismissed = state.s === "available" ? state.latest : null;
  uiEmit();
};
export const openUpdateModal = () => {
  ui = { ...ui, modal: true };
  uiEmit();
};
export const closeUpdateModal = () => {
  ui = { ...ui, modal: false };
  uiEmit();
};
export function useUpdateUi() {
  return useSyncExternalStore(
    (cb) => {
      uiSubs.add(cb);
      return () => uiSubs.delete(cb);
    },
    () => ui,
    () => ui,
  );
}

export function ago(ts: number): string {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 8) return "just now";
  if (s < 90) return `${s}s ago`;
  return `${Math.round(s / 60)} min ago`;
}

/** Android bridge (MainActivity.Opener): opens the APK URL in the system downloader → Package Installer. */
const nativeOpen = (url: string): boolean => {
  try {
    const b = (window as unknown as { ApexOpen?: { url: (u: string) => boolean } }).ApexOpen;
    return !!b && b.url(url);
  } catch {
    return false;
  }
};

/**
 * Download the APK. 1) Android: hand the URL to the system (Package Installer takes over). 2) Browser: stream with a
 * real progress bar when the asset host allows CORS, then trigger a file save. 3) Otherwise open the URL directly.
 */
export async function downloadApk(apk: ApkAsset, onProgress: (loaded: number, total: number) => void): Promise<"saved" | "handed-off"> {
  if (nativeOpen(apk.url)) return "handed-off";
  try {
    const r = await fetch(apk.url);
    if (!r.ok || !r.body) throw new Error("blocked");
    const total = Number(r.headers.get("content-length")) || apk.size;
    const reader = r.body.getReader();
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    let n = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value as Uint8Array<ArrayBuffer>);
      n += value.length;
      onProgress(n, total);
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(chunks, { type: "application/vnd.android.package-archive" }));
    a.download = apk.name;
    a.click();
    return "saved";
  } catch {
    const a = document.createElement("a");
    a.href = apk.url;
    a.rel = "noopener";
    a.download = apk.name;
    a.click();
    return "handed-off";
  }
}

/** OTA registry: new models can be published by editing registry.json in the repo — no APK needed. */
export const REGISTRY_URL = `https://raw.githubusercontent.com/${REPO}/main/web-showcase/public/registry.json`;

/** Best known release for the modal: the newest checked release, else the running version's own tag (reinstall). */
export function releaseOf(s: UpdateState): ReleaseInfo {
  if (s.s === "available") return s.release;
  if (s.s === "uptodate" && s.release) return s.release;
  return norm({ version: APP_VERSION }, "version.json");
}
