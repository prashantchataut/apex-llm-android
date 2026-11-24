"use client";

import { motion } from "framer-motion";
import { Icon } from "@/components/ui/Icon";
import { hapticsSupported, setHapticLevel, type HapticLevel } from "@/lib/haptics";
import { useHapticLevel } from "@/lib/useHaptics";

const LEVELS: { id: HapticLevel; label: string; note: string }[] = [
  { id: "off", label: "Off", note: "No vibration" },
  { id: "subtle", label: "Subtle", note: "Softer, fewer token ticks" },
  { id: "crisp", label: "Crisp", note: "Full-strength detents and ticks" },
];

/** Settings: haptic intensity (Off / Subtle / Crisp). Selecting a level plays a detent so you can feel it. */
export function HapticsControl() {
  const level = useHapticLevel();
  const note = LEVELS.find((l) => l.id === level)?.note;
  return (
    <div>
      <div role="radiogroup" aria-label="Haptic intensity" className="glass-dark relative flex rounded-full p-1">
        {LEVELS.map((l) => {
          const on = l.id === level;
          return (
            <button key={l.id} role="radio" aria-checked={on} onClick={() => setHapticLevel(l.id)} className="relative flex h-11 flex-1 items-center justify-center gap-1.5 rounded-full text-[13px] font-medium transition-transform active:scale-[0.97]">
              {on && <motion.span layoutId="haptic-pill" className="absolute inset-0 rounded-full bg-white/[0.14]" transition={{ type: "spring", stiffness: 380, damping: 30 }} />}
              <span className={`relative flex items-center gap-1.5 ${on ? "text-white" : "text-ink-3"}`}>
                {l.id === "off" ? null : <Icon name="vibrate" size={15} />}
                {l.label}
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-2 pl-1 text-[11.5px] text-ink-3">{note}{!hapticsSupported() && level !== "off" ? " · this device or browser has no vibration motor" : ""}</p>
    </div>
  );
}
