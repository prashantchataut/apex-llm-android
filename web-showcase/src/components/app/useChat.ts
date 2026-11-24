"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { buildContext, estimateTokens, type Attachment } from "@/lib/attachments";
import { systemPromptFor, type Cartridge } from "@/lib/cartridges";
import { createTokenTicker, haptic } from "@/lib/haptics";
import { invokeNative, isNative, streamNative } from "@/lib/native";
import { pickReply } from "@/lib/demo-script";

export interface ChatAttachRef {
  name: string;
  kind: "text" | "image";
  tokens: number;
  preview?: string;
}

export interface ChatMsg {
  id: number;
  role: "user" | "assistant";
  text: string;
  steps?: string[];
  stepsShown?: number;
  thinkStart?: number;
  thinkEnd?: number | null;
  streaming?: boolean;
  attach?: ChatAttachRef[];
  stats?: { tps: number; tokens: number };
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

/**
 * Chat driver. In the Android app it streams from the Rust engine (`chat_stream` → llama.cpp) and fires the
 * streaming haptics; in a plain browser, where no engine exists, it plays the bundled sample conversations.
 */
export function useChat() {
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [activeModel, setActiveModel] = useState<string | null>(null);
  const timers = useRef<number[]>([]);
  const ids = useRef(1);
  const msgsRef = useRef<ChatMsg[]>([]);
  msgsRef.current = msgs;

  const clear = useCallback(() => {
    timers.current.forEach((t) => {
      window.clearTimeout(t);
      window.clearInterval(t);
    });
    timers.current = [];
  }, []);
  useEffect(() => clear, [clear]);

  /** Resolve (and load, if necessary) the model the engine should use. */
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
    return pick.name;
  }, []);

  useEffect(() => {
    if (!isNative()) return;
    void invokeNative<LocalModel[]>("model_list").then((l) => {
      const cur = l?.find((m) => m.loaded) ?? l?.[0];
      if (cur) setActiveModel(cur.name);
    });
  }, []);

  const send = useCallback(
    (prompt: string, opts: SendOpts = {}) => {
      clear();
      const atts = opts.attachments ?? [];
      const uid = ids.current++;
      const aid = ids.current++;
      const attach: ChatAttachRef[] = atts.filter((a) => !a.error).map((a) => ({ name: a.name, kind: a.kind, tokens: a.tokens, preview: a.preview }));
      const userMsg: ChatMsg = { id: uid, role: "user", text: prompt, attach: attach.length ? attach : undefined };
      const asst: ChatMsg = { id: aid, role: "assistant", text: "", steps: [], stepsShown: 0, thinkStart: performance.now(), thinkEnd: null, streaming: true };
      const history = msgsRef.current.filter((m) => m.text && !m.notice).map((m) => ({ role: m.role, content: m.text }));
      setMsgs((m) => [...m.map((x) => (x.streaming ? { ...x, streaming: false, thinkEnd: x.thinkEnd ?? performance.now() } : x)), userMsg, asst]);
      const patch = (p: Partial<ChatMsg> | ((m: ChatMsg) => Partial<ChatMsg>)) =>
        setMsgs((ms) => ms.map((m) => (m.id === aid ? { ...m, ...(typeof p === "function" ? p(m) : p) } : m)));
      const tick = createTokenTicker();

      // ───────── on-device engine ─────────
      if (isNative()) {
        void (async () => {
          const model = await ensureModel();
          if (!model) {
            patch({ text: "No model is installed yet. Open **Models** and tap **Get** on the Instant Nano preset — it is under 100 MB.", streaming: false, thinkEnd: performance.now(), notice: "no-model" });
            return;
          }
          const ctx = opts.ctx ?? 4096;
          const context = buildContext(atts, Math.floor(ctx * 0.5));
          const content = context.text ? `${context.text}\n\n${prompt}` : prompt;
          const messages = [{ role: "system", content: systemPromptFor(opts.cartridge) }, ...history, { role: "user", content }];
          let thought = "";
          let pieces = 0;
          let text = "";
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
              text += e.text;
              tick();
              patch((m) => ({ text, thinkEnd: m.thinkEnd ?? performance.now() }));
            } else if (e.kind === "done") {
              patch({ streaming: false, stats: { tps: e.tps, tokens: e.completion_tokens || pieces } });
            } else if (e.kind === "error") {
              patch({ text: text || `The engine stopped: ${e.message}`, streaming: false, thinkEnd: performance.now() });
            }
          });
          if (!res.ok) patch((m) => ({ text: m.text || `The engine could not start: ${res.error ?? "unknown error"}`, streaming: false, thinkEnd: m.thinkEnd ?? performance.now() }));
          else patch((m) => (m.streaming ? { streaming: false } : {}));
        })();
        return;
      }

      // ───────── browser: bundled sample conversations ─────────
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
    },
    [clear, ensureModel],
  );

  const busy = msgs.some((m) => m.streaming);
  /** Rough KV-cache fill: every message in the transcript plus a typical system prompt. */
  const usedTokens = msgs.reduce((n, m) => n + estimateTokens(m.text) + (m.attach?.reduce((a, x) => a + x.tokens, 0) ?? 0), 120);
  return { msgs, send, busy, activeModel, usedTokens };
}
