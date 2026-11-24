"use client";

import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { useState, type PointerEvent } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";

/** Spring used for every physical motion on the page (stiffness 260–420, damping 24–32). */
const SPRING = { stiffness: 340, damping: 28, mass: 0.9 } as const;

interface Arch {
  key: "A" | "B" | "C" | "D";
  theme: "obsidian" | "visionos" | "swiss" | "reasoning";
  mode: "dark" | "light";
  icon: IconName;
  kicker: string;
  title: string;
  body: string;
}

const CARDS: Arch[] = [
  { key: "A", theme: "obsidian", mode: "dark", icon: "cpu", kicker: "On-device", title: "Runs on your phone. Not a server.", body: "Every model is sized to your hardware before you download." },
  { key: "B", theme: "visionos", mode: "dark", icon: "server", kicker: "Local API", title: "Your phone becomes an API.", body: "Point Cursor or Continue at it. Keys never leave the device." },
  { key: "C", theme: "swiss", mode: "light", icon: "prism", kicker: "Reasoning", title: "Thinking you can actually read.", body: "A live timeline for every thought. Math renders cleanly." },
  { key: "D", theme: "reasoning", mode: "dark", icon: "swatch", kicker: "Yours", title: "Make it yours, edge to edge.", body: "Six themes. Light and dark. Down to the status bar." },
];

function Tilt({ card, index, open }: { card: Arch; index: number; open: boolean }) {
  const rx = useMotionValue(0);
  const ry = useMotionValue(0);
  const sx = useSpring(rx, SPRING);
  const sy = useSpring(ry, SPRING);
  const glow = useTransform(sy, [-10, 10], ["30%", "70%"]);

  const move = (e: PointerEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    ry.set(((e.clientX - r.left) / r.width - 0.5) * 20);
    rx.set(-((e.clientY - r.top) / r.height - 0.5) * 20);
  };
  const reset = () => {
    rx.set(0);
    ry.set(0);
  };

  return (
    <motion.article
      data-theme={card.theme}
      data-mode={card.mode}
      onPointerMove={move}
      onPointerLeave={reset}
      onPointerCancel={reset}
      initial={false}
      animate={{ y: open ? 0 : index * -6, scale: open ? 1 : 1 - index * 0.015 }}
      transition={{ type: "spring", ...SPRING }}
      style={{ rotateX: sx, rotateY: sy, transformPerspective: 900, ["--glow-x" as string]: glow }}
      className="group relative flex min-h-[320px] flex-col justify-between overflow-hidden rounded-[28px] border border-[color:var(--hairline,rgb(255_255_255/0.14))] bg-canvas p-6 text-ink will-change-transform"
    >
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-70" style={{ background: "radial-gradient(120% 80% at var(--glow-x) 0%, color-mix(in srgb, var(--accent) 38%, transparent), transparent 60%)" }} />
      <div className="relative flex items-center justify-between">
        <span className="mono text-[11px] uppercase tracking-[0.18em] text-ink-3">{card.kicker}</span>
        <span className="mono grid h-8 w-8 place-items-center rounded-full border border-current/20 text-[12px] text-ink-2">{card.key}</span>
      </div>
      <div className="relative">
        <span className="icon-pill mb-6 transition-transform duration-300 group-hover:-translate-y-1">
          <Icon name={card.icon} size={18} />
        </span>
        <h3 className="display text-[26px] leading-[1.05]">{card.title}</h3>
        <p className="mt-3 text-[14.5px] leading-snug text-ink-2">{card.body}</p>
      </div>
    </motion.article>
  );
}

/** Four archetype cards. Pointer-tilt on desktop; tap the header to fan the stack on touch. */
export function Archetypes() {
  const [open, setOpen] = useState(true);
  return (
    <div>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-pressed={open} className="mono mb-6 flex h-11 items-center gap-2 rounded-full border border-white/15 px-4 text-[12px] uppercase tracking-[0.14em] text-ink-2 active:scale-95">
        {open ? "Stack" : "Spread"}
      </button>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" style={{ perspective: 1200 }}>
        {CARDS.map((c, i) => (
          <Tilt key={c.key} card={c} index={i} open={open} />
        ))}
      </div>
    </div>
  );
}
