"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { CIcon, type CIconName } from "./icons";

export type OnbChoice = "keyless" | "local" | "uncensored";

const PALETTE = {
  light: { bg: "#f8f9fa", card: "#ffffff", line: "#1b1e26", soft: "#e4f2ea", edge: "rgb(27 30 38 / 0.1)", glow: "radial-gradient(70% 60% at 20% 0%, #f6d5e5, transparent 70%), radial-gradient(60% 60% at 90% 0%, #ddf3e4, transparent 70%)" },
  dark: { bg: "#0a0b0f", card: "#12141a", line: "#eef0f6", soft: "#0f1d19", edge: "rgb(255 255 255 / 0.08)", glow: "radial-gradient(70% 60% at 15% -10%, rgb(88 96 214 / 0.35), transparent 70%), radial-gradient(60% 60% at 100% 0%, rgb(52 160 140 / 0.28), transparent 70%)" },
} as const;

function Preview({ mode, selected, onPick }: { mode: "light" | "dark"; selected: boolean; onPick: () => void }) {
  const p = PALETTE[mode];
  return (
    <button type="button" onClick={onPick} aria-pressed={selected} aria-label={`${mode} mode preview`} className="group relative flex-1 text-left">
      <motion.div animate={{ scale: selected ? 1 : 0.94 }} transition={{ type: "spring", stiffness: 360, damping: 28 }} className={`beam relative h-[196px] overflow-hidden rounded-[22px] ${selected ? "" : ""}`} data-live={selected} style={{ background: p.bg, boxShadow: `inset 0 0 0 1px ${p.edge}, ${mode === "dark" ? "inset 0 1px 0 rgb(255 255 255 / 0.07)," : ""} 0 18px 36px -22px rgb(0 0 0 / 0.5)` }}>
        <div className="absolute inset-x-0 top-0 h-20" style={{ background: p.glow }} />
        <div className="relative px-3 pt-3">
          <div className="mx-auto h-5 w-[62%] rounded-full" style={{ background: p.card, boxShadow: `inset 0 0 0 1px ${p.edge}` }} />
          <div className="mt-5 h-2 w-8 rounded-full" style={{ background: p.line, opacity: 0.35 }} />
          <div className="mt-2 h-3 w-[78%] rounded-full" style={{ background: p.line, opacity: 0.9 }} />
          <div className="mt-1.5 h-3 w-[52%] rounded-full" style={{ background: p.line, opacity: 0.9 }} />
          <div className="mt-3 grid grid-cols-2 gap-1.5">
            {[0, 1].map((i) => (
              <div key={i} className="h-9 rounded-xl" style={{ background: p.card, boxShadow: `inset 0 0 0 1px ${p.edge}` }} />
            ))}
          </div>
        </div>
        <div className="absolute inset-x-2.5 bottom-2.5 rounded-2xl p-1" style={{ background: p.soft }}>
          <div className="flex h-9 items-center justify-between rounded-xl px-2.5" style={{ background: p.card, boxShadow: `inset 0 0 0 1px ${p.edge}` }}>
            <div className="h-1.5 w-12 rounded-full" style={{ background: p.line, opacity: 0.25 }} />
            <div className="h-5 w-5 rounded-lg" style={{ background: p.line }} />
          </div>
        </div>
      </motion.div>
      <span className="mt-2.5 flex items-center justify-center gap-1.5 text-[13px] font-medium">
        <CIcon name={mode === "light" ? "sun" : "moon"} size={14} /> {mode === "light" ? "Porcelain" : "Obsidian"}
        {selected && <CIcon name="check" size={14} className="text-[var(--accent)]" />}
      </span>
    </button>
  );
}

const CHOICES: { id: OnbChoice; icon: CIconName; title: string; sub: string; tag: string }[] = [
  { id: "keyless", icon: "bolt", title: "Keyless AI", sub: "Start chatting right now. No account, no key, no download.", tag: "Instant" },
  { id: "local", icon: "lock", title: "Local models", sub: "Download a GGUF once, then chat fully offline and private.", tag: "Offline" },
  { id: "uncensored", icon: "unlock", title: "Uncensored mode", sub: "Abliterated models that run on your phone without refusals.", tag: "On-device" },
];

