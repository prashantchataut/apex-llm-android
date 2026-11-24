"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(performance.now()), 50);
    return () => window.clearInterval(id);
  }, [active]);
  return now;
}

/**
 * Live reasoning accordion (Archetype D): glowing pulse orb, live ms timer,
 * vertical timeline of reasoning steps. Auto-collapses when the thought completes.
 */
export function ThinkingAccordion({ steps, shown, startedAt, endedAt }: { steps: string[]; shown: number; startedAt: number; endedAt: number | null }) {
  const thinking = endedAt === null;
  const now = useNow(thinking);
  const elapsed = Math.max(0, (endedAt ?? now) - startedAt) / 1000;
  const [userOpen, setUserOpen] = useState<boolean | null>(null);
  const open = userOpen ?? thinking; // auto: open while thinking, collapsed after

  return (
    <div className="glass-dark overflow-hidden rounded-[20px]">
      <button
        onClick={() => setUserOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <span className="orb" data-done={!thinking} />
        <span className="tnum flex-1 text-[13px] font-medium">
          {thinking ? <span className="shimmer-text">Thinking… {elapsed.toFixed(1)}s</span> : <span className="text-ink-2">Thought for {elapsed.toFixed(1)}s</span>}
        </span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ type: "spring", stiffness: 300, damping: 24 }} className="text-ink-3">
          <Icon name="chevron" size={18} />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 30 }}
            className="overflow-hidden"
          >
            <ol className="relative mx-4 mb-4 mt-1 space-y-3 pl-6">
              <span className="absolute bottom-2 left-[6px] top-2 w-px bg-gradient-to-b from-white/30 via-white/15 to-transparent" aria-hidden="true" />
              {steps.slice(0, shown).map((s, i) => {
                const active = thinking && i === shown - 1;
                return (
                  <motion.li key={s} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} className="relative text-[13px] text-ink-2">
                    <span
                      className={`absolute -left-6 top-[3px] grid h-[14px] w-[14px] place-items-center rounded-full border ${active ? "border-accent-2/70 bg-accent-2/30 shadow-[0_0_12px_rgba(56,189,248,0.7)]" : "border-ok/50 bg-ok/20"}`}
                    >
                      {!active && <Icon name="check" size={9} strokeWidth={3} className="text-ok" />}
                    </span>
                    {s}
                  </motion.li>
                );
              })}
            </ol>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
