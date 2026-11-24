"use client";

import { motion } from "framer-motion";
import { useRef, useState, type KeyboardEvent } from "react";
import { Icon } from "@/components/ui/Icon";
import { RippleButton } from "@/components/ui/Glass";
import { RichInline } from "./Rich";

/**
 * Clickable MCQ glass cards (Archetype D). Keyboard: 1–9 select, ↑/↓ move focus, Enter/Space activate.
 * On-device the options come from grammar-constrained JSON (`cortex-inference::grammar::mcq_grammar`).
 */
export function OptionCards({ question, options, answer }: { question: string; options: string[]; answer?: number }) {
  const [picked, setPicked] = useState<number | null>(null);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const locked = picked !== null;

  const choose = (i: number) => {
    if (!locked) setPicked(i);
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const n = Number(e.key);
    if (n >= 1 && n <= options.length) {
      e.preventDefault();
      refs.current[n - 1]?.focus();
      choose(n - 1);
      return;
    }
    const cur = refs.current.findIndex((r) => r === document.activeElement);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = (cur + (e.key === "ArrowDown" ? 1 : -1) + options.length) % options.length;
      refs.current[next]?.focus();
    }
  };

  const state = (i: number): "idle" | "right" | "wrong" | "reveal" | "picked" => {
    if (picked === null) return "idle";
    if (answer === undefined) return i === picked ? "picked" : "idle";
    if (i === picked) return i === answer ? "right" : "wrong";
    if (i === answer) return "reveal";
    return "idle";
  };
  const ring: Record<string, string> = {
    idle: "border-white/10 bg-white/[0.05] hover:bg-white/[0.09]",
    picked: "border-accent/60 bg-accent/15",
    right: "border-ok/70 bg-ok/15",
    wrong: "border-bad/70 bg-bad/15",
    reveal: "border-ok/40 bg-transparent",
  };

  return (
    <div role="radiogroup" aria-label={question} onKeyDown={onKey} className="glass-dark rounded-[22px] p-3.5">
      <div className="mb-2.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-3">
        <Icon name="sparkle" size={14} /> Quick question
      </div>
      <p className="mb-3 text-[15px] font-medium text-white">
        <RichInline text={question} />
      </p>
      <div className="grid gap-2">
        {options.map((o, i) => {
          const s = state(i);
          return (
            <motion.div key={i} whileHover={locked ? undefined : { y: -1 }} transition={{ type: "spring", stiffness: 400, damping: 25 }}>
              <RippleButton
                ref={(el: HTMLButtonElement | null) => {
                  refs.current[i] = el;
                }}
                role="radio"
                aria-checked={picked === i}
                disabled={locked && s === "idle"}
                onClick={() => choose(i)}
                className={`flex min-h-[48px] w-full items-center gap-3 rounded-2xl border px-3.5 py-2.5 text-left text-[14px] text-white transition-colors ${ring[s]} ${locked && s === "idle" ? "opacity-45" : ""}`}
              >
                <span className="mono grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-white/10 text-[11px] text-ink-2">{i + 1}</span>
                <span className="flex-1">
                  <RichInline text={o} />
                </span>
                {(s === "right" || s === "reveal") && <Icon name="check" size={18} className="text-ok" />}
                {s === "wrong" && <Icon name="x" size={18} className="text-bad" />}
              </RippleButton>
            </motion.div>
          );
        })}
      </div>
      {locked && answer !== undefined && (
        <motion.p initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className={`mt-3 text-[13px] ${picked === answer ? "text-ok" : "text-bad"}`}>
          {picked === answer ? "Correct — nicely done." : "Not quite — the highlighted option is the right one."}
        </motion.p>
      )}
    </div>
  );
}
