"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { ShimmerBadge } from "@/components/ui/Glass";
import { AssistantBody } from "./Rich";
import { PromptBar } from "./PromptBar";
import { ThinkingAccordion } from "./ThinkingAccordion";
import { useVoiceDemo } from "./useVoice";
import type { ChatMsg } from "./useDemoChat";

/** Archetype D — cobalt aurora, reasoning timeline, KaTeX, MCQ cards. */
export function ChatScreen({ msgs, busy, onSend }: { msgs: ChatMsg[]; busy: boolean; onSend: (p: string) => void }) {
  const [value, setValue] = useState("");
  const { voice, toggleVoice } = useVoiceDemo(setValue);
  const scroller = useRef<HTMLDivElement>(null);
  const last = msgs[msgs.length - 1];

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [msgs.length, last?.text.length, last?.stepsShown]);

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between px-5 pb-3 pt-14">
        <div>
          <div className="text-[17px] font-semibold tracking-tight">Chat</div>
          <div className="mono mt-0.5 text-[11px] text-ink-3">Qwen2.5-3B · Q4_K_M · 4k ctx</div>
        </div>
        {busy ? (
          <ShimmerBadge>Reasoning</ShimmerBadge>
        ) : (
          <span className="mono tnum rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-[11px] text-ink-2">18.4 tok/s</span>
        )}
      </header>

      <div ref={scroller} className="scroll-hide flex-1 space-y-5 overflow-y-auto px-5 pb-4">
        {msgs.length === 0 && (
          <div className="mt-24 text-center text-ink-3">
            <div className="glass-dark mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl">
              <Icon name="chat" size={24} />
            </div>
            <p className="text-[15px]">Ask something — try the mic, or pick a prompt on Home.</p>
          </div>
        )}
        {msgs.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="flex justify-end">
              <div className="max-w-[85%] rounded-[22px] rounded-br-md border border-white/10 bg-white/[0.09] px-4 py-2.5 text-[15px] leading-snug">{m.text}</div>
            </div>
          ) : (
            <div key={m.id} className="space-y-3">
              {m.steps && m.thinkStart !== undefined && <ThinkingAccordion steps={m.steps} shown={m.stepsShown ?? 0} startedAt={m.thinkStart} endedAt={m.thinkEnd ?? null} />}
              {m.text && <AssistantBody text={m.text} streaming={!!m.streaming} />}
            </div>
          ),
        )}
      </div>

      <div className="px-4 pb-2">
        <PromptBar
          value={value}
          onChange={setValue}
          voice={voice}
          onMic={toggleVoice}
          disabled={busy}
          placeholder={busy ? "Apex is answering…" : "Reply…"}
          onSubmit={() => {
            onSend(value.trim());
            setValue("");
          }}
        />
      </div>
    </div>
  );
}
