"use client";

import { useSyncExternalStore } from "react";
import { REPO } from "./site";
import { APP_VERSION } from "./version";

/** AutoUpdater: compares APP_VERSION with the latest GitHub Release, and syncs the OTA model registry. */
const LATEST = `https://api.github.com/repos/${REPO}/releases/latest`;

export interface ApkAsset {
  name: string;
  size: number;
  url: string;
}
export type UpdateState =
  | { s: "idle" }
  | { s: "checking" }
  | { s: "uptodate"; at: number; latest: string }
  | { s: "available"; at: number; latest: string; notes: string; apk: ApkAsset | null; page: string }
  | { s: "error"; at: number; msg: string };

const IDLE: UpdateState = { s: "idle" };
let state: UpdateState = IDLE;
const subs = new Set<() => void>();
const set = (s: UpdateState) => {
  state = s;
  subs.forEach((f) => f());
};

export function cmpVersion(a: string, b: string): number {
  const pa = a.replace(/^v/, "").split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  const pb = b.replace(/^v/, "").split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  return 0;
}

export async function checkForUpdate(): Promise<void> {
  set({ s: "checking" });
  try {
    const r = await fetch(LATEST, { headers: { Accept: "application/vnd.github+json" } });
    if (r.status === 404) return set({ s: "uptodate", at: Date.now(), latest: `v${APP_VERSION}` });
    if (!r.ok) throw new Error(`GitHub answered ${r.status}`);
    const j = (await r.json()) as { tag_name: string; body?: string; html_url: string; assets?: { name: string; size: number; browser_download_url: string }[] };
    const a = j.assets?.find((x) => x.name.endsWith(".apk"));
    if (cmpVersion(j.tag_name, APP_VERSION) > 0) set({ s: "available", at: Date.now(), latest: j.tag_name, notes: (j.body ?? "").slice(0, 600), apk: a ? { name: a.name, size: a.size, url: a.browser_download_url } : null, page: j.html_url });
    else set({ s: "uptodate", at: Date.now(), latest: j.tag_name });
  } catch (e) {
    set({ s: "error", at: Date.now(), msg: e instanceof Error ? e.message : "Update check failed" });
  }
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

export function ago(ts: number): string {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 8) return "just now";
  if (s < 90) return `${s}s ago`;
  return `${Math.round(s / 60)} min ago`;
}

/**
 * Download the APK with progress. GitHub's asset host does not send CORS headers, so a browser `fetch` is normally
 * blocked; in that case we hand the URL to the system downloader (the Android package installer takes over from there).
 * A native in-app installer command is NOT implemented (STUB).
 */
export async function downloadApk(apk: ApkAsset, onProgress: (loaded: number, total: number) => void): Promise<"saved" | "handed-off"> {
  try {
    const r = await fetch(apk.url);
    if (!r.ok || !r.body) throw new Error("blocked");
    const reader = r.body.getReader();
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    let n = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value as Uint8Array<ArrayBuffer>);
      n += value.length;
      onProgress(n, apk.size);
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(chunks, { type: "application/vnd.android.package-archive" }));
    a.download = apk.name;
    a.click();
    return "saved";
  } catch {
    window.open(apk.url, "_blank", "noopener");
    return "handed-off";
  }
}

/** OTA registry: new models can be published by editing registry.json in the repo — no APK needed. */
export const REGISTRY_URL = `https://raw.githubusercontent.com/${REPO}/main/web-showcase/public/registry.json`;
