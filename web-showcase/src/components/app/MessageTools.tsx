"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { download } from "@/lib/artifacts";
import { renderBento, type BentoInput } from "@/lib/bento";
import { haptic } from "@/lib/haptics";
import type { BranchInfo, ChatMsg } from "./useChat";

/** `‹ 2 / 2 ›` branch navigator. */
export function BranchPager({ info, onSwitch, align = "start" }: { info: BranchInfo; onSwitch: (id: number) => void; align?: "start" | "end" }) {
  const go = (d: number) => onSwitch(info.ids[(info.index + d + info.total) % info.total]);
  return (
    <div className={`mono tnum flex items-center gap-0.5 text-[11px] text-ink-3 ${align === "end" ? "justify-end" : ""}`} aria-label={`Branch ${info.index + 1} of ${info.total}`}>
      <button type="button" onClick={() => go(-1)} aria-label="Previous branch" className="grid h-9 w-9 place-items-center rounded-full active:scale-90">
        <span className="rotate-90">
          <Icon name="chevron" size={14} />
        </span>
      </button>
      <span className="min-w-[34px] text-center text-ink-2">
        {info.index + 1} / {info.total}
      </span>
      <button type="button" onClick={() => go(1)} aria-label="Next branch" className="grid h-9 w-9 place-items-center rounded-full active:scale-90">
        <span className="-rotate-90">
          <Icon name="chevron" size={14} />
        </span>
      </button>
    </div>
  );
}

const fmt = (n: number | undefined, d = 0) => (n === undefined || Number.isNaN(n) ? "—" : n.toFixed(d));

/** Footer under every assistant reply: engine honesty badge, telemetry (tap for the inspector), regenerate, share. */
export function MsgFooter({ m, onTelemetry, onRegenerate, onShare, disabled }: { m: ChatMsg; onTelemetry: () => void; onRegenerate: () => void; onShare: () => void; disabled: boolean }) {
  if (m.streaming || (!m.text && !m.notice)) return null;
  const real = m.engine && m.engine.backend !== "sandbox";
  const s = m.stats;
  const btn = "grid h-10 w-10 place-items-center rounded-full text-ink-3 transition-transform active:scale-90 disabled:opacity-30";
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {m.engine && (
        <span className={`mono flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[9.5px] font-medium tracking-[0.12em] ${real ? "border-ok/30 text-ok" : "border-warn/30 text-warn"}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${real ? "bg-ok" : "bg-warn"}`} />
          {real ? "LIVE WEIGHTS" : "SIMULATED"}
        </span>
      )}
      {s ? (
        <button type="button" onClick={() => { haptic("detentClick"); onTelemetry(); }} className="mono tnum h-9 rounded-full px-2 text-[11px] text-ink-3 underline decoration-white/20 underline-offset-4 active:scale-95" aria-label="Open telemetry inspector">
          {fmt(s.tps, 1)} tok/s{s.ttftMs !== undefined ? ` · TTFT ${s.ttftMs}ms` : ""} · {s.tokens} tokens
        </button>
      ) : m.engine?.backend === "sandbox" ? (
        <button type="button" onClick={() => { haptic("detentClick"); onTelemetry(); }} className="mono h-9 rounded-full px-2 text-[11px] text-ink-3 underline decoration-white/20 underline-offset-4 active:scale-95">
          scripted sample · no tokens measured
        </button>
      ) : null}
      <span className="ml-auto flex items-center">
        <button type="button" className={btn} onClick={onRegenerate} disabled={disabled} aria-label="Regenerate">
          <Icon name="refresh" size={16} />
        </button>
        <button type="button" className={btn} onClick={onShare} aria-label="Share Bento Card">
          <Icon name="share" size={16} />
        </button>
      </span>
    </div>
  );
}

