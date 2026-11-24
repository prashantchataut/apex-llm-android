"use client";

import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { RippleButton } from "@/components/ui/Glass";
import { FanStack } from "@/components/ui/FanStack";
import { BADGE, DEVICES, fmtBytes, GIB, recommend, score } from "@/lib/compat";
import { CATALOG, kvFor, VOICE_MODELS } from "@/lib/models";

type DlState = { status: "idle" | "downloading" | "paused" | "done"; pct: number };

/** Simulated resumable downloader: click = start, click again = pause (keeps %), click = resume. */
function useDownloads() {
  const [dl, setDl] = useState<Record<string, DlState>>({});
  useEffect(() => {
    const id = window.setInterval(() => {
      setDl((cur) => {
        let changed = false;
        const next: Record<string, DlState> = { ...cur };
        for (const [k, v] of Object.entries(cur)) {
          if (v.status === "downloading") {
            changed = true;
            const pct = Math.min(100, v.pct + 1.6 + Math.random() * 1.4);
            next[k] = pct >= 100 ? { status: "done", pct: 100 } : { status: "downloading", pct };
          }
        }
        return changed ? next : cur;
      });
    }, 120);
    return () => window.clearInterval(id);
  }, []);
  const toggle = useCallback((id: string) => {
    setDl((cur) => {
      const v = cur[id] ?? { status: "idle", pct: 0 };
      if (v.status === "done") return cur;
      return { ...cur, [id]: { ...v, status: v.status === "downloading" ? "paused" : "downloading" } };
    });
  }, []);
  return { dl, toggle };
}

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
      <div className="h-full origin-left rounded-full bg-gradient-to-r from-violet-400 to-sky-300" style={{ transform: `scaleX(${pct / 100})` }} />
    </div>
  );
}

