"use client";

import { useSyncExternalStore } from "react";
import type { Wllama } from "@wllama/wllama";
import { CATALOG, type CatalogModel } from "./models";
import { isNative } from "./native";

/**
 * Execution backends, in the order the UI trusts them:
 *  - `external` : an OpenAI-compatible endpoint the user configured (OpenRouter, LM Studio, Ollama on the LAN …)
 *  - `native`   : the Rust core inside the Android app (pure-Rust candle / llama.cpp, `chat_stream`)
 *  - `wllama`   : llama.cpp compiled to WebAssembly SIMD, running the real GGUF inside this page / WebView
 *  - `sandbox`  : scripted sample conversations. NO neural network runs. Always labelled as such.
 */
export type Backend = "external" | "native" | "wllama" | "sandbox";
export type Slot = "a" | "b";

export interface RouterConfig {
  baseUrl: string;
  model: string;
  key: string;
  enabled: boolean;
}

export interface LoadProgress {
  modelId: string;
  slot: Slot;
  phase: "downloading" | "loading" | "error";
  loaded: number;
  total: number;
  /** Rolling download speed in MB/s. */
  mbps: number;
  error?: string;
}

export interface EngineSnapshot {
  /** Model currently resident in each wllama slot. */
  loaded: Record<Slot, string | null>;
  /** Model ids whose GGUF is fully cached in OPFS / IndexedDB. */
  cached: string[];
  progress: LoadProgress | null;
  router: RouterConfig | null;
  /** Rust-core model name when running inside the Android app. */
  nativeModel: string | null;
}

export interface GenStats {
  ttftMs: number;
  tps: number;
  tokens: number;
  promptTokens: number;
  totalMs: number;
}

export interface ChatTurn {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface GenOpts {
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  signal?: AbortSignal;
}

const ROUTER_KEY = "apex.router.v1";
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
export const MB = 1_000_000;

export function modelUrl(m: CatalogModel): string {
  return `https://huggingface.co/${m.repo}/resolve/main/${m.file}`;
}

function readRouter(): RouterConfig | null {
  try {
    const raw = localStorage.getItem(ROUTER_KEY);
    return raw ? (JSON.parse(raw) as RouterConfig) : null;
  } catch {
    return null;
  }
}

let snap: EngineSnapshot = { loaded: { a: null, b: null }, cached: [], progress: null, router: null, nativeModel: null };
const listeners = new Set<() => void>();
function set(p: Partial<EngineSnapshot>) {
  snap = { ...snap, ...p };
  listeners.forEach((l) => l());
}
const SERVER_SNAP = snap;

export function getEngineSnapshot(): EngineSnapshot {
  return snap;
}
export function useEngine(): EngineSnapshot {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => snap,
    () => SERVER_SNAP,
  );
}

export function setNativeModel(name: string | null) {
  if (snap.nativeModel !== name) set({ nativeModel: name });
}

export function saveRouter(cfg: RouterConfig | null) {
  try {
    if (cfg) localStorage.setItem(ROUTER_KEY, JSON.stringify(cfg));
    else localStorage.removeItem(ROUTER_KEY);
  } catch {
    /* storage blocked */
  }
  set({ router: cfg });
}

/** Active backend for a chat turn (see {@link Backend}). */
export function activeBackend(s: EngineSnapshot = snap): Backend {
  if (s.router?.enabled && s.router.baseUrl && s.router.model) return "external";
  if (isNative() && s.nativeModel) return "native";
  if (s.loaded.a) return "wllama";
  return "sandbox";
}

/** `SmolLM2-135M-Instruct-Q8_0.gguf` → `SmolLM2-135M (Q8_0)`. */
export function shortModelName(m: CatalogModel | undefined | null): string {
  if (!m) return "model";
  return `${m.name.split("·")[0].trim().replace(/ Instruct$/, "")} (${m.quant})`;
}

// ───────────────────────── wllama (llama.cpp → WebAssembly SIMD) ─────────────────────────

const pool = new Map<Slot, Wllama>();

async function instance(slot: Slot): Promise<Wllama> {
  const have = pool.get(slot);
  if (have) return have;
  const { Wllama } = await import("@wllama/wllama");
  const w = new Wllama({ default: `${BASE}/wllama/wllama.wasm` }, { suppressNativeLog: true });
  pool.set(slot, w);
  return w;
}

/** Which catalog models are completely cached on this device. */
export async function refreshCache(): Promise<string[]> {
  if (typeof window === "undefined") return [];
  try {
    const { ModelManager } = await import("@wllama/wllama");
    const models = await new ModelManager().getModels();
    const ids = CATALOG.filter((c) => models.some((m) => m.url === modelUrl(c) && m.size >= c.sizeGB * 1e9 * 0.97)).map((c) => c.id);
    set({ cached: ids });
    return ids;
  } catch {
    return snap.cached;
  }
}

if (typeof window !== "undefined") {
  snap = { ...snap, router: readRouter() };
  void refreshCache();
}

/**
 * Download (byte-accurate, resumable, cached in OPFS) and load a catalog GGUF into a wllama slot.
 * Throws on failure after publishing the error in the snapshot.
 */
