"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import { ApexMark } from "./ApexMark";
import { CIcon, type CIconName } from "./icons";

const EASE = [0.23, 1, 0.32, 1] as const;

/** The three things Apex does, shown as an interactive live preview. Tap a tab or let it cycle. */
const FEATURES: { id: string; icon: CIconName; tab: string; title: string; prompt: string; lines: string[]; foot: string }[] = [
  {
    id: "offline",
    icon: "cube",
    tab: "Run",
    title: "Run Qwen 3, Gemma 3 & Llama Locally 100% Offline",
    prompt: "Explain how tides work",
    lines: ["Tides come from the Moon's gravity pulling", "on the oceans, raising water on the near", "side and, by inertia, on the far side."],
    foot: "Qwen 3 · on device · airplane mode",
  },
  {
    id: "create",
    icon: "layers",
    tab: "Create",
    title: "Create Presentations, Analyze PDFs & Render Live Previews",
    prompt: "Make a 6 slide deck from my PDF",
    lines: ["Slide 1 of 6  Market overview", "Slide 2 of 6  Key findings", "Slide 3 of 6  Roadmap and next steps"],
    foot: "Live Preview · Phone · Tablet · Code",
  },
  {
    id: "think",
    icon: "sparkle",
    tab: "Refine",
    title: "Expandable Thinking Traces & Instant Selection Rewrite",
    prompt: "Make this paragraph shorter",
    lines: ["Thought for 2.4s", "Select any passage, then Explain, Improve", "or Shorten it in place. Keep or Discard."],
    foot: "Thinking trace · Selection actions",
  },
];

function PreviewCard({ reduce }: { reduce: boolean }) {
  const [i, setI] = useState(0);
  const [hold, setHold] = useState(false);
  useEffect(() => {
    if (reduce || hold) return;
    const t = window.setInterval(() => setI((n) => (n + 1) % FEATURES.length), 4200);
    return () => window.clearInterval(t);
  }, [reduce, hold]);
  const f = FEATURES[i];
  return (
    <div className="calm-card w-full max-w-[380px] p-3.5 text-left" data-testid="preview-card">
      <div role="tablist" aria-label="What Apex does" className="grid grid-cols-3 gap-1 rounded-full bg-[var(--surface-2)] p-1">
        {FEATURES.map((x, k) => (
          <button key={x.id} type="button" role="tab" aria-selected={k === i} onClick={() => { setI(k); setHold(true); }} className="relative flex min-h-9 items-center justify-center gap-1.5 rounded-full text-[12.5px] font-medium active:scale-[0.97]" style={{ transition: `transform .2s cubic-bezier(0.23,1,0.32,1)`, color: k === i ? "var(--canvas)" : "rgb(var(--ink-rgb)/var(--ink-3-a))" }}>
            {k === i && <motion.span layoutId="onb-tab" className="absolute inset-0 rounded-full bg-[var(--ink-solid)]" transition={{ duration: 0.45, ease: EASE }} />}
            <span className="relative flex items-center gap-1.5"><CIcon name={x.icon} size={14} />{x.tab}</span>
          </button>
        ))}
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={f.id} initial={{ opacity: 0, y: 10, filter: "blur(6px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} exit={{ opacity: 0, y: -6, filter: "blur(6px)" }} transition={{ duration: 0.45, ease: EASE }} className="mt-3">
          <p className="text-[14.5px] font-medium leading-snug tracking-[-0.01em]">{f.title}</p>
          <p className="ml-auto mt-3 w-fit max-w-[85%] rounded-[16px_16px_5px_16px] bg-[var(--surface-2)] px-3 py-2 text-[12.5px]">{f.prompt}</p>
          <div className="mt-2 rounded-[14px] px-3 py-2.5 text-[12.5px] leading-[1.55]" style={{ background: "var(--halo-a)", color: "var(--halo-ink)" }}>
            {f.lines.map((l, k) => (
              <motion.p key={l} initial={{ opacity: 0, filter: "blur(4px)" }} animate={{ opacity: 1, filter: "blur(0px)" }} transition={{ delay: 0.25 + k * 0.18, duration: 0.5, ease: EASE }}>{l}</motion.p>
            ))}
          </div>
          <p className="mt-2 flex items-center gap-1.5 text-[11.5px] text-[rgb(var(--ink-rgb)/var(--ink-3-a))]"><span className="h-1.5 w-1.5 rounded-full bg-[#34d399]" aria-hidden="true" />{f.foot}</p>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/** Onboarding screen 1: the Apex mark (the favicon) in a soft radial glow, staggered blur-to-sharp type, and the live preview card. */
export function OnboardingHero({ dim }: { dim: string }) {
  const reduce = !!useReducedMotion();
  const words = "Your private pocket AI studio.".split(" ");
  return (
    <div className="flex w-full flex-col items-center text-center">
      <motion.div className="relative grid h-[132px] w-[132px] place-items-center" initial={{ opacity: 0, scale: 0.86, filter: "blur(14px)" }} animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }} transition={{ duration: 1, ease: EASE }}>
        <motion.span className="absolute -inset-10 rounded-full" style={{ background: "radial-gradient(closest-side, rgb(140 120 255 / .34), transparent 70%)" }} animate={reduce ? undefined : { opacity: [0.7, 1, 0.7], scale: [1, 1.06, 1] }} transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }} aria-hidden="true" />
        <motion.div animate={reduce ? undefined : { y: [0, -4, 0] }} transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }} className="relative shadow-[0_24px_60px_-20px_rgb(120_100_255/.55)] rounded-[30px]">
          <ApexMark size={112} title="Apex" />
        </motion.div>
      </motion.div>
      <motion.span initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.6, ease: EASE }} className="mt-6 inline-flex h-7 items-center gap-2 rounded-full bg-[var(--surface-2)] px-3 text-[10.5px] font-medium uppercase tracking-[0.08em] text-[rgb(var(--ink-rgb)/var(--ink-3-a))]">
        <span className="h-1.5 w-1.5 rounded-full bg-[#34d399]" aria-hidden="true" />
        On-Device Local AI Runner
      </motion.span>
      <h1 className="mt-3 max-w-[16ch] text-[29px] font-normal leading-[1.1] tracking-[-0.03em]">
        {words.map((w, k) => (
          <motion.span key={k} className="mr-[0.26em] inline-block" initial={{ opacity: 0, y: 10, filter: "blur(8px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} transition={{ duration: 0.8, delay: 0.3 + k * 0.08, ease: EASE }}>
            {w}
          </motion.span>
        ))}
      </h1>
      <motion.p initial={{ opacity: 0, filter: "blur(6px)" }} animate={{ opacity: 1, filter: "blur(0px)" }} transition={{ delay: 0.95, duration: 0.8 }} className={`mt-3 max-w-[36ch] text-[13.5px] leading-relaxed ${dim}`}>
        Models run on your phone&apos;s silicon. Your chats, documents and creations stay on this device.
      </motion.p>
      <motion.div className="mt-6 flex w-full justify-center" initial={{ opacity: 0, y: 18, filter: "blur(8px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} transition={{ duration: 0.9, ease: EASE, delay: 1.1 }}>
        <PreviewCard reduce={reduce} />
      </motion.div>
    </div>
  );
}
