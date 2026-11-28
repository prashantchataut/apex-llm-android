"use client";

import { motion } from "framer-motion";
import { ApexMark } from "./ApexMark";
import { CIcon, type CIconName } from "./icons";
import { STARTERS, type Starter } from "@/lib/templates";

const EASE = [0.23, 1, 0.32, 1] as const;
const ICON: Record<Starter["id"], CIconName> = { presentation: "layers", page: "code", pdf: "file", research: "globe" };

/**
 * Empty-chat canvas: the Apex mark, the Active Engine Status Pill, and four tactile creation cards.
 */
export function Home({ onStarter, engine, mode, onEngine }: { onStarter: (s: Starter) => void; engine: string; mode: string; onEngine: () => void }) {
  return (
    <div className="mx-auto flex h-full w-full max-w-[560px] flex-col items-center overflow-y-auto px-5 pb-3 pt-[4vh] scroll-quiet">
      <motion.div className="relative grid h-[96px] w-[96px] shrink-0 place-items-center" initial={{ opacity: 0, scale: 0.88, filter: "blur(12px)" }} animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }} transition={{ duration: 0.9, ease: EASE }}>
        <motion.span className="absolute -inset-9 rounded-full" style={{ background: "radial-gradient(closest-side, rgb(140 120 255 / .26), transparent 70%)" }} animate={{ opacity: [0.7, 1, 0.7] }} transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }} aria-hidden="true" />
        <ApexMark size={80} className="relative rounded-[22px] shadow-[0_18px_44px_-18px_rgb(120_100_255/.6)]" title="Apex" />
      </motion.div>

      <motion.button type="button" onClick={onEngine} aria-label={`Active engine: ${engine}. ${mode}. Switch engine`} data-testid="engine-pill" className="mt-5 flex h-10 max-w-full items-center gap-2 rounded-full bg-[var(--surface)] pl-3.5 pr-3 text-[13px] font-medium shadow-[var(--specular),var(--shadow-card)] active:scale-[0.97]" initial={{ opacity: 0, y: 8, filter: "blur(6px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} transition={{ duration: 0.7, ease: EASE, delay: 0.15 }} whileTap={{ scale: 0.97 }}>
        <span className="relative flex h-2 w-2 shrink-0"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#34d399] opacity-50" /><span className="relative inline-flex h-2 w-2 rounded-full bg-[#34d399]" /></span>
        <span className="truncate">{engine}</span>
        <span className="h-3.5 w-px shrink-0 bg-[rgb(var(--ink-rgb)/.16)]" aria-hidden="true" />
        <span className="flex shrink-0 items-center gap-1 text-[12px] text-[rgb(var(--ink-rgb)/var(--ink-3-a))]"><CIcon name="bolt" size={13} />{mode}</span>
      </motion.button>

      <motion.h1 className="mt-5 text-center text-[26px] font-normal leading-[1.14] tracking-[-0.03em]" initial={{ opacity: 0, y: 10, filter: "blur(8px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} transition={{ duration: 0.8, ease: EASE, delay: 0.25 }}>
        What will you create today?
      </motion.h1>

      <div className="mt-6 grid w-full grid-cols-2 gap-2.5" role="group" aria-label="Create">
        {STARTERS.map((c, i) => (
          <motion.button
            key={c.id}
            type="button"
            onClick={() => onStarter(c)}
            data-testid={`card-${c.id}`}
            className="calm-card flex min-h-[148px] flex-col items-start justify-between p-3.5 text-left"
            initial={{ opacity: 0, y: 18, filter: "blur(6px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ type: "spring", stiffness: 170, damping: 22, delay: 0.35 + i * 0.07 }}
            whileHover={{ y: -3, scale: 1.015 }}
            whileTap={{ scale: 0.97 }}
          >
            <span className="grid h-9 w-9 place-items-center rounded-[12px] bg-[var(--surface-2)]"><CIcon name={ICON[c.id]} size={18} /></span>
            <span>
              <span className="block text-[13.5px] font-medium leading-tight tracking-[-0.01em]">{c.title}</span>
              <span className="mt-1 block text-[12px] leading-snug text-[rgb(var(--ink-rgb)/var(--ink-3-a))]">{c.sub}</span>
            </span>
          </motion.button>
        ))}
      </div>

    </div>
  );
}
