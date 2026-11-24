"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { BUILTIN_CARTRIDGES, systemPromptFor, type Cartridge } from "@/lib/cartridges";
import { getEngineSnapshot, loadWllamaModel, shortModelName, splitThink, useEngine, wllamaChat, estimateRamMb, type Slot } from "@/lib/engine";
import { haptic } from "@/lib/haptics";
import { CATALOG } from "@/lib/models";
import { pickReply } from "@/lib/demo-script";
import { AssistantBody } from "./Rich";
import type { EngineTag, MsgStats } from "./useChat";

type Phase = "idle" | "loading" | "thinking" | "streaming" | "done" | "error";
export interface LaneResult {
  text: string;
  engine: EngineTag;
  stats?: MsgStats;
}
interface Lane {
  phase: Phase;
  text: string;
  tokens: number;
  tps: number;
  ttftMs: number | null;
  thinkMs: number;
  t0: number;
  engine: EngineTag | null;
  stats?: MsgStats;
  error?: string;
}
interface Cfg {
  model: string; // catalog id or "sandbox"
  cartridge: string;
}
const IDLE: Lane = { phase: "idle", text: "", tokens: 0, tps: 0, ttftMs: null, thinkMs: 0, t0: 0, engine: null };
const SLOT: Record<"A" | "B", Slot> = { A: "a", B: "b" };

/** Gauge arc for live tok/s (0‥60). transform-free SVG stroke offset. */
function Gauge({ value, tone }: { value: number; tone: string }) {
  const r = 22;
  const c = Math.PI * r;
  const pct = Math.min(1, value / 60);
  return (
    <svg width="64" height="40" viewBox="0 0 64 40" aria-label={`${value.toFixed(1)} tokens per second`}>
      <path d="M10 34a22 22 0 0 1 44 0" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="5" strokeLinecap="round" />
      <path d="M10 34a22 22 0 0 1 44 0" fill="none" stroke={tone} strokeWidth="5" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct)} style={{ transition: "stroke-dashoffset 160ms linear" }} />
      <text x="32" y="33" textAnchor="middle" className="mono tnum" fontSize="11" fontWeight="700" fill="#fff">
        {value.toFixed(0)}
      </text>
    </svg>
  );
}

/**
 * Apex Arena: two lanes stream the same prompt at once. Lanes use real GGUF weights (wllama slot A / B) when a model is
 * cached on the device; otherwise the lane is a clearly-labelled SIMULATED sample.
 */
