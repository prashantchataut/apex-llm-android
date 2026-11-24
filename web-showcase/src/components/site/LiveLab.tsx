"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { ThinkingAccordion } from "@/components/app/ThinkingAccordion";
import { AssistantBody } from "@/components/app/Rich";
import { LOOKS } from "@/components/app/Onboarding";
import { ApexLogo } from "@/components/brand/ApexLogo";
import { Icon } from "@/components/ui/Icon";
import { SiliconScan } from "@/components/ui/SiliconScan";
import { useTheme } from "@/components/theme/ThemeProvider";
import { DEVICES } from "@/lib/compat";
import { pickReply } from "@/lib/demo-script";

const SPRING = { type: "spring", stiffness: 320, damping: 26 } as const;

function Panel({ kicker, title, action, children, className = "" }: { kicker: string; title: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={`bento flex flex-col p-5 sm:p-6 ${className}`}>
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <div className="mono text-[10.5px] uppercase tracking-[0.18em] text-ink-3">{kicker}</div>
          <h3 className="display mt-1 text-[24px] leading-[1.05]">{title}</h3>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function ReplayButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} className="flex h-11 shrink-0 items-center gap-2 rounded-full border border-white/15 px-4 text-[12.5px] font-medium text-ink-2 transition-transform hover:bg-white/10 active:scale-[0.97]">
      <Icon name="play" size={13} /> {label}
    </button>
  );
}

/** Live reasoning demo: steps appear on a timer, the accordion collapses, then KaTeX + clickable MCQ cards render. */
function ReasoningDemo() {
  const reply = useMemo(() => pickReply("expand a square"), []);
  const [run, setRun] = useState(0);
  const [session, setSession] = useState<{ t0: number } | null>(null);
  const [shown, setShown] = useState(0);
  const [endedAt, setEndedAt] = useState<number | null>(null);

  useEffect(() => {
    setSession({ t0: performance.now() });
    setShown(0);
    setEndedAt(null);
    const timers: number[] = [];
    const gap = reply.thinkMs / (reply.steps.length + 0.5);
    reply.steps.forEach((_, i) => timers.push(window.setTimeout(() => setShown(i + 1), gap * (i + 0.6))));
    timers.push(window.setTimeout(() => setEndedAt(performance.now()), reply.thinkMs));
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [run, reply]);

  return (
    <div className="min-h-[560px] space-y-3">
      <div className="ml-auto w-fit max-w-[85%] rounded-[22px] rounded-br-md border border-white/10 bg-white/[0.09] px-4 py-2.5 text-[14.5px] leading-snug">Expand (a + b)² and check it.</div>
      {session && <ThinkingAccordion key={run} steps={reply.steps} shown={shown} startedAt={session.t0} endedAt={endedAt} />}
      {endedAt !== null && (
        <motion.div initial={{ opacity: 0, y: 10, filter: "blur(8px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} transition={SPRING} key={`a${run}`}>
          <AssistantBody text={reply.answer} streaming={false} />
        </motion.div>
      )}
      <button onClick={() => setRun((r) => r + 1)} className="mono flex h-11 items-center gap-2 text-[11.5px] uppercase tracking-[0.14em] text-ink-3 active:scale-[0.97]" aria-label="Replay reasoning demo">
        <Icon name="play" size={12} /> Replay thought
      </button>
    </div>
  );
}

export function LiveLab() {
  const { theme, mode, setTheme, setMode } = useTheme();
  const [devIdx, setDevIdx] = useState(1);
  const [scanKey, setScanKey] = useState(0);
  const active = LOOKS.find((l) => l.theme === theme && (l.mode === mode || (l.id === "day" && mode === "system")))?.id;

  return (
    <div>
      {/* live theme switcher: this changes the whole page, not a mock */}
      <div role="radiogroup" aria-label="Theme" className="glass-dark mb-8 grid grid-cols-2 gap-1 rounded-[26px] p-1.5 sm:inline-grid sm:grid-cols-4">
        {LOOKS.map((l) => {
          const on = active === l.id;
          return (
            <button
              key={l.id}
              role="radio"
              aria-checked={on}
              onClick={() => {
                setTheme(l.theme);
                setMode(l.mode);
              }}
              className="relative flex min-h-11 items-center justify-center rounded-[20px] px-3 text-[12.5px] font-medium transition-transform active:scale-[0.97]"
            >
              {on && <motion.span layoutId="lab-look" className="absolute inset-0 rounded-[20px] bg-white/[0.14]" transition={SPRING} />}
              <span className={`relative whitespace-nowrap ${on ? "text-white" : "text-ink-3"}`}>{l.name.replace("VisionOS ", "")}</span>
            </button>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.1fr] lg:items-start">
        <Panel
          kicker="Onboarding · scene 02"
          title="Silicon scan"
          action={<ReplayButton onClick={() => setScanKey((k) => k + 1)} label="Re-scan" />}
        >
          <SiliconScan dev={DEVICES[devIdx]} source="preset" runKey={scanKey} />
          <div className="mt-4 flex gap-2" role="radiogroup" aria-label="Phone class">
            {DEVICES.map((d, k) => (
              <button key={d.label} role="radio" aria-checked={k === devIdx} onClick={() => setDevIdx(k)} className={`min-h-11 flex-1 rounded-2xl border px-2 py-2.5 text-[12px] font-medium transition-[transform,background-color] active:scale-[0.97] ${k === devIdx ? "border-white/40 bg-white/15" : "border-white/10 text-ink-3"}`}>
                {d.label}
              </button>
            ))}
          </div>
          <p className="mt-3 text-[11.5px] text-ink-3">Same component the app runs on first launch. Phone classes are presets; the app measures the real device.</p>
        </Panel>

        <Panel kicker="Chat · reasoning" title="Think, then answer">
          <ReasoningDemo />
        </Panel>
      </div>

      <AnimatePresence>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mono mt-6 flex items-center gap-3 text-[11px] text-ink-3">
          <ApexLogo size={18} state="monochrome" />
          Scripted replies. The web build has no model; the Android build runs llama.cpp.
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
