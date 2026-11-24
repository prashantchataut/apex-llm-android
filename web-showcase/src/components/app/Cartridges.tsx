"use client";

import { AnimatePresence, motion, useMotionTemplate, useMotionValue, useSpring } from "framer-motion";
import { useRef, useState, type PointerEvent } from "react";
import { Icon } from "@/components/ui/Icon";
import { RippleButton } from "@/components/ui/Glass";
import { newCustomCartridge, toModelfile, type Cartridge } from "@/lib/cartridges";
import { haptic } from "@/lib/haptics";

const CTX_STEPS = [1024, 2048, 4096, 8192, 16384];
const fmtCtx = (n: number) => `${n / 1024}k`;

/** One collectible frosted-glass Modelfile cartridge with pointer-driven 3D tilt and a moving specular highlight. */
function Cartridge3D({ c, active, onPick, onEdit }: { c: Cartridge; active: boolean; onPick: () => void; onEdit: () => void }) {
  const rx = useSpring(0, { stiffness: 260, damping: 22 });
  const ry = useSpring(0, { stiffness: 260, damping: 22 });
  const mx = useMotionValue(50);
  const my = useMotionValue(30);
  const glare = useMotionTemplate`radial-gradient(120px circle at ${mx}% ${my}%, rgba(255,255,255,0.42), transparent 62%)`;
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    ry.set((px - 0.5) * 22);
    rx.set((0.5 - py) * 18);
    mx.set(px * 100);
    my.set(py * 100);
  };
  const leave = () => {
    rx.set(0);
    ry.set(0);
    mx.set(50);
    my.set(30);
  };
  return (
    <div className="snap-center shrink-0 [perspective:700px]" onPointerMove={move} onPointerLeave={leave}>
      <motion.div style={{ rotateX: rx, rotateY: ry, transformStyle: "preserve-3d" }} animate={{ y: active ? -8 : 0, scale: active ? 1.03 : 1 }} transition={{ type: "spring", stiffness: 300, damping: 24 }} className="relative h-[196px] w-[150px]">
        <RippleButton
          onClick={onPick}
          aria-pressed={active}
          aria-label={`${c.name} cartridge${active ? ", loaded" : ""}`}
          className="absolute inset-0 overflow-hidden rounded-[22px] border border-white/20 p-3.5 text-left shadow-[0_18px_40px_-14px_rgba(0,0,0,0.7),inset_0_1px_0_rgba(255,255,255,0.35)] backdrop-blur-xl"
        >
          <span aria-hidden className="absolute inset-0" style={{ background: `linear-gradient(155deg, ${c.hue[0]}cc, ${c.hue[1]}f0 78%)` }} />
          <motion.span aria-hidden className="pointer-events-none absolute inset-0 mix-blend-soft-light" style={{ background: glare }} />
          {/* cartridge notch + contact strip */}
          <span aria-hidden className="absolute left-1/2 top-0 h-2.5 w-14 -translate-x-1/2 rounded-b-lg bg-black/45" />
          <span aria-hidden className="absolute bottom-0 left-4 right-4 h-1.5 rounded-t bg-[repeating-linear-gradient(90deg,rgba(255,255,255,0.55)_0_3px,transparent_3px_6px)]" />
          <span className="relative z-[1] flex h-full flex-col">
            <span className="mono flex items-center gap-1.5 pt-2 text-[9.5px] uppercase tracking-[0.16em] text-white/75">
              <span className={`h-1.5 w-1.5 rounded-full ${active ? "bg-ok shadow-[0_0_8px_#34d399]" : "bg-white/40"}`} />
              {active ? "Loaded" : c.builtin ? "Modelfile" : "Custom"}
            </span>
            <span className="mt-auto block text-[17px] font-semibold leading-[1.15] tracking-tight text-white">{c.name}</span>
            <span className="mt-1 block text-[11.5px] leading-snug text-white/75">{c.tagline}</span>
            <span className="mono mt-2.5 flex gap-2 pb-2.5 text-[10px] text-white/80">
              <span>T {c.temperature.toFixed(1)}</span>
              <span>p {c.topP.toFixed(2)}</span>
              <span>{fmtCtx(c.ctx)}</span>
            </span>
          </span>
        </RippleButton>
        <button type="button" onClick={onEdit} aria-label={`Edit ${c.name}`} className="absolute right-1.5 top-3 z-10 grid h-11 w-11 place-items-center rounded-full text-white/80 active:scale-90">
          <span className="grid h-7 w-7 place-items-center rounded-full bg-black/30 backdrop-blur">
            <Icon name="pencil" size={13} />
          </span>
        </button>
      </motion.div>
    </div>
  );
}

function Slider({ label, value, min, max, step, display, onChange }: { label: string; value: number; min: number; max: number; step: number; display: string; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <span className="mb-1 flex items-baseline justify-between text-[12px] text-ink-3">
        {label}
        <span className="mono tnum text-[12.5px] text-white">{display}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (v !== value) haptic("detentClick"); // one mechanical detent per notch
          onChange(v);
        }}
        className="h-11 w-full accent-[var(--accent,#8b7bff)]"
      />
    </label>
  );
}

