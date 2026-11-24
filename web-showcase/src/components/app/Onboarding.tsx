"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";
import { RippleButton } from "@/components/ui/Glass";
import { FanStack } from "@/components/ui/FanStack";
import { GridFrame } from "@/components/ui/Swiss";
import { ThemePicker } from "@/components/theme/ThemePicker";
import { BADGE, DEVICES, GIB, recommend, score, type Compat, type DeviceProfile } from "@/lib/compat";
import { bestMedia, mediaTotalGB, scoreMedia } from "@/lib/media";
import { CATALOG, kvFor, VOICE_MODELS } from "@/lib/models";
import { invokeNative } from "@/lib/native";
import type { OnboardingState, UseCase } from "@/lib/prefs";
import type { Downloads } from "./useDownloads";

const SPRING = { type: "spring", stiffness: 340, damping: 30, mass: 0.85 } as const;
const STEPS = ["use", "look", "device", "models", "key"] as const;
type Step = (typeof STEPS)[number];

const USES: { id: UseCase; label: string; hint: string; icon: IconName }[] = [
  { id: "chat", label: "Chat & writing", hint: "Everyday assistant", icon: "chat" },
  { id: "code", label: "Code", hint: "Editor and repo help", icon: "code" },
  { id: "image", label: "Images", hint: "Generate offline", icon: "image" },
  { id: "video", label: "Video", hint: "Short clips", icon: "film" },
  { id: "voice", label: "Dictation", hint: "Speak instead of type", icon: "mic" },
  { id: "server", label: "Serve to my PC", hint: "Ollama-compatible API", icon: "server" },
];

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
    const v = VOICE_MODELS[1];
    out.push({ id: v.id, kind: "Voice", title: v.name, sub: v.note, gb: v.mb / 1024, compat: "optimal" });
  }
  return out;
}

const COPY: Record<Step, { title: [string, string]; body: string }> = {
  use: { title: ["What will you", "use Apex for?"], body: "Pick any. We’ll suggest models that fit." },
  look: { title: ["Choose", "your look."], body: "Change it any time in Settings." },
  device: { title: ["Reading", "this phone."], body: "Memory, processor and accelerators decide what runs well." },
  models: { title: ["Models that", "fit you."], body: "Sized to your free memory and storage." },
  key: { title: ["Bring a", "cloud key?"], body: "Optional. Use a hosted model when a local one isn’t enough." },
};

