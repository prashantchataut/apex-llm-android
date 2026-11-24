"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildContext, estimateTokens, type Attachment } from "@/lib/attachments";
import { systemPromptFor, type Cartridge } from "@/lib/cartridges";
import { activeBackend, estimateRamMb, getEngineSnapshot, routerChat, setNativeModel, shortModelName, splitThink, wllamaChat, type Backend, type ChatTurn } from "@/lib/engine";
import { createTokenTicker, haptic } from "@/lib/haptics";
import { invokeNative, isNative, streamNative } from "@/lib/native";
import { CATALOG } from "@/lib/models";
import { pickReply } from "@/lib/demo-script";

export interface ChatAttachRef {
  name: string;
  kind: "text" | "image";
  tokens: number;
  preview?: string;
}

/** Measured numbers for one assistant reply (shown in the per-message telemetry popover). */
export interface MsgStats {
  tps: number;
  tokens: number;
  ttftMs?: number;
  promptTokens?: number;
  totalMs?: number;
  ramMb?: number;
  temperature?: number;
  topP?: number;
}

/** Which engine actually produced a reply. `sandbox` means NO neural network ran. */
export interface EngineTag {
  backend: Backend;
  label: string;
  cartridge?: string;
}

export interface ChatMsg {
  id: number;
  /** Tree edge: siblings share a parent and form a branch (`< 2 / 2 >`). */
  parentId: number | null;
  role: "user" | "assistant";
  text: string;
  steps?: string[];
  stepsShown?: number;
  thinkStart?: number;
  thinkEnd?: number | null;
  streaming?: boolean;
  attach?: ChatAttachRef[];
  stats?: MsgStats;
  engine?: EngineTag;
  notice?: "no-model";
}

type ChatEvent =
  | { kind: "text"; text: string }
  | { kind: "thought"; text: string }
  | { kind: "thinkStart" }
  | { kind: "thinkEnd" }
  | { kind: "done"; prompt_tokens: number; completion_tokens: number; tps: number }
  | { kind: "error"; message: string };

interface LocalModel {
  name: string;
  size_bytes: number;
  loaded: boolean;
}

export const MODEL_KEY = "apex.model.v1";

/** Pretty label for a GGUF filename: `SmolLM2-135M-Instruct-Q3_K_M.gguf` → `SmolLM2-135M-Instruct · Q3_K_M`. */
export function modelLabel(file: string | null): string {
  if (!file) return "No model";
  const base = file.replace(/\.gguf$/i, "");
  const m = base.match(/^(.*?)[-_.](I?Q\d[\w]*|f16|F16|bf16)$/);
  return m ? `${m[1]} · ${m[2].toUpperCase()}` : base;
}

export interface SendOpts {
  attachments?: Attachment[];
  cartridge?: Cartridge;
  /** Context window (tokens) used to budget attachments. */
  ctx?: number;
}

export interface BranchInfo {
  index: number;
  total: number;
  ids: number[];
}

const keyOf = (p: number | null) => (p === null ? "root" : String(p));

/** Follow the selected child at every fork, from the root down to the visible leaf. */
function visiblePath(nodes: ChatMsg[], sel: Record<string, number>): ChatMsg[] {
  const byParent = new Map<string, ChatMsg[]>();
  for (const n of nodes) {
    const k = keyOf(n.parentId);
    byParent.set(k, [...(byParent.get(k) ?? []), n]);
  }
  const out: ChatMsg[] = [];
  let parent: number | null = null;
  for (;;) {
    const kids = byParent.get(keyOf(parent));
    if (!kids?.length) break;
    const pick: ChatMsg = kids.find((k) => k.id === sel[keyOf(parent)]) ?? kids[kids.length - 1];
    out.push(pick);
    parent = pick.id;
  }
  return out;
}

/**
 * Chat driver with a non-destructive branch tree.
 * Backends (see `lib/engine.ts`): external router → Rust core in the Android app → wllama (llama.cpp WASM) → sandbox.
 * Editing a prompt or regenerating a reply adds a sibling instead of overwriting; `branchInfo` powers the `< 2 / 2 >` pager.
 */