function Editor({ draft, setDraft, onSave, onDelete, onClose }: { draft: Cartridge; setDraft: (c: Cartridge) => void; onSave: () => void; onDelete?: () => void; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const idx = Math.max(0, CTX_STEPS.indexOf(draft.ctx));
  return (
    <motion.div className="absolute inset-0 z-40 flex items-end bg-black/55 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div
        role="dialog"
        aria-label="Modelfile editor"
        onClick={(e) => e.stopPropagation()}
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 340, damping: 34 }}
        className="glass-dark scroll-hide max-h-[88%] w-full overflow-y-auto rounded-t-[28px] p-5"
        style={{ paddingBottom: "max(20px, env(safe-area-inset-bottom), var(--apex-inset-bottom, 0px))" }}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/25" />
        <div className="flex items-center justify-between">
          <h3 className="text-[18px] font-semibold tracking-tight">{draft.builtin ? "Customise a copy" : "Modelfile"}</h3>
          <button onClick={onClose} aria-label="Close" className="grid h-11 w-11 place-items-center rounded-full bg-white/[0.07]">
            <Icon name="x" size={18} />
          </button>
        </div>
        <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} aria-label="Name" className="glass-dark mt-3 h-12 w-full rounded-2xl px-4 text-[15px] outline-none" />
        <textarea value={draft.system} onChange={(e) => setDraft({ ...draft, system: e.target.value })} aria-label="System prompt" rows={5} className="glass-dark mt-3 w-full resize-none rounded-2xl px-4 py-3 text-[14px] leading-relaxed outline-none" />
        <div className="mt-2">
          <Slider label="Temperature" value={draft.temperature} min={0} max={2} step={0.1} display={draft.temperature.toFixed(1)} onChange={(v) => setDraft({ ...draft, temperature: Math.round(v * 10) / 10 })} />
          <Slider label="Top-p" value={draft.topP} min={0} max={1} step={0.05} display={draft.topP.toFixed(2)} onChange={(v) => setDraft({ ...draft, topP: Math.round(v * 100) / 100 })} />
          <Slider label="Context window" value={idx} min={0} max={CTX_STEPS.length - 1} step={1} display={`${fmtCtx(draft.ctx)} tokens`} onChange={(v) => setDraft({ ...draft, ctx: CTX_STEPS[v] })} />
        </div>
        <pre className="mono scroll-hide mt-2 max-h-28 overflow-auto rounded-2xl bg-black/30 p-3 text-[10.5px] leading-relaxed text-ink-2">{toModelfile(draft)}</pre>
        <div className="mt-4 flex gap-2">
          <RippleButton
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(toModelfile(draft));
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1400);
              } catch {
                /* clipboard unavailable */
              }
            }}
            className="flex h-12 items-center gap-1.5 rounded-full bg-white/[0.08] px-4 text-[13px] font-medium"
          >
            <Icon name={copied ? "check" : "copy"} size={15} /> {copied ? "Copied" : "Copy Modelfile"}
          </RippleButton>
          {onDelete && (
            <RippleButton onClick={onDelete} className="h-12 rounded-full px-4 text-[13px] text-bad">
              Delete
            </RippleButton>
          )}
          <RippleButton onClick={onSave} className="ml-auto flex h-12 items-center gap-1.5 rounded-full bg-white px-6 text-[14px] font-semibold text-black">
            Load cartridge
          </RippleButton>
        </div>
      </motion.div>
    </motion.div>
  );
}

/** Horizontal carousel of Modelfile system cartridges + "Create custom Modelfile". */
export function Cartridges({ all, selected, onSelect, onSave, onRemove }: { all: Cartridge[]; selected: Cartridge; onSelect: (id: string) => void; onSave: (c: Cartridge) => void; onRemove: (id: string) => void }) {
  const [draft, setDraft] = useState<Cartridge | null>(null);
  const root = useRef<HTMLElement>(null);
  const edit = (c: Cartridge) => setDraft(c.builtin ? { ...c, id: `custom-${Date.now().toString(36)}`, name: `${c.name} (copy)`, builtin: false } : { ...c });
  return (
    <section ref={root} aria-label="System cartridges">
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="text-[13px] font-semibold uppercase tracking-[0.14em] text-ink-3">System cartridges</h3>
        <span className="mono text-[10.5px] text-ink-3">Modelfile presets</span>
      </div>
      <div className="scroll-hide -mx-5 flex snap-x gap-3.5 overflow-x-auto px-5 pb-4 pt-3">
        {all.map((c) => (
          <Cartridge3D key={c.id} c={c} active={c.id === selected.id} onPick={() => onSelect(c.id)} onEdit={() => edit(c)} />
        ))}
        <div className="snap-center shrink-0">
          <RippleButton onClick={() => setDraft(newCustomCartridge())} aria-label="Create custom Modelfile" className="grid h-[196px] w-[150px] place-items-center rounded-[22px] border border-dashed border-white/25 text-ink-2">
            <span className="flex flex-col items-center gap-2 px-3 text-center text-[13px] font-medium">
              <span className="icon-pill">
                <Icon name="plus" size={18} />
              </span>
              Create custom Modelfile
            </span>
          </RippleButton>
        </div>
      </div>
      <AnimatePresence>
        {draft && (
          <Editor
            draft={draft}
            setDraft={setDraft}
            onClose={() => setDraft(null)}
            onSave={() => {
              onSave({ ...draft, builtin: false });
              setDraft(null);
            }}
            onDelete={!draft.builtin && all.some((x) => x.id === draft.id) ? () => (onRemove(draft.id), setDraft(null)) : undefined}
          />
        )}
      </AnimatePresence>
    </section>
  );
}
