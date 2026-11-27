"use client";

import { useRef, useState } from "react";
import { ASPECTS, IMAGE_MODELS, STYLES, addToGallery, downloadImage, enhancePrompt, fetchImageChain, imageUrlChain, makeThumb, randomSeed, removeFromGallery, useGallery, type ImageJob } from "@/lib/images";
import { useApexModels } from "@/lib/apex-cloud";
import { CIcon } from "./icons";
import { ViewTitle } from "./Chrome";

const Seg = ({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) => (
  <button type="button" aria-pressed={on} onClick={onClick} className="min-h-10 rounded-full px-4 text-[13px] transition-colors" style={on ? { background: "var(--ink-solid)", color: "var(--canvas)", borderColor: "transparent" } : { background: "var(--surface-2)" }}>
    {label}
  </button>
);

export function ImageStudio({ onUseInChat, onZoom }: { onUseInChat: (url: string, prompt: string, src: string) => void; onZoom: (url: string, prompt: string) => void }) {
  const [prompt, setPrompt] = useState("");
  const apex = useApexModels();
  const [engine, setEngine] = useState(IMAGE_MODELS[0].id);
  const [enhancing, setEnhancing] = useState(false);
  const [note, setNote] = useState("");
  const [aspect, setAspect] = useState("1:1");
  const [style, setStyle] = useState("soft");
  const [negative, setNegative] = useState("");
  const [seed, setSeed] = useState(() => randomSeed());
  const [res, setRes] = useState<{ url: string; job: ImageJob; state: "loading" | "ok" | "err"; src?: string; wait?: number; err?: string; fell?: string; servedApi?: string } | null>(null);
  const gallery = useGallery();
  const token = useRef(0);

  const generate = (s = seed) => {
    if (!prompt.trim()) return;
    const job: ImageJob = { prompt: prompt.trim(), engine, aspect, style, negative, seed: s };
    const chain = imageUrlChain(job);
    if (!chain.length) return;
    const url = chain[0].url;
    const t = ++token.current;
    setRes({ url, job, state: "loading" });
    fetchImageChain(chain, {
      onWait: (w) => t === token.current && setRes((r) => (r ? { ...r, wait: w } : r)),
      onFallback: (api) => t === token.current && setRes((r) => (r ? { ...r, fell: api } : r)),
    })
      .then(async ({ src, api }) => {
        if (t !== token.current) return;
        const used = chain.find((c) => c.api === api)?.url ?? url;
        setRes({ url: used, job, state: "ok", src, servedApi: api });
        addToGallery(job, used, await makeThumb(src));
      })
      .catch((e: unknown) => t === token.current && setRes({ url, job, state: "err", err: e instanceof Error ? e.message : "Generation failed" }));
  };
  const enhance = async () => {
    if (!prompt.trim() || enhancing) return;
    setEnhancing(true);
    setNote("");
    const r = await enhancePrompt(prompt);
    setPrompt(r.text);
    setNote(r.by === "ai" ? "Prompt enhanced." : "AI is busy, so a quick rewrite was used.");
    setEnhancing(false);
  };
  const reroll = () => {
    const s = randomSeed();
    setSeed(s);
    generate(s);
  };
  const size = ASPECTS.find((a) => a.id === aspect) ?? ASPECTS[0];

  return (
    <div className="mx-auto w-full max-w-[640px] px-5 pb-12 pt-3">
      <ViewTitle title="Image Studio" sub="Apex API text-to-image. Pick an engine, describe it, and download or drop it straight into a chat." />
      <div className="flex flex-col gap-7">
        <section aria-label="Controls" className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-[12.5px] text-[rgb(var(--ink-rgb)/var(--ink-3-a))]">Prompt</span>
            <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} placeholder="A quiet harbor at dawn, soft pastel light" className="calm-field resize-none" />
          </label>
          <div className="-mt-1 flex items-center gap-3">
            <button type="button" className="calm-btn" onClick={() => void enhance()} disabled={!prompt.trim() || enhancing} data-testid="enhance-prompt">
              <CIcon name="wand" size={15} /> {enhancing ? "Enhancing…" : "Enhance prompt"}
            </button>
            {note && <span className="text-[12px] text-[rgb(var(--ink-rgb)/var(--ink-3-a))]" role="status">{note}</span>}
          </div>
          {!apex.unlocked && (
            <p className="rounded-[18px] bg-[var(--surface-2)] px-4 py-3 text-[13px] leading-relaxed text-[rgb(var(--ink-rgb)/var(--ink-3-a))]">Image engines are part of Apex API. Unlock it with your Apex API key (Settings, Apex API key) to generate images.</p>
          )}
          <fieldset>
            <legend className="mb-1.5 text-[12.5px] text-[rgb(var(--ink-rgb)/var(--ink-3-a))]">Model</legend>
            <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Image model">
              {IMAGE_MODELS.map((e) => (
                <button key={e.id} type="button" role="radio" aria-checked={engine === e.id} onClick={() => setEngine(e.id)} data-testid={`img-model-${e.id}`} className="flex min-h-[56px] items-center gap-2 rounded-[18px] px-3.5 text-left transition-colors" style={engine === e.id ? { background: "var(--halo-a)" } : { background: "var(--surface-2)" }}>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-medium">{e.label}</span>
                    <span className="block truncate text-[11.5px] text-[rgb(var(--ink-rgb)/var(--ink-3-a))]">{e.sub}</span>
                  </span>
                  {engine === e.id && <CIcon name="check" size={16} />}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-1.5 text-[12.5px] text-[rgb(var(--ink-rgb)/var(--ink-3-a))]">Aspect ratio</legend>
            <div className="calm-seg" role="group" aria-label="Aspect ratio">
              {ASPECTS.map((a) => (
                <button key={a.id} type="button" aria-pressed={aspect === a.id} onClick={() => setAspect(a.id)}>{a.label}</button>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-1.5 text-[12.5px] text-[rgb(var(--ink-rgb)/var(--ink-3-a))]">Style</legend>
            <div className="flex flex-wrap gap-1.5">
              {STYLES.map((s) => (
                <Seg key={s.id} label={s.label} on={style === s.id} onClick={() => setStyle(s.id)} />
              ))}
            </div>
          </fieldset>
          <label className="block">
            <span className="mb-1.5 block text-[12.5px] text-[rgb(var(--ink-rgb)/var(--ink-3-a))]">Negative prompt</span>
            <input value={negative} onChange={(e) => setNegative(e.target.value)} placeholder="blurry, text, watermark" className="calm-field" />
          </label>
          <div className="flex items-center gap-2">
            <label className="flex flex-1 items-center gap-2">
              <span className="text-[12.5px] text-[rgb(var(--ink-rgb)/var(--ink-3-a))]">Seed</span>
              <input value={seed} inputMode="numeric" onChange={(e) => setSeed(Number(e.target.value.replace(/\D/g, "")) || 0)} className="calm-field tnum !py-2.5" aria-label="Seed" />
            </label>
            <button type="button" className="calm-btn" onClick={() => setSeed(randomSeed())} aria-label="Randomize seed">
              <CIcon name="dice" size={16} />
            </button>
          </div>
          <button type="button" className="calm-btn w-full !h-12" data-primary="true" disabled={!prompt.trim() || res?.state === "loading" || !apex.unlocked} onClick={() => generate()}>
            {res?.state === "loading" ? "Generating…" : "Generate"}
          </button>
        </section>

        <section aria-label="Result" aria-live="polite">
          <div className="calm-card overflow-hidden p-3" data-beam="true">
            <div className="relative mx-auto w-full overflow-hidden rounded-[18px]" style={{ aspectRatio: `${size.w} / ${size.h}`, maxHeight: 560 }}>
              {(!res || res.state !== "ok") && (
                <div className={`absolute inset-0 grid place-items-center px-6 text-center text-[13px] text-[rgb(var(--ink-rgb)/var(--ink-3-a))] ${res?.state === "loading" ? "shimmer" : "bg-[var(--surface-2)]"}`}>
                  <span className="relative z-[1]">{!res ? "Your image appears here" : res.state === "loading" ? (res.wait ? `All models are busy, retrying in ${res.wait}s` : res.fell ? `Switching to ${res.fell} automatically…` : "Generating, this can take 5 to 20 seconds…") : (res.err ?? "Generation failed. Try again.")}</span>
                </div>
              )}
              {res?.state === "ok" && res.src && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={res.src} alt={res.job.prompt} onClick={() => onZoom(res.src ?? res.url, res.job.prompt)} className="h-full w-full cursor-zoom-in object-cover" />
              )}
            </div>
            {res?.state === "ok" && (
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" className="calm-btn" onClick={() => void downloadImage(res.src ?? res.url, `apex-${res.job.seed}.jpg`)}>
                  <CIcon name="download" size={15} /> Download
                </button>
                <button type="button" className="calm-btn" data-tone="sage" onClick={() => onUseInChat(res.url, res.job.prompt, res.src ?? res.url)}>
                  <CIcon name="corner" size={15} /> Use in chat
                </button>
                <button type="button" className="calm-btn" onClick={reroll}>
                  <CIcon name="refresh" size={15} /> New seed
                </button>
              </div>
            )}
            {res?.state === "err" && (
              <button type="button" className="calm-btn mt-3" onClick={() => generate()}>
                <CIcon name="refresh" size={15} /> Try again
              </button>
            )}
          </div>
        </section>
      </div>

      {gallery.length > 0 && (
        <section aria-label="Gallery" className="mt-9">
          <h2 className="mb-3 text-[16px] font-medium tracking-[-0.02em]">Recent</h2>
          <ul className="scroll-quiet -mx-5 flex gap-3 overflow-x-auto px-5 pb-2">
            {gallery.slice(0, 12).map((g) => (
              <li key={g.id} className="group relative h-[132px] w-[132px] shrink-0 overflow-hidden rounded-[22px] shadow-[var(--shadow-card)] shimmer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={g.thumb ?? g.url} alt={g.prompt} loading="lazy" onClick={() => onZoom(g.thumb ?? g.url, g.prompt)} className="relative z-[1] h-full w-full cursor-zoom-in object-cover" />
                <button type="button" aria-label="Remove from gallery" onClick={() => removeFromGallery(g.id)} className="absolute right-1.5 top-1.5 z-[2] grid h-8 w-8 place-items-center rounded-full bg-[var(--surface)]/90 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100">
                  <CIcon name="x" size={14} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
