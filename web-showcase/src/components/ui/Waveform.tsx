"use client";

import { useEffect, useRef } from "react";
import { bandLevels } from "@/lib/voice";

/**
 * 60 fps frequency spectrum.
 * With an `analyser` the bars are the REAL microphone spectrum (`getByteFrequencyData`, log-spaced bands);
 * `onBeat` fires on every rising energy edge so the caller can pulse the haptics.
 * Without one (landing-page demo only) the signal is synthetic.
 */
export function Waveform({ active, bins = 32, height = 44, analyser, onBeat }: { active: boolean; bins?: number; height?: number; analyser?: AnalyserNode | null; onBeat?: (energy: number) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const activeRef = useRef(active);
  activeRef.current = active;
  const beatRef = useRef(onBeat);
  beatRef.current = onBeat;

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
    const raw = new Float32Array(bins);
    const buf = analyser ? new Uint8Array(analyser.frequencyBinCount) : null;
    let prevEnergy = 0;
    let lastBeat = 0;
    let raf = 0;
    const loop = (t: number) => {
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      const gap = 3 * dpr;
      const bw = (w - gap * (bins - 1)) / bins;
      if (analyser && buf) {
        bandLevels(analyser, buf, bins, raw);
      } else {
        const speech = 0.55 + 0.45 * Math.sin(t / 380) * Math.sin(t / 910);
        for (let i = 0; i < bins; i++) {
          const f = i / (bins - 1);
          const formant = Math.exp(-Math.pow((f - 0.28) / 0.22, 2)) + 0.55 * Math.exp(-Math.pow((f - 0.62) / 0.15, 2));
          raw[i] = activeRef.current ? Math.max(0.04, formant * speech * (0.65 + 0.35 * Math.sin(t / 90 + i * 1.7))) : 0.04;
        }
      }
      let energy = 0;
      for (let i = 0; i < bins; i++) {
        // fast attack, slower release — reads as a physical meter
        const target = Math.max(0.04, raw[i]);
        level[i] += (target - level[i]) * (target > level[i] ? 0.55 : 0.16);
        energy += level[i];
        const bh = Math.max(3 * dpr, level[i] * h * 0.96);
        const x = i * (bw + gap);
        const g = ctx.createLinearGradient(0, h / 2 - bh / 2, 0, h / 2 + bh / 2);
        g.addColorStop(0, "rgba(255,255,255,0.95)");
        g.addColorStop(1, "rgba(160,190,255,0.55)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.roundRect(x, h / 2 - bh / 2, bw, bh, bw / 2);
        ctx.fill();
      }
      energy /= bins;
      if (energy > 0.16 && energy > prevEnergy * 1.18 && t - lastBeat > 170) {
        lastBeat = t;
        beatRef.current?.(energy);
      }
      prevEnergy = energy;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [bins, analyser]);

  return <canvas ref={ref} className="block w-full" style={{ height }} aria-hidden />;
}
