"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { resolveFlagships } from "@/data/frontier";
import { apexById, apexChat } from "@/lib/apex-cloud";
import { CATALOG } from "@/lib/models";
import { splitReasoning } from "@/lib/stream";
import { shortModelName, useEngine, wllamaChat, type GenStats } from "@/lib/engine";
import { useBackLayer } from "@/lib/backstack";
import { syncMesh, useMesh } from "@/services/apexCloudMesh";
import { CIcon } from "./icons";

interface Side {
  state: "idle" | "waiting" | "streaming" | "done" | "error";
  text: string;
  thought: string;
  ttft?: number;
  tps?: number;
  tokens?: number;
  total?: number;
  served?: string;
  error?: string;
}
const IDLE: Side = { state: "idle", text: "", thought: "" };
const dim = "text-[rgb(var(--ink-rgb)/var(--ink-3-a))]";
const fmtMs = (n?: number) => (n === undefined ? "-" : n >= 1000 ? `${(n / 1000).toFixed(1)} s` : `${n} ms`);

/** Side-by-side compare: one prompt, two models, streaming at the same time, with live latency and tokens/s per card. */
export function CompareView({ open, onClose, defaults }: { open: boolean; onClose: () => void; defaults?: [string, string] }) {
  const mesh = useMesh();
  const eng = useEngine();
  useBackLayer(open, onClose);
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [prompt, setPrompt] = useState("");
  const [sides, setSides] = useState<[Side, Side]>([IDLE, IDLE]);
  const [tab, setTab] = useState<0 | 1>(0);
  const ctl = useRef<AbortController[]>([]);
  const busy = sides.some((s) => s.state === "waiting" || s.state === "streaming");

  useEffect(() => {
    if (open && !mesh.synced && !mesh.syncing) void syncMesh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const models = useMemo(() => mesh.models.filter((m) => !m.nativeOnly && !m.disabled), [mesh.models]);
  const flags = useMemo(() => resolveFlagships(models).filter((f) => f.best), [models]);
  const loadedLocal = CATALOG.find((m) => m.id === eng.loaded.a);
  const verified = useMemo(() => models.filter((m) => m.verified && !flags.some((f) => f.best?.id === m.id)).sort((x, y) => (x.ms ?? 1e9) - (y.ms ?? 1e9)).slice(0, 80), [models, flags]);

  useEffect(() => {
    if (!open || a || !flags.length) return;
    const pick = (re: RegExp) => flags.find((f) => re.test(f.entry.key))?.best?.id;
    setA(defaults?.[0] ?? pick(/opus|sonnet/) ?? flags[0].best!.id);
    setB(defaults?.[1] ?? pick(/deepseek-r1/) ?? flags[Math.min(1, flags.length - 1)].best!.id);
  }, [open, a, flags, defaults]);

  const labelOf = (id: string) => (id === "local:a" ? (loadedLocal ? `${shortModelName(loadedLocal)} (on device)` : "On-device model") : flags.find((f) => f.best?.id === id)?.entry.label ?? models.find((m) => m.id === id)?.label ?? id);

  const run = async () => {
    const text = prompt.trim();
    if (!text || busy) return;
    ctl.current.forEach((c) => c.abort());
    ctl.current = [new AbortController(), new AbortController()];
    setSides([{ ...IDLE, state: "waiting" }, { ...IDLE, state: "waiting" }]);
    const patch = (i: 0 | 1, p: Partial<Side>) => setSides((s) => (i === 0 ? [{ ...s[0], ...p }, s[1]] : [s[0], { ...s[1], ...p }]));
    const t0 = performance.now();
    const go = async (i: 0 | 1, id: string) => {
      const signal = ctl.current[i].signal;
      let first = 0;
      const onText = (raw: string) => {
        const { thought, answer } = splitReasoning(raw);
        if (!first) first = performance.now();
        patch(i, { state: "streaming", text: answer, thought, ttft: Math.round(first - t0) });
      };
      try {
        let st: GenStats & { servedBy?: string };
        const msgs = [{ role: "user" as const, content: text }];
        if (id === "local:a") {
          if (!loadedLocal) throw new Error("No on-device model is loaded. Load one from the Model Hub first.");
          st = await wllamaChat("a", msgs, { maxTokens: 600, signal }, onText);
        } else {
          const m = apexById(id);
          if (!m) throw new Error("Model is not available.");
          st = await apexChat(m, msgs, { maxTokens: 700, signal, strict: true }, onText);
        }
        patch(i, { state: "done", ttft: st.ttftMs, tps: st.tps, tokens: st.tokens, total: st.totalMs, served: st.servedBy });
      } catch (e) {
        if (signal.aborted) patch(i, { state: "done" });
        else patch(i, { state: "error", error: e instanceof Error ? e.message : "Failed", total: Math.round(performance.now() - t0) });
      }
    };
    await Promise.all([go(0, a), go(1, b)]);
  };
  const stop = () => ctl.current.forEach((c) => c.abort());

  const Select = ({ v, set, label }: { v: string; set: (s: string) => void; label: string }) => (
    <select aria-label={label} value={v} onChange={(e) => set(e.target.value)} className="calm-field !h-10 min-w-0 flex-1 truncate !py-0 text-[13px]">
      {loadedLocal && (
        <optgroup label="On-device">
          <option value="local:a">{shortModelName(loadedLocal)} (loaded)</option>
        </optgroup>
      )}
      <optgroup label="Frontier Flagships">
        {flags.map((f) => (
          <option key={f.entry.key} value={f.best!.id}>{f.entry.label}</option>
        ))}
      </optgroup>
      <optgroup label="Live-verified models">
        {verified.map((m) => (
          <option key={m.id} value={m.id}>{m.label}</option>
        ))}
      </optgroup>
    </select>
  );

  const Card = ({ i, id }: { i: 0 | 1; id: string }) => {
    const s = sides[i];
    const tone = s.state === "error" ? "#ef4444" : s.state === "done" ? "#22c55e" : s.state === "idle" ? "rgb(156 163 175)" : "#f59e0b";
    return (
      <article data-testid={`compare-card-${i}`} className="flex min-h-0 min-w-0 flex-col rounded-3xl bg-[var(--surface-1)] p-4 ring-1 ring-[rgb(var(--ink-rgb)/0.08)]">
        <header className="flex items-center justify-between gap-2">
          <h3 className="min-w-0 truncate text-[14px] font-medium">{labelOf(id)}</h3>
          <span className="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-semibold" style={{ color: tone, background: `${tone}22` }}>
            <span className={`h-1.5 w-1.5 rounded-full ${s.state === "streaming" || s.state === "waiting" ? "animate-pulse" : ""}`} style={{ background: tone }} />
            {s.state === "idle" ? "READY" : s.state === "waiting" ? "WAITING" : s.state === "streaming" ? "STREAMING" : s.state === "error" ? "ERROR" : "DONE"}
          </span>
        </header>
        <dl className="mt-3 grid grid-cols-3 gap-2 text-center" data-testid={`compare-stats-${i}`}>
          {[
            ["First token", fmtMs(s.ttft)],
            ["Tokens/s", s.tps ? s.tps.toFixed(1) : "-"],
            ["Total", fmtMs(s.total)],
          ].map(([k, v]) => (
            <div key={k} className="min-w-0 rounded-2xl bg-[var(--surface-2)] px-1.5 py-2">
              <dt className={`truncate text-[10.5px] ${dim}`}>{k}</dt>
              <dd className="tnum truncate text-[13.5px] font-medium">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="scroll-quiet mt-3 min-h-[120px] flex-1 overflow-y-auto whitespace-pre-wrap break-words text-[14px] leading-relaxed md:max-h-none">
          {s.thought && <p className={`mb-2 text-[12px] italic ${dim}`}>Reasoning: {s.thought.length} characters</p>}
          {s.error ? <span className="text-[#ef4444]">{s.error}</span> : s.text || <span className={dim}>{s.state === "idle" ? "The answer appears here." : "Waiting for the first token"}</span>}
        </div>
        {s.served && <p className={`mt-2 truncate text-[11.5px] ${dim}`}>Answered by {s.served}</p>}
      </article>
    );
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div role="dialog" aria-modal="true" aria-label="Compare 2 models" data-testid="compare-view" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60] flex flex-col bg-zinc-950/90 backdrop-blur-xl">
          <div className="calm mx-auto flex min-h-0 w-full max-w-[1100px] flex-1 flex-col gap-3 px-3 pb-safe pt-safe">
            <header className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <h2 className="truncate text-[17px] font-medium tracking-[-0.01em]">Compare 2 Models</h2>
                <p className={`truncate text-[12px] ${dim}`}>Same prompt, two models, live latency and tokens per second</p>
              </div>
              <button type="button" className="ibtn !h-11 !w-11 shrink-0" onClick={onClose} aria-label="Close compare"><CIcon name="x" size={20} /></button>
            </header>
            <div className="flex gap-2">
              <Select v={a} set={setA} label="Model A" />
              <Select v={b} set={setB} label="Model B" />
            </div>
            <div className="seg w-full md:hidden" role="tablist" aria-label="Model card" style={{ gridAutoColumns: "1fr" }}>
              {([0, 1] as const).map((i) => (
                <button key={i} type="button" role="tab" aria-selected={tab === i} aria-pressed={tab === i} onClick={() => setTab(i)}>
                  <span className="block max-w-[150px] truncate">{labelOf(i === 0 ? a : b)}</span>
                </button>
              ))}
            </div>
            <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto md:grid-cols-2">
              <div className={`${tab === 0 ? "flex" : "hidden"} min-h-0 flex-col md:flex`}><Card i={0} id={a} /></div>
              <div className={`${tab === 1 ? "flex" : "hidden"} min-h-0 flex-col md:flex`}><Card i={1} id={b} /></div>
            </div>
            <form className="flex items-end gap-2 rounded-3xl bg-[var(--surface-1)] p-2 ring-1 ring-[rgb(var(--ink-rgb)/0.08)]" onSubmit={(e) => { e.preventDefault(); void run(); }}>
              <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={2} placeholder="Ask both models the same thing" aria-label="Prompt for both models" data-testid="compare-prompt" className="max-h-32 min-w-0 flex-1 resize-none bg-transparent px-3 py-2 text-[15px] outline-none" onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void run(); } }} />
              {busy ? (
                <button type="button" className="calm-btn shrink-0" onClick={stop} aria-label="Stop both"><CIcon name="stop" size={16} /> Stop</button>
              ) : (
                <button type="submit" className="calm-btn shrink-0" data-primary="true" disabled={!prompt.trim() || !a || !b} data-testid="compare-run"><CIcon name="up" size={16} /> Run both</button>
              )}
            </form>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
