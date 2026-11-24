"use client";

import { useEffect, useRef, useState } from "react";
import { onHaptic, type HapticEvent, type HapticName } from "@/lib/haptics";

const LABEL: Record<HapticName, string> = {
  tokenTick: "token tick",
  reasoningPulse: "reasoning pulse",
  reasoningDone: "reasoning snap",
  detentClick: "detent click",
  siliconScanSweep: "scan sweep",
  heavyLock: "heavy lock",
};

/**
 * Haptic Waveform Pulse: draws every haptic the engine fires as the vibration waveform it commands
 * (bar width = on-time, gap = off-time), so desktop visitors can *see* the tactile design.
 */
export function HapticPulse({ className = "" }: { className?: string }) {
  const [ev, setEv] = useState<(HapticEvent & { key: number }) | null>(null);
  const [count, setCount] = useState(0);
  const key = useRef(0);
  useEffect(
    () =>
      onHaptic((e) => {
        key.current += 1;
        setEv({ ...e, key: key.current });
        setCount((c) => c + 1);
      }),
    [],
  );
  const total = ev ? ev.pattern.reduce((a, b) => a + b, 0) : 1;
  let x = 0;
  return (
    <div className={`glass-dark inline-flex items-center gap-3 rounded-full px-3.5 py-2 ${className}`} role="status" aria-live="off" aria-label="Haptic waveform">
      <svg key={ev?.key ?? 0} width="72" height="22" viewBox="0 0 72 22" aria-hidden="true" className="shrink-0">
        <line x1="0" x2="72" y1="11" y2="11" stroke="currentColor" strokeOpacity="0.18" />
        {ev?.pattern.map((ms, i) => {
          const w = Math.max(2, (ms / total) * 72);
          const el = i % 2 === 0 ? <rect key={i} x={x} y={2} width={w} height={18} rx={1.5} className="haptic-bar" style={{ animationDelay: `${(x / 72) * 140}ms`, fill: ev.delivered ? "var(--accent, #8b7bff)" : "currentColor" }} /> : null;
          x += w;
          return el;
        })}
      </svg>
      <span className="mono min-w-[104px] text-[10.5px] uppercase tracking-[0.12em] text-ink-3">{ev ? LABEL[ev.name] : "haptics idle"}</span>
      <span className="mono tnum text-[10.5px] text-ink-3">{String(count).padStart(3, "0")}</span>
    </div>
  );
}
