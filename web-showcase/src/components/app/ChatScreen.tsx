"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { ShimmerBadge } from "@/components/ui/Glass";
import type { Attachment } from "@/lib/attachments";
import type { Cartridge } from "@/lib/cartridges";
import { AssistantBody } from "./Rich";
import { Composer } from "./Composer";
import { GuardPill } from "./GuardPill";
import { ThinkingAccordion } from "./ThinkingAccordion";
import { useVoiceDemo } from "./useVoice";
import { modelLabel, type ChatMsg } from "./useChat";

/** Archetype D — cobalt aurora, reasoning timeline, KaTeX, clarifying-choice cards. */
export function ChatScreen({ msgs, busy, onSend, model, cartridge, kvUsed }: { msgs: ChatMsg[]; busy: boolean; onSend: (p: string, atts?: Attachment[]) => void; model: string | null; cartridge: Cartridge; kvUsed: number }) {
  const [value, setValue] = useState("");
  const { voice, toggleVoice } = useVoiceDemo(setValue);
  const scroller = useRef<HTMLDivElement>(null);
  const last = msgs[msgs.length - 1];
  const stats = [...msgs].reverse().find((m) => m.stats)?.stats;

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [msgs.length, last?.text.length, last?.stepsShown]);

  return (
    <div className="flex h-full flex-col">
      <header className="px-5 pb-3 pt-14">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <div className="text-[17px] font-semibold tracking-tight">Chat</div>
            <div className="mono mt-0.5 truncate text-[11px] text-ink-3">{model ? modelLabel(model) : "Qwen2.5-3B · Q4_K_M"} · {cartridge.name}</div>
          </div>
          {busy ? (
            <ShimmerBadge>Reasoning</ShimmerBadge>
          ) : (
            <span className="mono tnum shrink-0 whitespace-nowrap rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-[11px] text-ink-2">{stats ? `${stats.tps.toFixed(1)} tok/s` : "18.4 tok/s"}</span>
          )}
        </div>
        <GuardPill className="mt-2.5" kvUsed={kvUsed} kvMax={cartridge.ctx} />
      </header>

      <div ref={scroller} className="scroll-hide flex-1 space-y-5 overflow-y-auto px-5 pb-4">
        {msgs.length === 0 && (
          <div className="mt-20 text-center text-ink-3">
            <div className="glass-dark mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl">
              <Icon name="chat" size={24} />
            </div>
            <p className="text-[15px]">Ask something — or attach a file with Upload.</p>
          </div>
        )}
        {msgs.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="flex flex-col items-end gap-1.5">
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
              <div className="max-w-[85%] rounded-[22px] rounded-br-md border border-white/10 bg-white/[0.09] px-4 py-2.5 text-[15px] leading-snug">{m.text}</div>
            </div>
          ) : (
            <div key={m.id} className="space-y-3">
              {m.steps && m.steps.length > 0 && m.thinkStart !== undefined && <ThinkingAccordion steps={m.steps} shown={m.stepsShown ?? 0} startedAt={m.thinkStart} endedAt={m.thinkEnd ?? null} />}
              {m.text && <AssistantBody text={m.text} streaming={!!m.streaming} onChoice={(a) => onSend(a)} />}
            </div>
          ),
        )}
      </div>

      <div className="px-4 pb-2">
        <Composer
          value={value}
          onChange={setValue}
          voice={voice}
          onMic={toggleVoice}
          busy={busy}
          quickActions
          ctx={cartridge.ctx}
          placeholder={busy ? "Apex is answering…" : "Reply…"}
          onSend={(t, a) => onSend(t, a)}
        />
      </div>
    </div>
  );
}
