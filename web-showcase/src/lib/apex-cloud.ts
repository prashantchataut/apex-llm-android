"use client";

import { useMemo, useSyncExternalStore } from "react";
import type { ChatTurn, GenOpts, GenStats } from "./engine";
import { getAccess, useAccess } from "./access";
import type { ApexCatalog, ApexModel } from "./vault";

/**
 * Apex Cloud Engine client. Nothing here names a provider, an endpoint or a model: the catalog (including the
 * endpoints) is decrypted from the vault in memory after a valid `sk-apex-` key is entered (see vault.ts / access.ts).
 * Requested models that are not currently served transparently fall back to the catalog's always-on model, and the
 * message footer always names the model that actually answered.
 */

export type { ApexModel } from "./vault";

interface Live {
  checked: boolean;
  names: string[];
  imageNames: string[];
  labels: Record<string, string>;
  extra: ApexModel[];
}
const EMPTY: Live = { checked: false, names: [], imageNames: [], labels: {}, extra: [] };
let live: Live = EMPTY;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

const pretty = (n: string) => n.split(/[-_/]/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join("-");

/** Dynamic discovery: after unlock, ask the upstream which models it serves right now and wrap new ones as Apex API models. */
export async function refreshLive(): Promise<void> {
  const cat = getAccess().catalog;
  if (typeof window === "undefined" || !cat) {
    if (live !== EMPTY) {
      live = EMPTY;
      emit();
    }
    return;
  }
  try {
    const [t, i] = await Promise.allSettled([fetch(cat.endpoints.models, { cache: "no-store" }).then((r) => r.json()), fetch(cat.endpoints.imageModels, { cache: "no-store" }).then((r) => r.json())]);
    const labels: Record<string, string> = {};
    const names: string[] = [];
    const extra: ApexModel[] = [];
    const known = new Set(cat.models.map((m) => m.api));
    if (t.status === "fulfilled" && Array.isArray(t.value)) {
      for (const m of t.value as { name: string; aliases?: string[]; description?: string; reasoning?: boolean; uncensored?: boolean; vision?: boolean }[]) {
        for (const n of [m.name, ...(m.aliases ?? [])]) {
          names.push(n);
          labels[n] = m.description ?? m.name;
        }
        if (!known.has(m.name) && !(m.aliases ?? []).some((a) => known.has(a))) extra.push({ id: `live-${m.name}`, label: `Apex-${pretty(m.name)}`, tag: "Newly discovered", group: "Discovered live", kind: "text", api: m.name, reasoning: m.reasoning, uncensored: m.uncensored, vision: m.vision });
      }
    }
    const imageNames = i.status === "fulfilled" && Array.isArray(i.value) ? (i.value as unknown[]).map(String) : [];
    for (const n of imageNames) if (!known.has(n)) extra.push({ id: `live-img-${n}`, label: `Apex-${pretty(n)}`, tag: "Newly discovered", group: "Discovered live", kind: "image", api: n });
    live = { checked: true, names, imageNames, labels, extra };
  } catch {
    live = { ...live, checked: true };
  }
  emit();
}

export function useApexLive(): Live {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => live,
    () => EMPTY,
  );
}

/** Catalog + discovered models. Empty while locked, so nothing about the tier is visible before unlock. */
export function modelsOf(cat: ApexCatalog | null, l: Live): ApexModel[] {
  return cat ? [...cat.models, ...l.extra] : [];
}
export function useApexModels(): { models: ApexModel[]; text: ApexModel[]; image: ApexModel[]; live: Live; unlocked: boolean } {
  const a = useAccess();
  const l = useApexLive();
  return useMemo(() => {
    const models = a.state === "active" ? modelsOf(a.catalog, l) : [];
    return { models, text: models.filter((m) => m.kind === "text"), image: models.filter((m) => m.kind === "image"), live: l, unlocked: models.length > 0 };
  }, [a.state, a.catalog, l]);
}
export function apexById(id: string): ApexModel | undefined {
  const a = getAccess();
  return modelsOf(a.catalog, live).find((m) => m.id === id);
}

/** True if this model is currently served upstream (optimistic until the first check finishes). */
export function isServed(m: ApexModel, l: Live): boolean {
  const names = m.kind === "image" ? l.imageNames : l.names;
  return !l.checked || names.length === 0 || names.includes(m.api);
}

export interface ApexStats extends GenStats {
  servedBy: string;
}

interface Delta {
  choices?: { delta?: { content?: string; reasoning?: string; reasoning_content?: string; tool_calls?: { index?: number; function?: { name?: string; arguments?: string } }[] } }[];
}

async function attempt(endpoint: string, api: string, messages: ChatTurn[], opts: GenOpts, onText: (raw: string) => void, started: { v: boolean }): Promise<GenStats> {
  const t0 = performance.now();
  let res: Response | null = null;
  for (let i = 0; i < 2; i++) {
    res = await fetch(endpoint, {
      method: "POST",
      signal: opts.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: api, messages, stream: true, temperature: opts.temperature ?? 0.7 }),
    });
    if (res.status !== 429) break;
    await new Promise((r) => setTimeout(r, 2500));
  }
  if (!res || !res.ok || !res.body) throw new Error(`Apex API answered ${res?.status ?? "no response"} for ${api}`);
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
  if (!started.v) throw new Error(`Apex API returned no tokens for ${api}`);
  return { ttftMs: Math.round((first || end) - t0), tps: tokens > 1 ? ((tokens - 1) / Math.max(1, end - first)) * 1000 : 0, tokens, promptTokens: 0, totalMs: Math.round(end - t0) };
}

/** Stream a completion with automatic fallback across models. Reasoning is surfaced as a `<think>` block. */
export async function apexChat(model: ApexModel, messages: ChatTurn[], opts: GenOpts, onText: (raw: string) => void): Promise<ApexStats> {
  const cat = getAccess().catalog;
  if (!cat) throw new Error("Apex API is locked. Enter your sk-apex key to unlock it.");
  let lastErr: unknown = new Error("No Apex API model answered");
  for (const api of [...new Set([model.api, cat.fallbackApi])]) {
    const started = { v: false };
    try {
      const st = await attempt(cat.endpoints.text, api, messages, opts, onText, started);
      return { ...st, servedBy: api };
    } catch (e) {
      if (opts.signal?.aborted || started.v) throw e;
      lastErr = e;
    }
  }
  throw lastErr;
}

/** Friendly name of the upstream that actually answered. */
export function servedLabel(api: string): string {
  const a = getAccess();
  const m = a.catalog?.models.find((x) => x.api === api);
  return m?.label ?? live.labels[api]?.replace(/\s*\(.*\)$/, "") ?? api;
}
