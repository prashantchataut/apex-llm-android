"use client";

import { AnimatePresence, motion, useMotionValue, useSpring, type Variants } from "framer-motion";
import { useCallback, useEffect, useMemo, useState, type PointerEvent, type ReactNode } from "react";
import { ApexLogo } from "@/components/brand/ApexLogo";
import { Icon, type IconName } from "@/components/ui/Icon";
import { RippleButton } from "@/components/ui/Glass";
import { SiliconScan } from "@/components/ui/SiliconScan";
import { Crosshair } from "@/components/ui/Swiss";
import { useTheme } from "@/components/theme/ThemeProvider";
import { BADGE, DEVICES, GIB, recommend, score, type Compat, type DeviceProfile } from "@/lib/compat";
import { bestMedia, mediaTotalGB, scoreMedia } from "@/lib/media";
import { CATALOG, kvFor, VOICE_MODELS } from "@/lib/models";
import { invokeNative } from "@/lib/native";
import type { OnboardingState, UseCase } from "@/lib/prefs";
import type { ModePref, ThemeId } from "@/lib/themes";
import type { Downloads } from "./useDownloads";
import type { KeyRec } from "./ServerScreen";

/** Every onboarding motion shares one spring: physical, quick, no wobble. */
const SPRING = { type: "spring", stiffness: 320, damping: 26 } as const;
const EXPO = [0.22, 1, 0.36, 1] as const;

const SCENES = ["awaken", "silicon", "taste", "ignite"] as const;
type Scene = (typeof SCENES)[number];

/* ───────────────────────── model recommendations (unchanged logic) ───────────────────────── */
interface Rec {
  id: string;
  kind: "Language" | "Image" | "Video" | "Voice";
  title: string;
  sub: string;
  gb: number;
  compat: Compat;
}

/** Picks one model per chosen use case — the largest that fits comfortably. */
export function buildRecs(uses: UseCase[], dev: DeviceProfile): Rec[] {
  const out: Rec[] = [];
  const ctx = Math.min(4096, recommend(dev).maxCtx);
  const scored = CATALOG.map((m) => ({ m, c: score(dev, m.sizeGB * GIB, kvFor(m, ctx)) }));
  const fit = scored.filter((x) => x.c === "optimal").sort((a, b) => b.m.sizeGB - a.m.sizeGB)[0] ?? scored.filter((x) => x.c === "heavy").sort((a, b) => a.m.sizeGB - b.m.sizeGB)[0];
  const wantsText = uses.some((u) => u === "chat" || u === "code" || u === "server") || uses.length === 0;
  if (wantsText && fit) out.push({ id: fit.m.id, kind: "Language", title: fit.m.name, sub: `${fit.m.quant} · ${fit.m.sizeGB.toFixed(2)} GB`, gb: fit.m.sizeGB, compat: fit.c });
  for (const k of ["image", "video"] as const) {
    if (!uses.includes(k)) continue;
    const m = bestMedia(dev, k);
    if (m) out.push({ id: m.id, kind: k === "image" ? "Image" : "Video", title: m.name, sub: m.output, gb: mediaTotalGB(m), compat: scoreMedia(dev, m) });
  }
  if (uses.includes("voice")) {
    const v = VOICE_MODELS[0];
    out.push({ id: v.id, kind: "Voice", title: v.name, sub: v.note, gb: v.mb / 1024, compat: "optimal" });
  }
  return out;
}

/* ───────────────────────── choices ───────────────────────── */
export const LOOKS: { id: string; theme: ThemeId; mode: ModePref; name: string; note: string; preview: { theme: ThemeId; mode: "light" | "dark" } }[] = [
  { id: "aurora", theme: "obsidian", mode: "dark", name: "Obsidian Aurora", note: "OLED black, violet glow", preview: { theme: "obsidian", mode: "dark" } },
  { id: "glass", theme: "visionos", mode: "dark", name: "VisionOS Spatial Glass", note: "Frosted, cool blue", preview: { theme: "visionos", mode: "dark" } },
  { id: "swiss", theme: "swiss", mode: "light", name: "Swiss Grid", note: "Hairlines, signal red", preview: { theme: "swiss", mode: "light" } },
  { id: "day", theme: "paper", mode: "system", name: "Adaptive Daylight", note: "Warm paper, follows your phone", preview: { theme: "paper", mode: "light" } },
];

