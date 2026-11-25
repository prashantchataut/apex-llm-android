"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useId, type ReactNode } from "react";
import { CIcon, type CIconName } from "./icons";

/** Segmented pill — inset track, raised thumb that springs between options (BeautifulUI "Drive / Dots / Orbit" control). */
export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { id: T; label: string; icon?: CIconName }[]; label: string }) {
  const gid = useId();
  return (
    <div role="tablist" aria-label={label} className="seg">
      {options.map((o) => (
        <button key={o.id} role="tab" type="button" aria-selected={value === o.id} onClick={() => onChange(o.id)}>
          {value === o.id && <motion.span layoutId={`seg-${gid}`} className="seg-thumb" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
          {o.icon && <CIcon name={o.icon} size={15} />}
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Spring height collapse for trace / reasoning blocks. */
export function Collapse({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ type: "spring", stiffness: 340, damping: 34 }} style={{ overflow: "hidden" }}>
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const DELAYS = [0, 0.15, 0.3, 0.15, 0.3, 0.45, 0.3, 0.45, 0.6];
/** 3x3 pixel-grid loader. */
export function PixelLoader({ live = true }: { live?: boolean }) {
  return (
    <span className="pixels" aria-hidden="true">
      {DELAYS.map((d, i) => (
        <i key={i} style={{ animationDelay: `${d}s`, animationPlayState: live ? "running" : "paused" }} />
      ))}
    </span>
  );
}

/** Light / dark toggle: two-state, instant, persisted by the caller. */
export function ThemeToggle({ resolved, onToggle }: { resolved: "light" | "dark"; onToggle: (m: "light" | "dark") => void }) {
  return (
    <div role="group" aria-label="Theme" className="seg !w-[84px] shrink-0">
      {(["light", "dark"] as const).map((m) => (
        <button key={m} type="button" aria-pressed={resolved === m} aria-label={`${m} mode`} onClick={() => onToggle(m)} className="!min-h-[32px] !px-0">
          {resolved === m && <motion.span layoutId="theme-thumb" className="seg-thumb" transition={{ type: "spring", stiffness: 480, damping: 36 }} />}
          <CIcon name={m === "light" ? "sun" : "moon"} size={15} />
        </button>
      ))}
    </div>
  );
}