/** Archetype B — frosted telemetry card with fanned data cards; hardware-aware badges using the same algorithm as cortex-hf-hub::score. */
export function HubScreen({ activeKeys }: { activeKeys: number }) {
  const [devIdx, setDevIdx] = useState(1);
  const dev = DEVICES[devIdx];
  const rec = recommend(dev);
  const { dl, toggle } = useDownloads();
  const ctx = Math.min(4096, rec.maxCtx);
  const tps = [6.2, 18.4, 31.7][devIdx];
  const usedPct = Math.round(((dev.totalGB - dev.availGB) / dev.totalGB) * 100);

  return (
    <div className="scroll-hide h-full overflow-y-auto px-5 pb-6 pt-14">
      <div className="mb-5 flex items-end justify-between">
        <h2 className="display text-[30px]">Model Hub</h2>
        <span className="mono text-[11px] text-white/45">Hugging Face · GGUF</span>
      </div>

      <FanStack
        cards={[
          { label: "TPS est.", value: tps.toFixed(1) },
          { label: "RAM free", value: dev.availGB.toFixed(1), unit: "GB" },
          { label: "Quant", value: rec.quant },
          { label: "API keys", value: String(activeKeys), unit: "active" },
          { label: "Context", value: String(ctx) },
        ]}
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/60">This phone</div>
            <div className="mt-0.5 text-[20px] font-semibold tracking-tight">{dev.label}</div>
          </div>
          <span className="icon-pill !h-10 !w-10 text-white">
            <Icon name="cpu" size={20} />
          </span>
        </div>
        <div className="mt-4">
          <div className="tnum mb-1.5 flex justify-between text-[12px] text-white/70">
            <span>RAM in use</span>
            <span>
              {(dev.totalGB - dev.availGB).toFixed(1)} / {dev.totalGB.toFixed(1)} GB
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-black/25">
            <div className="h-full origin-left rounded-full bg-white/90 transition-transform duration-700 ease-out" style={{ transform: `scaleX(${usedPct / 100})` }} />
          </div>
        </div>
        <div className="mono mt-4 flex flex-wrap gap-1.5 text-[10.5px]">
          {[
            `max GGUF ${fmtBytes(rec.maxGgufBytes)}`,
            dev.vulkan ? "Vulkan ✓" : "Vulkan ✗",
            "NPU ✗",
            `${rec.threads} threads`,
            rec.cpuVariant,
          ].map((c) => (
            <span key={c} className="rounded-full bg-black/25 px-2.5 py-1 text-white/85">
              {c}
            </span>
          ))}
        </div>
      </FanStack>

      <div className="mt-4 flex gap-2" role="tablist" aria-label="Simulate device">
        {DEVICES.map((d, i) => (
          <button
            key={d.label}
            role="tab"
            aria-selected={i === devIdx}
            onClick={() => setDevIdx(i)}
            className={`flex-1 rounded-2xl border px-2 py-2.5 text-[12px] font-medium transition-colors ${i === devIdx ? "border-white/40 bg-white/15 text-white" : "border-white/10 text-white/50"}`}
          >
            {d.label}
          </button>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-white/35">Simulate another phone — badges re-score live.</p>

      {/* Voice installer */}
      <h3 className="mt-8 mb-3 text-[13px] font-semibold uppercase tracking-[0.14em] text-white/45">Voice input · on-device</h3>
      <div className="space-y-2.5">
        {VOICE_MODELS.map((v) => {
          const s = dl[v.id] ?? { status: "idle", pct: 0 };
          return (
            <div key={v.id} className="bento p-3.5">
              <div className="flex items-center gap-3">
                <span className="icon-pill shrink-0">
                  <Icon name="mic" size={17} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-medium">{v.name}</div>
                  <div className="text-[11.5px] text-white/45">
                    ≈{v.mb} MB · {v.note}
                  </div>
                </div>
                <DlButton state={s} onClick={() => toggle(v.id)} label="Install" />
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

      {/* GGUF list */}
      <h3 className="mt-8 mb-3 text-[13px] font-semibold uppercase tracking-[0.14em] text-white/45">GGUF models</h3>
      <div className="space-y-2.5">
        {CATALOG.map((m) => {
          const bytes = m.sizeGB * GIB;
          const c = score(dev, bytes, kvFor(m, ctx));
          const s = dl[m.id] ?? { status: "idle", pct: 0 };
          return (
            <div key={m.id} className={`bento p-3.5 transition-opacity ${c === "incompatible" ? "opacity-60" : ""}`}>
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14.5px] font-medium tracking-tight">{m.name}</div>
                  <div className="mono mt-0.5 text-[11px] text-white/45">
                    {m.paramsB}B · {m.quant} · ≈{m.sizeGB.toFixed(2)} GB{m.reasoning ? " · reasoning" : ""}
                  </div>
                  <span className={`mt-2 inline-block rounded-full border px-2.5 py-1 text-[11px] font-medium ${BADGE[c].tone}`}>{BADGE[c].label}</span>
                </div>
                {c === "incompatible" ? (
                  <span className="mt-1 text-[11px] text-white/35">Won’t fit</span>
                ) : (
                  <DlButton state={s} onClick={() => toggle(m.id)} label="Get" />
                )}
              </div>
              {s.status !== "idle" && s.status !== "done" && (
                <div className="mt-3">
                  <ProgressBar pct={s.pct} />
                  <div className="mono tnum mt-1.5 flex justify-between text-[10.5px] text-white/40">
                    <span>
                      {((s.pct / 100) * m.sizeGB).toFixed(2)} / {m.sizeGB.toFixed(2)} GB · 4 segments
                    </span>
                    <span>{s.status === "paused" ? "paused · resumable" : "downloading"}</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-4 text-[10.5px] leading-relaxed text-white/30">Sizes and layer counts are approximate demo values. The app reads exact sizes and SHA-256 from the Hugging Face API.</p>
    </div>
  );
}

function DlButton({ state, onClick, label }: { state: DlState; onClick: () => void; label: string }) {
  if (state.status === "done")
    return (
      <span className="flex h-10 items-center gap-1 rounded-full bg-emerald-400/15 px-3 text-[12px] font-medium text-emerald-300">
        <Icon name="check" size={15} /> Ready
      </span>
    );
  return (
    <RippleButton
      onClick={onClick}
      aria-label={state.status === "downloading" ? "Pause download" : state.status === "paused" ? "Resume download" : `${label}`}
      className="flex h-10 min-w-[64px] items-center justify-center gap-1.5 rounded-full bg-white px-3.5 text-[12.5px] font-semibold text-black"
    >
      <Icon name={state.status === "downloading" ? "pause" : "download"} size={15} strokeWidth={2.2} />
      {state.status === "downloading" ? `${Math.floor(state.pct)}%` : state.status === "paused" ? "Resume" : label}
    </RippleButton>
  );
}
