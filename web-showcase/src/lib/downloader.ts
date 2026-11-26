"use client";

import { useSyncExternalStore } from "react";
import { CATALOG, registerModel, type CatalogModel } from "./models";
import { loadWllamaFromBlobs, modelUrl, unloadWllama, getEngineSnapshot } from "./engine";
import { haptic } from "./haptics";
import { isNative, streamNative } from "./native";

/**
 * Real download manager.
 * Browser / WebView: `fetch` + `ReadableStream` streamed straight into the Origin Private File System, with HTTP Range
 * resume, live MB/s, pause / resume / cancel / delete. A finished file is handed to wllama as a Blob (no re-download).
 * Native (Tauri): delegates to the Rust `hf_download` command (resumable ranges on disk). Pause/cancel there is NOT wired (STUB).
 */
export type DlStatus = "idle" | "downloading" | "paused" | "done" | "error";
export interface DlItem {
  status: DlStatus;
  loaded: number;
  total: number;
  mbps: number;
  error?: string;
}
const IDLE: DlItem = { status: "idle", loaded: 0, total: 0, mbps: 0 };
let items: Record<string, DlItem> = {};
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
function set(id: string, p: Partial<DlItem>) {
  items = { ...items, [id]: { ...(items[id] ?? IDLE), ...p } };
  emit();
  syncWake();
}

/** Screen WakeLock while any download / import runs, so the OS doesn't suspend the WebView mid-transfer. Re-acquired after the app returns to the foreground. */
type WakeSentinel = { release: () => Promise<void> };
let wake: WakeSentinel | null = null;
let wakeReq = false;
function syncWake() {
  if (typeof navigator === "undefined") return;
  const wl = (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<WakeSentinel> } }).wakeLock;
  if (!wl) return;
  const active = Object.values(items).some((i) => i.status === "downloading");
  if (active && !wake && !wakeReq) {
    wakeReq = true;
    wl.request("screen").then((w) => (wake = w)).catch(() => undefined).finally(() => (wakeReq = false));
  } else if (!active && wake) {
    const w = wake;
    wake = null;
    void w.release().catch(() => undefined);
  }
}
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      wake = null;
      syncWake();
    }
  });
}

const DIR = "apex-models";
const fname = (id: string) => `${id.replace(/[^a-z0-9._-]/gi, "_")}.gguf`;
const ctl = new Map<string, AbortController>();
const pausing = new Set<string>();

export const opfsSupported = () => typeof navigator !== "undefined" && !!navigator.storage && typeof navigator.storage.getDirectory === "function";
async function dir(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(DIR, { create: true });
}

/** Look at what is already on disk (finished and partial files) and publish it. */
export async function scanInstalled(): Promise<void> {
  if (!opfsSupported()) return;
  const native = isNative();
  try {
    const d = await dir();
    for (const m of CATALOG.filter((x) => !native || x.imported)) {
      try {
        const f = await (await d.getFileHandle(fname(m.id))).getFile();
        const total = Math.round(m.sizeGB * 1e9);
        if (ctl.has(m.id)) continue;
        if (f.size >= total * 0.985) set(m.id, { status: "done", loaded: f.size, total: f.size, mbps: 0 });
        else if (f.size > 0) set(m.id, { status: "paused", loaded: f.size, total, mbps: 0 });
      } catch {
        /* not present */
      }
    }
  } catch {
    /* storage unavailable */
  }
}

