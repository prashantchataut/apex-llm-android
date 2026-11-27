"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useRef, useState, type KeyboardEvent } from "react";
import { CIcon } from "@/components/calm/icons";
import type { ChoiceOption } from "@/lib/richtext";
import { RichInline } from "./Rich";

/**
 * Follow-up / multiple-choice pills. When a request is ambiguous the assistant asks one short question and offers a
 * few options. Each option is a full-width soft pill (no box, no border); picking sends the choice back as the next
 * message. "Something else" lets you type your own. Keyboard: 1–9 pick, Up/Down move focus, Enter/Space toggle.
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

  const pill = (on: boolean, dim: boolean) =>
    `flex min-h-[52px] w-full items-center gap-3 rounded-[16px] px-4 py-2.5 text-left text-[14.5px] transition-[background,opacity,box-shadow] duration-200 ${on ? "bg-[var(--halo-a)] text-[var(--halo-ink)] shadow-[var(--shadow-card)]" : "bg-[var(--surface-2)] hover:bg-[color-mix(in_oklab,var(--surface-2)_70%,var(--surface))]"} ${dim ? "opacity-40" : ""}`;

  return (
    <div role={multi ? "group" : "radiogroup"} aria-label={question} onKeyDown={onKey} className="mt-5">
      <p className="mb-3 text-[15.5px] leading-snug">
        <RichInline text={question} />
        {multi && <span className="ml-2 text-[12.5px] text-[rgb(var(--ink-rgb)/var(--ink-3-a))]">pick any</span>}
      </p>
      <div className="flex flex-col gap-2">
        {options.map((o, i) => {
          const on = picked.includes(i);
          return (
            <motion.button
              key={i}
              ref={(el: HTMLButtonElement | null) => {
                refs.current[i] = el;
              }}
              type="button"
              role={multi ? "checkbox" : "radio"}
              aria-checked={on}
              disabled={locked && !on}
              onClick={() => toggle(i)}
              whileTap={locked ? undefined : { scale: 0.985 }}
              whileHover={locked ? undefined : { scale: 1.003 }}
              transition={{ type: "spring", stiffness: 420, damping: 28 }}
              className={pill(on, locked && !on)}
            >
              <span className="min-w-0 flex-1">
                <span className="block leading-snug">
                  <RichInline text={o.label} />
                </span>
                {o.hint && (
                  <span className="mt-0.5 block text-[12.5px] leading-snug text-[rgb(var(--ink-rgb)/var(--ink-3-a))]">
                    <RichInline text={o.hint} />
                  </span>
                )}
              </span>
              <AnimatePresence initial={false}>
                {on && (
                  <motion.span initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0, opacity: 0 }}>
                    <CIcon name="check" size={17} />
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.button>
          );
        })}
        <motion.button
          ref={(el: HTMLButtonElement | null) => {
            refs.current[OTHER] = el;
          }}
          type="button"
          role={multi ? "checkbox" : "radio"}
          aria-checked={other !== null}
          disabled={locked && other === null}
          onClick={() => toggle(OTHER)}
          whileTap={locked ? undefined : { scale: 0.985 }}
          transition={{ type: "spring", stiffness: 420, damping: 28 }}
          className={`${pill(other !== null, locked && other === null)} text-[rgb(var(--ink-rgb)/var(--ink-2-a))]`}
        >
          <CIcon name="pencil" size={16} /> Something else
        </motion.button>
        <AnimatePresence initial={false}>
          {other !== null && !locked && (
            <motion.input
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 48 }}
              exit={{ opacity: 0, height: 0 }}
              autoFocus
              value={other}
              onChange={(e) => setOther(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="Tell me in your own words"
              aria-label="Your own answer"
              className="calm-field !rounded-[16px]"
            />
          )}
        </AnimatePresence>
      </div>
      {locked ? (
        <motion.p initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="mt-3 flex items-center gap-1.5 text-[13px] text-[rgb(var(--ink-rgb)/var(--ink-3-a))]">
          <CIcon name="check" size={14} /> Sent: {sent}
        </motion.p>
      ) : (
        <div className="mt-3 flex items-center justify-end gap-2">
          <button type="button" onClick={() => setSent("Skipped") /* local only: nothing is sent */} className="min-h-11 rounded-full px-4 text-[13.5px] text-[rgb(var(--ink-rgb)/var(--ink-3-a))] active:scale-95">
            Skip
          </button>
          <button type="button" onClick={submit} disabled={!answer} className="calm-btn" data-primary="true">
            Continue <CIcon name="arrow" size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
