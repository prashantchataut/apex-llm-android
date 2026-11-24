"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";
import { RippleButton } from "@/components/ui/Glass";
import { FanStack } from "@/components/ui/FanStack";
import { BADGE, DEVICES, fmtBytes, GIB, recommend, score, type DeviceProfile } from "@/lib/compat";
import { etaSeconds, fmtEta, MEDIA_CATALOG, mediaTotalGB, scoreMedia, type MediaKind, type MediaModel } from "@/lib/media";
import { CATALOG, kvFor, VOICE_MODELS } from "@/lib/models";
import type { Downloads, DlState } from "./useDownloads";

type Section = "text" | "image" | "video" | "voice";
const SECTIONS: { id: Section; label: string; icon: IconName }[] = [
  { id: "text", label: "Text", icon: "chat" },
  { id: "image", label: "Image", icon: "image" },
  { id: "video", label: "Video", icon: "film" },
  { id: "voice", label: "Voice", icon: "mic" },
];

export function ProgressBar({ pct }: { pct: number }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
      <div className="h-full origin-left rounded-full bg-gradient-to-r from-accent to-accent-2" style={{ transform: `scaleX(${pct / 100})` }} />
    </div>
  );
}

export function DlButton({ state, onClick, label }: { state: DlState; onClick: () => void; label: string }) {
  if (state.status === "done")
    return (
      <span className="flex h-11 items-center gap-1 rounded-full bg-ok/15 px-3.5 text-[12px] font-medium text-ok">
        <Icon name="check" size={15} /> Installed
      </span>
    );
  return (
    <RippleButton
      onClick={onClick}
      aria-label={state.status === "downloading" ? "Pause download" : state.status === "paused" ? "Resume download" : label}
      className="flex h-11 min-w-[72px] items-center justify-center gap-1.5 rounded-full bg-white px-4 text-[12.5px] font-semibold text-black"
    >
      <Icon name={state.status === "downloading" ? "pause" : "download"} size={15} strokeWidth={2.2} />
      <span className="tnum">{state.status === "downloading" ? `${Math.floor(state.pct)}%` : state.status === "paused" ? "Resume" : label}</span>
    </RippleButton>
  );
}

function Badge({ c }: { c: keyof typeof BADGE }) {
  return <span className={`inline-block rounded-full border px-2.5 py-1 text-[11px] font-medium ${BADGE[c].tone}`}>{BADGE[c].label}</span>;
}

function SectionTitle({ children }: { children: string }) {
  return <h3 className="mb-3 mt-7 text-[12px] font-semibold uppercase tracking-[0.14em] text-ink-3">{children}</h3>;
}

