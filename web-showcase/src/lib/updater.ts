"use client";

import { useSyncExternalStore } from "react";
import { REPO } from "./site";
import { assetUrl } from "./paths";
import { APP_VERSION } from "./version";

/**
 * AutoUpdater (v1.0.0 rewrite). Why the old one never showed "Update available":
 *  1. `/releases/latest` ignores pre-releases and answers 404 when only pre-releases exist.
 *  2. It was a single unauthenticated GitHub API call: 60 req/h per IP, shared by whole mobile carriers (403 -> "error").
 *  3. The comparison split on `.` and `-` and counted suffix numbers, so `v0.9.0-beta` vs `0.9.0` misfired.
 *  4. The app shipped as 0.9.0 while the newest published release was v0.7.0 -> "remote > local" was never true.
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
    known ? { ...known, version: known.version } : { version: APP_VERSION, changelog: ["Admin-editable Apex API keys (dual-envelope AES-256-GCM vault)", "Any custom key string, per-key model allow-lists", "Physical /admin route and zero-trust PAT handling", "Auto-updater verified end to end"] },
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

export interface UpdateProgress {
  status: "idle" | "starting" | "downloading" | "installing" | "done" | "error";
  percent: number;
  downloadedMB: number;
  totalMB: number;
  speedKBps: number;
  version?: string;
  message?: string;
}

interface ApexUpdaterBridge {
  start: (apkUrl: string, version: string, expectedBytes: number) => boolean;
  cancel: () => void;
  install: (version: string) => boolean;
  canInstall: () => boolean;
  openInstallSettings: () => void;
  status: () => string;
}
const bridge = (): ApexUpdaterBridge | null => {
  if (typeof window === "undefined") return null;
  return (window as unknown as { ApexUpdater?: ApexUpdaterBridge }).ApexUpdater ?? null;
};
export const hasNativeUpdater = (): boolean => bridge() !== null;
export const cancelApkDownload = (): void => {
  try {
    bridge()?.cancel();
  } catch {
    /* ignore */
  }
};
export const openInstallSettings = (): void => {
  try {
    bridge()?.openInstallSettings();
  } catch {
    /* ignore */
  }
};
export const canInstallApks = (): boolean => {
  try {
    return bridge()?.canInstall() ?? true;
  } catch {
    return true;
  }
};

/** Human line for the progress UI: `Downloading v1.4.0... 68% • 22.4 MB / 33.1 MB • 4.2 MB/s`. */
export function progressLine(p: UpdateProgress, tag: string): string {
  const speed = p.speedKBps >= 1024 ? `${(p.speedKBps / 1024).toFixed(1)} MB/s` : `${Math.round(p.speedKBps)} KB/s`;
  if (p.status === "starting") return `Connecting for ${tag}...`;
  if (p.status === "installing") return `Download complete. Opening Android installer for ${tag}...`;
  const size = p.totalMB > 0 ? `${p.downloadedMB.toFixed(1)} MB / ${p.totalMB.toFixed(1)} MB` : `${p.downloadedMB.toFixed(1)} MB`;
  return `Downloading ${tag}... ${p.totalMB > 0 ? `${Math.round(p.percent)}% \u2022 ` : ""}${size} \u2022 ${speed}`;
}

/**
 * Download the update INSIDE the app; nothing here ever opens Chrome or navigates away.
 *  - Android: the native `ApexUpdater` bridge streams the APK (following GitHub's 302 natively), emits `apex-update`
 *    events, then launches Android's package installer through FileProvider.
 *  - Browser preview: stream with fetch + ReadableStream (live progress) and save the blob via a download anchor.
 * Resolves "installer" (Android system dialog opened) or "saved" (browser file saved); rejects with a readable message.
 */
export async function downloadApk(apk: ApkAsset, tag: string, onProgress: (p: UpdateProgress) => void): Promise<"installer" | "saved"> {
  const b = bridge();
  if (b) {
    return new Promise((resolve, reject) => {
      const onEvt = (e: Event) => {
        const d = (e as CustomEvent<UpdateProgress>).detail;
        onProgress(d);
        if (d.status === "installing") {
          window.removeEventListener("apex-update", onEvt);
          resolve("installer");
        } else if (d.status === "error") {
          window.removeEventListener("apex-update", onEvt);
          reject(new Error(d.message || "Download failed"));
        }
      };
      window.addEventListener("apex-update", onEvt);
      let ok = false;
      try {
        ok = b.start(apk.url, tag, apk.size || 0);
      } catch {
        ok = false;
      }
      if (!ok) {
        window.removeEventListener("apex-update", onEvt);
        reject(new Error("The update could not be started (another download may be running)."));
      }
    });
  }
  const r = await fetch(apk.url);
  if (!r.ok || !r.body) throw new Error(`Download failed (HTTP ${r.status}).`);
  const total = Number(r.headers.get("content-length")) || apk.size || 0;
  const reader = r.body.getReader();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let n = 0;
  const t0 = performance.now();
  let lastTick = 0;
  const emit = (status: UpdateProgress["status"]) =>
    onProgress({ status, percent: total ? Math.min(100, (n / total) * 100) : 0, downloadedMB: n / 1048576, totalMB: total / 1048576, speedKBps: n / 1024 / Math.max(0.1, (performance.now() - t0) / 1000), version: tag });
  emit("starting");
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value as Uint8Array<ArrayBuffer>);
    n += value.length;
    const now = performance.now();
    if (now - lastTick >= 100) {
      lastTick = now;
      emit("downloading");
    }
  }
  emit("downloading");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(chunks, { type: "application/vnd.android.package-archive" }));
  a.download = apk.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
  return "saved";
}

/** OTA registry: new models can be published by editing registry.json in the repo — no APK needed. */
export const REGISTRY_URL = `https://raw.githubusercontent.com/${REPO}/main/web-showcase/public/registry.json`;

/** Best known release for the modal: the newest checked release, else the running version's own tag (reinstall). */
export function releaseOf(s: UpdateState): ReleaseInfo {
  if (s.s === "available") return s.release;
  if (s.s === "uptodate" && s.release) return s.release;
  return norm({ version: APP_VERSION }, "version.json");
}
