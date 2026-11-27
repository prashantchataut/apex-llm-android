"use client";

import { OnboardingHero } from "./OnboardingHero";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { verifyKey, type Verdict } from "@/lib/access";
import { activateModel, dlOf, startDownload, useDownloadStore } from "@/lib/downloader";
import { CATALOG } from "@/lib/models";
import { setChoice } from "@/lib/store";
import { CIcon, type CIconName } from "./icons";
import { StatusBadge } from "./AccessKeyModal";

type Theme = "light" | "dark";

const spring = { type: "spring", stiffness: 260, damping: 26 } as const;
const dim = "text-[rgb(var(--ink-rgb)/var(--ink-3-a))]";

/** Everything is built in. Nothing here is a mode to pick between. */
const BUILT_IN: { icon: CIconName; label: string }[] = [
  { icon: "unlock", label: "Uncensored models" },
  { icon: "tree", label: "Persistent memory" },
  { icon: "plug", label: "MCP & Skills" },
  { icon: "mic", label: "Voice" },
  { icon: "image", label: "Image Studio" },
];

/** Starter local models (sizes verified in the catalog). One tap downloads, loads and sets it as the active engine. */
const STARTERS = [
  { id: "smollm2-135m", tag: "Instant", sub: "Tiny and quick, runs on any phone" },
  { id: "qwen25-05b", tag: "Balanced", sub: "Everyday assistant, best first pick" },
  { id: "qwen25-05b-abl", tag: "Uncensored", sub: "Abliterated, zero refusals" },
] as const;

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
    <motion.div className="relative h-[190px] w-[190px]" animate={{ scale: [1, 1.04, 1] }} transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }} aria-hidden="true">
      <span className="orb-blob left-[4%] top-[8%] h-[62%] w-[62%]" style={{ background: "rgb(244 190 212 / 0.9)" }} />
      <span className="orb-blob right-[2%] top-[18%] h-[58%] w-[58%]" style={{ background: "rgb(246 214 168 / 0.9)", animationDelay: "-3s" }} />
      <span className="orb-blob bottom-[2%] left-[22%] h-[60%] w-[60%]" style={{ background: "rgb(176 218 192 / 0.95)", animationDelay: "-6s" }} />
      <span className="absolute inset-[22%] rounded-full bg-[color-mix(in_oklab,var(--surface)_55%,transparent)] shadow-[inset_0_1px_0_rgb(255_255_255/0.8),0_20px_50px_-18px_rgb(0_0_0/0.18)] backdrop-blur-xl" />
    </motion.div>
  );
}

interface Device {
  ram: number | null;
  cores: number;
  freeGB: number | null;
}
/** Best-effort hardware profile from web APIs (navigator.deviceMemory is rounded and capped at 8 GB). */
function useDevice(): Device {
  const [d, setD] = useState<Device>({ ram: null, cores: 0, freeGB: null });
  useEffect(() => {
    const nav = navigator as Navigator & { deviceMemory?: number };
    setD((p) => ({ ...p, ram: nav.deviceMemory ?? null, cores: nav.hardwareConcurrency || 0 }));
    void navigator.storage?.estimate?.().then((e) => {
      if (e.quota) setD((p) => ({ ...p, freeGB: Math.max(0, (e.quota ?? 0) - (e.usage ?? 0)) / 1e9 }));
    });
  }, []);
  return d;
}

const mbOf = (b: number) => (b / 1e6).toFixed(b >= 1e8 ? 0 : 1);