export async function startDownload(id: string): Promise<void> {
  const m = CATALOG.find((c) => c.id === id);
  if (!m) return;
  if (isNative()) return nativeDownload(id);
  if (!opfsSupported()) {
    set(id, { status: "error", error: "This browser has no persistent file storage (OPFS). Use the Apex Android app or a recent Chrome / Safari." });
    return;
  }
  if (ctl.has(id)) return;
  const ac = new AbortController();
  ctl.set(id, ac);
  pausing.delete(id);
  const expected = Math.round(m.sizeGB * 1e9);
  let writer: FileSystemWritableFileStream | null = null;
  try {
    const d = await dir();
    const fh = await d.getFileHandle(fname(id), { create: true });
    let have = (await fh.getFile()).size;
    if (have >= expected * 0.985) {
      set(id, { status: "done", loaded: have, total: have });
      return;
    }
    set(id, { status: "downloading", loaded: have, total: expected, mbps: 0, error: undefined });
    void navigator.storage.persist?.();
    const res = await fetch(modelUrl(m), { signal: ac.signal, headers: have > 0 ? { Range: `bytes=${have}-` } : {} });
    if (!res.ok && res.status !== 206) throw new Error(`Hugging Face answered ${res.status}`);
    if (have > 0 && res.status === 200) have = 0; // server ignored Range → restart cleanly
    const cr = res.headers.get("Content-Range")?.match(/\/(\d+)$/);
    const total = cr ? Number(cr[1]) : have + Number(res.headers.get("Content-Length") ?? 0) || expected;
    if (!res.body) throw new Error("No response body");
    writer = await fh.createWritable({ keepExistingData: have > 0 });
    if (have > 0) await writer.seek(have);
    const reader = res.body.getReader();
    let loaded = have;
    let lastT = performance.now();
    let lastB = loaded;
    let mbps = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      await writer.write(value as Uint8Array<ArrayBuffer>);
      loaded += value.length;
      const now = performance.now();
      if (now - lastT > 250) {
        const inst = (loaded - lastB) / 1e6 / ((now - lastT) / 1000);
        mbps = mbps === 0 ? inst : mbps * 0.6 + inst * 0.4;
        lastT = now;
        lastB = loaded;
        set(id, { status: "downloading", loaded, total, mbps });
      }
    }
    await writer.close();
    writer = null;
    if (loaded < total * 0.99) throw new Error("Download ended early — tap Resume");
    set(id, { status: "done", loaded, total: loaded, mbps: 0 });
    haptic("heavyLock");
  } catch (e) {
    if (writer) await writer.close().catch(() => undefined); // keep the partial bytes for Resume
    const cur = items[id] ?? IDLE;
    if (ac.signal.aborted) set(id, pausing.has(id) ? { status: "paused", mbps: 0 } : { status: "idle", loaded: 0, mbps: 0 });
    else set(id, { status: cur.loaded > 0 ? "paused" : "error", mbps: 0, error: e instanceof Error ? e.message : "Download failed" });
  } finally {
    ctl.delete(id);
    pausing.delete(id);
  }
}

async function nativeDownload(id: string): Promise<void> {
  const m = CATALOG.find((c) => c.id === id);
  if (!m) return;
  set(id, { status: "downloading", loaded: 0, total: Math.round(m.sizeGB * 1e9), mbps: 0, error: undefined });
  let lastT = performance.now();
  let lastB = 0;
  const r = await streamNative<{ kind: string; done?: number; total?: number; message?: string }>("hf_download", { id, repo: m.repo, file: m.file }, (e) => {
    if (e.kind === "progress" && e.done !== undefined) {
      const now = performance.now();
      const mbps = (e.done - lastB) / 1e6 / Math.max(0.05, (now - lastT) / 1000);
      lastT = now;
      lastB = e.done;
      set(id, { status: "downloading", loaded: e.done, total: e.total ?? items[id]?.total ?? 0, mbps });
    } else if (e.kind === "done") {
      set(id, { status: "done", loaded: items[id]?.total ?? 0, mbps: 0 });
      haptic("heavyLock");
    } else if (e.kind === "error") set(id, { status: "error", error: e.message });
  });
  if (!r.ok) set(id, { status: "error", error: r.error ?? "Native download failed" });
}

export function pauseDownload(id: string) {
  pausing.add(id);
  ctl.get(id)?.abort();
}
export const resumeDownload = (id: string) => startDownload(id);

export async function cancelDownload(id: string) {
  pausing.delete(id);
  ctl.get(id)?.abort();
  await new Promise((r) => setTimeout(r, 120));
  await removeFile(id);
  set(id, { status: "idle", loaded: 0, total: 0, mbps: 0, error: undefined });
}

async function removeFile(id: string) {
  try {
    const d = await dir();
    await d.removeEntry(fname(id));
  } catch {
    /* absent */
  }
}

