"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useRef, useState } from "react";
import { flushSync } from "react-dom";
import { CIcon, type CIconName } from "./icons";

export type Route = "keyless" | "offline" | "uncensored";
type Theme = "light" | "dark";

const MODES: { id: Route; icon: CIconName; title: string; sub: string }[] = [
  { id: "keyless", icon: "bolt", title: "Instant Keyless Cloud", sub: "Works immediately, zero setup" },
  { id: "offline", icon: "phone", title: "Private Offline Models", sub: "Runs directly on your phone's silicon" },
  { id: "uncensored", icon: "unlock", title: "Unfiltered & Uncensored", sub: "Zero refusals, complete creative freedom" },
];
const spring = { type: "spring", stiffness: 260, damping: 26 } as const;

/** Words that resolve from blur to sharp, one after another (CueDesign-style entrance). */
function BlurWords({ text, className, delay = 0 }: { text: string; className?: string; delay?: number }) {
  return (
    <h1 className={className}>
      {text.split(" ").map((w, i) => (
        <motion.span key={i} className="mr-[0.26em] inline-block" initial={{ opacity: 0, y: 10, filter: "blur(8px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} transition={{ duration: 0.8, delay: delay + i * 0.07, ease: [0.22, 1, 0.36, 1] }}>
          {w}
        </motion.span>
      ))}
    </h1>
  );
}

/** A slow, breathing prism: three blurred colour fields behind a glass core. */
function Orb() {
  return (
    <motion.div className="relative h-[230px] w-[230px]" animate={{ scale: [1, 1.04, 1] }} transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }} aria-hidden="true">
      <span className="orb-blob left-[4%] top-[8%] h-[62%] w-[62%]" style={{ background: "rgb(244 190 212 / 0.9)" }} />
      <span className="orb-blob right-[2%] top-[18%] h-[58%] w-[58%]" style={{ background: "rgb(246 214 168 / 0.9)", animationDelay: "-3s" }} />
      <span className="orb-blob bottom-[2%] left-[22%] h-[60%] w-[60%]" style={{ background: "rgb(176 218 192 / 0.95)", animationDelay: "-6s" }} />
      <span className="absolute inset-[22%] rounded-full bg-[color-mix(in_oklab,var(--surface)_55%,transparent)] shadow-[inset_0_1px_0_rgb(255_255_255/0.8),0_20px_50px_-18px_rgb(0_0_0/0.18)] backdrop-blur-xl" />
    </motion.div>
  );
}