export function Onboarding({ theme, onTheme, onDone }: { theme: Theme; onTheme: (t: Theme) => void; onDone: () => void }) {
  const [step, setStep] = useState(0);
  const [morph, setMorph] = useState(false);
  const [pick, setPick] = useState<string>("qwen25-05b");
  const [started, setStarted] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<string | null>(null);
  const [loadErr, setLoadErr] = useState("");
  const [keyOpen, setKeyOpen] = useState(false);
  const [keyVal, setKeyVal] = useState("");
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [keyBusy, setKeyBusy] = useState(false);
  const dev = useDevice();
  const dl = useDownloadStore();
  const picked = useRef(false);
  const last = step === 2;

  // Pre-select the starter that fits the phone (the user can still choose any of the three).
  useEffect(() => {
    if (picked.current || dev.ram === null) return;
    setPick(dev.ram <= 2 ? "smollm2-135m" : "qwen25-05b");
  }, [dev.ram]);

  const model = CATALOG.find((m) => m.id === pick);
  const item = started ? dlOf(dl, started) : dlOf(dl, pick);

  // Once the file is on disk: hand it to the inference engine and make it the active model.
  useEffect(() => {
    if (!started || loaded === started || dlOf(dl, started).status !== "done") return;
    setChoice({ kind: "local", id: started });
    void activateModel(started).then(() => setLoaded(started)).catch((e) => setLoadErr(e instanceof Error ? e.message : "Couldn't load the model yet. It will load on your first message."));
  }, [dl, started, loaded]);

  /** Live key check while typing (debounced); saved only on explicit unlock. */
  useEffect(() => {
    const k = keyVal.trim();
    if (k.length < 4) {
      setVerdict(null);
      return;
    }
    setKeyBusy(true);
    const t = window.setTimeout(() => void verifyKey(k).then((v) => { setVerdict(v); setKeyBusy(false); }), 450);
    return () => window.clearTimeout(t);
  }, [keyVal]);

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
    window.setTimeout(onDone, 820);
  };
  const workspace = () => {
    setMorph(true);
    window.setTimeout(onDone, 500);
  };

  const begin = () => {
    setLoadErr("");
    setStarted(pick);
    void startDownload(pick);
  };
  const downloading = !!started && item.status !== "done";
  const ready = !!started && item.status === "done";
  const pct = item.total ? Math.min(100, (item.loaded / item.total) * 100) : 0;

  const cta = step === 1 ? (started ? (ready ? "Continue" : "Continue in background") : "Download & Load Now") : last ? "Start chatting" : "Continue";
  const onCta = last ? finish : step === 1 && !started ? begin : () => setStep(step + 1);
  const ctaW = step === 1 ? 260 : last ? 200 : 150;

  return (
    <motion.div className="absolute inset-0 z-[60] flex flex-col overflow-hidden bg-[var(--canvas)]" initial={false} animate={{ opacity: morph ? 0 : 1 }} transition={{ duration: 0.35, delay: morph ? 0.55 : 0 }} role="dialog" aria-modal="true" aria-label="Welcome to Apex Local AI Studio">
      <div className="calm-glow" aria-hidden="true" />
      <div className="relative z-[1] flex items-center justify-between px-6 pt-safe-lg">
        <span className="text-[17px] font-medium tracking-[-0.025em]">Apex</span>
        {!last && (
          <button type="button" onClick={workspace} className={`rounded-full px-3 py-2 text-[13.5px] ${dim}`}>
            Skip
          </button>
        )}
      </div>

      <div className="scroll-quiet relative z-[1] mx-auto flex min-h-0 w-full max-w-[460px] flex-1 flex-col overflow-y-auto px-6">
        <AnimatePresence mode="wait" initial={false}>
          {step === 0 && (
            <motion.section key="s0" className="flex flex-1 flex-col items-center justify-center py-4 text-center" exit={{ opacity: 0, filter: "blur(8px)", y: -10 }} transition={{ duration: 0.25 }}>
              <OnboardingHero dim={dim} />
            </motion.section>
          )}

          {step === 1 && (
            <motion.section key="s1" className="flex flex-1 flex-col justify-center py-3" exit={{ opacity: 0, filter: "blur(8px)", y: -10 }} transition={{ duration: 0.25 }}>
              <BlurWords text="Your phone, your model." className="text-[28px] font-normal leading-[1.1] tracking-[-0.03em]" />
              <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.2 }} className="mt-4 grid grid-cols-3 gap-2" aria-label="Detected hardware">
                {[
                  ["Memory", dev.ram ? `${dev.ram >= 8 ? "8+" : dev.ram} GB` : "—"],
                  ["CPU cores", dev.cores ? String(dev.cores) : "—"],
                  ["Free space", dev.freeGB !== null ? `${dev.freeGB >= 10 ? Math.round(dev.freeGB) : dev.freeGB.toFixed(1)} GB` : "—"],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-[20px] bg-[var(--surface)] px-3 py-2.5 shadow-[var(--specular),var(--shadow-card)]">
                    <p className={`text-[11.5px] ${dim}`}>{k}</p>
                    <p className="tnum mt-0.5 text-[17px] font-medium tracking-[-0.02em]">{v}</p>
                  </div>
                ))}
              </motion.div>
              <p className={`mt-4 text-[13px] ${dim}`}>Pick a starter. It downloads once, stays on this device and answers offline.</p>
              <div className="mt-3 flex flex-col gap-2" role="radiogroup" aria-label="Starter model">
                {STARTERS.map((s, i) => {
                  const m = CATALOG.find((x) => x.id === s.id);
                  if (!m) return null;
                  const on = pick === s.id;
                  const rec = s.id === (dev.ram !== null && dev.ram <= 2 ? "smollm2-135m" : "qwen25-05b");
                  return (
                    <motion.button
                      key={s.id}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      disabled={!!started}
                      onClick={() => {
                        picked.current = true;
                        setPick(s.id);
                      }}
                      initial={{ opacity: 0, y: 24 }}
                      animate={{ opacity: on || started === s.id ? 1 : started ? 0.45 : 0.82, y: 0 }}
                      whileTap={{ scale: 0.98 }}
                      transition={{ ...spring, delay: 0.25 + i * 0.07 }}
                      className="flex items-center gap-3.5 rounded-[24px] bg-[var(--surface)] p-3.5 text-left"
                      style={{ boxShadow: on ? "var(--specular), var(--shadow-lift)" : "var(--specular), var(--shadow-card)" }}
                    >
                      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full transition-colors" style={{ background: on ? "var(--halo-a)" : "var(--surface-2)", color: on ? "var(--halo-ink)" : undefined }}>
                        <CIcon name={s.id.endsWith("abl") ? "unlock" : "cube"} size={19} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2 text-[15px] font-medium tracking-[-0.015em]">
                          <span className="truncate">{m.name.replace(" Instruct", "").replace(" · Instant Nano", "")}</span>
                          {rec && <span className="shrink-0 rounded-full bg-[var(--halo-a)] px-2 py-0.5 text-[10.5px] font-medium text-[var(--halo-ink)]">Recommended</span>}
                        </span>
                        <span className={`mt-0.5 block text-[12.5px] leading-snug ${dim}`}>{s.tag} · {Math.round(m.sizeGB * 1000)} MB · {s.sub}</span>
                      </span>
                      {on && <CIcon name="check" size={18} className="shrink-0 text-[var(--halo-ink)]" />}
                    </motion.button>
                  );
                })}
              </div>
              <AnimatePresence initial={false}>
                {started && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden" aria-live="polite">
                    <div className="mt-4">
                      <div className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-2)]" role="progressbar" aria-valuenow={Math.round(ready ? 100 : pct)} aria-valuemin={0} aria-valuemax={100}>
                        <motion.div className="h-full rounded-full bg-[var(--accent)]" animate={{ width: `${ready ? 100 : pct}%` }} transition={{ ease: "easeOut", duration: 0.4 }} />
                      </div>
                      <p className="tnum mt-2 text-[12.5px]">
                        {item.status === "error"
                          ? item.error ?? "Download failed. Retry from Model Hub."
                          : ready
                            ? loaded === started
                              ? `${CATALOG.find((m) => m.id === started)?.name.split("·")[0].trim()} is loaded and ready, fully offline.`
                              : loadErr || "Downloaded. Loading into memory…"
                            : `${mbOf(item.loaded)} / ${item.total ? mbOf(item.total) : "…"} MB${item.mbps ? ` · ${item.mbps.toFixed(1)} MB/s` : ""}`}
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.section>
          )}

          {step === 2 && (
            <motion.section key="s2" className="flex flex-1 flex-col justify-center py-3" exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
              <BlurWords text="Pick your atmosphere." className="text-[28px] font-normal leading-[1.1] tracking-[-0.03em]" />
              <div className="mt-6 flex justify-center">
                <div className="seg" role="radiogroup" aria-label="Appearance">
                  {([
                    ["dark", "Obsidian Dark", "moon"],
                    ["light", "Porcelain Light", "sun"],
                  ] as const).map(([id, label, icon]) => (
                    <button key={id} type="button" role="radio" aria-checked={theme === id} onClick={(e) => pickTheme(id, e)} className="!inline-flex items-center gap-2 !px-4">
                      {theme === id && <motion.span layoutId="onb-theme" className="seg-thumb" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
                      <CIcon name={icon} size={16} /> {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-6 rounded-[24px] bg-[var(--surface)] p-4 shadow-[var(--specular),var(--shadow-card)]">
                <p className="text-[14px] font-medium tracking-[-0.01em]">You already have everything local.</p>
                <p className={`mt-1 text-[13px] leading-relaxed ${dim}`}>Local and uncensored models, memory, skills, voice and Image Studio need no key. An Apex API key only adds cloud models on top.</p>
              </div>

              <div className="mt-3 rounded-[24px] bg-[var(--surface)] shadow-[var(--specular),var(--shadow-card)]">
                <button type="button" aria-expanded={keyOpen} onClick={() => setKeyOpen((o) => !o)} className="flex min-h-[56px] w-full items-center gap-3 px-4 text-left">
                  <CIcon name="key" size={17} className="shrink-0 opacity-60" />
                  <span className="flex-1 text-[13.5px] leading-snug">Have an Apex API Key? <span className={dim}>Enter it here (Optional)</span></span>
                  <motion.span animate={{ rotate: keyOpen ? 180 : 0 }} className="opacity-50"><CIcon name="chevron" size={15} /></motion.span>
                </button>
                <AnimatePresence initial={false}>
                  {keyOpen && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.28 }} className="overflow-hidden">
                      <div className="px-4 pb-4">
                        <input className="calm-field !rounded-full !font-mono" value={keyVal} onChange={(e) => setKeyVal(e.target.value)} placeholder="Paste your Apex API key" autoComplete="off" autoCapitalize="off" spellCheck={false} aria-label="Apex API key" />
                        <div className="mt-2.5 flex min-h-8 items-center justify-between gap-2">
                          {keyBusy && keyVal.trim().length >= 4 ? (
                            <StatusBadge state="checking">Checking…</StatusBadge>
                          ) : verdict && verdict.state !== "none" ? (
                            <StatusBadge state={verdict.state}>{verdict.state === "active" ? "Active · Verified" : verdict.state === "invalid" || verdict.state === "revoked" ? "Invalid / Revoked by Admin" : verdict.message}</StatusBadge>
                          ) : (
                            <span className={`text-[12.5px] ${dim}`}>Checked live against the admin registry.</span>
                          )}
                          {verdict?.state === "active" && (
                            <button type="button" className="calm-btn" data-primary="true" onClick={() => void verifyKey(keyVal, true).then((v) => { setVerdict(v.state === "active" ? { ...v, message: "Saved · Apex API unlocked" } : v); })}>
                              Unlock
                            </button>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.section>
          )}
        </AnimatePresence>
      </div>

      <div className="relative z-[1] flex flex-col items-center gap-3 px-6 pb-safe-lg pt-3">
        <div className="flex gap-1.5" aria-label={`Step ${step + 1} of 3`}>
          {[0, 1, 2].map((i) => (
            <motion.button key={i} type="button" aria-label={`Go to step ${i + 1}`} onClick={() => setStep(i)} className="h-1.5 rounded-full bg-[rgb(var(--ink-rgb))]" animate={{ width: step === i ? 22 : 6, opacity: step === i ? 0.85 : 0.2 }} transition={spring} />
          ))}
        </div>
        <div className="relative h-[54px] w-full max-w-[460px]">
          <motion.button
            type="button"
            onClick={onCta}
            disabled={step === 1 && downloading && item.status === "error"}
            className="absolute bottom-0 left-1/2 flex items-center justify-center overflow-hidden text-[15px] font-medium"
            initial={false}
            animate={morph ? { width: "100%", height: 124, borderRadius: 28, y: 0, backgroundColor: theme === "dark" ? "#161618" : "#ffffff", color: "#8a8a90" } : { width: ctaW, height: 54, borderRadius: 27, x: "-50%", backgroundColor: theme === "dark" ? "#ececf0" : "#18181b", color: theme === "dark" ? "#18181b" : "#fafafa" }}
            style={{ x: "-50%" }}
            transition={{ type: "spring", stiffness: 210, damping: 26 }}
            whileTap={morph ? undefined : { scale: 0.96 }}
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.span key={morph ? "ask" : cta} initial={{ opacity: 0, filter: "blur(4px)" }} animate={{ opacity: 1, filter: "blur(0px)" }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className={morph ? "absolute left-5 top-4 text-[15.5px] font-normal" : "inline-flex items-center gap-2"}>
                {morph ? "Ask anything..." : (<>{step === 1 && !started && <CIcon name="download" size={17} />}{cta}</>)}
              </motion.span>
            </AnimatePresence>
          </motion.button>
        </div>
        {step === 1 && !started && (
          <button type="button" onClick={workspace} className={`min-h-9 rounded-full px-3 text-[13.5px] ${dim}`}>
            Skip to Workspace (Download Later)
          </button>
        )}
      </div>
    </motion.div>
  );
}