/** Delete a model from disk to free storage. */
export async function deleteModel(id: string) {
  const snap = getEngineSnapshot();
  if (snap.loaded.a === id) await unloadWllama("a");
  if (snap.loaded.b === id) await unloadWllama("b");
  await removeFile(id);
  set(id, { status: "idle", loaded: 0, total: 0, mbps: 0, error: undefined });
}

/** Hand the on-disk file to wllama (no network). */
export async function activateModel(id: string): Promise<void> {
  const d = await dir();
  const file = await (await d.getFileHandle(fname(id))).getFile();
  await loadWllamaFromBlobs(id, [file], "a");
}

export async function storageEstimate(): Promise<{ used: number; quota: number } | null> {
  try {
    const e = await navigator.storage.estimate();
    return { used: e.usage ?? 0, quota: e.quota ?? 0 };
  } catch {
    return null;
  }
}

export function useDownloadStore(): Record<string, DlItem> {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => items,
    () => items,
  );
}
export const dlSnapshot = (): Record<string, DlItem> => items;
export const dlOf = (m: Record<string, DlItem>, id: string): DlItem => m[id] ?? IDLE;

if (typeof window !== "undefined") void scanInstalled();

/**
 * Import a .gguf the user picked from device storage (Downloads, SD card, any DocumentsProvider the system picker offers).
 * The bytes are streamed into OPFS (no whole-file copy in RAM), the GGUF magic is verified, and the model is registered as
 * an installed catalog entry. It always runs through wllama, also inside the Android app (the picker yields a Blob, not a path).
 */
export async function importLocalModel(file: File): Promise<CatalogModel> {
  if (!opfsSupported()) throw new Error("This WebView has no persistent file storage (OPFS), so a file can't be imported here.");
  const magic = String.fromCharCode(...new Uint8Array(await file.slice(0, 4).arrayBuffer()));
  if (magic !== "GGUF") throw new Error(`${file.name} is not a GGUF model file (missing the GGUF header).`);
  const params = Number(file.name.match(/(\d+(?:\.\d+)?)\s*[bB](?![a-z])/)?.[1] ?? "1");
  const m: CatalogModel = {
    id: `local:${file.name}`,
    name: file.name.replace(/\.gguf$/i, "").replace(/[-_.](I?Q\d.*|F16|BF16)$/i, ""),
    family: "On device",
    paramsB: params,
    quant: file.name.match(/(I?Q\d(?:_[A-Z0-9]+)*|F16|BF16)/i)?.[1]?.toUpperCase() ?? "GGUF",
    sizeGB: file.size / 1e9,
    layers: Math.max(16, Math.round(params * 9 + 12)),
    kvHeads: 4,
    headDim: 64,
    repo: "local",
    file: file.name,
    custom: true,
    imported: true,
    group: "custom",
    uncensored: /uncensor|abliterat|dolphin|heretic/i.test(file.name),
  };
  registerModel(m);
  set(m.id, { status: "downloading", loaded: 0, total: file.size, mbps: 0, error: undefined });
  let writer: FileSystemWritableFileStream | null = null;
  try {
    void navigator.storage.persist?.();
    const d = await dir();
    const fh = await d.getFileHandle(fname(m.id), { create: true });
    writer = await fh.createWritable();
    const reader = file.stream().getReader();
    let loaded = 0;
    let lastT = performance.now();
    let lastB = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      await writer.write(value as Uint8Array<ArrayBuffer>);
      loaded += value.length;
      const now = performance.now();
      if (now - lastT > 250) {
        set(m.id, { status: "downloading", loaded, total: file.size, mbps: (loaded - lastB) / 1e6 / ((now - lastT) / 1000) });
        lastT = now;
        lastB = loaded;
      }
    }
    await writer.close();
    writer = null;
    set(m.id, { status: "done", loaded: file.size, total: file.size, mbps: 0 });
    haptic("heavyLock");
    return m;
  } catch (e) {
    if (writer) await writer.abort().catch(() => undefined);
    await removeFile(m.id);
    set(m.id, { status: "error", mbps: 0, error: e instanceof Error ? e.message : "Import failed" });
    throw e;
  }
}
