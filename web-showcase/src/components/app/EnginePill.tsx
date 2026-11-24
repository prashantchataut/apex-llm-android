"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { RippleButton } from "@/components/ui/Glass";
import { activeBackend, loadWllamaModel, MB, saveRouter, shortModelName, unloadWllama, useEngine, type Backend } from "@/lib/engine";
import { CATALOG } from "@/lib/models";
import { isNative } from "@/lib/native";
import { haptic } from "@/lib/haptics";
import { modelLabel } from "./useChat";

const TONE: Record<Backend, { dot: string; text: string; ring: string }> = {
  native: { dot: "bg-ok", text: "text-ok", ring: "border-ok/30" },
  wllama: { dot: "bg-ok", text: "text-ok", ring: "border-ok/30" },
  external: { dot: "bg-[#60a5fa]", text: "text-[#93c5fd]", ring: "border-[#60a5fa]/30" },
  sandbox: { dot: "bg-warn", text: "text-warn", ring: "border-warn/30" },
};

const LOADABLE = CATALOG.filter((m) => m.nano || m.id === "qwen25-05b");
const fmtMb = (b: number) => (b / MB).toFixed(1);

/** Honest engine telemetry pill: states exactly which backend produced (or will produce) the tokens. */
export function EnginePill({ nativeModel }: { nativeModel: string | null }) {
  const eng = useEngine();
  const [open, setOpen] = useState(false);
  const backend = activeBackend(eng);
  const loadedCat = CATALOG.find((c) => c.id === eng.loaded.a);
  const p = eng.progress;
  const nano = LOADABLE[0];
  const tone = TONE[backend];

  let label: string;
  if (p && p.phase !== "error") {
    const m = CATALOG.find((c) => c.id === p.modelId);
    label = p.phase === "downloading" ? `DOWNLOADING ${fmtMb(p.loaded)} / ${fmtMb(p.total)} MB · ${p.mbps.toFixed(1)} MB/s` : `LOADING ${shortModelName(m).toUpperCase()} INTO WASM`;
  } else if (backend === "external") label = `EXTERNAL API ROUTER · ${eng.router?.model}`;
  else if (backend === "native") label = `NATIVE RUST GGUF · ${modelLabel(eng.nativeModel ?? nativeModel)}`;
  else if (backend === "wllama") label = `WLLAMA GGUF · ${shortModelName(loadedCat)}`;
  else label = `SANDBOX DEMO ENGINE · tap to load ${Math.round(nano.sizeGB * 1000)} MB Nano GGUF`;
  const busy = !!p && p.phase !== "error";

  return (
    <>
      <button
        type="button"
        onClick={() => {
          haptic("detentClick");
          setOpen((v) => !v);
        }}
        aria-expanded={open}
        aria-label="Execution engine"
        className={`relative flex h-9 max-w-full items-center gap-2 overflow-hidden rounded-full border bg-white/[0.05] pl-3 pr-3.5 text-left transition-transform active:scale-[0.98] ${tone.ring}`}
      >
        <span className={`h-2 w-2 shrink-0 rounded-full ${tone.dot} ${busy ? "animate-pulse" : ""}`} style={{ boxShadow: "0 0 10px currentColor" }} />
        <span className={`mono tnum truncate text-[10.5px] font-medium tracking-wide ${tone.text}`}>{label}</span>
        <span className="text-ink-3">
          <Icon name="chevron" size={12} />
        </span>
        {busy && p && <span className="absolute inset-x-0 bottom-0 h-[2px] origin-left bg-ok/80" style={{ transform: `scaleX(${p.total ? p.loaded / p.total : 0})` }} />}
      </button>

      <AnimatePresence>
        {open && (
          <>
            <motion.button type="button" aria-label="Close engine panel" className="absolute inset-0 z-30 bg-black/40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)} />
            <motion.div
              role="dialog"
              aria-label="Execution engine"
              className="glass-dark absolute inset-x-3 top-[104px] z-40 max-h-[70%] overflow-y-auto rounded-[26px] p-4 scroll-hide"
              initial={{ opacity: 0, y: -10, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.97 }}
              transition={{ type: "spring", stiffness: 380, damping: 30 }}
            >
              <div className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${tone.dot}`} />
                <div className={`mono text-[11px] font-semibold tracking-[0.14em] ${tone.text}`}>
                  {backend === "sandbox" ? "SIMULATED PREVIEW" : backend === "external" ? "EXTERNAL ROUTER" : "LIVE GGUF WEIGHTS"}
                </div>
                <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="ml-auto grid h-9 w-9 place-items-center rounded-full text-ink-3 active:scale-90">
                  <Icon name="x" size={16} />
                </button>
              </div>
              <p className="mt-1 text-[12px] leading-snug text-ink-3">
                {backend === "sandbox" ? "No neural network is running. Replies are scripted samples until you load a model." : backend === "external" ? "Tokens come from the endpoint below, not from this device." : isNative() ? "Weights run inside the Rust core on this phone." : "llama.cpp compiled to WebAssembly SIMD runs the weights in this tab. Nothing leaves the device."}
              </p>

              {!isNative() && (
                <div className="mt-3 space-y-2">
                  {LOADABLE.map((m) => {
                    const isLoaded = eng.loaded.a === m.id;
                    const cached = eng.cached.includes(m.id);
                    const mine = p?.modelId === m.id && p.phase !== "error";
                    return (
                      <div key={m.id} className="rounded-2xl border border-white/10 bg-white/[0.05] p-3">
                        <div className="flex items-center gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-[13.5px] font-medium">{m.name.split("·")[0].trim()}</div>
                            <div className="mono text-[10.5px] text-ink-3">
                              {m.quant} · {Math.round(m.sizeGB * 1000)} MB · {cached ? "cached on device" : "not downloaded"}
                            </div>
                          </div>
                          {isLoaded ? (
                            <button type="button" onClick={() => void unloadWllama("a")} className="mono flex h-11 items-center rounded-full bg-ok/15 px-3 text-[11.5px] font-semibold text-ok active:scale-95">
                              ACTIVE · EJECT
                            </button>
                          ) : (
                            <RippleButton disabled={!!p && p.phase !== "error"} onClick={() => void loadWllamaModel(m.id, "a").catch(() => undefined)} className="flex h-11 shrink-0 items-center gap-1.5 rounded-full bg-white px-3.5 text-[12.5px] font-semibold text-black disabled:opacity-40">
                              <Icon name={cached ? "play" : "download"} size={14} />
                              {cached ? "Load" : "Download"}
                            </RippleButton>
                          )}
                        </div>
                        {mine && p && (
                          <div className="mt-2.5">
                            <div className="h-1.5 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuenow={Math.round((p.loaded / (p.total || 1)) * 100)} aria-valuemin={0} aria-valuemax={100}>
                              <div className="h-full origin-left rounded-full bg-ok" style={{ transform: `scaleX(${p.total ? p.loaded / p.total : 0})`, transition: "transform 200ms linear" }} />
                            </div>
                            <div className="mono tnum mt-1.5 flex justify-between text-[10.5px] text-ink-3">
                              <span>
                                {fmtMb(p.loaded)} / {fmtMb(p.total)} MB
                              </span>
                              <span>{p.phase === "loading" ? "parsing GGUF · allocating KV" : `${p.mbps.toFixed(1)} MB/s`}</span>
                            </div>
                          </div>
                        )}
                        {p?.modelId === m.id && p.phase === "error" && <p className="mt-2 text-[11.5px] text-bad">{p.error ?? "Download failed."}</p>}
                      </div>
                    );
                  })}
                </div>
              )}

              <details className="mt-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3" open={backend === "external"}>
                <summary className="mono cursor-pointer list-none text-[11px] font-semibold tracking-[0.12em] text-ink-2">EXTERNAL API ROUTER · OPENROUTER / LOCAL LAN</summary>
                <RouterForm />
              </details>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

function RouterForm() {
  const eng = useEngine();
  const r = eng.router;
  const [baseUrl, setBaseUrl] = useState(r?.baseUrl ?? "https://openrouter.ai/api/v1");
  const [model, setModel] = useState(r?.model ?? "");
  const [key, setKey] = useState(r?.key ?? "");
  const field = "mono mt-1 h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-[12px] text-white outline-none focus:border-white/30";
  return (
    <div className="mt-2 space-y-2.5 text-[11px] text-ink-3">
      <label className="block">
        Base URL (OpenAI-compatible)
        <input className={field} value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="http://192.168.1.20:11434/v1" inputMode="url" />
      </label>
      <label className="block">
        Model
        <input className={field} value={model} onChange={(e) => setModel(e.target.value)} placeholder="qwen2.5:0.5b or openai/gpt-4o-mini" />
      </label>
      <label className="block">
        API key (stored on this device only)
        <input className={field} value={key} onChange={(e) => setKey(e.target.value)} placeholder="optional for LAN servers" type="password" autoComplete="off" />
      </label>
      <div className="flex gap-2">
        <button type="button" onClick={() => saveRouter({ baseUrl: baseUrl.trim(), model: model.trim(), key, enabled: true })} className="h-11 flex-1 rounded-full bg-white text-[12.5px] font-semibold text-black active:scale-95">
          {r?.enabled ? "Update & keep routing" : "Route chats here"}
        </button>
        {r && (
          <button type="button" onClick={() => saveRouter(null)} className="h-11 rounded-full border border-white/15 px-4 text-[12.5px] font-medium text-ink-2 active:scale-95">
            Disable
          </button>
        )}
      </div>
    </div>
  );
}