export function Onboarding({
  dev,
  setDev,
  source,
  downloads,
  onFinish,
}: {
  dev: DeviceProfile;
  setDev: (d: DeviceProfile) => void;
  source: "native" | "browser" | "preset";
  downloads: Downloads;
  onFinish: (s: OnboardingState) => void;
}) {
  const [i, setI] = useState(0);
  const [dir, setDir] = useState(1);
  const [uses, setUses] = useState<UseCase[]>([]);
  const [picks, setPicks] = useState<string[] | null>(null);
  const [scanning, setScanning] = useState(false);
  const [provider, setProvider] = useState<"openai" | "anthropic" | "openrouter">("openai");
  const [apiKey, setApiKey] = useState("");
  const [skipInstall, setSkipInstall] = useState(false);
  const step = STEPS[i];
  const recs = useMemo(() => buildRecs(uses, dev), [uses, dev]);
  const chosen = picks ?? recs.map((r) => r.id);
  const totalGB = recs.filter((r) => chosen.includes(r.id)).reduce((a, r) => a + r.gb, 0);

  useEffect(() => {
    if (step !== "device") return;
    setScanning(true);
    const t = window.setTimeout(() => setScanning(false), 1300);
    return () => window.clearTimeout(t);
  }, [step]);

  useEffect(() => setPicks(null), [uses, dev]);

  const go = (n: number) => {
    setDir(n > i ? 1 : -1);
    setI(Math.max(0, Math.min(STEPS.length - 1, n)));
  };
  const finish = (install: boolean, saveKey = true) => {
    const doInstall = install && !skipInstall;
    if (doInstall) chosen.forEach((id) => downloads.start(id));
    if (saveKey && apiKey.trim()) void invokeNative("provider_key_set", { provider, key: apiKey.trim() });
    onFinish({ done: true, uses, picks: doInstall ? chosen : [] });
  };
  const next = () => {
    if (step === "models") setSkipInstall(false);
    if (step === "key") finish(true);
    else go(i + 1);
  };
  const toggleUse = (u: UseCase) => setUses((c) => (c.includes(u) ? c.filter((x) => x !== u) : [...c, u]));
  const devIdx = DEVICES.findIndex((d) => d.label === dev.label);
  const keyOk = apiKey.trim().length === 0 || apiKey.trim().length >= 20;
  const primary = step === "models" ? (recs.length ? `Install ${chosen.length} · ${totalGB.toFixed(1)} GB` : "Continue") : step === "key" ? (apiKey.trim() ? "Save and finish" : "Finish") : "Continue";

  return (
    <motion.div className="absolute inset-0 z-[70] flex flex-col bg-canvas" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 1.02 }} transition={{ duration: 0.35 }} role="dialog" aria-modal="true" aria-label="Welcome to Apex">
      <div className="aurora" data-tone="violet" />
      <div className="grain pointer-events-none absolute inset-0" />
      <GridFrame cols={4} className="pointer-events-none absolute inset-0 !max-w-none opacity-70">
        <span />
      </GridFrame>

      <div className="relative flex min-h-0 flex-1 flex-col px-5 pb-4 pt-12">
        {/* Swiss progress rail: + markers, active segment fills with a spring */}
        <div className="relative h-11" aria-label={`Step ${i + 1} of ${STEPS.length}`}>
          <span className="grid-h" style={{ top: 22 }} />
          <motion.span className="absolute top-[22px] h-px origin-left bg-accent" style={{ left: 0, right: 0, height: 2, marginTop: -0.5 }} initial={false} animate={{ scaleX: (i + 1) / STEPS.length }} transition={SPRING} />
          {STEPS.map((s, k) => (
            <span key={s} className="absolute top-[22px] -translate-x-1/2 -translate-y-1/2 text-[15px] leading-none" style={{ left: `${(k / (STEPS.length - 1)) * 100}%`, color: k <= i ? "var(--accent)" : "rgb(var(--ink-rgb) / .5)", marginLeft: k === 0 ? 7 : k === STEPS.length - 1 ? -7 : 0 }} aria-hidden="true">
              +
            </span>
          ))}
        </div>
        <div className="flex items-center justify-between">
          <button onClick={() => go(i - 1)} aria-label="Back" className={`-ml-2 grid h-11 w-11 place-items-center rounded-full transition-opacity active:scale-[0.97] ${i === 0 ? "pointer-events-none opacity-0" : ""}`}>
            <Icon name="back" size={20} />
          </button>
          <span className="mono tnum text-[11px] tracking-[0.16em] text-ink-3">
            {String(i + 1).padStart(2, "0")} / {String(STEPS.length).padStart(2, "0")}
          </span>
          <button onClick={() => finish(false, false)} className="-mr-2 flex h-11 items-center rounded-full px-3 text-[13px] font-medium text-ink-2 active:scale-[0.97]">
            Skip setup
          </button>
        </div>

        <AnimatePresence mode="wait" custom={dir} initial={false}>
          <motion.div
            key={step}
            custom={dir}
            variants={{ in: (d: number) => ({ opacity: 0, x: 28 * d }), on: { opacity: 1, x: 0 }, out: (d: number) => ({ opacity: 0, x: -20 * d }) }}
            initial="in"
            animate="on"
            exit="out"
            transition={SPRING}
            className="scroll-hide -mx-3 mt-3 min-h-0 flex-1 overflow-y-auto px-3"
          >
            <h2 className="display text-[clamp(34px,10vw,44px)]">
              <span>{COPY[step].title[0]}</span>
              <br />
              <span style={{ opacity: 0.4 }}>{COPY[step].title[1]}</span>
            </h2>
            <p className="mt-3 max-w-[34ch] text-[15px] leading-relaxed text-ink-2">{COPY[step].body}</p>

            <div className="mt-6 pb-2">
              {step === "use" && (
                <div className="grid grid-cols-2 gap-2.5" role="group" aria-label="Use cases">
                  {USES.map((u) => {
                    const on = uses.includes(u.id);
                    return (
                      <motion.button key={u.id} onClick={() => toggleUse(u.id)} aria-pressed={on} whileTap={{ scale: 0.97 }} transition={SPRING} className={`bento relative flex min-h-[96px] flex-col justify-between p-3.5 text-left transition-colors ${on ? "!border-accent !bg-accent/10" : ""}`}>
                        <span className="flex items-center justify-between">
                          <span className="icon-pill">
                            <Icon name={u.icon} size={17} />
                          </span>
                          <span className={`grid h-5 w-5 place-items-center rounded-full border transition-all ${on ? "scale-100 border-accent bg-accent text-black" : "scale-90 border-white/25"}`}>{on && <Icon name="check" size={12} strokeWidth={3} />}</span>
                        </span>
                        <span>
                          <span className="block text-[14px] font-semibold tracking-tight">{u.label}</span>
                          <span className="block text-[11.5px] text-ink-3">{u.hint}</span>
                        </span>
                      </motion.button>
                    );
                  })}
                </div>
              )}

              {step === "look" && <ThemePicker compact />}

              {step === "device" && (
                <>
                  <FanStack
                    cards={[
                      { label: "Memory", value: scanning ? "—" : dev.totalGB.toFixed(1), unit: scanning ? "" : "GB" },
                      { label: "Free", value: scanning ? "—" : dev.availGB.toFixed(1), unit: scanning ? "" : "GB" },
                      { label: "Cores", value: scanning ? "—" : String(dev.cores) },
                      { label: "GPU", value: scanning ? "—" : dev.vulkan ? "Vulkan" : "CPU" },
                      { label: "NPU", value: scanning ? "—" : dev.npu ? "Yes" : "No" },
                    ]}
                  >
                    <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-2">{scanning ? "Scanning" : source === "native" ? "Measured" : source === "browser" ? "Estimated from browser" : "Typical phone"}</div>
                    <div className={`mt-0.5 text-[22px] font-semibold tracking-tight ${scanning ? "shimmer-text" : ""}`}>{scanning ? "Reading hardware" : dev.label}</div>
                    <div className="mono mt-3 flex min-h-[26px] flex-wrap gap-1.5 text-[10.5px]">
                      {!scanning &&
                        [`${recommend(dev).quant} quant`, `${recommend(dev).maxCtx} ctx`, `${recommend(dev).threads} threads`].map((c) => (
                          <span key={c} className="rounded-full bg-black/20 px-2.5 py-1 text-ink-2">
                            {c}
                          </span>
                        ))}
                    </div>
                  </FanStack>
                  {source !== "native" && (
                    <>
                      <div className="mt-4 flex gap-2" role="radiogroup" aria-label="Choose a phone class">
                        {DEVICES.map((d, k) => (
                          <button key={d.label} role="radio" aria-checked={k === devIdx} onClick={() => setDev(d)} className={`min-h-11 flex-1 rounded-2xl border px-2 py-2.5 text-[12px] font-medium transition-transform active:scale-[0.97] ${k === devIdx ? "border-white/40 bg-white/15" : "border-white/10 text-ink-3"}`}>
                            {d.label}
                          </button>
                        ))}
                      </div>
                      <p className="mt-2 text-[11.5px] text-ink-3">A browser can’t read hardware exactly. Pick the closest class.</p>
                    </>
                  )}
                </>
              )}

              {step === "models" && (
                <div className="space-y-2.5">
                  {recs.length === 0 && <p className="text-[13.5px] text-ink-2">Nothing here fits yet. You can browse every model in Models.</p>}
                  {recs.map((r) => {
                    const on = chosen.includes(r.id);
                    return (
                      <motion.button key={r.id} onClick={() => setPicks(on ? chosen.filter((x) => x !== r.id) : [...chosen, r.id])} aria-pressed={on} whileTap={{ scale: 0.98 }} transition={SPRING} className={`bento flex w-full items-center gap-3 p-3.5 text-left ${on ? "" : "opacity-60"}`}>
                        <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-md border transition-colors ${on ? "border-accent bg-accent text-black" : "border-white/25"}`}>{on && <Icon name="check" size={14} strokeWidth={3} />}</span>
                        <span className="min-w-0 flex-1">
                          <span className="mono block text-[10px] uppercase tracking-[0.14em] text-ink-3">{r.kind}</span>
                          <span className="block truncate text-[14.5px] font-medium tracking-tight">{r.title}</span>
                          <span className="block truncate text-[11.5px] text-ink-3">{r.sub}</span>
                        </span>
                        <span className="text-right">
                          <span className="tnum block text-[13px] font-semibold">{r.gb.toFixed(2)} GB</span>
                          <span className={`mt-0.5 inline-block rounded-full border px-2 py-0.5 text-[10px] font-medium ${BADGE[r.compat].tone}`}>{BADGE[r.compat].label}</span>
                        </span>
                      </motion.button>
                    );
                  })}
                  {recs.length > 0 && (
                    <p className="pt-1 text-[11.5px] leading-relaxed text-ink-3">
                      {dev.freeStorageGB.toFixed(0)} GB free · downloads resume if interrupted
                    </p>
                  )}
                </div>
              )}

              {step === "key" && (
                <div>
                  <div role="radiogroup" aria-label="Provider" className="glass-dark flex rounded-full p-1">
                    {(
                      [
                        ["openai", "OpenAI"],
                        ["anthropic", "Anthropic"],
                        ["openrouter", "OpenRouter"],
                      ] as const
                    ).map(([id, label]) => (
                      <button key={id} role="radio" aria-checked={provider === id} onClick={() => setProvider(id)} className={`relative h-11 flex-1 rounded-full text-[12.5px] font-medium transition-colors active:scale-[0.97] ${provider === id ? "bg-white/[0.14] text-white" : "text-ink-3"}`}>
                        {label}
                      </button>
                    ))}
                  </div>
                  <label className="mt-4 block">
                    <span className="mono text-[10.5px] uppercase tracking-[0.16em] text-ink-3">API key</span>
                    <input value={apiKey} onChange={(e) => setApiKey(e.target.value)} type="password" autoComplete="off" spellCheck={false} placeholder={provider === "anthropic" ? "sk-ant-…" : "sk-…"} className="glass-dark mono mt-2 h-12 w-full rounded-2xl px-4 text-[14px] text-white outline-none placeholder:text-ink-3 focus-visible:outline-accent" />
                  </label>
                  {!keyOk && <p role="alert" className="mt-2 text-[12px] text-bad">That looks too short for an API key.</p>}
                  <p className="mt-3 text-[11.5px] leading-relaxed text-ink-3">This demo keeps the key in memory only. The Android build stores it in the system Keystore. You can skip this and add one later.</p>
                </div>
              )}
            </div>
          </motion.div>
        </AnimatePresence>

        <div className="pt-3">
          <RippleButton onClick={next} disabled={step === "key" && !keyOk} className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-white text-[14.5px] font-semibold text-black disabled:opacity-40">
            {primary}
            <Icon name="arrow" size={16} strokeWidth={2.2} />
          </RippleButton>
          {(step === "models" || step === "key") && (
            <button
              onClick={() => {
                if (step === "models") {
                  setSkipInstall(true);
                  go(i + 1);
                } else finish(true, false);
              }}
              className="mx-auto flex h-11 items-center px-4 text-[13px] font-medium text-ink-2"
            >
              {step === "models" ? "Not now" : apiKey ? "Finish without saving" : "Skip for now"}
            </button>
          )}
          {step !== "models" && step !== "key" && <div className="h-11" />}
        </div>
      </div>
    </motion.div>
  );
}
