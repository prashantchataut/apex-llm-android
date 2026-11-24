"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { ShimmerBadge } from "@/components/ui/Glass";
import type { Attachment } from "@/lib/attachments";
import type { Cartridge } from "@/lib/cartridges";
import { haptic } from "@/lib/haptics";
import { AssistantBody } from "./Rich";
import { ArenaView, type LaneResult } from "./ArenaView";
import { ArtifactDrawer, type Artifact } from "./Artifacts";
import { Composer } from "./Composer";
import { EnginePill } from "./EnginePill";
import { GuardPill } from "./GuardPill";
import { BentoModal, BranchPager, MsgFooter, TelemetryPopover } from "./MessageTools";
import { ThinkingAccordion } from "./ThinkingAccordion";
import { useVoice } from "./useVoice";
import { modelLabel, type BranchInfo, type ChatMsg } from "./useChat";
import type { BentoInput } from "@/lib/bento";

export interface ChatHandlers {
  onSend: (p: string, atts?: Attachment[]) => void;
  onEdit: (id: number, text: string) => void;
  onRegenerate: (id: number) => void;
  onStop: () => void;
  branchInfo: (id: number) => BranchInfo | null;
  onSwitch: (id: number) => void;
  onAdopt: (prompt: string, r: LaneResult) => void;
}

