"use client";

import { useMemo, useSyncExternalStore } from "react";
import type { ChatTurn, GenOpts, GenStats } from "./engine";
import { getAccess, useAccess } from "./access";
import type { ApexCatalog, ApexModel } from "./vault";
import { verifiedChain } from "./verified";
import { flagshipOf, tailOf } from "@/data/frontier";
import { candidatesFor, getMesh, isMeshId, markFailure, markSuccess, meshAsApexModels, parseMeshId, syncMesh } from "@/services/apexCloudMesh";

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
    // Keyless mesh (OVH / LLM7 / Pollinations / owner-added endpoints): live `/models`, grouped by category.
    try {
      await syncMesh();
      const seen = new Set<string>([...known, ...extra.map((e) => e.api)]);
      extra.push(...meshAsApexModels(seen));
    } catch {
      /* mesh is additive: the vault catalog still works */
    }
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
  const hit = modelsOf(a.catalog, live).find((m) => m.id === id);
  if (hit || !isMeshId(id)) return hit;
  // Keyless mesh models are usable without the vault: build the descriptor straight from the mesh registry.
  const p = parseMeshId(id);
  if (!p) return undefined;
  const mm = getMesh().allModels.find((m) => m.id === id);
  return { id, label: mm?.label ?? p.api, tag: "Apex Mesh", group: "Apex Mesh", kind: "text", api: p.api, reasoning: mm?.reasoning, vision: mm?.vision, uncensored: mm?.uncensored, provider: p.provider };
}

/** True if this model is currently served upstream (optimistic until the first check finishes). */
export function isServed(m: ApexModel, l: Live): boolean {
  if (isMeshId(m.id)) return true;
  const names = m.kind === "image" ? l.imageNames : l.names;
  return !l.checked || names.length === 0 || names.includes(m.api);
}

export interface ApexStats extends GenStats {
  servedBy: string;
}

interface Delta {
  choices?: { delta?: { content?: string; reasoning?: string; reasoning_content?: string; tool_calls?: { index?: number; function?: { name?: string; arguments?: string } }[] } }[];
}

interface AttemptExtra {
  headers?: Record<string, string>;
  /** Wait and retry once on 429. Off while another provider is still queued: failover is instant instead. */
  retry429?: boolean;
  /** Abort if no token arrived in this time, so a hung free tier hands over to the next provider. */
  timeoutMs?: number;
  /** Wire format of the endpoint: OpenAI chat-completions (default) or Anthropic Messages (`/v1/messages`). */
  format?: "openai" | "anthropic";
}
class HttpError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function attempt(endpoint: string, api: string, messages: ChatTurn[], opts: GenOpts, onText: (raw: string) => void, started: { v: boolean }, extra: AttemptExtra = {}): Promise<GenStats> {
  const ctl = new AbortController();
  const fwd = () => ctl.abort();
  if (opts.signal?.aborted) ctl.abort();
  opts.signal?.addEventListener("abort", fwd);
  const timer = extra.timeoutMs ? setTimeout(() => ctl.abort(), extra.timeoutMs) : undefined;
  try {
    return await attemptCore(endpoint, api, messages, { ...opts, signal: ctl.signal }, onText, started, extra, () => timer && clearTimeout(timer));
  } finally {
    if (timer) clearTimeout(timer);
    opts.signal?.removeEventListener("abort", fwd);
  }
}