const FLOWS: { id: string; use: UseCase; label: string; hint: string; icon: IconName }[] = [
  { id: "reason", use: "chat", label: "Local Reasoning & Math", hint: "Think blocks, LaTeX, quizzes", icon: "chat" },
  { id: "code", use: "code", label: "Offline Code & GitHub", hint: "Repo-aware, nothing uploaded", icon: "code" },
  { id: "lan", use: "server", label: "LAN Ollama Server for PC", hint: "Serve :11434 to your laptop", icon: "server" },
  { id: "voice", use: "voice", label: "Parakeet Voice Assistant", hint: "Tiny on-device dictation", icon: "mic" },
];

const COPY: Record<Exclude<Scene, "awaken">, { title: [string, string]; body: string }> = {
  silicon: { title: ["Reading", "this silicon."], body: "Memory, cores and accelerators decide which models run well." },
  taste: { title: ["Make it", "yours."], body: "Tap a look. The whole canvas morphs live. Then pick how you’ll use Apex." },
  ignite: { title: ["Ignite", "your key."], body: "A private key for your PC, plus models queued for your hardware." },
};

/* ───────────────────────── motion helpers ───────────────────────── */
const blurIn = (to = 1): Variants => ({
  hidden: { opacity: 0, y: 18, filter: "blur(10px)" },
  show: (i: number = 0) => ({ opacity: to, y: 0, filter: "blur(0px)", transition: { ...SPRING, delay: 0.12 + i * 0.09 } }),
});

function Reveal({ i = 0, to = 1, className = "", children }: { i?: number; to?: number; className?: string; children: ReactNode }) {
  return (
    <motion.div variants={blurIn(to)} custom={i} initial="hidden" animate="show" className={className}>
      {children}
    </motion.div>
  );
}

const VX = [0, 25, 50, 75, 100];
const HY = [14, 34, 58, 82];

/** Exposed Swiss grid: hairlines draw in (stroke-dashoffset via pathLength), then `+` crosshairs pop at every intersection. */
function OnboardGrid({ dim }: { dim: boolean }) {
  return (
    <motion.div className="pointer-events-none absolute inset-0" animate={{ opacity: dim ? 0.5 : 1 }} transition={{ duration: 0.7, ease: EXPO }} aria-hidden="true">
      <svg className="absolute inset-0 h-full w-full">
        {VX.map((x, i) => (
          <motion.line key={`v${x}`} x1={`${x}%`} x2={`${x}%`} y1="0" y2="100%" stroke="rgb(var(--ink-rgb) / .16)" strokeWidth="1" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.3, delay: i * 0.09, ease: EXPO }} />
        ))}
        {HY.map((y, i) => (
          <motion.line key={`h${y}`} x1="0" x2="100%" y1={`${y}%`} y2={`${y}%`} stroke="rgb(var(--ink-rgb) / .16)" strokeWidth="1" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.3, delay: 0.25 + i * 0.1, ease: EXPO }} />
        ))}
      </svg>
      {HY.flatMap((y, r) =>
        VX.map((x, c) => (
          <motion.span key={`${x}-${y}`} className="absolute" style={{ left: `${x}%`, top: `${y}%` }} initial={{ opacity: 0, scale: 0.4 }} animate={{ opacity: 1, scale: 1 }} transition={{ ...SPRING, delay: 0.9 + (r * VX.length + c) * 0.025 }}>
            <Crosshair left="0px" top="0px" />
          </motion.span>
        )),
      )}
    </motion.div>
  );
}

