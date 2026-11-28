"use client";

import { motion } from "framer-motion";

export type Suggestion = "summarize" | "illustrate" | "brainstorm";
const PILLS: { id: Suggestion; text: string; rot: number; dy: number; align: string }[] = [
  { id: "summarize", text: "Summarize a PDF or a long document", rot: -1.5, dy: 0, align: "self-start" },
  { id: "illustrate", text: "Generate an illustration", rot: 1, dy: 3, align: "self-end" },
  { id: "brainstorm", text: "Brainstorm without restrictions", rot: -0.8, dy: -2, align: "self-start" },
];

/**
 * Empty-chat canvas. No cards, no grid: a calm greeting in the upper third and three floating
 * speech-bubble pills resting just above the composer. Roughly two thirds of the screen stays open.
 */
export function Home({ onPick }: { onPick: (s: Suggestion) => void }) {
  return (
    <div className="mx-auto flex h-full w-full max-w-[640px] flex-col px-6 pb-3">
      <motion.div
        className="mt-[7vh] sm:mt-[9vh]"
        initial={{ opacity: 0, y: 10, filter: "blur(8px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
      >
        <p className="text-[14px] text-[rgb(var(--ink-rgb)/var(--ink-3-a))]">Hi there</p>
        <h1 className="mt-2 max-w-[16ch] text-[30px] font-normal leading-[1.14] tracking-[-0.03em]">What do you want to do today?</h1>
      </motion.div>

      <div className="flex-1" />

      <div className="flex flex-col gap-2.5 pb-1" role="group" aria-label="Suggestions">
        {PILLS.map((p, i) => (
          <motion.div key={p.id} className={p.align} initial={{ opacity: 0, y: 16, filter: "blur(6px)" }} animate={{ opacity: 1, y: p.dy, filter: "blur(0px)" }} transition={{ type: "spring", stiffness: 160, damping: 22, delay: 0.35 + i * 0.09 }}>
            <motion.button
              type="button"
              onClick={() => onPick(p.id)}
              className="sug"
              style={{ rotate: p.rot }}
              animate={{ y: [0, -3, 0] }}
              transition={{ y: { duration: 5 + i, repeat: Infinity, ease: "easeInOut", delay: i * 0.6 } }}
              whileHover={{ scale: 1.02, rotate: 0 }}
              whileTap={{ scale: 0.97 }}
            >
              {p.text}
            </motion.button>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
