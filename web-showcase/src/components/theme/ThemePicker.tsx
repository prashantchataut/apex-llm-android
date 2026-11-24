"use client";

import { AnimatePresence, motion, type PanInfo } from "framer-motion";
import { useEffect, type CSSProperties } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";
import { FanStack } from "@/components/ui/FanStack";
import { MODES, THEMES, type Mode, type ModePref, type ThemeMeta } from "@/lib/themes";
import { useTheme } from "./ThemeProvider";

const SPRING = { type: "spring", stiffness: 380, damping: 30 } as const;
const MODE_ICON: Record<ModePref, IconName> = { system: "monitor", light: "sun", dark: "moon" };

/** Segmented System / Light / Dark control with a spring-sliding pill. */
export function ModeControl({ id = "mode" }: { id?: string }) {
  const { mode, setMode } = useTheme();
  return (
    <div role="radiogroup" aria-label="Colour mode" className="glass-dark relative flex rounded-full p-1">
      {MODES.map((m) => {
        const on = m.id === mode;
        return (
          <button
            key={m.id}
            role="radio"
            aria-checked={on}
            onClick={() => setMode(m.id)}
            className="relative flex h-11 flex-1 items-center justify-center gap-2 rounded-full text-[13px] font-medium transition-transform active:scale-[0.97]"
          >
            {on && <motion.span layoutId={`${id}-pill`} className="absolute inset-0 rounded-full bg-white/[0.14]" transition={SPRING} />}
            <span className={`relative flex items-center gap-1.5 ${on ? "text-white" : "text-ink-3"}`}>
              <Icon name={MODE_ICON[m.id]} size={16} />
              {m.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Miniature of a theme rendered with that theme's own tokens (the preview element carries data-theme/data-mode). */
function Swatch({ t, mode }: { t: ThemeMeta; mode: Mode }) {
  const grid = t.archetype === "C";
  return (
    <div
      data-theme={t.id}
      data-mode={mode}
      className="relative h-[104px] overflow-hidden"
      style={{ background: "var(--canvas)", borderRadius: "calc(var(--r-card) * 0.7)", border: "1px solid var(--hairline-strong)" } as CSSProperties}
      aria-hidden="true"
    >
      <div className="absolute inset-x-0 top-0 h-3/5" style={{ opacity: "var(--aurora-strength)", background: "radial-gradient(70% 90% at 20% -10%, var(--au-1), transparent 70%), radial-gradient(60% 80% at 90% 0%, var(--au-2), transparent 70%)" }} />
      {grid && (
        <>
          <span className="absolute inset-y-0 left-1/3 w-px" style={{ background: "var(--grid-line)" }} />
          <span className="absolute inset-y-0 left-2/3 w-px" style={{ background: "var(--grid-line)" }} />
          <span className="absolute inset-x-0 top-[38%] h-px" style={{ background: "var(--grid-line)" }} />
          <span className="absolute left-1/3 top-[38%] -translate-x-1/2 -translate-y-1/2 text-[11px] leading-none" style={{ color: "rgb(var(--ink-rgb) / .8)" }}>+</span>
          <span className="absolute left-2/3 top-[38%] -translate-x-1/2 -translate-y-1/2 text-[11px] leading-none" style={{ color: "rgb(var(--ink-rgb) / .8)" }}>+</span>
        </>
      )}
      <div className="absolute inset-x-2.5 bottom-2.5 p-2" style={{ background: "var(--surface)", border: "1px solid var(--hairline)", borderRadius: "calc(var(--r-card) * 0.4)", boxShadow: "inset 0 1px 0 var(--card-hi)" }}>
        <div className="h-1.5 w-2/3 rounded-full" style={{ background: "rgb(var(--ink-rgb) / .85)" }} />
        <div className="mt-1.5 h-1.5 w-1/2 rounded-full" style={{ background: "rgb(var(--ink-rgb) / .3)" }} />
        <div className="absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full" style={{ background: "var(--accent)" }} />
      </div>
    </div>
  );
}

/** Theme grid + mode control. Used by the Appearance sheet and by onboarding. */
export function ThemePicker({ compact = false }: { compact?: boolean }) {
  const { theme, setTheme, resolved } = useTheme();
  return (
    <div className="space-y-4">
      <ModeControl id={compact ? "mode-c" : "mode"} />
      <div role="radiogroup" aria-label="Theme" className="grid grid-cols-2 gap-3">
        {THEMES.map((t) => {
          const on = t.id === theme;
          return (
            <motion.button
              key={t.id}
              role="radio"
              aria-checked={on}
              onClick={() => setTheme(t.id)}
              whileTap={{ scale: 0.97 }}
              transition={SPRING}
              className="relative rounded-[22px] p-1.5 text-left"
            >
              {on && <motion.span layoutId={compact ? "theme-ring-c" : "theme-ring"} className="absolute inset-0 rounded-[22px] border-2 border-accent" transition={SPRING} />}
              <Swatch t={t} mode={resolved} />
              <div className="flex items-center justify-between gap-2 px-1.5 pb-1.5 pt-2.5">
                <div className="min-w-0">
                  <div className="truncate text-[14px] font-semibold tracking-tight">{t.name}</div>
                  <div className="truncate text-[11.5px] text-ink-3">{t.tagline}</div>
                </div>
                <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full transition-all ${on ? "scale-100 bg-accent text-black opacity-100" : "scale-50 opacity-0"}`}>
                  <Icon name="check" size={12} strokeWidth={3} />
                </span>
              </div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

/** Bottom sheet (spring in, drag-down to dismiss). `inline` anchors to the nearest positioned ancestor (phone frame). */
export function ThemeSheet({ open, onClose, inline = false, onReplayOnboarding }: { open: boolean; onClose: () => void; inline?: boolean; onReplayOnboarding?: () => void }) {
  const { theme, resolved } = useTheme();
  const meta = THEMES.find((t) => t.id === theme) ?? THEMES[0];

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > 110 || info.velocity.y > 600) onClose();
  };
  const pos = inline ? "absolute" : "fixed";

  return (
    <AnimatePresence>
      {open && (
        <div className={`${pos} inset-0 z-[80] flex items-end justify-center sm:items-center`} role="dialog" aria-modal="true" aria-label="Appearance">
          <motion.button
            aria-label="Close appearance"
            className="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="relative flex max-h-[88%] w-full max-w-[460px] flex-col overflow-hidden rounded-t-[32px] border border-white/[0.12] bg-surface shadow-[0_-20px_80px_rgba(0,0,0,0.45)] sm:rounded-[32px]"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 340, damping: 32, mass: 0.9 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.4 }}
            onDragEnd={onDragEnd}
          >
            <div className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-white/25" aria-hidden="true" />
            <div className="flex items-center justify-between px-5 pb-1 pt-3">
              <div>
                <div className="mono text-[10.5px] uppercase tracking-[0.18em] text-ink-3">Settings</div>
                <h2 className="display text-[28px]">Appearance</h2>
              </div>
              <button onClick={onClose} aria-label="Close" className="grid h-11 w-11 place-items-center rounded-full bg-white/10 transition-transform active:scale-[0.97]">
                <Icon name="x" size={18} />
              </button>
            </div>
            <div className="scroll-hide min-h-0 flex-1 overflow-y-auto px-5 pb-8 pt-4">
              <FanStack
                cards={[
                  { label: "Theme", value: meta.name },
                  { label: "Mode", value: resolved === "dark" ? "Dark" : "Light" },
                  { label: "Look", value: meta.archetype },
                ]}
              >
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-2">Live preview</div>
                <div className="mt-0.5 text-[20px] font-semibold tracking-tight">{meta.name}</div>
                <div className="text-[13px] text-ink-2">{meta.tagline}</div>
              </FanStack>
              <div className="mt-6">
                <ThemePicker />
              </div>
              {onReplayOnboarding && (
                <button onClick={onReplayOnboarding} className="bento mt-5 flex min-h-[56px] w-full items-center gap-3 px-4 text-left transition-transform active:scale-[0.97]">
                  <span className="icon-pill">
                    <Icon name="play" size={15} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-semibold tracking-tight">Replay onboarding</span>
                    <span className="block text-[11.5px] text-ink-3">Awakening, silicon scan, looks and key ignition</span>
                  </span>
                </button>
              )}
              <p className="mt-5 text-[12px] leading-relaxed text-ink-3">Saved on this device. “System” follows your phone’s light or dark setting.</p>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