export function Onboarding({ resolved, onTheme, onFinish }: { resolved: "light" | "dark"; onTheme: (m: "light" | "dark") => void; onFinish: (c: OnbChoice) => void }) {
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [pick, setPick] = useState<OnbChoice>("keyless");
  const go = (n: number) => {
    setDir(n > step ? 1 : -1);
    setStep(n);
  };
  return (
    <motion.div role="dialog" aria-modal="true" aria-label="Welcome to Apex" className="absolute inset-0 z-[60] flex flex-col bg-[var(--canvas)]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 1.02 }} transition={{ duration: 0.25 }}>
      <div className="calm-glow" aria-hidden="true" style={{ height: "46%" }} />
      <div className="relative z-[1] flex items-center justify-between px-5 pt-[max(16px,env(safe-area-inset-top))]">
        <div className="flex items-center gap-1.5" aria-label={`Step ${step + 1} of 2`}>
          {[0, 1].map((i) => (
            <motion.span key={i} animate={{ width: i === step ? 22 : 7, opacity: i <= step ? 1 : 0.3 }} transition={{ type: "spring", stiffness: 420, damping: 32 }} className="h-[7px] rounded-full bg-[var(--ink-solid)]" />
          ))}
        </div>
        <button type="button" onClick={() => onFinish("keyless")} className="calm-chip !h-9 !px-3.5">Skip</button>
      </div>

      <div className="relative z-[1] min-h-0 flex-1 overflow-hidden">
        <AnimatePresence mode="popLayout" custom={dir} initial={false}>
          <motion.section key={step} custom={dir} initial={{ x: dir * 56, opacity: 0, filter: "blur(6px)" }} animate={{ x: 0, opacity: 1, filter: "blur(0px)" }} exit={{ x: dir * -56, opacity: 0, filter: "blur(6px)" }} transition={{ type: "spring", stiffness: 300, damping: 32 }} className="scroll-quiet absolute inset-0 mx-auto flex w-full max-w-[520px] flex-col justify-center overflow-y-auto px-5 py-4">
            {step === 0 ? (
              <>
                <motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="text-[14px] text-[rgb(var(--ink-rgb)/var(--ink-2-a))]">Welcome to Apex</motion.p>
                <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mt-1 text-[clamp(30px,8vw,40px)] font-normal leading-[1.08] tracking-[-0.03em]">Pick your atmosphere.</motion.h1>
                <p className="mt-3 text-[15px] leading-relaxed text-[rgb(var(--ink-rgb)/var(--ink-2-a))]">Tap a preview. The whole app changes instantly, and we remember it.</p>
                <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18, type: "spring", stiffness: 240, damping: 26 }} className="mt-7 flex gap-3.5">
                  <Preview mode="light" selected={resolved === "light"} onPick={() => onTheme("light")} />
                  <Preview mode="dark" selected={resolved === "dark"} onPick={() => onTheme("dark")} />
                </motion.div>
              </>
            ) : (
              <>
                <h1 className="text-[clamp(28px,7.4vw,38px)] font-normal leading-[1.1] tracking-[-0.028em]">How should Apex think?</h1>
                <p className="mt-2.5 text-[15px] leading-relaxed text-[rgb(var(--ink-rgb)/var(--ink-2-a))]">You can switch any time from the model pill.</p>
                <div className="mt-6 space-y-2.5" role="radiogroup" aria-label="Engine">
                  {CHOICES.map((c, i) => (
                    <motion.button key={c.id} type="button" role="radio" aria-checked={pick === c.id} onClick={() => setPick(c.id)} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 + i * 0.06, type: "spring", stiffness: 260, damping: 26 }} className={`calm-card beam flex w-full items-center gap-3.5 p-3.5 text-left ${pick === c.id ? "" : "opacity-80"}`} data-live={pick === c.id} style={{ borderRadius: 22, outline: pick === c.id ? "1.5px solid var(--accent)" : undefined, outlineOffset: -1 }}>
                      <span className="well"><CIcon name={c.icon} size={19} /></span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2 text-[15px] font-medium">{c.title}<span className="calm-chip !h-5 !px-2 text-[10.5px]">{c.tag}</span></span>
                        <span className="mt-0.5 block text-[12.5px] leading-snug text-[rgb(var(--ink-rgb)/var(--ink-3-a))]">{c.sub}</span>
                      </span>
                      <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full" style={{ boxShadow: "inset 0 0 0 1.5px var(--hairline-strong)", background: pick === c.id ? "var(--accent)" : "transparent" }}>
                        {pick === c.id && <CIcon name="check" size={12} className="text-[var(--canvas)]" strokeWidth={2.6} />}
                      </span>
                    </motion.button>
                  ))}
                </div>
              </>
            )}
          </motion.section>
        </AnimatePresence>
      </div>

      <div className="relative z-[1] mx-auto flex w-full max-w-[520px] gap-2.5 px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-2">
        {step === 1 && (
          <button type="button" onClick={() => go(0)} className="calm-btn !h-[52px] !w-[52px] !px-0" aria-label="Back">
            <CIcon name="back" size={18} />
          </button>
        )}
        <button type="button" onClick={() => (step === 0 ? go(1) : onFinish(pick))} className="calm-btn !h-[52px] flex-1 !text-[15px]" data-primary="true">
          {step === 0 ? "Continue" : pick === "keyless" ? "Start chatting" : "Open Model Hub"}
          <CIcon name="arrow" size={17} />
        </button>
      </div>
    </motion.div>
  );
}