/** Archetype B — frosted telemetry card with fanned data cards; every model is scored against this phone. */
export function HubScreen({
  activeKeys,
  dev,
  setDev,
  source,
  downloads,
  initialSection = "text",
}: {
  activeKeys: number;
  dev: DeviceProfile;
  setDev: (d: DeviceProfile) => void;
  source: "native" | "browser" | "preset";
  downloads: Downloads;
  initialSection?: Section;
}) {
  const [section, setSection] = useState<Section>(initialSection);
  const rec = recommend(dev);
  const ctx = Math.min(4096, rec.maxCtx);
  const speedIdx = dev.speed >= 1.5 ? 2 : dev.speed >= 0.8 ? 1 : 0;
  const tps = [6.2, 18.4, 31.7][speedIdx];
  const usedPct = Math.round(((dev.totalGB - dev.availGB) / dev.totalGB) * 100);
  const devIdx = DEVICES.findIndex((d) => d.label === dev.label);

  return (
    <div className="scroll-hide h-full overflow-y-auto px-5 pb-6 pt-14">
      <div className="mb-9 flex items-end justify-between">
        <h2 className="display text-[30px]">Models</h2>
        <span className="mono text-[11px] text-ink-3">Hugging Face</span>
      </div>

      <FanStack
        cards={[
          { label: "Speed est.", value: tps.toFixed(1), unit: "tok/s" },
          { label: "RAM free", value: dev.availGB.toFixed(1), unit: "GB" },
          { label: "Quant", value: rec.quant },
          { label: "API keys", value: String(activeKeys), unit: "active" },
          { label: "Context", value: String(ctx) },
        ]}
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-2">This phone</div>
            <div className="mt-0.5 text-[20px] font-semibold tracking-tight">{dev.label}</div>
          </div>
          <span className="icon-pill !h-11 !w-11 text-white">
            <Icon name="cpu" size={20} />
          </span>
        </div>
        <div className="mt-4">
          <div className="tnum mb-1.5 flex justify-between text-[12px] text-ink-2">
            <span>RAM in use</span>
            <span>
              {(dev.totalGB - dev.availGB).toFixed(1)} / {dev.totalGB.toFixed(1)} GB
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-black/20">
            <div className="h-full origin-left rounded-full bg-white/90 transition-transform duration-700 ease-out" style={{ transform: `scaleX(${usedPct / 100})` }} />
          </div>
        </div>
        <div className="mono mt-4 flex flex-wrap gap-1.5 text-[10.5px]">
          {[`max GGUF ${fmtBytes(rec.maxGgufBytes)}`, dev.vulkan ? "Vulkan" : "No Vulkan", dev.npu ? "NPU" : "No NPU", `${rec.threads} threads`, rec.cpuVariant].map((c) => (
            <span key={c} className="rounded-full bg-black/20 px-2.5 py-1 text-ink-2">
              {c}
            </span>
          ))}
        </div>
      </FanStack>

      {source !== "native" && (
        <>
          <div className="mt-4 flex gap-2" role="radiogroup" aria-label="Preview another phone">
            {DEVICES.map((d, i) => (
              <button
                key={d.label}
                role="radio"
                aria-checked={i === devIdx}
                onClick={() => setDev(d)}
                className={`min-h-11 flex-1 rounded-2xl border px-2 py-2.5 text-[12px] font-medium transition-[colors,transform] active:scale-[0.97] ${i === devIdx ? "border-white/40 bg-white/15 text-white" : "border-white/10 text-ink-3"}`}
              >
                {d.label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11.5px] text-ink-3">Preview another phone. Fit badges update instantly.</p>
        </>
      )}

      {/* section switcher */}
      <div role="tablist" aria-label="Model type" className="glass-dark relative mt-6 flex rounded-full p-1">
        {SECTIONS.map((s) => {
          const on = s.id === section;
          return (
            <button
              key={s.id}
              role="tab"
              aria-selected={on}
              onClick={() => setSection(s.id)}
              className="relative flex h-11 flex-1 items-center justify-center gap-1.5 rounded-full text-[12.5px] font-medium transition-transform active:scale-[0.97]"
            >
              {on && <motion.span layoutId="hub-seg" className="absolute inset-0 rounded-full bg-white/[0.14]" transition={{ type: "spring", stiffness: 420, damping: 32 }} />}
              <span className={`relative flex items-center gap-1.5 ${on ? "text-white" : "text-ink-3"}`}>
                <Icon name={s.icon} size={15} />
                {s.label}
              </span>
            </button>
          );
        })}
      </div>

      {section === "text" && (
        <>
          <SectionTitle>Language models · GGUF</SectionTitle>
          <div className="space-y-2.5">
            {CATALOG.map((m) => {
              const c = score(dev, m.sizeGB * GIB, kvFor(m, ctx));
              const s = downloads.get(m.id);
              return (
                <div key={m.id} className={`bento p-3.5 transition-opacity ${c === "incompatible" ? "opacity-70" : ""}`}>
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[14.5px] font-medium tracking-tight">{m.name}</div>
                      <div className="mono mt-0.5 text-[11px] text-ink-3">
                        {m.paramsB}B · {m.quant} · {m.sizeGB.toFixed(2)} GB{m.reasoning ? " · reasoning" : ""}
                      </div>
                      <div className="mt-2">
                        <Badge c={c} />
                      </div>
                    </div>
                    {c !== "incompatible" && <DlButton state={s} onClick={() => downloads.toggle(m.id)} label="Get" />}
                  </div>
                  {s.status !== "idle" && s.status !== "done" && (
                    <div className="mt-3">
                      <ProgressBar pct={s.pct} />
                      <div className="mono tnum mt-1.5 flex justify-between text-[10.5px] text-ink-3">
                        <span>
                          {((s.pct / 100) * m.sizeGB).toFixed(2)} / {m.sizeGB.toFixed(2)} GB
                        </span>
                        <span>{s.status === "paused" ? "paused · resumable" : "downloading"}</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <p className="mt-4 text-[11px] leading-relaxed text-ink-3">Sizes and layer counts are rounded demo values. The app reads exact sizes and SHA-256 from Hugging Face.</p>
        </>
      )}

      {(section === "image" || section === "video") && <MediaList kind={section} dev={dev} downloads={downloads} />}

      {section === "voice" && (
        <>
          <SectionTitle>Dictation · on-device</SectionTitle>
          <div className="space-y-2.5">
            {VOICE_MODELS.map((v) => {
              const s = downloads.get(v.id);
              return (
                <div key={v.id} className="bento p-3.5">
                  <div className="flex items-center gap-3">
                    <span className="icon-pill shrink-0">
                      <Icon name="mic" size={17} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[14px] font-medium">{v.name}</div>
                      <div className="text-[11.5px] text-ink-3">
                        about {v.mb} MB · {v.note}
                      </div>
                    </div>
                    <DlButton state={s} onClick={() => downloads.toggle(v.id)} label="Get" />
                  </div>
                  {s.status !== "idle" && s.status !== "done" && (
                    <div className="mt-3">
                      <ProgressBar pct={s.pct} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <p className="mt-4 text-[11px] leading-relaxed text-ink-3">Sizes are unverified estimates until the recognizer backend lands.</p>
        </>
      )}
    </div>
  );
}

function MediaList({ kind, dev, downloads }: { kind: MediaKind; dev: DeviceProfile; downloads: Downloads }) {
  const list = MEDIA_CATALOG.filter((m) => m.kind === kind);
  const order = { optimal: 0, heavy: 1, incompatible: 2 } as const;
  const sorted = [...list].sort((a, b) => order[scoreMedia(dev, a)] - order[scoreMedia(dev, b)] || b.quality - a.quality);
  return (
    <>
      <SectionTitle>{kind === "image" ? "Image generation" : "Video generation"}</SectionTitle>
      <div className="bento mb-3 flex gap-3 p-3.5 text-[12.5px] leading-relaxed text-ink-2">
        <Icon name="prism" size={16} className="mt-0.5 shrink-0 text-accent" />
        <p>
          Runs offline through <span className="mono text-[11.5px]">stable-diffusion.cpp</span>. Models install and score today; the Android generation engine is still being wired in.
        </p>
      </div>
      <div className="space-y-2.5">
        {sorted.map((m) => (
          <MediaCard key={m.id} m={m} dev={dev} downloads={downloads} />
        ))}
      </div>
      <p className="mt-4 text-[11px] leading-relaxed text-ink-3">Main file sizes come from the Hugging Face API. Encoder sizes, memory use and run times are estimates for a mid-range phone.</p>
    </>
  );
}

function MediaCard({ m, dev, downloads }: { m: MediaModel; dev: DeviceProfile; downloads: Downloads }) {
  const c = scoreMedia(dev, m);
  const s = downloads.get(m.id);
  const total = mediaTotalGB(m);
  const extras = m.companions.length;
  return (
    <div className={`bento p-3.5 transition-opacity ${c === "incompatible" ? "opacity-70" : ""}`}>
      <div className="flex items-start gap-3">
        <span className="icon-pill mt-0.5 shrink-0">
          <Icon name={m.kind === "image" ? "image" : "film"} size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14.5px] font-medium tracking-tight">{m.name}</div>
          <div className="mono mt-0.5 text-[11px] text-ink-3">
            {m.family} · {m.sizeGB.toFixed(2)} GB{extras > 0 ? ` + ${(total - m.sizeGB).toFixed(1)} GB encoders` : ""}
          </div>
          <div className="mt-1.5 text-[12.5px] text-ink-2">{m.note}</div>
          <div className="mono mt-2 flex flex-wrap gap-1.5 text-[10.5px]">
            <span className="rounded-full bg-white/10 px-2.5 py-1 text-ink-2">{m.output}</span>
            <span className="rounded-full bg-white/10 px-2.5 py-1 text-ink-2">{m.engine === "sd.cpp" ? "CPU · Vulkan" : m.engine === "mnn" ? "CPU · MNN" : "NPU · QNN"}</span>
            {c !== "incompatible" && <span className="tnum rounded-full bg-white/10 px-2.5 py-1 text-ink-2">{fmtEta(etaSeconds(dev, m))} each</span>}
          </div>
          <div className="mt-2.5 flex items-center gap-2">
            <Badge c={c} />
            {m.needsNpu && !dev.npu && <span className="text-[11px] text-ink-3">Needs a Snapdragon NPU</span>}
          </div>
        </div>
        {c !== "incompatible" && <DlButton state={s} onClick={() => downloads.toggle(m.id)} label="Get" />}
      </div>
      {s.status !== "idle" && s.status !== "done" && (
        <div className="mt-3">
          <ProgressBar pct={s.pct} />
          <div className="mono tnum mt-1.5 flex justify-between text-[10.5px] text-ink-3">
            <span>
              {((s.pct / 100) * total).toFixed(2)} / {total.toFixed(2)} GB
            </span>
            <span>{s.status === "paused" ? "paused · resumable" : "downloading"}</span>
          </div>
        </div>
      )}
    </div>
  );
}