/** VisionOS-style frosted telemetry popover. */
export function TelemetryPopover({ m, model, onClose }: { m: ChatMsg | null; model: string; onClose: () => void }) {
  const s = m?.stats;
  const real = m?.engine && m.engine.backend !== "sandbox";
  const rows: [string, string][] = m
    ? [
        ["Engine", m.engine ? `${m.engine.label}` : model],
        ["Prompt tokens", s?.promptTokens ? String(s.promptTokens) : "—"],
        ["Completion tokens", s ? String(s.tokens) : "—"],
        ["Time to first token", s?.ttftMs !== undefined ? `${s.ttftMs} ms` : "—"],
        ["Decode speed", s ? `${fmt(s.tps, 1)} tok/s` : "—"],
        ["Total wall time", s?.totalMs !== undefined ? `${(s.totalMs / 1000).toFixed(2)} s` : "—"],
        ["RAM (weights + KV, est.)", s?.ramMb ? `${s.ramMb} MB` : "—"],
        ["Sampling", s?.temperature !== undefined ? `T ${s.temperature.toFixed(2)} · top-p ${fmt(s.topP, 2)}` : "—"],
        ["Modelfile cartridge", m.engine?.cartridge ?? "—"],
      ]
    : [];
  return (
    <AnimatePresence>
      {m && (
        <>
          <motion.button type="button" aria-label="Close telemetry" className="absolute inset-0 z-40 bg-black/40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div role="dialog" aria-label="Message telemetry" className="glass absolute inset-x-5 bottom-28 z-50 rounded-[28px] p-4" initial={{ opacity: 0, y: 18, scale: 0.94 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12, scale: 0.96 }} transition={{ type: "spring", stiffness: 380, damping: 28 }}>
            <div className="relative z-[1]">
              <div className="flex items-center gap-2">
                <span className={`mono text-[10.5px] font-medium tracking-[0.14em] ${real ? "text-ok" : "text-warn"}`}>{real ? "MEASURED ON REAL WEIGHTS" : "SIMULATED — NO MODEL RAN"}</span>
                <button type="button" onClick={onClose} aria-label="Close" className="ml-auto grid h-9 w-9 place-items-center rounded-full active:scale-90">
                  <Icon name="x" size={15} />
                </button>
              </div>
              <dl className="mt-2 divide-y divide-white/10">
                {rows.map(([k, v]) => (
                  <div key={k} className="flex items-baseline justify-between gap-4 py-2">
                    <dt className="text-[12px] text-ink-3">{k}</dt>
                    <dd className="mono tnum truncate text-right text-[12.5px] font-medium text-white">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/** Share Bento Card preview: renders the PNG on open, then download / native share. */
export function BentoModal({ input, onClose }: { input: BentoInput | null; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  useEffect(() => {
    setUrl(null);
    setBlob(null);
    if (!input) return;
    let live = true;
    let made: string | null = null;
    void renderBento(input).then((b) => {
      if (!live) return;
      made = URL.createObjectURL(b);
      setBlob(b);
      setUrl(made);
      haptic("heavyLock");
    });
    return () => {
      live = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [input]);
  const share = async () => {
    if (!blob) return;
    const file = new File([blob], "apex-bento.png", { type: "image/png" });
    if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], text: "Made with Apex — private on-device AI" }).catch(() => undefined);
    else download("apex-bento.png", blob);
  };
  return (
    <AnimatePresence>
      {input && (
        <>
          <motion.button type="button" aria-label="Close preview" className="absolute inset-0 z-40 bg-black/70" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div role="dialog" aria-label="Bento card" className="absolute inset-x-4 bottom-4 top-12 z-50 flex flex-col items-center gap-3" initial={{ opacity: 0, y: 30, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 20 }} transition={{ type: "spring", stiffness: 340, damping: 30 }}>
            <div className="relative min-h-0 w-full flex-1 overflow-hidden rounded-[26px] border border-white/15 bg-black shadow-2xl">
              {url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={url} alt="Shareable Apex bento card" className="h-full w-full object-contain" />
              ) : (
                <div className="grid h-full place-items-center text-[13px] text-ink-3">Composing card…</div>
              )}
            </div>
            <div className="flex w-full gap-2">
              <button type="button" onClick={() => blob && download("apex-bento.png", blob)} disabled={!blob} className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-white text-[14px] font-medium text-black active:scale-95 disabled:opacity-40">
                <Icon name="download" size={16} /> Save PNG
              </button>
              <button type="button" onClick={() => void share()} disabled={!blob} className="glass-dark flex h-12 flex-1 items-center justify-center gap-2 rounded-full text-[14px] font-medium active:scale-95 disabled:opacity-40">
                <Icon name="share" size={16} /> Share
              </button>
              <button type="button" onClick={onClose} aria-label="Close" className="glass-dark grid h-12 w-12 place-items-center rounded-full active:scale-95">
                <Icon name="x" size={16} />
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
