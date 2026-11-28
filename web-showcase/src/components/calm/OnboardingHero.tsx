"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { routeAuto } from "@/lib/router";

const SAMPLES = [
  { prompt: "Draft a five-slide outline for a team presentation", offline: false },
  { prompt: "Why is the sky blue at noon?", offline: false },
  { prompt: "Prove that the square root of 2 is irrational", offline: false },
  { prompt: "No signal on the train, summarize my notes", offline: true },
] as const;

const ease = [0.22, 1, 0.36, 1] as const;

const CAPS = [
  { t: "True Offline Local LLMs", d: "Qwen 3, Gemma 3, Llama 3.2, DeepSeek R1 and uncensored Dolphin running privately on-device.", icon: "M7 3h10v4H7zM4 9h16v8H4zM8 21v-4M16 21v-4M9 13h.01M15 13h.01" },
  { t: "Document, PDF & LaTeX Intelligence", d: "Built-in PDF reader, local RAG vault, and native KaTeX math rendering.", icon: "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h4" },
  { t: "Multi-Modal Creation & Apex Auto", d: "Image Generation Studio, Live Voice Mode, and under 1ms smart routing.", icon: "M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM19 16l.9 2.1L22 19l-2.1.9L19 22l-.9-2.1L16 19l2.1-.9z" },
] as const;

/** Isometric prism: three faces lit from the top-left, a slow light sweep, and a soft contact glow. */
function Prism({ reduce }: { reduce: boolean }) {
  return (
    <motion.div className="relative mx-auto h-[150px] w-[150px]" animate={reduce ? undefined : { y: [0, -6, 0] }} transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }} aria-hidden="true">
      <span className="absolute inset-x-[8%] bottom-[-6px] h-6 rounded-full bg-[rgb(var(--ink-rgb)/0.16)] blur-xl" />
      <span className="absolute -inset-6 rounded-full opacity-70 blur-3xl" style={{ background: "radial-gradient(closest-side, rgb(140 120 255 / .38), transparent)" }} />
      <svg viewBox="0 0 150 150" className="relative h-full w-full overflow-visible">
        <defs>
          <linearGradient id="pz-top" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#f6f3ff" /><stop offset="1" stopColor="#c9c0ff" /></linearGradient>
          <linearGradient id="pz-left" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#8e82ff" /><stop offset="1" stopColor="#4a3fd0" /></linearGradient>
          <linearGradient id="pz-right" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#5b4de6" /><stop offset="1" stopColor="#241a8c" /></linearGradient>
          <linearGradient id="pz-sweep" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#fff" stopOpacity="0" /><stop offset=".5" stopColor="#fff" stopOpacity=".55" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></linearGradient>
          <clipPath id="pz-clip"><path d="M75 12 L134 44 L134 106 L75 138 L16 106 L16 44 Z" /></clipPath>
        </defs>
        <path d="M75 12 L134 44 L75 76 L16 44 Z" fill="url(#pz-top)" />
        <path d="M16 44 L75 76 L75 138 L16 106 Z" fill="url(#pz-left)" />
        <path d="M134 44 L75 76 L75 138 L134 106 Z" fill="url(#pz-right)" />
        <path d="M75 12 L134 44 L134 106 L75 138 L16 106 L16 44 Z" fill="none" stroke="rgb(255 255 255 / .55)" strokeWidth="1" />
        <path d="M75 76 L75 138 M16 44 L75 76 L134 44" fill="none" stroke="rgb(255 255 255 / .35)" strokeWidth="1" />
        <g clipPath="url(#pz-clip)">
          {!reduce && <motion.rect y="0" width="40" height="150" fill="url(#pz-sweep)" style={{ skewX: -20 }} initial={{ x: -60 }} animate={{ x: 190 }} transition={{ duration: 3.2, repeat: Infinity, repeatDelay: 2.4, ease: "easeInOut" }} />}
        </g>
        {/* routing nodes on the faces */}
        <circle cx="75" cy="44" r="3.2" fill="#fff" />
        <circle cx="45" cy="92" r="2.6" fill="#fff" opacity=".85" />
        <circle cx="105" cy="92" r="2.6" fill="#fff" opacity=".85" />
      </svg>
    </motion.div>
  );
}