async function attemptCore(endpoint: string, api: string, messages: ChatTurn[], opts: GenOpts, onText: (raw: string) => void, started: { v: boolean }, extra: AttemptExtra, firstToken: () => void): Promise<GenStats> {
  const t0 = performance.now();
  let res: Response | null = null;
  for (let i = 0; i < 2; i++) {
    res = await fetch(endpoint, {
      method: "POST",
      signal: opts.signal,
      headers: { "Content-Type": "application/json", ...extra.headers },
      body: JSON.stringify(
        extra.format === "anthropic"
          ? { model: api, max_tokens: opts.maxTokens ?? 4096, stream: true, temperature: opts.temperature ?? 0.7, system: messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n") || undefined, messages: messages.filter((m) => m.role !== "system") }
          : { model: api, messages, stream: true, temperature: opts.temperature ?? 0.7 },
      ),
    });
    if (res.status !== 429 || !extra.retry429) break;
    await new Promise((r) => setTimeout(r, 2500));
  }
  if (!res || !res.ok || !res.body) throw new HttpError(`Apex API answered ${res?.status ?? "no response"} for ${api}`, res?.status ?? 0);
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
        if (extra.format === "anthropic") {
          const ev = JSON.parse(data) as { type?: string; delta?: { type?: string; text?: string; thinking?: string } };
          if (ev.type === "content_block_delta") {
            if (ev.delta?.thinking) thought += ev.delta.thinking;
            if (ev.delta?.text) text += ev.delta.text;
            if (ev.delta?.thinking || ev.delta?.text) {
              if (!first) {
                first = performance.now();
                firstToken();
              }
              started.v = true;
              tokens += 1;
              onText(thought ? `<think>${thought}${text ? "</think>" : ""}${text}` : text);
            }
          }
          continue;
        }
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
          if (!first) {
            first = performance.now();
            firstToken();
          }
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

interface Step {
  endpoint: string;
  api: string;
  headers?: Record<string, string>;
  /** Mesh provider id (cooldown bookkeeping). Absent for the vault upstream. */
  provider?: string;
  format?: "openai" | "anthropic";
  /** Owner override from /admin for this provider. */
  system?: string;
  firstTokenMs?: number;
}

/**
 * Stream a completion with zero-downtime failover. Order: the requested model on its own upstream (vault catalog or mesh provider),
 * the catalog's always-on model, then a stand-in model on every other healthy keyless provider. 429 / 5xx / timeout / network errors
 * hand over to the next step immediately; an abort by the user or an answer that already started is never retried.
 */
export async function apexChat(model: ApexModel, messages: ChatTurn[], opts: GenOpts, onText: (raw: string) => void): Promise<ApexStats> {
  const cat = getAccess().catalog;
  // Keyless mesh models (Apex Auto) never need the vault; vault models still do.
  if (!cat && !isMeshId(model.id)) throw new Error("Apex API is locked. Enter your Apex API key to unlock it.");
  const plan: Step[] = [];
  const meshStep = (c: { provider: { id: string; chat: string; auth?: string; format?: "openai" | "anthropic"; systemPrompt?: string; timeoutMs?: number }; api: string }): Step => ({
    system: c.provider.systemPrompt,
    firstTokenMs: c.provider.timeoutMs,
    endpoint: c.provider.chat,
    api: c.api,
    headers: c.provider.format === "anthropic" ? { "x-api-key": "free", "anthropic-version": "2023-06-01" } : c.provider.auth ? { Authorization: c.provider.auth } : undefined,
    provider: c.provider.id,
    format: c.provider.format,
  });
  const pref = isMeshId(model.id) ? parseMeshId(model.id) : null;
  if (!pref && cat) for (const api of [...new Set([model.api, cat.fallbackApi])]) plan.push({ endpoint: cat.endpoints.text, api });
  for (const c of candidatesFor(pref ?? undefined)) plan.push(meshStep(c));
  // Self-healing: the live-verified models (fastest first) are the last-resort backups so a prompt never dead-ends.
  for (const v of verifiedChain({ preferred: pref ?? undefined })) plan.push(meshStep({ provider: v.provider, api: v.api }));
  let uniq = plan.filter((s, i) => plan.findIndex((x) => x.endpoint === s.endpoint && x.api === s.api) === i);
  if (opts.strict && pref) {
    // Honest comparison: the chosen model, or other routes of the same flagship. Never a stand-in.
    const fl = flagshipOf(pref.api);
    uniq = uniq.filter((s) => s.api === pref.api || (!!fl && fl.rx.test(tailOf(s.api))));
  }
  let lastErr: unknown = new Error("No Apex API model answered");
  for (let i = 0; i < uniq.length; i++) {
    const step = uniq[i];
    const started = { v: false };
    const last = i === uniq.length - 1;
    try {
      const sent = step.system ? [{ role: "system" as const, content: step.system }, ...messages.filter((x) => x.role !== "system")] : messages;
      const st = await attempt(step.endpoint, step.api, sent, opts, onText, started, { headers: step.headers, retry429: last, timeoutMs: step.firstTokenMs ?? (last || opts.strict || (i === 0 && !!pref) ? (opts.strict ? 60000 : 25000) : 3500), format: step.format });
      if (step.provider) markSuccess(step.provider, step.api);
      return { ...st, servedBy: step.api };
    } catch (e) {
      if (opts.signal?.aborted || started.v) throw e;
      if (step.provider) markFailure(step.provider, step.api);
      lastErr = e;
    }
  }
  throw lastErr;
}

/** Friendly name of the upstream that actually answered. */
export function servedLabel(api: string): string {
  const a = getAccess();
  const m = a.catalog?.models.find((x) => x.api === api) ?? live.extra.find((x) => x.api === api);
  return m?.label ?? live.labels[api]?.replace(/\s*\(.*\)$/, "") ?? api;
}
