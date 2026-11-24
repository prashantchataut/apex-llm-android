"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";

export interface FanCard {
  label: string;
  value: string;
  unit?: string;
}

/**
 * Archetype B hallmark: 3–5 mini white data cards fanned from -12° to +14°
 * peeking over the top edge of a frosted primary card. Spring-spreads on hover/tap.
 */
export function FanStack({ cards, children }: { cards: FanCard[]; children: ReactNode }) {
  const n = Math.min(5, Math.max(3, cards.length));
  const list = cards.slice(0, n);
  return (
    <motion.div className="relative pt-[58px]" initial="rest" animate="rest" whileHover="hover" whileTap="hover">
      {list.map((c, i) => {
        const angle = -12 + (26 * i) / (n - 1);
        const left = 4 + (i * (100 - 36 - 8)) / (n - 1);
        return (
          <motion.div
            key={c.label}
            className="mini-card absolute top-0 h-28 w-[36%] px-3 py-2.5"
            style={{ left: `${left}%`, transformOrigin: "50% 100%", zIndex: i }}
            variants={{
              rest: { rotate: angle, y: 0 },
              hover: { rotate: angle * 1.4, y: -12 },
            }}
            transition={{ type: "spring", stiffness: 320, damping: 20, delay: i * 0.015 }}
          >
            <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[rgb(11_11_16/0.6)]">{c.label}</div>
            <div className="tnum mt-0.5 text-[19px] font-semibold leading-none tracking-tight">
              {c.value}
              {c.unit && <span className="ml-0.5 text-[11px] font-medium text-[rgb(11_11_16/0.6)]">{c.unit}</span>}
            </div>
          </motion.div>
        );
      })}
      <div className="glass relative z-10 overflow-hidden !rounded-[28px] p-4">
        <div className="relative z-[1]">{children}</div>
      </div>
    </motion.div>
  );
}
