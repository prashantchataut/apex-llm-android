"use client";

import { haptic, scanSweep } from "@/lib/haptics";
import { motion, useAnimationControls } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { ApexLogo } from "@/components/brand/ApexLogo";
import { GIB, recommend, type DeviceProfile } from "@/lib/compat";

const SPRING = { type: "spring", stiffness: 320, damping: 26 } as const;
/** Tilt of each telemetry card once its subsystem is detected. */
const ANGLES = [-12, -5, 6, 14] as const;

/** `at` = where the beam is (0..1 of the schematic width) when the subsystem is detected. */
const ZONES = [
  { id: "ram", at: 0.2 },
  { id: "cpu", at: 0.5 },
  { id: "gpu", at: 0.82 },
  { id: "disk", at: 0.97 },
] as const;

export function quantBadge(dev: DeviceProfile): string {
  const r = recommend(dev);
  return `OPTIMAL TIER: GGUF ${r.quant} · UP TO ${(r.maxGgufBytes / GIB).toFixed(1)} GB`;
}

/**
 * Onboarding hallmark: a luminous beam sweeps a frosted hardware schematic. As it crosses each
 * subsystem a white telemetry card springs out from behind the glass pill (0° → tilt, 80 ms stagger).
 */
export function SiliconScan({
  dev,
  source = "preset",
  runKey = 0,
  duration = 2.6,
  onDone,
}: {
  dev: DeviceProfile;
  source?: "native" | "browser" | "preset";
  runKey?: number;
  duration?: number;
  onDone?: () => void;
}) {
  const [found, setFound] = useState(0);
  const [done, setDone] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const beam = useAnimationControls();
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const rec = recommend(dev);

  useEffect(() => {
    setFound(0);
    setDone(false);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const d = reduce ? 0.4 : duration;
    const w = panel.current?.clientWidth ?? 320;
    const timers: number[] = [];
    beam.set({ x: 0, opacity: 1 });
    void beam.start({ x: w - 3, transition: { duration: d, ease: "linear" } }).then(() => beam.start({ opacity: 0, transition: { duration: 0.35 } }));
    // Geiger-like ticks that speed up along the beam, and a detent as each telemetry card lands
    const stopSweep = scanSweep(Math.max(6, Math.round(d * 5)), 220, 55);
    ZONES.forEach((z, i) =>
      timers.push(
        window.setTimeout(() => {
          setFound(i + 1);
          haptic("detentClick");
        }, d * 1000 * z.at),
      ),
    );
    timers.push(
      window.setTimeout(() => {
        setDone(true);
        doneRef.current?.();
      }, d * 1000 + 250),
    );
    return () => {
      stopSweep();
      timers.forEach((t) => window.clearTimeout(t));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runKey, dev.label, duration]);

  const cards = [
    { label: "Memory", value: dev.totalGB.toFixed(1), unit: "GB", sub: `${dev.availGB.toFixed(1)} GB free` },
    { label: "NEON", value: String(dev.cores), unit: "cores", sub: dev.dotprod ? "DotProd" : "NEON only" },
    { label: "GPU", value: dev.vulkan ? "Vulkan" : "CPU", sub: dev.vulkan ? "Compute" : "CPU fallback" },
    { label: "Storage", value: dev.freeStorageGB.toFixed(0), unit: "GB", sub: "for models" },
  ];
  const lit = (i: number) => found > i;
  const sourceLabel = source === "native" ? "Measured on this device" : source === "browser" ? "Estimated from browser" : "Typical phone";

  return (
    <div>
      {/* ── frosted hardware schematic + scan beam ── */}
      <div ref={panel} className="glass-dark relative h-[132px] overflow-hidden rounded-[26px]" aria-hidden="true">
        <svg viewBox="0 0 320 150" className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
          {/* pins */}
          {Array.from({ length: 14 }, (_, i) => (
            <g key={i} stroke="rgb(var(--ink-rgb) / .22)" strokeWidth="1">
              <path d={`M${22 + i * 20} 4v8M${22 + i * 20} 138v8`} />
            </g>
          ))}
          <rect x="10" y="12" width="300" height="126" rx="14" fill="none" stroke="rgb(var(--ink-rgb) / .28)" />
          <rect className="zone" data-lit={lit(0)} x="24" y="26" width="62" height="98" rx="8" />
          {[0, 1, 2, 3].map((b) => (
            <rect key={b} x="32" y={36 + b * 22} width="46" height="12" rx="3" fill="none" stroke="rgb(var(--ink-rgb) / .3)" />
          ))}
          <rect className="zone" data-lit={lit(1)} x="100" y="26" width="100" height="60" rx="8" />
          {[0, 1, 2, 3].map((c) => (
            <g key={c}>
              <rect x={108 + c * 22} y="34" width="16" height="20" rx="3" fill="none" stroke="rgb(var(--ink-rgb) / .3)" />
              <rect x={108 + c * 22} y="58" width="16" height="20" rx="3" fill="none" stroke="rgb(var(--ink-rgb) / .3)" />
            </g>
          ))}
          <rect className="zone" data-lit={lit(2)} x="214" y="26" width="82" height="60" rx="8" />
          <path d="M226 74l18-34 18 34zM244 40v34" fill="none" stroke="rgb(var(--ink-rgb) / .35)" strokeLinejoin="round" />
          <rect className="zone" data-lit={lit(3)} x="100" y="98" width="196" height="26" rx="8" />
          {Array.from({ length: 12 }, (_, k) => (
            <path key={k} d={`M${116 + k * 15} 106v10`} stroke="rgb(var(--ink-rgb) / .3)" />
          ))}
        </svg>
        <motion.div animate={beam} initial={{ x: 0, opacity: 0 }} className="scan-beam-v absolute inset-y-0 left-0 w-[3px]" />
      </div>

      {/* ── telemetry cards fan out from behind the VisionOS pill ── */}
      <div className="relative pt-[84px]">
        {cards.map((c, i) => {
          const on = found > i;
          return (
            <motion.div
              key={c.label}
              className="mini-card absolute top-0 h-[104px] w-[26%] px-3 py-2.5"
              style={{ left: `${2 + i * 23}%`, transformOrigin: "50% 100%", zIndex: i }}
              initial={false}
              animate={on ? { rotate: ANGLES[i], y: 0, opacity: 1 } : { rotate: 0, y: 46, opacity: 0 }}
              transition={{ ...SPRING, delay: on ? 0.08 * i : 0 }}
            >
              <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[rgb(11_11_16/0.6)]">{c.label}</div>
              <div className="tnum mt-0.5 text-[19px] font-semibold leading-none tracking-tight">
                {c.value}
                {c.unit && <span className="ml-0.5 text-[11px] font-medium text-[rgb(11_11_16/0.6)]">{c.unit}</span>}
              </div>
              <div className="mt-1 text-[10px] leading-tight text-[rgb(11_11_16/0.6)]">{c.sub}</div>
            </motion.div>
          );
        })}
        <div className="glass relative z-10 !rounded-[28px] p-4">
          <div className="relative z-[1]">
            <div className="flex items-center gap-2">
              <ApexLogo size={18} state={done ? "idle" : "scanning"} />
              <span className="mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink-2">{done ? sourceLabel : `Scanning silicon · ${found}/4`}</span>
            </div>
            <div className={`mt-1 text-[22px] font-semibold tracking-tight ${done ? "" : "shimmer-text"}`}>{done ? dev.label : "Reading hardware"}</div>
            <div className="mono mt-3 flex min-h-[28px] flex-wrap gap-1.5 text-[10.5px]">
              <motion.span
                initial={false}
                animate={done ? { opacity: 1, y: 0, filter: "blur(0px)" } : { opacity: 0, y: 6, filter: "blur(6px)" }}
                transition={SPRING}
                className="rounded-full border border-accent/60 bg-accent/10 px-2.5 py-1.5 text-[9.5px] font-medium tracking-[0.02em] text-white sm:text-[10.5px] sm:tracking-[0.04em]"
              >
                {quantBadge(dev)}
              </motion.span>
            </div>
            <div className="mono mt-2 min-h-[16px] text-[10.5px] text-ink-3">{done ? `${rec.maxCtx} ctx · ${rec.threads} threads · ${rec.cpuVariant}` : ""}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
