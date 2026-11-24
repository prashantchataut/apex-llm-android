"use client";

import { useEffect, useRef } from "react";

/**
 * 60 fps reactive spectrum. In the web demo the signal is synthetic; in the app the bins come
 * from `cortex-voice::spectrum_bins` over the live mic buffer (same 32 log-spaced bands).
 */
export function Waveform({ active, bins = 32, height = 44 }: { active: boolean; bins?: number; height?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const activeRef = useRef(active);
  activeRef.current = active;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      canvas.width = Math.round(r.width * dpr);
      canvas.height = Math.round(r.height * dpr);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const level = new Float32Array(bins).fill(0.04);
    let raf = 0;
    const loop = (t: number) => {
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      const gap = 3 * dpr;
      const bw = (w - gap * (bins - 1)) / bins;
      const speech = 0.55 + 0.45 * Math.sin(t / 380) * Math.sin(t / 910);
      for (let i = 0; i < bins; i++) {
        const f = i / (bins - 1);
        const formant = Math.exp(-Math.pow((f - 0.28) / 0.22, 2)) + 0.55 * Math.exp(-Math.pow((f - 0.62) / 0.15, 2));
        const noise = 0.5 + 0.5 * Math.sin(t / (90 + i * 7) + i * 1.7);
        const target = activeRef.current ? Math.max(0.05, Math.min(1, (0.15 + 0.85 * formant * noise) * speech)) : 0.04;
        level[i] += (target - level[i]) * (target > level[i] ? 0.35 : 0.12); // fast attack, slow release
        const bh = Math.max(3 * dpr, level[i] * h);
        const x = i * (bw + gap);
        const g = ctx.createLinearGradient(0, h / 2 - bh / 2, 0, h / 2 + bh / 2);
        g.addColorStop(0, "rgba(255,255,255,0.95)");
        g.addColorStop(1, "rgba(167,139,250,0.75)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.roundRect(x, h / 2 - bh / 2, bw, bh, bw / 2);
        ctx.fill();
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [bins]);

  return <canvas ref={ref} className="block w-full" style={{ height }} aria-hidden="true" />;
}