export function Onboarding({ theme, onTheme, onDone }: { theme: Theme; onTheme: (t: Theme) => void; onDone: (r: Route) => void }) {
  const [step, setStep] = useState(0);
  const [route, setRoute] = useState<Route>("keyless");
  const [morph, setMorph] = useState(false);
  const last = step === 2;

  /** Real circular reveal from the tap point (View Transitions API); plain crossfade where unsupported. */
  const pickTheme = (t: Theme, e: React.MouseEvent) => {
    if (t === theme) return;
    const x = e.clientX;
    const y = e.clientY;
    const apply = () => flushSync(() => onTheme(t));
    const doc = document as Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void> } };
    if (!doc.startViewTransition || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return apply();
    const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    const vt = doc.startViewTransition(apply);
    void vt.ready.then(() => {
      document.documentElement.animate({ clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] }, { duration: 750, easing: "cubic-bezier(0.22, 1, 0.36, 1)", pseudoElement: "::view-transition-new(root)" });
    });
  };

  const finish = () => {
    setMorph(true);
    window.setTimeout(() => onDone(route), 820);
  };

  return (
    <motion.div className="absolute inset-0 z-[60] flex flex-col overflow-hidden bg-[var(--canvas)]" initial={false} animate={{ opacity: morph ? 0 : 1 }} transition={{ duration: 0.35, delay: morph ? 0.55 : 0 }} role="dialog" aria-modal="true" aria-label="Welcome to Apex">
      <div className="calm-glow" aria-hidden="true" />
      <div className="relative z-[1] flex items-center justify-between px-6 pt-[max(18px,env(safe-area-inset-top))]">
        <span className="text-[17px] font-medium tracking-[-0.025em]">Apex</span>
        {!last && (
          <button type="button" onClick={() => setStep(2)} className="rounded-full px-3 py-2 text-[13.5px] text-[rgb(var(--ink-rgb)/var(--ink-3-a))]">
            Skip
          </button>
        )}
      </div>

      <div className="relative z-[1] mx-auto flex w-full max-w-[460px] min-h-0 flex-1 flex-col px-6">
        <AnimatePresence mode="wait" initial={false}>
          {step === 0 && (
            <motion.section key="s0" className="flex flex-1 flex-col items-center justify-center text-center" exit={{ opacity: 0, filter: "blur(8px)", y: -10 }} transition={{ duration: 0.25 }}>
              <motion.div initial={{ opacity: 0, scale: 0.85, filter: "blur(14px)" }} animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }} transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}>
                <Orb />
              </motion.div>
              <BlurWords text="Intelligence that lives on your phone." className="mt-8 max-w-[14ch] text-[34px] font-normal leading-[1.08] tracking-[-0.03em]" delay={0.35} />
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.1, duration: 0.8 }} className="mt-4 max-w-[30ch] text-[15px] leading-relaxed text-[rgb(var(--ink-rgb)/var(--ink-3-a))]">
                Private, fast and quietly capable, with or without a connection.
              </motion.p>
            </motion.section>
          )}

          {step === 1 && (
            <motion.section key="s1" className="flex flex-1 flex-col justify-center" exit={{ opacity: 0, filter: "blur(8px)", y: -10 }} transition={{ duration: 0.25 }}>
              <BlurWords text="How do you want to begin?" className="mb-7 text-[30px] font-normal leading-[1.12] tracking-[-0.03em]" />
              <div className="flex flex-col gap-3" role="radiogroup" aria-label="How to run Apex">
                {MODES.map((m, i) => {
                  const on = route === m.id;
                  return (
                    <motion.button
                      key={m.id}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => setRoute(m.id)}
                      initial={{ opacity: 0, y: 34, scale: 0.97 }}
                      animate={{ opacity: on ? 1 : 0.78, y: 0, scale: on ? 1 : 0.985 }}
                      whileTap={{ scale: 0.97 }}
                      transition={{ ...spring, delay: 0.12 + i * 0.08 }}
                      className="flex items-center gap-4 rounded-[26px] bg-[var(--surface)] p-4 text-left"
                      style={{ boxShadow: on ? "var(--specular), var(--shadow-lift)" : "var(--specular), var(--shadow-card)" }}
                    >
                      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full transition-colors" style={{ background: on ? "var(--halo-a)" : "var(--surface-2)", color: on ? "var(--halo-ink)" : undefined }}>
                        <CIcon name={m.icon} size={21} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[16.5px] font-medium leading-snug tracking-[-0.02em]">{m.title}</span>
                        <span className="mt-0.5 block text-[13.5px] leading-snug text-[rgb(var(--ink-rgb)/var(--ink-3-a))]">{m.sub}</span>
                      </span>
                      <AnimatePresence initial={false}>
                        {on && (
                          <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={spring} className="text-[var(--halo-ink)]">
                            <CIcon name="check" size={20} />
                          </motion.span>
                        )}
                      </AnimatePresence>
                    </motion.button>
                  );
                })}
              </div>
            </motion.section>
          )}

          {step === 2 && (
            <motion.section key="s2" className="flex flex-1 flex-col justify-center" exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
              <BlurWords text="Pick your atmosphere." className="text-[30px] font-normal leading-[1.12] tracking-[-0.03em]" />
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }} className="mt-2 text-[15px] text-[rgb(var(--ink-rgb)/var(--ink-3-a))]">
                Tap to feel it change. You can switch any time.
              </motion.p>
              <div className="mt-8 flex justify-center">
                <div className="seg" role="radiogroup" aria-label="Appearance">
                  {([
                    ["light", "Warm Porcelain", "sun"],
                    ["dark", "Soft Carbon", "moon"],
                  ] as const).map(([id, label, icon]) => (
                    <button key={id} type="button" role="radio" aria-checked={theme === id} onClick={(e) => pickTheme(id, e)} className="!inline-flex items-center gap-2 !px-5">
                      {theme === id && <motion.span layoutId="onb-theme" className="seg-thumb" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
                      <CIcon name={icon} size={16} /> {label}
                    </button>
                  ))}
                </div>
              </div>
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.3 }} className="mx-auto mt-9 w-[78%]">
                <div className="rounded-[26px] bg-[var(--surface)] p-5 shadow-[var(--specular),var(--shadow-lift)]">
                  <p className="text-[12.5px] text-[rgb(var(--ink-rgb)/var(--ink-3-a))]">Hi there</p>
                  <p className="mt-1 text-[19px] leading-snug tracking-[-0.025em]">What do you want to do today?</p>
                  <div className="mt-4 h-9 rounded-full bg-[var(--surface-2)]" />
                </div>
              </motion.div>
            </motion.section>
          )}
        </AnimatePresence>
      </div>

      <div className="relative z-[1] flex flex-col items-center gap-5 px-6 pb-[max(20px,env(safe-area-inset-bottom))] pt-4">
        <div className="flex gap-1.5" aria-label={`Step ${step + 1} of 3`}>
          {[0, 1, 2].map((i) => (
            <motion.button key={i} type="button" aria-label={`Go to step ${i + 1}`} onClick={() => setStep(i)} className="h-1.5 rounded-full bg-[rgb(var(--ink-rgb))]" animate={{ width: step === i ? 22 : 6, opacity: step === i ? 0.85 : 0.2 }} transition={spring} />
          ))}
        </div>
        <div className="relative h-[54px] w-full max-w-[460px]">
          <motion.button
            type="button"
            onClick={last ? finish : () => setStep(step + 1)}
            className="absolute bottom-0 left-1/2 flex items-center justify-center overflow-hidden bg-[#18181b] text-[15px] font-medium text-white"
            initial={false}
            animate={morph ? { width: "100%", height: 124, borderRadius: 28, y: 0, backgroundColor: "#ffffff", color: "#8a8a90" } : { width: last ? 200 : 150, height: 54, borderRadius: 27, x: "-50%" }}
            style={{ x: "-50%" }}
            transition={{ type: "spring", stiffness: 210, damping: 26 }}
            whileTap={morph ? undefined : { scale: 0.96 }}
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.span key={morph ? "ask" : last ? "go" : "next"} initial={{ opacity: 0, filter: "blur(4px)" }} animate={{ opacity: 1, filter: "blur(0px)" }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className={morph ? "absolute left-5 top-4 text-[15.5px] font-normal" : ""}>
                {morph ? "Ask anything..." : last ? "Start chatting" : "Continue"}
              </motion.span>
            </AnimatePresence>
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
}
