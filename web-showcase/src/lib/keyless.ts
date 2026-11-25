"use client";

import { useSyncExternalStore } from "react";
import type { ChatTurn, GenOpts, GenStats } from "./engine";

/**
 * Keyless cloud provider: Pollinations' OpenAI-compatible endpoint, no account, no API key.
 * The free ("anonymous") tier changes over time, so the model list is discovered live from `/models`.
 * Requested models that are not currently served keylessly transparently fall back to the next available one,
 * and the message footer always names the model that actually answered.
 */
export const TEXT_API = "https://text.pollinations.ai/openai";
export const MODELS_API = "https://text.pollinations.ai/models";

export interface KeylessModel {
  id: string;
  label: string;
  tag: string;
  /** Pollinations model id sent on the wire. */
  api: string;
  reasoning?: boolean;
}

export const KEYLESS_MODELS: KeylessModel[] = [
  { id: "gpt-oss", label: "GPT-OSS 20B", tag: "Keyless Reasoning", api: "openai-fast", reasoning: true },
  { id: "deepseek-r1", label: "DeepSeek R1", tag: "Keyless Reasoning", api: "deepseek-reasoning", reasoning: true },
  { id: "qwen-coder", label: "Qwen 2.5 Coder 32B", tag: "Keyless Code", api: "qwen-coder" },
  { id: "llama", label: "Llama 3.3 70B", tag: "Keyless General", api: "llama" },
  { id: "mistral", label: "Mistral Small 3", tag: "Keyless Fast", api: "mistral" },
];

export function keylessById(id: string): KeylessModel {
  return KEYLESS_MODELS.find((m) => m.id === id) ?? KEYLESS_MODELS[0];
}

interface Live {
  checked: boolean;
  names: string[];
  labels: Record<string, string>;
}
let live: Live = { checked: false, names: [], labels: {} };
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

export async function refreshLive(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const r = await fetch(MODELS_API);
    const j = (await r.json()) as { name: string; aliases?: string[]; description?: string }[];
    const labels: Record<string, string> = {};
    for (const m of j) for (const n of [m.name, ...(m.aliases ?? [])]) labels[n] = m.description ?? m.name;
    live = { checked: true, names: Object.keys(labels), labels };
  } catch {
    live = { ...live, checked: true };
  }
  emit();
}

export function useKeylessLive(): Live {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => live,
    () => live,
  );
}

/** True if this model is currently served on the anonymous tier (optimistic until the first check finishes). */
export function isServed(m: KeylessModel, l: Live): boolean {
  return !l.checked || l.names.length === 0 || l.names.includes(m.api);
}

/** Requested model first, then the verified always-on anonymous model. */
function chainFor(m: KeylessModel): string[] {
  return [...new Set([m.api, "openai-fast"])];
}

export interface KeylessStats extends GenStats {
  servedBy: string;
}

interface Delta {
  choices?: { delta?: { content?: string; reasoning?: string; reasoning_content?: string; tool_calls?: { index?: number; function?: { name?: string; arguments?: string } }[] } }[];
}

async function attempt(api: string, messages: ChatTurn[], opts: GenOpts, onText: (raw: string) => void, started: { v: boolean }): Promise<GenStats> {
  const t0 = performance.now();
  let res: Response | null = null;
  for (let i = 0; i < 2; i++) {
    res = await fetch(TEXT_API, {
      method: "POST",
      signal: opts.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: api, messages, stream: true, temperature: opts.temperature ?? 0.7 }),
    });
    if (res.status !== 429) break;
    await new Promise((r) => setTimeout(r, 2500));
  }
  if (!res || !res.ok || !res.body) throw new Error(`Keyless provider answered ${res?.status ?? "no response"} for ${api}`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let thought = "";
  let text = "";
  let tokens = 0;
  let first = 0;
  const calls = new Map<number, { name: string; args: string }>();
  /** Native function-calling deltas are re-encoded in the app's <tool_call> format so one loop handles every model. */
  const callMarkup = () => [...calls.values()].filter((c) => c.name).map((c) => `<tool_call>${JSON.stringify({ name: c.name, arguments: (() => { try { return JSON.parse(c.args || "{}"); } catch { return {}; } })() })}</tool_call>`).join("");
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
        const d = (JSON.parse(data) as Delta).choices?.[0]?.delta;
        const th = d?.reasoning ?? d?.reasoning_content;
        if (th) thought += th;
        if (d?.content) text += d.content;
        for (const tc of d?.tool_calls ?? []) {
          const k = tc.index ?? 0;
          const cur = calls.get(k) ?? { name: "", args: "" };
          calls.set(k, { name: cur.name + (tc.function?.name ?? ""), args: cur.args + (tc.function?.arguments ?? "") });
        }
        if (th || d?.content || d?.tool_calls) {
          if (!first) first = performance.now();
          started.v = true;
          tokens += 1;
          const tail = callMarkup();
          onText((thought ? `<think>${thought}${text || tail ? "</think>" : ""}${text}` : text) + tail);
        }
      } catch {
        /* keep-alive or partial JSON */
      }
    }
  }
  const end = performance.now();
  if (!started.v) throw new Error(`Keyless provider returned no tokens for ${api}`);
  return { ttftMs: Math.round((first || end) - t0), tps: tokens > 1 ? ((tokens - 1) / Math.max(1, end - first)) * 1000 : 0, tokens, promptTokens: 0, totalMs: Math.round(end - t0) };
}

/** Stream a completion with automatic fallback across models. Reasoning is surfaced as a `<think>` block. */
export async function keylessChat(model: KeylessModel, messages: ChatTurn[], opts: GenOpts, onText: (raw: string) => void): Promise<KeylessStats> {
  let lastErr: unknown = new Error("No keyless model answered");
  for (const api of chainFor(model)) {
    const started = { v: false };
    try {
      const st = await attempt(api, messages, opts, onText, started);
      return { ...st, servedBy: api };
    } catch (e) {
      if (opts.signal?.aborted || started.v) throw e;
      lastErr = e;
    }
  }
  throw lastErr;
}

export function servedLabel(api: string): string {
  return KEYLESS_MODELS.find((m) => m.api === api)?.label ?? live.labels[api]?.replace(/\s*\(.*\)$/, "") ?? api;
}