export async function loadWllamaModel(modelId: string, slot: Slot = "a", onProgress?: (p: LoadProgress) => void): Promise<void> {
  const m = CATALOG.find((c) => c.id === modelId);
  if (!m) throw new Error(`Unknown model ${modelId}`);
  if (snap.loaded[slot] === modelId) return;
  const w = await instance(slot);
  if (w.isModelLoaded()) await w.exit().catch(() => undefined);
  pool.delete(slot);
  const fresh = await instance(slot);

  const t0 = performance.now();
  let lastT = t0;
  let lastB = 0;
  let mbps = 0;
  const publish = (p: Partial<LoadProgress>) => {
    const full: LoadProgress = { modelId, slot, phase: "downloading", loaded: 0, total: Math.round(m.sizeGB * 1e9), mbps, ...snap.progress, ...p };
    set({ progress: full });
    onProgress?.(full);
  };
  publish({ phase: "downloading", loaded: 0, mbps: 0 });
  try {
    await fresh.loadModelFromUrl(modelUrl(m), {
      n_ctx: 2048,
      progressCallback: ({ loaded, total }: { loaded: number; total: number }) => {
        const now = performance.now();
        if (now - lastT > 400) {
          const inst = ((loaded - lastB) / MB) / ((now - lastT) / 1000);
          mbps = mbps === 0 ? inst : mbps * 0.6 + inst * 0.4;
          lastT = now;
          lastB = loaded;
        }
        publish({ phase: loaded >= total && total > 0 ? "loading" : "downloading", loaded, total, mbps });
      },
    });
  } catch (e) {
    pool.delete(slot);
    publish({ phase: "error", error: e instanceof Error ? e.message : "Download failed" });
    throw e;
  }
  set({ loaded: { ...snap.loaded, [slot]: modelId }, progress: null });
  void refreshCache();
}

export async function unloadWllama(slot: Slot) {
  const w = pool.get(slot);
  pool.delete(slot);
  if (w) await w.exit().catch(() => undefined);
  set({ loaded: { ...snap.loaded, [slot]: null } });
}

/** Stream a real completion from the GGUF resident in `slot`. */
export async function wllamaChat(slot: Slot, messages: ChatTurn[], opts: GenOpts, onText: (full: string) => void): Promise<GenStats> {
  const w = pool.get(slot);
  if (!w || !w.isModelLoaded()) throw new Error("No GGUF is loaded in this slot");
  const t0 = performance.now();
  let first = 0;
  let tokens = 0;
  let text = "";
  let promptTokens = 0;
  let engineTps = 0;
  const it = await w.createChatCompletion({
    messages,
    stream: true,
    max_tokens: opts.maxTokens ?? 512,
    temperature: opts.temperature ?? 0.7,
    top_p: opts.topP ?? 0.9,
    abortSignal: opts.signal,
  });
  for await (const chunk of it) {
    const piece = chunk.choices[0]?.delta?.content;
    if (piece) {
      if (!first) first = performance.now();
      tokens += 1;
      text += piece;
      onText(text);
    }
    if (chunk.usage) {
      promptTokens = chunk.usage.prompt_tokens ?? promptTokens;
      tokens = chunk.usage.completion_tokens || tokens;
    }
    if (chunk.timings) {
      promptTokens = chunk.timings.prompt_n || promptTokens;
      engineTps = chunk.timings.predicted_per_second || engineTps;
    }
  }
  const end = performance.now();
  const decodeMs = Math.max(1, end - (first || t0));
  return {
    ttftMs: Math.round((first || end) - t0),
    tps: engineTps > 0 ? engineTps : tokens > 1 ? ((tokens - 1) / decodeMs) * 1000 : 0,
    tokens,
    promptTokens,
    totalMs: Math.round(end - t0),
  };
}

// ───────────────────────── external OpenAI-compatible router ─────────────────────────

export async function routerChat(cfg: RouterConfig, messages: ChatTurn[], opts: GenOpts, onText: (full: string) => void): Promise<GenStats> {
  const t0 = performance.now();
  const res = await fetch(`${cfg.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    signal: opts.signal,
    headers: { "Content-Type": "application/json", ...(cfg.key ? { Authorization: `Bearer ${cfg.key}` } : {}) },
    body: JSON.stringify({ model: cfg.model, messages, stream: true, max_tokens: opts.maxTokens ?? 512, temperature: opts.temperature ?? 0.7 }),
  });
  if (!res.ok || !res.body) throw new Error(`Router answered ${res.status}`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let text = "";
  let tokens = 0;
  let first = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      const l = line.trim();
      if (!l.startsWith("data:")) continue;
      const data = l.slice(5).trim();
      if (data === "[DONE]") continue;
      try {
        const piece = (JSON.parse(data) as { choices?: { delta?: { content?: string } }[] }).choices?.[0]?.delta?.content;
        if (piece) {
          if (!first) first = performance.now();
          tokens += 1;
          text += piece;
          onText(text);
        }
      } catch {
        /* keep-alive comment or partial JSON */
      }
    }
  }
  const end = performance.now();
  return { ttftMs: Math.round((first || end) - t0), tps: tokens > 1 ? ((tokens - 1) / Math.max(1, end - first)) * 1000 : 0, tokens, promptTokens: 0, totalMs: Math.round(end - t0) };
}

/** Split `<think>…</think>` out of a raw model stream. */
export function splitThink(raw: string): { thought: string; answer: string; open: boolean } {
  const s = raw.indexOf("<think>");
  if (s === -1) return { thought: "", answer: raw, open: false };
  const e = raw.indexOf("</think>", s);
  if (e === -1) return { thought: raw.slice(s + 7).trim(), answer: raw.slice(0, s).trim(), open: true };
  return { thought: raw.slice(s + 7, e).trim(), answer: (raw.slice(0, s) + raw.slice(e + 8)).trim(), open: false };
}

/** Approximate resident memory for a wllama model: weights + KV for 2k context. */
export function estimateRamMb(m: CatalogModel | undefined): number {
  if (!m) return 0;
  return Math.round(m.sizeGB * 1000 + (2 * m.layers * 2048 * m.kvHeads * m.headDim * 2) / MB);
}
