"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useRef, useState, type KeyboardEvent } from "react";
import { Icon } from "@/components/ui/Icon";
import { RippleButton } from "@/components/ui/Glass";
import type { ChoiceOption } from "@/lib/richtext";
import { RichInline } from "./Rich";

/**
 * Clarifying-choice cards. When a request is ambiguous the assistant asks one short question and offers
 * a few options (like the choice chips in modern AI chat apps). There is no right or wrong answer:
 * picking sends your choice back as your next message. "Something else…" lets you type your own.
 * Keyboard: 1–9 pick, ↑/↓ move focus, Enter/Space toggle.
 */
export function ChoiceCards({ question, options, multi, onAnswer }: { question: string; options: ChoiceOption[]; multi: boolean; onAnswer?: (text: string) => void }) {
  const [picked, setPicked] = useState<number[]>([]);
  const [other, setOther] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const locked = sent !== null;
  const OTHER = options.length;

  const toggle = (i: number) => {
    if (locked) return;
    if (i === OTHER) {
      setOther((o) => (o === null ? "" : null));
      if (!multi) setPicked([]);
      return;
    }
    setPicked((p) => (multi ? (p.includes(i) ? p.filter((x) => x !== i) : [...p, i]) : [i]));
    if (!multi) setOther(null);
  };
  const answer = [...picked.sort((a, b) => a - b).map((i) => options[i].label), ...(other && other.trim() ? [other.trim()] : [])].join("; ");
  const submit = () => {
    if (!answer || locked) return;
    setSent(answer);
    onAnswer?.(answer);
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).tagName === "INPUT") return;
    const n = Number(e.key);
    if (n >= 1 && n <= options.length) {
      e.preventDefault();
      refs.current[n - 1]?.focus();
      toggle(n - 1);
      return;
    }
    const cur = refs.current.findIndex((r) => r === document.activeElement);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const total = options.length + 1;
      refs.current[(cur + (e.key === "ArrowDown" ? 1 : -1) + total) % total]?.focus();
    }
  };

  const row = (on: boolean) => (on ? "border-accent/60 bg-accent/15" : "border-white/10 bg-white/[0.05] hover:bg-white/[0.09]");

  return (
    <div role={multi ? "group" : "radiogroup"} aria-label={question} onKeyDown={onKey} className="glass-dark rounded-[22px] p-3.5">
      <div className="mb-2.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-3">
        <Icon name="prism" size={14} /> Help me narrow this down{multi && <span className="ml-auto normal-case tracking-normal">pick any</span>}
      </div>
      <p className="mb-3 text-[15px] font-medium text-white">
        <RichInline text={question} />
      </p>
      <div className="grid gap-2">
        {options.map((o, i) => {
          const on = picked.includes(i);
          return (
            <motion.div key={i} whileHover={locked ? undefined : { y: -1 }} transition={{ type: "spring", stiffness: 400, damping: 25 }}>
              <RippleButton
                ref={(el: HTMLButtonElement | null) => {
                  refs.current[i] = el;
                }}
                role={multi ? "checkbox" : "radio"}
                aria-checked={on}
                disabled={locked && !on}
                onClick={() => toggle(i)}
                className={`flex min-h-[52px] w-full items-center gap-3 rounded-2xl border px-3.5 py-2.5 text-left text-[14px] text-white transition-colors ${row(on)} ${locked && !on ? "opacity-40" : ""}`}
              >
                <span className={`mono grid h-6 w-6 shrink-0 place-items-center text-[11px] ${multi ? "rounded-md" : "rounded-full"} ${on ? "bg-accent text-white" : "bg-white/10 text-ink-2"}`}>{on ? <Icon name="check" size={13} strokeWidth={3} /> : i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium leading-snug">
                    <RichInline text={o.label} />
                  </span>
                  {o.hint && (
                    <span className="mt-0.5 block text-[12px] leading-snug text-ink-3">
                      <RichInline text={o.hint} />
                    </span>
                  )}
                </span>
              </RippleButton>
            </motion.div>
          );
        })}
        <RippleButton
          ref={(el: HTMLButtonElement | null) => {
            refs.current[OTHER] = el;
          }}
          role={multi ? "checkbox" : "radio"}
          aria-checked={other !== null}
          disabled={locked && other === null}
          onClick={() => toggle(OTHER)}
          className={`flex min-h-[48px] w-full items-center gap-3 rounded-2xl border border-dashed px-3.5 py-2 text-left text-[14px] ${other !== null ? "border-accent/60 bg-accent/10 text-white" : "border-white/15 text-ink-2"} ${locked && other === null ? "opacity-40" : ""}`}
        >
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white/10">
            <Icon name="pencil" size={13} />
          </span>
          Something else…
        </RippleButton>
        <AnimatePresence initial={false}>
          {other !== null && !locked && (
            <motion.input
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 46 }}
              exit={{ opacity: 0, height: 0 }}
              autoFocus
              value={other}
              onChange={(e) => setOther(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="Tell me in your own words"
              aria-label="Your own answer"
              className="glass-dark rounded-2xl px-4 text-[14px] text-white outline-none placeholder:text-ink-3"
            />
          )}
        </AnimatePresence>
      </div>
      {locked ? (
        <motion.p initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="mt-3 flex items-center gap-1.5 text-[12.5px] text-ink-3">
          <Icon name="check" size={14} className="text-ok" /> Sent: {sent}
        </motion.p>
      ) : (
        <div className="mt-3 flex items-center justify-end gap-2">
          <button type="button" onClick={() => setSent("Skipped") /* local only: nothing is sent */} className="min-h-11 rounded-full px-4 text-[13px] text-ink-3 active:scale-95">
            Skip
          </button>
          <RippleButton type="button" onClick={submit} disabled={!answer} className="flex h-11 items-center gap-1.5 rounded-full bg-white px-5 text-[13px] font-semibold text-black disabled:bg-white/20 disabled:text-ink-3">
            Continue <Icon name="send" size={14} strokeWidth={2.4} />
          </RippleButton>
        </div>
      )}
    </div>
  );
}