/** A live card that runs the REAL Apex Auto router on sample prompts and shows where each one would go. */
function RoutingCard({ reduce }: { reduce: boolean }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (reduce) return;
    const t = window.setInterval(() => setI((n) => (n + 1) % SAMPLES.length), 3200);
    return () => window.clearInterval(t);
  }, [reduce]);
  const rows = useMemo(
    () =>
      SAMPLES.map((s) => {
        const d = routeAuto(s.prompt, { offline: s.offline, localOnly: false, localId: "smollm2-135m", localLabel: "SmolLM2 · on device" });
        return { ...s, d };
      }),
    [],
  );
  const cur = rows[i];
  return (
    <div className="calm-card w-full max-w-[380px] p-3.5 text-left" data-testid="routing-card" role="img" aria-label={`Apex Auto routes "${cur.prompt}" to ${cur.d.label}`}>
      <div className="flex items-center gap-2 text-[11.5px] uppercase tracking-[0.07em] text-[rgb(var(--ink-rgb)/var(--ink-3-a))]">
        <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#34d399] opacity-60" /><span className="relative inline-flex h-2 w-2 rounded-full bg-[#34d399]" /></span>
        Apex Auto · live routing
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={i} initial={{ opacity: 0, y: 8, filter: "blur(6px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} exit={{ opacity: 0, y: -6, filter: "blur(6px)" }} transition={{ duration: 0.45, ease }} className="mt-3">
          <p className="rounded-[14px] bg-[var(--surface-2)] px-3 py-2.5 text-[13.5px] leading-snug">“{cur.prompt}”</p>
          <div className="relative ml-5 h-6" aria-hidden="true">
            <svg width="2" height="24" className="absolute left-0 top-0"><motion.line x1="1" y1="0" x2="1" y2="24" stroke="rgb(140 120 255)" strokeWidth="2" strokeLinecap="round" strokeDasharray="4 4" animate={reduce ? undefined : { strokeDashoffset: [0, -16] }} transition={{ duration: 0.9, repeat: Infinity, ease: "linear" }} /></svg>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-[14px] px-3 py-2.5" style={{ background: "var(--halo-a)", color: "var(--halo-ink)" }}>
            <span className="min-w-0">
              <span className="block truncate text-[14px] font-medium">{cur.d.kind === "local" ? "On-device" : cur.d.label}</span>
              <span className="block truncate text-[12px] opacity-75">{cur.d.reason}</span>
            </span>
            <span className="tnum shrink-0 rounded-full bg-black/10 px-2.5 py-1 text-[11.5px] font-medium">{cur.d.ms < 1 ? `${cur.d.ms.toFixed(2)} ms` : `${cur.d.ms.toFixed(1)} ms`}</span>
          </div>
        </motion.div>
      </AnimatePresence>
      <div className="mt-3 flex justify-center gap-1.5" aria-hidden="true">
        {rows.map((_, k) => <span key={k} className="h-1 rounded-full bg-[rgb(var(--ink-rgb))] transition-all" style={{ width: k === i ? 18 : 6, opacity: k === i ? 0.8 : 0.2 }} />)}
      </div>
    </div>
  );
}

export function OnboardingHero({ dim }: { dim: string }) {
  const reduce = !!useReducedMotion();
  const words = "Run Open-Weight AI Directly on Your Phone.".split(" ");
  return (
    <div className="flex w-full flex-col items-center text-center">
      <motion.div initial={{ opacity: 0, scale: 0.85, filter: "blur(14px)" }} animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }} transition={{ duration: 1.1, ease }}>
        <Prism reduce={reduce} />
      </motion.div>
      <motion.span initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.6, ease }} className="mt-6 inline-flex h-7 items-center gap-2 rounded-full bg-[var(--surface-2)] px-3 text-[10.5px] font-medium uppercase tracking-[0.1em]" data-testid="onboarding-eyebrow">
        <span className="h-1.5 w-1.5 rounded-full bg-[#34d399]" aria-hidden="true" />
        On-Device Local AI Runner
      </motion.span>
      <h1 className="mt-3 max-w-[17ch] text-[27px] font-normal leading-[1.1] tracking-[-0.03em]">
        {words.map((w, k) => (
          <motion.span key={k} className="mr-[0.26em] inline-block" initial={{ opacity: 0, y: 10, filter: "blur(8px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} transition={{ duration: 0.8, delay: 0.3 + k * 0.07, ease }}>
            {w}
          </motion.span>
        ))}
      </h1>
      <motion.p initial={{ opacity: 0, filter: "blur(6px)" }} animate={{ opacity: 1, filter: "blur(0px)" }} transition={{ delay: 0.95, duration: 0.8 }} className={`mt-3 max-w-[38ch] text-[13.5px] leading-relaxed ${dim}`}>
        Download and execute GGUF &amp; ONNX models 100% offline on your phone&apos;s silicon, analyze PDFs &amp; documents privately, render LaTeX math, generate studio imagery, and route across fast cloud models in under 1ms.
      </motion.p>
      <motion.div className="mt-6 flex w-full justify-center" initial={{ opacity: 0, y: 18, filter: "blur(8px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} transition={{ type: "spring", stiffness: 140, damping: 20, delay: 1.15 }}>
        <RoutingCard reduce={reduce} />
      </motion.div>
      <motion.ul className="mt-4 grid w-full max-w-[380px] gap-2 text-left" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.4, duration: 0.7, ease }} data-testid="capability-cards">
        {CAPS.map((c) => (
          <li key={c.t} className="calm-card flex items-start gap-3 p-3">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-[var(--surface-2)]" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={c.icon} /></svg>
            </span>
            <span className="min-w-0">
              <span className="block text-[13.5px] font-medium leading-tight">{c.t}</span>
              <span className={`mt-0.5 block text-[12px] leading-snug ${dim}`}>{c.d}</span>
            </span>
          </li>
        ))}
      </motion.ul>
    </div>
  );
}