export function useChat() {
  const [nodes, setNodes] = useState<ChatMsg[]>([]);
  const [sel, setSel] = useState<Record<string, number>>({});
  const [activeModel, setActiveModel] = useState<string | null>(null);
  const timers = useRef<number[]>([]);
  const abort = useRef<AbortController | null>(null);
  const ids = useRef(1);
  const nodesRef = useRef<ChatMsg[]>([]);
  nodesRef.current = nodes;
  const selRef = useRef(sel);
  selRef.current = sel;

  const msgs = useMemo(() => visiblePath(nodes, sel), [nodes, sel]);

  const clear = useCallback(() => {
    timers.current.forEach((t) => {
      window.clearTimeout(t);
      window.clearInterval(t);
    });
    timers.current = [];
  }, []);
  useEffect(
    () => () => {
      clear();
      abort.current?.abort();
    },
    [clear],
  );

  /** Resolve (and load, if necessary) the model the Rust engine should use. */
  const ensureModel = useCallback(async (): Promise<string | null> => {
    const list = (await invokeNative<LocalModel[]>("model_list")) ?? [];
    if (list.length === 0) return null;
    let preferred: string | null = null;
    try {
      preferred = localStorage.getItem(MODEL_KEY);
    } catch {
      /* storage blocked */
    }
    const pick = list.find((m) => m.loaded) ?? list.find((m) => m.name === preferred) ?? list[0];
    if (!pick.loaded) {
      const r = await invokeNative<string>("model_load", { name: pick.name });
      if (r === null) return null;
      haptic("heavyLock");
    }
    setActiveModel(pick.name);
    setNativeModel(pick.name);
    return pick.name;
  }, []);

  useEffect(() => {
    if (!isNative()) return;
    void invokeNative<LocalModel[]>("model_list").then((l) => {
      const cur = l?.find((m) => m.loaded) ?? l?.[0];
      if (cur) {
        setActiveModel(cur.name);
        setNativeModel(cur.name);
      }
    });
  }, []);

  const patchNode = useCallback((id: number, p: Partial<ChatMsg> | ((m: ChatMsg) => Partial<ChatMsg>)) => setNodes((ms) => ms.map((m) => (m.id === id ? { ...m, ...(typeof p === "function" ? p(m) : p) } : m))), []);

  /** Run one assistant reply under `userNode`, with `history` = the visible turns before it. */
  const generate = useCallback(
    (aid: number, history: ChatTurn[], prompt: string, atts: Attachment[], opts: SendOpts) => {
      const patch = (p: Partial<ChatMsg> | ((m: ChatMsg) => Partial<ChatMsg>)) => patchNode(aid, p);
      const tick = createTokenTicker();
      const ctx = opts.ctx ?? 4096;
      const context = buildContext(atts, Math.floor(ctx * 0.5));
      const content = context.text ? `${context.text}\n\n${prompt}` : prompt;
      const temperature = opts.cartridge?.temperature ?? 0.7;
      const topP = opts.cartridge?.topP ?? 0.9;
      const messages: ChatTurn[] = [{ role: "system", content: systemPromptFor(opts.cartridge) }, ...history, { role: "user", content }];
      const cartName = opts.cartridge?.name;

      void (async () => {
        let backend = activeBackend();
        if (isNative() && backend !== "external") {
          const model = await ensureModel();
          backend = activeBackend();
          if (!model && backend !== "wllama") {
            patch({ text: "No model is installed yet. Open **Models** and tap **Get** on the Instant Nano preset — it is 145 MB.", streaming: false, thinkEnd: performance.now(), notice: "no-model" });
            return;
          }
        }

        // ───────── real engines: Rust core (native) ─────────
        if (backend === "native") {
          const model = getEngineSnapshot().nativeModel ?? "model";
          patch({ engine: { backend, label: modelLabel(model), cartridge: cartName } });
          let thought = "";
          let pieces = 0;
          let text = "";
          const t0 = performance.now();
          let first = 0;
          const res = await streamNative<ChatEvent>("chat_stream", { messages }, (e) => {
            if (e.kind === "thinkStart") {
              haptic("reasoningPulse");
              patch({ thinkStart: performance.now(), thinkEnd: null });
            } else if (e.kind === "thought") {
              thought += e.text;
              tick();
              const steps = thought.split(/\n+/).map((s) => s.trim()).filter(Boolean);
              patch({ steps, stepsShown: steps.length });
            } else if (e.kind === "thinkEnd") {
              haptic("reasoningDone");
              patch({ thinkEnd: performance.now() });
            } else if (e.kind === "text") {
              pieces += 1;
              if (!first) first = performance.now();
              text += e.text;
              tick();
              patch((m) => ({ text, thinkEnd: m.thinkEnd ?? performance.now() }));
            } else if (e.kind === "done") {
              patch({ streaming: false, stats: { tps: e.tps, tokens: e.completion_tokens || pieces, promptTokens: e.prompt_tokens, ttftMs: Math.round((first || performance.now()) - t0), totalMs: Math.round(performance.now() - t0), temperature, topP } });
            } else if (e.kind === "error") {
              patch({ text: text || `The engine stopped: ${e.message}`, streaming: false, thinkEnd: performance.now() });
            }
          });
          if (!res.ok) patch((m) => ({ text: m.text || `The engine could not start: ${res.error ?? "unknown error"}`, streaming: false, thinkEnd: m.thinkEnd ?? performance.now() }));
          else patch((m) => (m.streaming ? { streaming: false } : {}));
          return;
        }

        // ───────── real engines: wllama GGUF (WASM) or external router ─────────
        if (backend === "wllama" || backend === "external") {
          const snap = getEngineSnapshot();
          const cat = CATALOG.find((c) => c.id === snap.loaded.a);
          const label = backend === "external" ? `${snap.router?.model ?? "router"} · ${new URL(snap.router?.baseUrl ?? "http://x").host}` : shortModelName(cat);
          patch({ engine: { backend, label, cartridge: cartName } });
          const ctl = new AbortController();
          abort.current = ctl;
          let thinkSeen = false;
          const onText = (raw: string) => {
            tick();
            const { thought, answer, open } = splitThink(raw);
            if (thought) {
              if (!thinkSeen) {
                thinkSeen = true;
                haptic("reasoningPulse");
              }
              const steps = thought.split(/\n+/).map((s) => s.trim()).filter(Boolean);
              patch((m) => ({ steps, stepsShown: steps.length, text: answer, thinkEnd: open ? null : (m.thinkEnd ?? performance.now()) }));
            } else patch((m) => ({ text: answer, thinkEnd: m.thinkEnd ?? performance.now() }));
          };
          try {
            const opt = { maxTokens: 700, temperature, topP, signal: ctl.signal };
            const st = backend === "external" && snap.router ? await routerChat(snap.router, messages, opt, onText) : await wllamaChat("a", messages, opt, onText);
            haptic("reasoningDone");
            patch({ streaming: false, thinkEnd: performance.now(), stats: { ...st, ramMb: backend === "wllama" ? estimateRamMb(cat) : undefined, temperature, topP } });
          } catch (e) {
            const aborted = ctl.signal.aborted;
            patch((m) => ({ text: m.text || (aborted ? "Stopped." : `The engine stopped: ${e instanceof Error ? e.message : "unknown error"}`), streaming: false, thinkEnd: m.thinkEnd ?? performance.now() }));
          }
          return;
        }

        // ───────── sandbox: scripted sample conversations. NO neural network runs. ─────────
        patch({ engine: { backend: "sandbox", label: "Scripted sample", cartridge: cartName } });
        const reply = pickReply(prompt);
        patch({ steps: reply.steps });
        const gap = (reply.thinkMs - 700) / reply.steps.length;
        haptic("reasoningPulse");
        reply.steps.forEach((_, i) => timers.current.push(window.setTimeout(() => patch({ stepsShown: i + 1 }), 350 + i * gap)));
        timers.current.push(
          window.setTimeout(() => {
            patch({ thinkEnd: performance.now() });
            haptic("reasoningDone");
            let pos = 0;
            const iv = window.setInterval(() => {
              pos += 5;
              tick();
              if (pos >= reply.answer.length) {
                window.clearInterval(iv);
                patch({ text: reply.answer, streaming: false });
              } else patch({ text: reply.answer.slice(0, pos) });
            }, 24);
            timers.current.push(iv);
          }, reply.thinkMs),
        );
      })();
    },
    [ensureModel, patchNode],
  );

  const stopStreaming = useCallback(() => {
    abort.current?.abort();
    clear();
    setNodes((ms) => ms.map((m) => (m.streaming ? { ...m, streaming: false, thinkEnd: m.thinkEnd ?? performance.now() } : m)));
  }, [clear]);

  const history = (upToExclusive: number | null): ChatTurn[] => {
    const chain: ChatMsg[] = [];
    let cur = upToExclusive;
    while (cur !== null) {
      const n = nodesRef.current.find((x) => x.id === cur);
      if (!n) break;
      chain.unshift(n);
      cur = n.parentId;
    }
    return chain.filter((m) => m.text && !m.notice).map((m) => ({ role: m.role, content: m.text }));
  };

  const spawnReply = useCallback(
    (userId: number, text: string, atts: Attachment[], opts: SendOpts, hist: ChatTurn[]) => {
      const aid = ids.current++;
      const asst: ChatMsg = { id: aid, parentId: userId, role: "assistant", text: "", steps: [], stepsShown: 0, thinkStart: performance.now(), thinkEnd: null, streaming: true };
      setNodes((ms) => [...ms.map((x) => (x.streaming ? { ...x, streaming: false, thinkEnd: x.thinkEnd ?? performance.now() } : x)), asst]);
      setSel((s) => ({ ...s, [keyOf(userId)]: aid }));
      generate(aid, hist, text, atts, opts);
    },
    [generate],
  );

  const send = useCallback(
    (prompt: string, opts: SendOpts = {}) => {
      clear();
      abort.current?.abort();
      const atts = opts.attachments ?? [];
      const leaf = visiblePath(nodesRef.current, selRef.current).at(-1) ?? null;
      const uid = ids.current++;
      const attach: ChatAttachRef[] = atts.filter((a) => !a.error).map((a) => ({ name: a.name, kind: a.kind, tokens: a.tokens, preview: a.preview }));
      const userMsg: ChatMsg = { id: uid, parentId: leaf?.id ?? null, role: "user", text: prompt, attach: attach.length ? attach : undefined };
      const hist = history(leaf?.id ?? null);
      setNodes((ms) => [...ms, userMsg]);
      setSel((s) => ({ ...s, [keyOf(userMsg.parentId)]: uid }));
      spawnReply(uid, prompt, atts, opts, hist);
    },
    [clear, spawnReply],
  );

  /** Edit a user prompt → new sibling branch, regenerated from there. The old branch stays reachable. */
  const edit = useCallback(
    (userId: number, text: string, opts: SendOpts = {}) => {
      const orig = nodesRef.current.find((n) => n.id === userId);
      if (!orig || !text.trim()) return;
      clear();
      abort.current?.abort();
      const uid = ids.current++;
      const userMsg: ChatMsg = { id: uid, parentId: orig.parentId, role: "user", text: text.trim(), attach: orig.attach };
      const hist = history(orig.parentId);
      setNodes((ms) => [...ms, userMsg]);
      setSel((s) => ({ ...s, [keyOf(orig.parentId)]: uid }));
      spawnReply(uid, userMsg.text, [], opts, hist);
    },
    [clear, spawnReply],
  );

  /** Regenerate an assistant reply → new sibling under the same prompt. */
  const regenerate = useCallback(
    (asstId: number, opts: SendOpts = {}) => {
      const a = nodesRef.current.find((n) => n.id === asstId);
      const u = a && nodesRef.current.find((n) => n.id === a.parentId);
      if (!a || !u) return;
      clear();
      abort.current?.abort();
      spawnReply(u.id, u.text, [], opts, history(u.parentId));
    },
    [clear, spawnReply],
  );

  const branchInfo = useCallback(
    (id: number): BranchInfo | null => {
      const n = nodes.find((x) => x.id === id);
      if (!n) return null;
      const sib = nodes.filter((x) => x.parentId === n.parentId && x.role === n.role).map((x) => x.id);
      return sib.length > 1 ? { index: sib.indexOf(id), total: sib.length, ids: sib } : null;
    },
    [nodes],
  );

  const switchBranch = useCallback((id: number) => {
    const n = nodesRef.current.find((x) => x.id === id);
    if (!n) return;
    haptic("detentClick");
    setSel((s) => ({ ...s, [keyOf(n.parentId)]: id }));
  }, []);

  /** Crown an Arena winner: append its prompt + reply to the main conversation as a fresh branch. */
  const adopt = useCallback((prompt: string, reply: { text: string; engine: EngineTag; stats?: MsgStats }) => {
    const leaf = visiblePath(nodesRef.current, selRef.current).at(-1) ?? null;
    const uid = ids.current++;
    const aid = ids.current++;
    const u: ChatMsg = { id: uid, parentId: leaf?.id ?? null, role: "user", text: prompt };
    const a: ChatMsg = { id: aid, parentId: uid, role: "assistant", text: reply.text, streaming: false, engine: reply.engine, stats: reply.stats };
    setNodes((ms) => [...ms, u, a]);
    setSel((s) => ({ ...s, [keyOf(u.parentId)]: uid, [keyOf(uid)]: aid }));
  }, []);

  const busy = msgs.some((m) => m.streaming);
  /** Rough KV-cache fill: every message in the transcript plus a typical system prompt. */
  const usedTokens = msgs.reduce((n, m) => n + estimateTokens(m.text) + (m.attach?.reduce((a, x) => a + x.tokens, 0) ?? 0), 120);
  return { msgs, send, edit, regenerate, stop: stopStreaming, branchInfo, switchBranch, adopt, busy, activeModel, usedTokens };
}