/** Archetype D — cobalt aurora, reasoning timeline, KaTeX, live artifacts, branching, Arena duel. */
export function ChatScreen({ msgs, busy, model, cartridge, kvUsed, handlers }: { msgs: ChatMsg[]; busy: boolean; model: string | null; cartridge: Cartridge; kvUsed: number; handlers: ChatHandlers }) {
  const { onSend, onEdit, onRegenerate, onStop, branchInfo, onSwitch, onAdopt } = handlers;
  const [value, setValue] = useState("");
  const { voice, toggleVoice } = useVoice(setValue);
  const scroller = useRef<HTMLDivElement>(null);
  const last = msgs[msgs.length - 1];
  const stats = [...msgs].reverse().find((m) => m.stats)?.stats;
  const [artifact, setArtifact] = useState<Artifact | null>(null);
  const [telemetryId, setTelemetryId] = useState<number | null>(null);
  const [bento, setBento] = useState<BentoInput | null>(null);
  const [editing, setEditing] = useState<{ id: number; draft: string } | null>(null);
  const [arena, setArena] = useState(false);
  const [job, setJob] = useState<{ prompt: string; nonce: number } | null>(null);
  const pillRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [msgs.length, last?.text.length, last?.stepsShown]);

  const telemetryMsg = useMemo(() => msgs.find((m) => m.id === telemetryId) ?? null, [msgs, telemetryId]);

  const share = (m: ChatMsg) => {
    const idx = msgs.findIndex((x) => x.id === m.id);
    const prompt = msgs[idx - 1]?.text ?? "";
    setBento({ prompt, think: m.steps?.join(" "), answer: m.text, stats: m.stats, engine: m.engine });
  };

  const submit = (t: string, a?: Attachment[]) => {
    if (arena) setJob({ prompt: t, nonce: Date.now() });
    else onSend(t, a);
  };

  return (
    <div className="relative flex h-full flex-col">
      <header className="px-5 pb-3 pt-14">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[17px] font-semibold tracking-tight">{arena ? "Apex Arena" : "Prompt Studio"}</div>
            <div className="mono mt-0.5 truncate text-[11px] text-ink-3">
              {model ? modelLabel(model) : "Local GGUF"} · {cartridge.name}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {busy && !arena ? (
              <button type="button" onClick={onStop} aria-label="Stop generating" className="flex h-9 items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.08] px-3 text-[11.5px] font-medium active:scale-95">
                <Icon name="stop" size={12} /> Stop
              </button>
            ) : (
              <span className="mono tnum hidden shrink-0 whitespace-nowrap rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-[11px] text-ink-2 min-[380px]:inline">{stats ? `${stats.tps.toFixed(1)} tok/s` : "idle"}</span>
            )}
            <button
              type="button"
              onClick={() => {
                haptic("heavyLock");
                setArena((v) => !v);
              }}
              aria-pressed={arena}
              aria-label="Toggle Arena mode"
              className={`flex h-11 items-center gap-1.5 rounded-full border px-3 text-[12px] font-semibold transition-transform active:scale-95 ${arena ? "border-transparent bg-white text-black" : "border-white/15 bg-white/[0.08] text-white"}`}
            >
              <Icon name="columns" size={15} /> Arena
            </button>
          </div>
        </div>
        <div className="mt-2.5" ref={pillRef}>
          <EnginePill nativeModel={model} />
        </div>
        {busy && !arena && (
          <div className="mt-2">
            <ShimmerBadge>Reasoning</ShimmerBadge>
          </div>
        )}
        <GuardPill className="mt-2.5" kvUsed={kvUsed} kvMax={cartridge.ctx} />
      </header>

      {arena ? (
        <div className="min-h-0 flex-1">
          <ArenaView job={job} defaultCartridge={cartridge} onCrown={(p, r) => onAdopt(p, r)} onNeedModel={() => pillRef.current?.querySelector("button")?.click()} />
        </div>
      ) : (
        <div ref={scroller} className="scroll-hide flex-1 space-y-5 overflow-y-auto px-5 pb-4">
          {msgs.length === 0 && (
            <div className="mt-16 text-center text-ink-3">
              <div className="glass-dark mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl">
                <Icon name="chat" size={24} />
              </div>
              <p className="text-[15px]">Ask something — or attach a file with Upload.</p>
              <p className="mono mt-2 text-[11px]">Try: “draw an SVG logo” · “mermaid flowchart of a login” · “a small HTML clicker game”</p>
            </div>
          )}
          {msgs.map((m) => {
            const b = branchInfo(m.id);
            return m.role === "user" ? (
              <div key={m.id} className="flex flex-col items-end gap-1">
                {m.attach && (
                  <div className="flex max-w-[85%] flex-wrap justify-end gap-1.5">
                    {m.attach.map((a, i) => (
                      <span key={i} className="glass-dark mono flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[10.5px] text-ink-2">
                        <Icon name={a.kind === "image" ? "camera" : "book"} size={12} />
                        <span className="max-w-[120px] truncate">{a.name}</span>
                        <span className="text-ink-3">~{a.tokens}</span>
                      </span>
                    ))}
                  </div>
                )}
                {editing?.id === m.id ? (
                  <div className="glass-dark w-full max-w-[92%] rounded-[22px] p-2.5">
                    <textarea
                      autoFocus
                      value={editing.draft}
                      onChange={(e) => setEditing({ id: m.id, draft: e.target.value })}
                      rows={3}
                      aria-label="Edit prompt"
                      className="w-full resize-none rounded-xl bg-black/30 p-3 text-[15px] leading-snug text-white outline-none"
                    />
                    <div className="mt-2 flex justify-end gap-2">
                      <button type="button" onClick={() => setEditing(null)} className="h-10 rounded-full border border-white/15 px-4 text-[12.5px] active:scale-95">
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onEdit(m.id, editing.draft);
                          setEditing(null);
                        }}
                        className="h-10 rounded-full bg-white px-4 text-[12.5px] font-semibold text-black active:scale-95"
                      >
                        Save as new branch
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="max-w-[85%] rounded-[22px] rounded-br-md border border-white/10 bg-white/[0.09] px-4 py-2.5 text-[15px] leading-snug">{m.text}</div>
                )}
                <div className="flex items-center gap-1">
                  {b && <BranchPager info={b} onSwitch={onSwitch} align="end" />}
                  {editing?.id !== m.id && !busy && (
                    <button type="button" onClick={() => setEditing({ id: m.id, draft: m.text })} aria-label="Edit prompt" className="grid h-10 w-10 place-items-center rounded-full text-ink-3 active:scale-90">
                      <Icon name="pencil" size={14} />
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div key={m.id} className="space-y-3">
                {m.steps && m.steps.length > 0 && m.thinkStart !== undefined && <ThinkingAccordion steps={m.steps} shown={m.stepsShown ?? 0} startedAt={m.thinkStart} endedAt={m.thinkEnd ?? null} />}
                {m.text && <AssistantBody text={m.text} streaming={!!m.streaming} onChoice={(a) => onSend(a)} onOpenArtifact={(a) => { haptic("heavyLock"); setArtifact(a); }} />}
                <MsgFooter m={m} disabled={busy} onTelemetry={() => setTelemetryId(m.id)} onRegenerate={() => onRegenerate(m.id)} onShare={() => share(m)} />
                {b && <BranchPager info={b} onSwitch={onSwitch} />}
              </div>
            );
          })}
        </div>
      )}

      <div className="px-4 pb-2">
        <Composer value={value} onChange={setValue} voice={voice} onMic={() => void toggleVoice()} busy={arena ? false : busy} quickActions ctx={cartridge.ctx} placeholder={arena ? "Send one prompt to both lanes…" : busy ? "Apex is answering…" : "Reply…"} onSend={(t, a) => submit(t, a)} />
      </div>

      <ArtifactDrawer artifact={artifact} onClose={() => setArtifact(null)} />
      <TelemetryPopover m={telemetryMsg} model={model ?? "—"} onClose={() => setTelemetryId(null)} />
      <BentoModal input={bento} onClose={() => setBento(null)} />
    </div>
  );
}
