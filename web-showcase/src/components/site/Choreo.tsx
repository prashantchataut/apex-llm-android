"use client";

import { animate, motion, useInView, useMotionValue, useReducedMotion, useSpring } from "framer-motion";
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";

/**
 * Perspective tilt with a specular highlight that follows the cursor / finger.
 * Exposes `--mouse-x` / `--mouse-y` (percent) on the element so any child can hang a radial spotlight off them.
 */
export function Tilt({ children, max = 9, className = "", style, glare = true }: { children: ReactNode; max?: number; className?: string; style?: CSSProperties; glare?: boolean }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const rx = useSpring(useMotionValue(0), { stiffness: 220, damping: 20 });
  const ry = useSpring(useMotionValue(0), { stiffness: 220, damping: 20 });
  const [active, setActive] = useState(false);

  const move = (e: PointerEvent<HTMLDivElement>) => {
    if (reduce) return;
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    ry.set((px - 0.5) * 2 * max);
    rx.set((0.5 - py) * 2 * max);
    el.style.setProperty("--mouse-x", `${(px * 100).toFixed(1)}%`);
    el.style.setProperty("--mouse-y", `${(py * 100).toFixed(1)}%`);
  };
  const leave = () => {
    rx.set(0);
    ry.set(0);
    setActive(false);
  };

  return (
    <div className="[perspective:1100px]" style={{ touchAction: "pan-y" }}>
      <motion.div ref={ref} onPointerMove={move} onPointerEnter={() => setActive(true)} onPointerLeave={leave} onPointerCancel={leave} style={{ rotateX: rx, rotateY: ry, transformStyle: "preserve-3d", ...style }} className={`relative ${className}`}>
        {children}
        {glare && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 z-[5] rounded-[inherit] mix-blend-soft-light transition-opacity duration-300"
            style={{ opacity: active ? 1 : 0, background: "radial-gradient(420px circle at var(--mouse-x, 50%) var(--mouse-y, 30%), rgba(255,255,255,0.38), transparent 60%)" }}
          />
        )}
      </motion.div>
    </div>
  );
}

/** Spring-driven staggered reveal when scrolled into view. */
export function Reveal({ children, delay = 0, y = 24, className = "" }: { children: ReactNode; delay?: number; y?: number; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div className={className} initial={reduce ? false : { opacity: 0, y, filter: "blur(6px)" }} whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }} viewport={{ once: true, margin: "0px 0px -12% 0px" }} transition={{ type: "spring", stiffness: 170, damping: 24, delay }}>
      {children}
    </motion.div>
  );
}

/** Counts from 0 to `to` when scrolled into view. */
export function CountUp({ to, decimals = 0, suffix = "", duration = 1.6 }: { to: number; decimals?: number; suffix?: string; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const reduce = useReducedMotion();
  const [v, setV] = useState(reduce ? to : 0);
  useEffect(() => {
    if (!inView || reduce) return;
    const c = animate(0, to, { duration, ease: [0.22, 1, 0.36, 1], onUpdate: setV });
    return () => c.stop();
  }, [inView, to, duration, reduce]);
  return (
    <span ref={ref} className="tnum">
      {v.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
      {suffix}
    </span>
  );
}

/** Adds `.in` once the element is on screen: drives the hairline-draw and crosshair-spin CSS in globals.css. */
export function useChoreo<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const inView = useInView(ref, { once: true, amount: 0.05 });
  return { ref, className: `choreo${inView ? " in" : ""}` };
}