export function ArenaView({ job, defaultCartridge, onCrown, onNeedModel }: { job: { prompt: string; nonce: number } | null; defaultCartridge: Cartridge; onCrown: (prompt: string, r: LaneResult) => void; onNeedModel: () => void }) {
  const eng = useEngine();
  const real = useMemo(() => CATALOG.filter((c) => eng.cached.includes(c.id) || eng.loaded.a === c.id || eng.loaded.b === c.id), [eng.cached, eng.loaded]);
  const [cfg, setCfg] = useState<Record<"A" | "B", Cfg>>({ A: { model: "sandbox", cartridge: defaultCartridge.id }, B: { model: "sandbox", cartridge: BUILTIN_CARTRIDGES[3]?.id ?? defaultCartridge.id } });
  const [lanes, setLanes] = useState<Record<"A" | "B", Lane>>({ A: IDLE, B: IDLE });
  const [crown, setCrown] = useState<"A" | "B" | null>(null);
  const [prompt, setPrompt] = useState("");
  const timers = useRef<number[]>([]);
  const initial = useRef(false);

  // default lane models once we know what is cached: A = fastest nano, B = the next model (or same model, different cartridge)
  useEffect(() => {
    if (initial.current || real.length === 0) return;
    initial.current = true;
    setCfg((c) => ({ A: { ...c.A, model: real[0].id }, B: { ...c.B, model: (real[1] ?? real[0]).id } }));
  }, [real]);

  const patch = useCallback((l: "A" | "B", p: Partial<Lane>) => setLanes((s) => ({ ...s, [l]: { ...s[l], ...p } })), []);

  const runLane = useCallback(
    async (l: "A" | "B", c: Cfg, text: string) => {
      const cart = BUILTIN_CARTRIDGES.find((x) => x.id === c.cartridge) ?? defaultCartridge;
      const t0 = performance.now();
      setLanes((s) => ({ ...s, [l]: { ...IDLE, phase: "loading", t0 } }));
      if (c.model !== "sandbox") {
        const cat = CATALOG.find((x) => x.id === c.model);
        const tag: EngineTag = { backend: "wllama", label: shortModelName(cat), cartridge: cart.name };
        try {
          if (getEngineSnapshot().loaded[SLOT[l]] !== c.model) await loadWllamaModel(c.model, SLOT[l]);
          const start = performance.now();
          patch(l, { phase: "thinking", t0: start, engine: tag });
          let n = 0;
          let first = 0;
          const st = await wllamaChat(SLOT[l], [{ role: "system", content: systemPromptFor(cart) }, { role: "user", content: text }], { maxTokens: 360, temperature: cart.temperature, topP: cart.topP }, (raw) => {
            n += 1;
            const now = performance.now();
            if (!first) {
              first = now;
              haptic("reasoningDone");
            }
            const { answer } = splitThink(raw);
            patch(l, { phase: "streaming", text: answer, tokens: n, ttftMs: Math.round(first - start), thinkMs: first - start, tps: n > 1 ? ((n - 1) / Math.max(1, now - first)) * 1000 : 0 });
          });
          patch(l, { phase: "done", tps: st.tps, tokens: st.tokens, ttftMs: st.ttftMs, stats: { ...st, ramMb: estimateRamMb(cat), temperature: cart.temperature, topP: cart.topP } });
        } catch (e) {
          patch(l, { phase: "error", error: e instanceof Error ? e.message : "lane failed" });
        }
        return;
      }
      // simulated lane — scripted sample, no neural network
      const reply = pickReply(text);
      const tag: EngineTag = { backend: "sandbox", label: "Scripted sample", cartridge: cart.name };
      const speed = l === "A" ? 1 : 1.35;
      patch(l, { phase: "thinking", engine: tag, t0: performance.now() });
      timers.current.push(
        window.setTimeout(() => {
          let pos = 0;
          const begin = performance.now();
          patch(l, { phase: "streaming", thinkMs: begin - t0, ttftMs: Math.round(begin - t0) });
          const iv = window.setInterval(() => {
            pos += 4;
            const now = performance.now();
            const done = pos >= reply.answer.length;
            const toks = Math.round(pos / 4);
            patch(l, { text: reply.answer.slice(0, pos), tokens: toks, tps: (toks / Math.max(1, now - begin)) * 1000, ...(done ? { phase: "done" as const } : {}) });
            if (done) window.clearInterval(iv);
          }, 26 * speed);
          timers.current.push(iv);
        }, (reply.thinkMs / 2) * speed),
      );
    },
    [defaultCartridge, patch],
  );

  useEffect(() => {
    if (!job) return;
    setPrompt(job.prompt);
    setCrown(null);
    timers.current.forEach((t) => {
      window.clearTimeout(t);
      window.clearInterval(t);
    });
    timers.current = [];
    void runLane("A", cfg.A, job.prompt);
    void runLane("B", cfg.B, job.prompt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.nonce]);

  useEffect(
    () => () => {
      timers.current.forEach((t) => {
        window.clearTimeout(t);
        window.clearInterval(t);
      });
    },
    [],
  );

  // live clock for the dual think timers
  const [, force] = useState(0);
  const running = lanes.A.phase === "loading" || lanes.A.phase === "thinking" || lanes.B.phase === "loading" || lanes.B.phase === "thinking";
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => force((n) => n + 1), 80);
    return () => window.clearInterval(id);
  }, [running]);

  const bothDone = lanes.A.phase === "done" && lanes.B.phase === "done";
  const faster = bothDone ? (lanes.A.tps >= lanes.B.tps ? "A" : "B") : null;
  const crownIt = (l: "A" | "B") => {
    if (!lanes[l].engine) return;
    haptic("heavyLock");
    window.setTimeout(() => haptic("reasoningDone"), 140);
    setCrown(l);
    onCrown(prompt, { text: lanes[l].text, engine: lanes[l].engine as EngineTag, stats: lanes[l].stats });
  };
  const anyReal = real.length > 0;

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 px-3 pb-2">
      {!anyReal && (
        <button type="button" onClick={onNeedModel} className="mono rounded-2xl border border-warn/30 bg-warn/10 px-3.5 py-2.5 text-left text-[11px] leading-snug text-warn">
          SIMULATED PREVIEW — both lanes play scripted samples. Tap to download a Nano GGUF and duel real weights.
        </button>
      )}
      <div className="grid min-h-0 flex-1 grid-cols-2 gap-2">
        {(["A", "B"] as const).map((l) => {
          const s = lanes[l];
          const c = cfg[l];
          const live = s.phase === "loading" || s.phase === "thinking";
          const thinkMs = live ? performance.now() - s.t0 : s.thinkMs;
          const tone = l === "A" ? "#a78bfa" : "#60a5fa";
          const won = crown === l;
          return (
            <motion.section key={l} layout className={`glass-dark relative flex min-h-0 flex-col overflow-hidden rounded-[22px] ${won ? "ring-2 ring-[#fbbf24]" : ""}`} animate={{ scale: crown && !won ? 0.985 : 1, opacity: crown && !won ? 0.7 : 1 }} transition={{ type: "spring", stiffness: 340, damping: 28 }} aria-label={`Lane ${l}`}>
              <div className="flex items-center gap-1.5 px-2.5 pt-2.5">
                <span className="mono grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold text-black" style={{ background: tone }}>
                  {l}
                </span>
                <select
                  aria-label={`Lane ${l} model`}
                  value={c.model}
                  onChange={(e) => setCfg((x) => ({ ...x, [l]: { ...x[l], model: e.target.value } }))}
                  className="mono h-9 min-w-0 flex-1 truncate rounded-lg border border-white/10 bg-black/30 px-1.5 text-[10.5px] text-white"
                >
                  <option value="sandbox">Simulated sample</option>
                  {real.map((m) => (
                    <option key={m.id} value={m.id}>
                      {shortModelName(m)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="px-2.5 pt-1.5">
                <select
                  aria-label={`Lane ${l} cartridge`}
                  value={c.cartridge}
                  onChange={(e) => setCfg((x) => ({ ...x, [l]: { ...x[l], cartridge: e.target.value } }))}
                  className="mono h-8 w-full truncate rounded-lg border border-white/10 bg-black/30 px-1.5 text-[10.5px] text-ink-2"
                >
                  {BUILTIN_CARTRIDGES.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="mt-2 flex items-center justify-between gap-1 px-2.5">
                <div>
                  <div className="mono text-[9px] uppercase tracking-[0.14em] text-ink-3">{live ? "thinking" : "thought for"}</div>
                  <div className="mono tnum text-[15px] font-semibold">{(thinkMs / 1000).toFixed(2)}s</div>
                </div>
                <Gauge value={s.tps} tone={tone} />
              </div>
              <div className="mono tnum flex justify-between px-2.5 text-[9.5px] text-ink-3">
                <span>TTFT {s.ttftMs !== null ? `${s.ttftMs}ms` : "—"}</span>
                <span>{s.tokens} tok</span>
              </div>
              <div className="scroll-hide mt-1.5 min-h-0 flex-1 overflow-y-auto px-2.5 pb-2 text-[12.5px] leading-[1.5] text-ink-2">
                {s.phase === "loading" && <span className="text-ink-3">Loading weights…</span>}
                {s.phase === "error" && <span className="text-bad">{s.error}</span>}
                {s.text && <AssistantBody text={s.text} streaming={s.phase === "streaming"} />}
              </div>
              <div className="flex items-center gap-1.5 border-t border-white/10 p-2">
                <span className={`mono flex h-6 items-center gap-1 rounded-full px-2 text-[8.5px] font-semibold tracking-[0.1em] ${s.engine && s.engine.backend !== "sandbox" ? "bg-ok/15 text-ok" : "bg-warn/15 text-warn"}`}>{s.engine ? (s.engine.backend === "sandbox" ? "SIMULATED" : "LIVE GGUF") : c.model === "sandbox" ? "SIMULATED" : "LIVE GGUF"}</span>
                {faster === l && <span className="mono text-[9px] text-[#fbbf24]">FASTER</span>}
                <button
                  type="button"
                  disabled={!bothDone || !!crown}
                  onClick={() => crownIt(l)}
                  className="ml-auto flex h-10 items-center gap-1.5 rounded-full bg-[#fbbf24] px-3 text-[11px] font-bold text-black transition-transform active:scale-90 disabled:bg-white/10 disabled:text-ink-3"
                  aria-label={`Crown lane ${l} winner`}
                >
                  <Icon name="crown" size={13} /> {won ? "Crowned" : "Crown"}
                </button>
              </div>
              <AnimatePresence>
                {won && (
                  <div className="pointer-events-none absolute inset-0" aria-hidden>
                    {Array.from({ length: 14 }, (_, i) => (
                      <motion.span key={i} className="absolute left-1/2 top-[60%] h-2 w-2 rounded-sm" style={{ background: ["#fbbf24", "#a78bfa", "#60a5fa", "#34d399"][i % 4] }} initial={{ x: 0, y: 0, opacity: 1, scale: 1 }} animate={{ x: Math.cos((i / 14) * 6.283) * (60 + (i % 3) * 22), y: Math.sin((i / 14) * 6.283) * (60 + (i % 3) * 22) - 40, opacity: 0, rotate: i * 70, scale: 0.4 }} transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }} />
                    ))}
                  </div>
                )}
              </AnimatePresence>
            </motion.section>
          );
        })}
      </div>
      {crown && <p className="mono text-center text-[10.5px] text-ink-3">Lane {crown} crowned — its reply was added to the conversation as a new branch.</p>}
    </div>
  );
}
