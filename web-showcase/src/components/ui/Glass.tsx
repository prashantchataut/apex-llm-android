"use client";

import { motion } from "framer-motion";
import { useCallback, useState, type ComponentProps, type CSSProperties, type ReactNode, type PointerEvent } from "react";

export const SPRING = { type: "spring", stiffness: 380, damping: 26 } as const;

/** Tactile button with spring press + ripple. */
export function RippleButton({
  children,
  className = "",
  onPointerDown,
  ...rest
}: ComponentProps<"button"> & { children: ReactNode }) {
  const [ripples, setRipples] = useState<{ id: number; x: number; y: number; s: number }[]>([]);
  const down = useCallback(
    (e: PointerEvent<HTMLButtonElement>) => {
      const r = e.currentTarget.getBoundingClientRect();
      const id = Date.now() + Math.random();
      const s = Math.max(r.width, r.height) / 2;
      setRipples((p) => [...p, { id, x: e.clientX - r.left - s / 2, y: e.clientY - r.top - s / 2, s }]);
      window.setTimeout(() => setRipples((p) => p.filter((x) => x.id !== id)), 650);
      onPointerDown?.(e);
    },
    [onPointerDown],
  );
  return (
    <button {...rest} onPointerDown={down} className={`ripple-host transition-transform duration-150 active:scale-[0.97] ${className}`}>
      {children}
      {ripples.map((r) => (
        <span key={r.id} className="ripple" style={{ left: r.x, top: r.y, width: r.s, height: r.s }} />
      ))}
    </button>
  );
}

export function GlassPill({ children, className = "", style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <div className={`glass ${className}`} style={style}>
      <div className="relative z-[1]">{children}</div>
    </div>
  );
}

/** Floating tilted 3D glass chip (Archetype C). */
export function Chip3D({ children, tilt = "rotate(-6deg)", delay = 0, className = "" }: { children: ReactNode; tilt?: string; delay?: number; className?: string }) {
  const style = {
    "--tilt": tilt,
    transform: `perspective(700px) rotateX(10deg) rotateY(-12deg) ${tilt}`,
    animationDelay: `${delay}s`,
  } as CSSProperties;
  return (
    <span className={`glass float inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white ${className}`} style={style}>
      <span className="relative z-[1] inline-flex items-center gap-2">{children}</span>
    </span>
  );
}

export function ShimmerBadge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-xs font-medium">
      <span className="orb !h-2.5 !w-2.5" />
      <span className="shimmer-text">{children}</span>
    </span>
  );
}

/** Spring toggle switch. */
export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`relative h-11 w-16 shrink-0 rounded-full border transition-colors duration-300 ${on ? "border-ok/40 bg-ok/30" : "border-white/10 bg-white/10"}`}
    >
      <motion.span
        layout
        transition={SPRING}
        className="absolute top-[5px] h-8 w-8 rounded-full bg-white shadow-[0_2px_10px_rgba(0,0,0,0.4)]"
        style={{ left: on ? 27 : 3 }}
      />
    </button>
  );
}
