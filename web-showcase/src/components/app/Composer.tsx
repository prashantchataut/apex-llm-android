"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { RippleButton } from "@/components/ui/Glass";
import { readAttachment, TEXT_ACCEPT, type Attachment } from "@/lib/attachments";
import { fmtK } from "./GuardPill";
import { PromptBar, type VoiceState } from "./PromptBar";

/** Frosted-glass "Attached Context" chip: file or photo, live token estimate, remove. */
function Chip({ a, onRemove, budget }: { a: Attachment; onRemove: () => void; budget: number }) {
  const over = a.kind === "text" && a.tokens > budget;
  return (
    <motion.div layout initial={{ opacity: 0, y: 8, scale: 0.94 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ type: "spring", stiffness: 420, damping: 30 }} className={`glass-dark flex h-12 max-w-[240px] shrink-0 items-center gap-2 rounded-2xl pl-1.5 pr-0.5 ${a.error ? "!border-bad/50" : ""}`}>
      {a.preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={a.preview} alt="" className="h-9 w-9 rounded-xl object-cover" />
      ) : (
        <span className={`grid h-9 w-9 place-items-center rounded-xl ${a.error ? "bg-bad/20 text-bad" : "bg-white/10 text-ink-2"}`}>
          <Icon name={a.error ? "x" : "book"} size={16} />
        </span>
      )}
      <span className="min-w-0">
        <span className="block max-w-[120px] truncate text-[12.5px] font-medium leading-tight">{a.name}</span>
        <span className={`mono tnum block truncate text-[10.5px] leading-tight ${a.error ? "text-bad" : over ? "text-warn" : "text-ink-3"}`}>{a.error ?? (a.kind === "image" ? `photo · ~${a.tokens} tok` : `~${fmtK(a.tokens)} tok · ${a.chunks.length} chunk${a.chunks.length === 1 ? "" : "s"}${over ? " · trimmed" : ""}`)}</span>
      </span>
      <button type="button" onClick={onRemove} aria-label={`Remove ${a.name}`} className="grid h-11 w-9 shrink-0 place-items-center rounded-full text-ink-3 active:scale-90">
        <Icon name="x" size={14} />
      </button>
    </motion.div>
  );
}

/** Prompt composer: attached-context chips · [Upload][Camera][Voice] quick actions · prompt bar. */
export function Composer({
  value,
  onChange,
  onSend,
  voice,
  onMic,
  busy,
  placeholder,
  quickActions = true,
  ctx = 4096,
  footer,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: (text: string, attachments: Attachment[]) => void;
  voice: VoiceState;
  onMic: () => void;
  busy?: boolean;
  placeholder?: string;
  quickActions?: boolean;
  ctx?: number;
  footer?: string;
}) {
  const [atts, setAtts] = useState<Attachment[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const budget = Math.floor(ctx * 0.5);

  const add = async (files: FileList | null, kind: "text" | "image") => {
    if (!files) return;
    const read = await Promise.all(Array.from(files).slice(0, 4).map((f) => readAttachment(f, kind)));
    setAtts((cur) => [...cur, ...read].slice(-6));
  };
  const total = atts.filter((a) => !a.error).reduce((n, a) => n + a.tokens, 0);

  return (
    <div>
      {quickActions && (
        <div className="mb-2.5 flex justify-center">
          <div className="glass flex items-center gap-1 p-1 text-[13px] font-medium">
            <input ref={fileRef} type="file" multiple accept={TEXT_ACCEPT} className="hidden" aria-label="Choose files to attach" onChange={(e) => { void add(e.target.files, "text"); e.target.value = ""; }} />
            <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" aria-label="Take a photo" onChange={(e) => { void add(e.target.files, "image"); e.target.value = ""; }} />
            <RippleButton type="button" onClick={() => fileRef.current?.click()} className="relative z-[1] flex h-11 items-center gap-1.5 rounded-full px-3.5">
              <Icon name="upload" size={16} /> Upload
            </RippleButton>
            <RippleButton type="button" onClick={() => camRef.current?.click()} className="relative z-[1] flex h-11 items-center gap-1.5 rounded-full px-3.5">
              <Icon name="camera" size={16} /> Camera
            </RippleButton>
            <RippleButton type="button" onClick={onMic} className="relative z-[1] flex h-11 items-center gap-1.5 rounded-full px-3.5">
              <Icon name="mic" size={16} /> Voice
            </RippleButton>
          </div>
        </div>
      )}
      <AnimatePresence initial={false}>
        {atts.length > 0 && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="scroll-hide mb-2 flex items-center gap-2 overflow-x-auto pb-0.5" aria-label="Attached context">
              <AnimatePresence initial={false}>
                {atts.map((a) => (
                  <Chip key={a.id} a={a} budget={budget} onRemove={() => setAtts((c) => c.filter((x) => x.id !== a.id))} />
                ))}
              </AnimatePresence>
              <span className="mono tnum shrink-0 pl-1 text-[10.5px] text-ink-3">{fmtK(total)} / {fmtK(budget)} tok</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <PromptBar
        value={value}
        onChange={onChange}
        voice={voice}
        onMic={onMic}
        disabled={busy}
        placeholder={placeholder}
        canSendEmpty={atts.some((a) => !a.error)}
        onSubmit={() => {
          onSend(value.trim() || (atts.some((a) => a.kind === "image") ? "Describe this image." : "Summarise the attached files."), atts.filter((a) => !a.error));
          onChange("");
          setAtts([]);
        }}
      />
      {(voice.notice || footer) && <p className="mono mt-2 text-center text-[10px] text-ink-3">{voice.notice ?? footer}</p>}
    </div>
  );
}
