"use client";

import { motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Icon } from "@/components/ui/Icon";
import { RippleButton } from "@/components/ui/Glass";
import type { DeviceProfile } from "@/lib/compat";
import { bestMedia, etaSeconds, fmtEta, MEDIA_CATALOG, type MediaKind, type MediaModel } from "@/lib/media";
import { invokeNative, isNative } from "@/lib/native";
import { DlButton, ProgressBar } from "./HubScreen";
import type { Downloads } from "./useDownloads";

const DEMO_MS: Record<MediaKind, number> = { image: 4200, video: 6400 };
const TICKS = 24;
const PLACEHOLDERS: Record<MediaKind, string> = {
  image: "A lighthouse at dusk, film grain, soft fog",
  video: "Waves rolling onto a black sand beach, slow pan",
};

/** Deterministic placeholder art from the prompt. Not model output — labelled as such in the UI. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
function art(prompt: string, seed: number): CSSProperties {
  const h = hash(`${prompt}:${seed}`);
  const h1 = h % 360;
  const h2 = (h1 + 50 + ((h >> 8) % 110)) % 360;
  const h3 = (h1 + 200 + ((h >> 16) % 80)) % 360;
  const p = (n: number) => 15 + ((h >> n) % 70);
  return {
    background: `radial-gradient(80% 80% at ${p(3)}% ${p(5)}%, hsl(${h1} 90% 60%), transparent 78%), radial-gradient(75% 75% at ${p(7)}% ${p(9)}%, hsl(${h2} 85% 58%), transparent 76%), linear-gradient(165deg, hsl(${h3} 60% 24%), hsl(${h1} 65% 40%))`,
  };
}

type Phase = "idle" | "running" | "done" | "error";

export function StudioScreen({ dev, downloads, onBrowse }: { dev: DeviceProfile; downloads: Downloads; onBrowse: (k: MediaKind) => void }) {
  const [kind, setKind] = useState<MediaKind>("image");
  const [modelId, setModelId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [seed, setSeed] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  const installed = useMemo(() => MEDIA_CATALOG.filter((m) => m.kind === kind && downloads.get(m.id).status === "done"), [kind, downloads]);
  const model: MediaModel | undefined = installed.find((m) => m.id === modelId) ?? installed[0];
  const suggestion = useMemo(() => bestMedia(dev, kind), [dev, kind]);

  useEffect(() => () => void (timer.current && window.clearInterval(timer.current)), []);
  useEffect(() => {
    setPhase("idle");
    setProgress(0);
    setError(null);
    if (timer.current) window.clearInterval(timer.current);
  }, [kind]);

  const run = useCallback(async () => {
    if (!model || phase === "running") return;
    const text = prompt.trim() || PLACEHOLDERS[kind];
    setError(null);
    if (isNative()) {
      const res = await invokeNative<{ path: string }>("media_generate", { model: model.id, prompt: text, kind });
      if (!res) {
        setPhase("error");
        setError("The generation engine isn’t available in this build yet.");
        return;
      }
    }
    setSeed((s) => s + 1);
    setPhase("running");
    setProgress(0);
    const t0 = performance.now();
    timer.current = window.setInterval(() => {
      const p = Math.min(1, (performance.now() - t0) / DEMO_MS[kind]);
      setProgress(p);
      if (p >= 1) {
        if (timer.current) window.clearInterval(timer.current);
        setPhase("done");
      }
    }, 50);
  }, [kind, model, phase, prompt]);

  const steps = model?.steps ?? 20;
  const lit = Math.round(progress * TICKS);
  const stepNow = Math.min(steps, Math.round(progress * steps));
  const frames = kind === "video" ? 33 : 0;
  const text = prompt.trim() || PLACEHOLDERS[kind];
  const resolved = phase === "running" ? progress : phase === "done" ? 1 : 0;

  return (
    <div className="scroll-hide h-full overflow-y-auto px-5 pb-6 pt-14">
      <div className="mb-5 flex items-end justify-between">
        <h2 className="display text-[30px]">Studio</h2>
        <span className="mono text-[11px] text-ink-3">offline · on-device</span>
      </div>

      <div role="tablist" aria-label="Output type" className="glass-dark relative flex rounded-full p-1">
        {(["image", "video"] as const).map((k) => {
          const on = k === kind;
          return (
            <button key={k} role="tab" aria-selected={on} onClick={() => setKind(k)} className="relative flex h-11 flex-1 items-center justify-center gap-2 rounded-full text-[13px] font-medium transition-transform active:scale-[0.97]">
              {on && <motion.span layoutId="studio-seg" className="absolute inset-0 rounded-full bg-white/[0.14]" transition={{ type: "spring", stiffness: 420, damping: 32 }} />}
              <span className={`relative flex items-center gap-1.5 ${on ? "text-white" : "text-ink-3"}`}>
                <Icon name={k === "image" ? "image" : "film"} size={16} />
                {k === "image" ? "Image" : "Video"}
              </span>
            </button>
          );
        })}
      </div>

      {/* Canvas — fixed aspect ratio reserves space, so nothing shifts while rendering. */}
      <div className={`bento relative mt-4 overflow-hidden ${kind === "image" ? "aspect-square" : "aspect-video"}`}>
        {model ? (
          <>
            <div className="absolute inset-0" style={{ ...art(text, seed), opacity: resolved, transition: phase === "running" ? "none" : "opacity 400ms" }}>
              {kind === "video" && phase === "done" && <div className="studio-pan absolute inset-[-20%]" style={art(`${text}b`, seed)} />}
            </div>
            <div className="grain absolute inset-0" style={{ opacity: 1 - resolved * 0.85 }} />
            {phase === "idle" && (
              <div className="absolute inset-0 grid place-items-center p-6 text-center">
                <div>
                  <Icon name={kind === "image" ? "image" : "film"} size={26} className="mx-auto text-ink-3" />
                  <p className="mt-3 text-[13.5px] text-ink-2">{model.name} is ready.</p>
                  <p className="mono mt-1 text-[11px] text-ink-3">{model.output}</p>
                </div>
              </div>
            )}
            {phase === "done" && <span className="mono absolute left-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-[10px] text-white/90 backdrop-blur">Demo render · placeholder art</span>}
          </>
        ) : (
          <div className="absolute inset-0 grid place-items-center p-6 text-center">
            <div className="w-full max-w-[280px]">
              <Icon name={kind === "image" ? "image" : "film"} size={26} className="mx-auto text-ink-3" />
              <p className="mt-3 text-[15px] font-medium tracking-tight">No {kind} model installed</p>
              <p className="mt-1 text-[12.5px] leading-relaxed text-ink-2">
                {suggestion ? `${suggestion.name} fits this phone best (${suggestion.sizeGB.toFixed(2)} GB).` : "None of the current models fit this phone."}
              </p>
              <div className="mt-4 flex flex-col items-center gap-2">
                {suggestion && (
                  <>
                    <DlButton state={downloads.get(suggestion.id)} onClick={() => downloads.start(suggestion.id)} label="Install" />
                    {downloads.get(suggestion.id).status === "downloading" && (
                      <div className="w-full">
                        <ProgressBar pct={downloads.get(suggestion.id).pct} />
                      </div>
                    )}
                  </>
                )}
                <button onClick={() => onBrowse(kind)} className="min-h-11 rounded-full px-4 text-[12.5px] font-medium text-ink-2 underline-offset-4 hover:underline">
                  Browse all {kind} models
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Hallmark: denoising timeline */}
      <div className="mt-3" aria-label="Generation progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
        <div className="flex gap-[3px]">
          {Array.from({ length: TICKS }, (_, i) => (
            <span key={i} className="h-5 flex-1 rounded-[3px] transition-colors duration-150" style={{ background: i < lit ? "var(--accent)" : "rgb(var(--ink-rgb) / 0.12)", opacity: i < lit ? 0.45 + 0.55 * (i / TICKS) : 1 }} />
          ))}
        </div>
        <div className="mono tnum mt-2 flex h-4 justify-between text-[10.5px] text-ink-3">
          <span>{phase === "running" ? `step ${stepNow}/${steps}${frames ? ` · ${frames} frames` : ""}` : phase === "done" ? "complete" : "idle"}</span>
          <span>{model ? `${fmtEta(etaSeconds(dev, model))} on this phone (est.)` : ""}</span>
        </div>
      </div>

      {installed.length > 1 && (
        <div className="scroll-hide -mx-5 mt-3 flex gap-2 overflow-x-auto px-5" role="radiogroup" aria-label="Model">
          {installed.map((m) => (
            <button key={m.id} role="radio" aria-checked={m.id === model?.id} onClick={() => setModelId(m.id)} className={`min-h-11 shrink-0 rounded-full border px-4 text-[12.5px] font-medium transition-transform active:scale-[0.97] ${m.id === model?.id ? "border-white/40 bg-white/15" : "border-white/10 text-ink-3"}`}>
              {m.name}
            </button>
          ))}
        </div>
      )}

      <label className="mt-4 block">
        <span className="mono text-[10.5px] uppercase tracking-[0.16em] text-ink-3">Prompt</span>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={PLACEHOLDERS[kind]}
          rows={3}
          className="glass-dark mt-2 min-h-[88px] w-full resize-none rounded-[20px] px-4 py-3 text-[14.5px] leading-snug text-white outline-none placeholder:text-ink-3 focus-visible:outline-accent"
        />
      </label>

      <RippleButton
        onClick={run}
        disabled={!model || phase === "running"}
        className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-white text-[14.5px] font-semibold text-black disabled:opacity-40"
      >
        <Icon name="sparkle" size={17} />
        {phase === "running" ? "Generating…" : kind === "image" ? "Generate image" : "Generate clip"}
      </RippleButton>
      {error && <p role="alert" className="mt-3 text-[12.5px] text-bad">{error}</p>}
      <p className="mt-3 text-[11px] leading-relaxed text-ink-3">
        {isNative() ? "Output is written to your gallery folder." : "Browser demo: the canvas shows placeholder art so you can review the flow. No model runs here."}
      </p>
    </div>
  );
}