/** Generates a `sk-apex-…` LAN key. Uses the Rust vault when running in Tauri, otherwise WebCrypto (browser preview). */
async function issueKey(): Promise<string> {
  const native = await invokeNative<{ key?: string } | string>("api_key_create", { name: "Onboarding · LAN" });
  const k = typeof native === "string" ? native : native?.key;
  if (k && k.startsWith("sk-apex-")) return k;
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const alphabet = "abcdefghijklmnopqrstuvwxyz234567";
  let bits = 0;
  let acc = 0;
  let out = "";
  for (const b of bytes) {
    acc = (acc << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += alphabet[(acc >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  return `sk-apex-${out}`;
}

/** Tilt-on-pointer card that flips (rotateY 180°) to reveal the LAN key. */
function KeyCard({ flipped, keyText, onToggle }: { flipped: boolean; keyText: string; onToggle: () => void }) {
  const rx = useMotionValue(0);
  const ry = useMotionValue(0);
  const sx = useSpring(rx, { stiffness: 320, damping: 26 });
  const sy = useSpring(ry, { stiffness: 320, damping: 26 });
  const [copied, setCopied] = useState(false);

  const move = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    ry.set(px * 16);
    rx.set(-py * 14);
  };
  const leave = () => {
    rx.set(0);
    ry.set(0);
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(keyText);
    } catch {
      /* clipboard may be blocked in iframes; the visual confirmation is still honest about what was attempted */
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  return (
    <div className="relative mx-auto h-[196px] w-full max-w-[340px]" style={{ perspective: 900 }} onPointerMove={move} onPointerLeave={leave}>
      <motion.div className="relative h-full w-full" style={{ rotateX: sx, rotateY: sy, transformStyle: "preserve-3d" }}>
        <motion.div className="absolute inset-0" initial={false} animate={{ rotateY: flipped ? 180 : 0 }} transition={{ ...SPRING, stiffness: 180, damping: 22 }} style={{ transformStyle: "preserve-3d" }}>
          {/* back face (shown first): sealed card */}
          <button onClick={onToggle} aria-label="Reveal your LAN key" className="key-card-back key-shimmer absolute inset-0 flex flex-col items-center justify-center gap-3 overflow-hidden rounded-[26px] active:scale-[0.98]" style={{ backfaceVisibility: "hidden" }}>
            <ApexLogo size={56} state="scanning" />
            <span className="mono text-[11px] uppercase tracking-[0.2em] text-white/70">Tap to ignite</span>
          </button>
          {/* front face: the key */}
          <div className="key-card key-shimmer absolute inset-0 flex flex-col justify-between overflow-hidden rounded-[26px] p-5" style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-[#fff]">
                <ApexLogo size={22} state="monochrome" />
                <span className="mono text-[10.5px] uppercase tracking-[0.18em]">LAN API key</span>
              </span>
              <button onClick={copy} aria-label="Copy key" className="relative z-[2] grid h-11 w-11 place-items-center rounded-full bg-white/15 active:scale-[0.97]">
                <Icon name={copied ? "check" : "copy"} size={16} />
              </button>
            </div>
            <div className="mono break-all text-[12.5px] leading-snug tracking-tight" aria-live="polite">
              {keyText || "sk-apex-…"}
            </div>
            <div className="mono flex items-center justify-between text-[10.5px] text-white/75">
              <span>http://apex.local:11434</span>
              <span>Ollama · OpenAI</span>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}

export function Onboarding({
  dev,
  setDev,
  source,
  downloads,
  onFinish,
  onKeyIssued,
}: {
  dev: DeviceProfile;
  setDev: (d: DeviceProfile) => void;
  source: "native" | "browser" | "preset";
  downloads: Downloads;
  onFinish: (s: OnboardingState) => void;
  onKeyIssued?: (k: KeyRec) => void;
}) {
  const { setTheme, setMode } = useTheme();
  const [i, setI] = useState(0);
  const [dir, setDir] = useState(1);
  const [look, setLook] = useState("aurora");
  const [flow, setFlow] = useState<string | null>(null);
  const [picks, setPicks] = useState<string[] | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [key, setKey] = useState("");
  const scene = SCENES[i];

  const uses = useMemo<UseCase[]>(() => {
    const f = FLOWS.find((x) => x.id === flow);
    if (!f) return [];
    return f.use === "voice" ? ["voice", "chat"] : [f.use];
  }, [flow]);
  const recs = useMemo(() => buildRecs(uses, dev), [uses, dev]);
  useEffect(() => setPicks(null), [uses, dev]);
  const chosen = picks ?? recs.map((r) => r.id);
  const totalGB = recs.filter((r) => chosen.includes(r.id)).reduce((a, r) => a + r.gb, 0);
  const devIdx = DEVICES.findIndex((d) => d.label === dev.label);

  const go = (n: number) => {
    setDir(n > i ? 1 : -1);
    setI(Math.max(0, Math.min(SCENES.length - 1, n)));
  };

  const ignite = useCallback(async () => {
    setFlipped(true);
    if (!key) setKey(await issueKey());
  }, [key]);

  // Scene 4: the card flips on its own shortly after arriving; tapping it does the same.
  useEffect(() => {
    if (scene !== "ignite" || flipped) return;
    const t = window.setTimeout(() => void ignite(), 1100);
    return () => window.clearTimeout(t);
  }, [scene, flipped, ignite]);

  const pickLook = (l: (typeof LOOKS)[number]) => {
    setLook(l.id);
    setTheme(l.theme);
    setMode(l.mode);
  };

  const finish = (install: boolean) => {
    if (install) chosen.forEach((id) => downloads.start(id));
    if (key) onKeyIssued?.({ id: `onb${key.slice(-6)}`, name: "Onboarding · LAN", hint: key.slice(-4), requests: 0, tokens: 0, revoked: false });
    onFinish({ done: true, uses, picks: install ? chosen : [] });
  };
  const next = () => (scene === "ignite" ? finish(true) : go(i + 1));
  const primary = scene === "awaken" ? "Begin" : scene === "ignite" ? (chosen.length ? `Queue ${chosen.length} · ${totalGB < 0.1 ? "<0.1" : totalGB.toFixed(1)} GB` : "Open Prompt Studio") : "Continue";

  return (
    <motion.div className="absolute inset-0 z-[70] flex flex-col overflow-hidden bg-canvas" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 1.03, filter: "blur(8px)" }} transition={{ duration: 0.4, ease: EXPO }} role="dialog" aria-modal="true" aria-label="Welcome to Apex">
      <div className="aurora" data-tone={scene === "ignite" ? "cobalt" : "violet"} />
      <div className="grain pointer-events-none absolute inset-0" />
      <OnboardGrid dim={scene !== "awaken"} />

      <div className="relative flex min-h-0 flex-1 flex-col px-5 pb-4 pt-12">
        {/* progress rail */}
        <motion.div className="relative h-11" initial={false} animate={{ opacity: scene === "awaken" ? 0 : 1 }} transition={{ duration: 0.4 }} aria-label={`Scene ${i + 1} of ${SCENES.length}`}>
          <span className="grid-h" style={{ top: 22 }} />
          <motion.span className="absolute top-[22px] origin-left bg-accent" style={{ left: 0, right: 0, height: 2, marginTop: -0.5 }} initial={false} animate={{ scaleX: (i + 1) / SCENES.length }} transition={SPRING} />
          {SCENES.map((s, k) => (
            <span key={s} className="absolute top-[22px] -translate-x-1/2 -translate-y-1/2 text-[15px] leading-none" style={{ left: `${(k / (SCENES.length - 1)) * 100}%`, color: k <= i ? "var(--accent)" : "rgb(var(--ink-rgb) / .5)", marginLeft: k === 0 ? 7 : k === SCENES.length - 1 ? -7 : 0 }} aria-hidden="true">
              +
            </span>
          ))}
        </motion.div>
        <div className="flex items-center justify-between">
          <button onClick={() => go(i - 1)} aria-label="Back" className={`-ml-2 grid h-11 w-11 place-items-center rounded-full transition-opacity active:scale-[0.97] ${i === 0 ? "pointer-events-none opacity-0" : ""}`}>
            <Icon name="back" size={20} />
          </button>
          <span className="mono tnum text-[11px] tracking-[0.16em] text-ink-3">
            {String(i + 1).padStart(2, "0")} / {String(SCENES.length).padStart(2, "0")}
          </span>
          <button onClick={() => finish(false)} className="-mr-2 flex h-11 items-center rounded-full px-3 text-[13px] font-medium text-ink-2 active:scale-[0.97]">
            Skip setup
          </button>
        </div>

        <AnimatePresence mode="wait" custom={dir} initial={false}>
          <motion.div
            key={scene}
            custom={dir}
            variants={{ in: (d: number) => ({ opacity: 0, x: 32 * d, filter: "blur(6px)" }), on: { opacity: 1, x: 0, filter: "blur(0px)" }, out: (d: number) => ({ opacity: 0, x: -24 * d, filter: "blur(6px)" }) }}
            initial="in"
            animate="on"
            exit="out"
            transition={SPRING}
            className="scroll-hide -mx-3 mt-3 min-h-0 flex-1 overflow-y-auto px-3"
          >
            {/* ───────── Scene 1 — Architectural awakening ───────── */}
            {scene === "awaken" && (
              <div className="flex min-h-full flex-col items-center justify-center pb-6 text-center">
                <div className="relative grid h-[148px] w-[148px] place-items-center">
                  <motion.span className="absolute inset-0 rounded-full" style={{ background: "radial-gradient(closest-side, color-mix(in oklab, var(--accent) 45%, transparent), transparent)" }} initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 1.4, delay: 0.8, ease: EXPO }} />
                  <ApexLogo size={120} assemble delay={0.7} title="Apex Tensor Prism" />
                </div>
                <Reveal i={6} className="mono mt-6 text-[11px] uppercase tracking-[0.28em] text-ink-3">
                  Apex · Local inference
                </Reveal>
                <h1 className="display mt-4 text-[clamp(36px,11vw,48px)]">
                  <Reveal i={7} to={1} className="block">Intelligence</Reveal>
                  <Reveal i={8} to={0.65} className="block">that lives on</Reveal>
                  <Reveal i={9} to={0.35} className="block">your silicon.</Reveal>
                </h1>
                <Reveal i={10} className="mt-5 max-w-[30ch] text-[15px] leading-relaxed text-ink-2">
                  Language, image and voice models. Private by construction. Sized to this phone before you download a byte.
                </Reveal>
              </div>
            )}

            {/* ───────── Scene 2 — Silicon radar ───────── */}
            {scene === "silicon" && (
              <>
                <Reveal>
                  <h2 className="display text-[clamp(34px,10vw,44px)]">
                    <span>{COPY.silicon.title[0]}</span>
                    <br />
                    <span style={{ opacity: 0.4 }}>{COPY.silicon.title[1]}</span>
                  </h2>
                </Reveal>
                <Reveal i={1}>
                  <p className="mt-3 max-w-[34ch] text-[15px] leading-relaxed text-ink-2">{COPY.silicon.body}</p>
                </Reveal>
                <Reveal i={2} className="mt-5 pb-2">
                  <SiliconScan dev={dev} source={source} />
                  {source !== "native" && (
                    <>
                      <div className="mt-4 flex gap-2" role="radiogroup" aria-label="Choose a phone class">
                        {DEVICES.map((d, k) => (
                          <button key={d.label} role="radio" aria-checked={k === devIdx} onClick={() => setDev(d)} className={`min-h-11 flex-1 rounded-2xl border px-2 py-2.5 text-[12px] font-medium transition-[transform,background-color,border-color] active:scale-[0.97] ${k === devIdx ? "border-white/40 bg-white/15" : "border-white/10 text-ink-3"}`}>
                            {d.label}
                          </button>
                        ))}
                      </div>
                      <p className="mt-2 text-[11.5px] text-ink-3">A browser can’t read hardware exactly. Pick the closest class and the scan re-runs.</p>
                    </>
                  )}
                </Reveal>
              </>
            )}

            {/* ───────── Scene 3 — Theme + workflow choreographer ───────── */}
            {scene === "taste" && (
              <>
                <Reveal>
                  <h2 className="display text-[clamp(34px,10vw,44px)]">
                    <span>{COPY.taste.title[0]}</span>
                    <br />
                    <span style={{ opacity: 0.4 }}>{COPY.taste.title[1]}</span>
                  </h2>
                </Reveal>
                <Reveal i={1}>
                  <p className="mt-3 max-w-[34ch] text-[15px] leading-relaxed text-ink-2">{COPY.taste.body}</p>
                </Reveal>

                <Reveal i={2} className="mt-5">
                  <div className="mono mb-2 text-[10.5px] uppercase tracking-[0.18em] text-ink-3">Look</div>
                  <div className="grid grid-cols-2 gap-2.5" role="radiogroup" aria-label="Look">
                    {LOOKS.map((l) => {
                      const on = look === l.id;
                      return (
                        <motion.button key={l.id} role="radio" aria-checked={on} onClick={() => pickLook(l)} whileTap={{ scale: 0.97 }} transition={SPRING} className="relative overflow-hidden rounded-[20px] border text-left" style={{ borderColor: on ? "var(--accent)" : "var(--hairline)", boxShadow: on ? "0 0 0 1px var(--accent)" : undefined }}>
                          {/* swatch renders with its own scoped theme tokens */}
                          <span data-theme={l.preview.theme} data-mode={l.preview.mode} className="relative block h-[58px] overflow-hidden" style={{ background: "var(--canvas)" }}>
                            <span className="absolute -right-4 -top-6 h-16 w-16 rounded-full blur-xl" style={{ background: "var(--accent)", opacity: 0.55 }} />
                            <span className="absolute inset-x-3 bottom-3 h-px" style={{ background: "rgb(var(--ink-rgb) / .35)" }} />
                            <span className="absolute left-3 top-3 text-[15px] font-semibold leading-none tracking-tight" style={{ color: "rgb(var(--ink-rgb))" }}>
                              Aa
                              <span className="ml-0.5" style={{ opacity: 0.35 }}>
                                Aa
                              </span>
                            </span>
                            <span className="absolute bottom-3.5 right-3 h-2 w-8 rounded-full" style={{ background: "var(--accent)" }} />
                          </span>
                          <span className="block px-3 pb-2.5 pt-2">
                            <span className="block text-[12.5px] font-semibold leading-tight tracking-tight">{l.name}</span>
                            <span className="block text-[11px] leading-snug text-ink-3">{l.note}</span>
                          </span>
                          <AnimatePresence>
                            {on && (
                              <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={SPRING} className="absolute right-2 top-2 grid h-5 w-5 place-items-center rounded-full bg-accent text-black">
                                <Icon name="check" size={12} strokeWidth={3} />
                              </motion.span>
                            )}
                          </AnimatePresence>
                        </motion.button>
                      );
                    })}
                  </div>
                </Reveal>

                <Reveal i={3} className="mt-6 pb-2">
                  <div className="mono mb-2 text-[10.5px] uppercase tracking-[0.18em] text-ink-3">Primary workflow</div>
                  <div className="grid grid-cols-2 gap-2.5" role="radiogroup" aria-label="Primary workflow">
                    {FLOWS.map((f) => {
                      const on = flow === f.id;
                      return (
                        <motion.button key={f.id} role="radio" aria-checked={on} onClick={() => setFlow(f.id)} whileTap={{ scale: 0.97 }} transition={SPRING} className={`bento relative flex min-h-[108px] flex-col justify-between p-3.5 text-left transition-colors ${on ? "!border-accent !bg-accent/10" : ""}`}>
                          <span className="flex items-center justify-between">
                            <span className="icon-pill">
                              <Icon name={f.icon} size={17} />
                            </span>
                            <span className={`grid h-5 w-5 place-items-center rounded-full border transition-colors ${on ? "border-accent bg-accent text-black" : "border-white/25"}`}>
                              <AnimatePresence>
                                {on && (
                                  <motion.span initial={{ scale: 0, rotate: -40 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0 }} transition={SPRING} className="grid place-items-center">
                                    <Icon name="check" size={12} strokeWidth={3} />
                                  </motion.span>
                                )}
                              </AnimatePresence>
                            </span>
                          </span>
                          <span>
                            <span className="block text-[13px] font-semibold leading-tight tracking-tight">{f.label}</span>
                            <span className="mt-0.5 block text-[11px] leading-snug text-ink-3">{f.hint}</span>
                          </span>
                        </motion.button>
                      );
                    })}
                  </div>
                </Reveal>
              </>
            )}

            {/* ───────── Scene 4 — Key ignition + model queue ───────── */}
            {scene === "ignite" && (
              <>
                <Reveal>
                  <h2 className="display text-[clamp(34px,10vw,44px)]">
                    <span>{COPY.ignite.title[0]}</span>
                    <br />
                    <span style={{ opacity: 0.4 }}>{COPY.ignite.title[1]}</span>
                  </h2>
                </Reveal>
                <Reveal i={1}>
                  <p className="mt-3 max-w-[34ch] text-[15px] leading-relaxed text-ink-2">{COPY.ignite.body}</p>
                </Reveal>
                <Reveal i={2} className="mt-6">
                  <KeyCard flipped={flipped} keyText={key} onToggle={() => (flipped ? setFlipped(false) : void ignite())} />
                  <p className="mt-3 text-center text-[11.5px] text-ink-3">{source === "native" ? "Stored in the Rust key vault. Shown once." : "Browser preview: generated locally, held in memory only."}</p>
                </Reveal>
                <Reveal i={3} className="mt-6 pb-2">
                  <div className="mono mb-2 flex items-center justify-between text-[10.5px] uppercase tracking-[0.18em] text-ink-3">
                    <span>Starter queue</span>
                    <span className="tnum">{dev.freeStorageGB.toFixed(0)} GB free</span>
                  </div>
                  <div className="space-y-2">
                    {recs.length === 0 && <p className="text-[13.5px] text-ink-2">Nothing fits yet. Browse every model in Models.</p>}
                    {recs.map((r) => {
                      const on = chosen.includes(r.id);
                      return (
                        <motion.button key={r.id} onClick={() => setPicks(on ? chosen.filter((x) => x !== r.id) : [...chosen, r.id])} aria-pressed={on} whileTap={{ scale: 0.97 }} transition={SPRING} className={`bento flex w-full items-center gap-3 p-3 text-left transition-opacity ${on ? "" : "opacity-60"}`}>
                          <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-md border transition-colors ${on ? "border-accent bg-accent text-black" : "border-white/25"}`}>{on && <Icon name="check" size={14} strokeWidth={3} />}</span>
                          <span className="min-w-0 flex-1">
                            <span className="mono block text-[10px] uppercase tracking-[0.14em] text-ink-3">{r.kind}</span>
                            <span className="block truncate text-[14px] font-medium tracking-tight">{r.title}</span>
                            <span className="block truncate text-[11.5px] text-ink-3">{r.sub}</span>
                          </span>
                          <span className="text-right">
                            <span className="tnum block text-[13px] font-semibold">{r.gb < 0.1 ? `${Math.round(r.gb * 1024)} MB` : `${r.gb.toFixed(2)} GB`}</span>
                            <span className={`mt-0.5 inline-block rounded-full border px-2 py-0.5 text-[10px] font-medium ${BADGE[r.compat].tone}`}>{BADGE[r.compat].label}</span>
                          </span>
                        </motion.button>
                      );
                    })}
                  </div>
                </Reveal>
              </>
            )}
          </motion.div>
        </AnimatePresence>

        <div className="pt-3">
          <RippleButton onClick={next} className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-white text-[14.5px] font-semibold text-black">
            {primary}
            <Icon name="arrow" size={16} strokeWidth={2.2} />
          </RippleButton>
          {scene === "ignite" ? (
            <button onClick={() => finish(false)} className="mx-auto flex h-11 items-center px-4 text-[13px] font-medium text-ink-2">
              Enter without downloading
            </button>
          ) : (
            <div className="h-11" />
          )}
        </div>
      </div>
    </motion.div>
  );
}
