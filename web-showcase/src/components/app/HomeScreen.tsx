"use client";

import { motion } from "framer-motion";
import { useRef, useState } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";
import { RippleButton } from "@/components/ui/Glass";
import { Ph } from "@/components/ui/Swiss";
import { SUGGESTIONS } from "@/lib/demo-script";
import { PromptBar } from "./PromptBar";
import { useVoiceDemo } from "./useVoice";

const ICONS: Record<string, IconName> = { quant: "cpu", math: "sparkle", rust: "code", repo: "github" };

/** Archetype A — obsidian canvas, violet top-bleed aurora (rendered by the shell), asymmetric bento cards, docked quick-action pill. */
export function HomeScreen({ onSend }: { onSend: (prompt: string) => void }) {
  const [value, setValue] = useState("");
  const [attachment, setAttachment] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const { voice, toggleVoice } = useVoiceDemo(setValue);

  const submit = () => {
    onSend(value.trim());
    setValue("");
    setAttachment(null);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="scroll-hide flex-1 overflow-y-auto px-5 pb-3 pt-14">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
            <span className="grid h-7 w-7 place-items-center rounded-[9px] bg-white text-black">
              <Icon name="bolt" size={16} strokeWidth={2.4} />
            </span>
            Apex
          </div>
          <span className="glass-dark mono rounded-full px-3 py-1.5 text-[11px] text-white/75">
            <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 align-middle shadow-[0_0_8px_#34d399]" />
            Qwen2.5-3B · Q4_K_M
          </span>
        </div>

        <h1 className="display mt-12 text-[40px]">
          <Ph text="What should we" from={1} to={1} />
          <br />
          <Ph text="run on-device?" from={1} to={0.35} />
        </h1>

        <div className="mt-8 grid grid-cols-2 gap-3">
          {SUGGESTIONS.map((s, i) => {
            const tall = "tall" in s && s.tall;
            const wide = "wide" in s && s.wide;
            return (
              <motion.button
                key={s.id}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: "spring", stiffness: 260, damping: 26, delay: 0.08 + i * 0.06 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => onSend(s.title)}
                className={`bento flex flex-col justify-between p-4 text-left ${tall ? "row-span-2 min-h-[210px]" : "min-h-[104px]"} ${wide ? "col-span-2" : ""}`}
              >
                <div>
                  <div className="mono text-[10px] uppercase tracking-[0.14em] text-white/40">{s.tag}</div>
                  <div className="mt-2 text-[15px] font-medium leading-[1.25] tracking-tight text-white/90">{s.title}</div>
                </div>
                <span className="icon-pill mt-4 self-start text-white/80">
                  <Icon name={ICONS[s.id]} size={17} />
                </span>
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* docked composer */}
      <div className="px-4 pb-2">
        <div className="mb-2.5 flex justify-center">
          <div className="glass flex items-center gap-1 p-1 text-[13px] font-medium">
            <input ref={fileRef} type="file" className="hidden" onChange={(e) => setAttachment(e.target.files?.[0]?.name ?? null)} />
            <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => setAttachment(e.target.files?.[0]?.name ?? null)} />
            <RippleButton type="button" onClick={() => fileRef.current?.click()} className="relative z-[1] flex h-10 items-center gap-1.5 rounded-full px-3.5">
              <Icon name="upload" size={16} /> Upload
            </RippleButton>
            <RippleButton type="button" onClick={() => camRef.current?.click()} className="relative z-[1] flex h-10 items-center gap-1.5 rounded-full px-3.5">
              <Icon name="camera" size={16} /> Camera
            </RippleButton>
            <RippleButton type="button" onClick={toggleVoice} className="relative z-[1] flex h-10 items-center gap-1.5 rounded-full px-3.5">
              <Icon name="mic" size={16} /> Voice
            </RippleButton>
          </div>
        </div>
        {attachment && (
          <div className="mb-2 flex items-center gap-2 pl-2 text-[12px] text-white/60">
            <Icon name="upload" size={13} /> <span className="truncate">{attachment}</span>
            <button onClick={() => setAttachment(null)} aria-label="Remove attachment" className="ml-auto">
              <Icon name="x" size={14} />
            </button>
          </div>
        )}
        <PromptBar value={value} onChange={setValue} onSubmit={submit} voice={voice} onMic={toggleVoice} />
        <p className="mono mt-2 text-center text-[10px] text-white/30">{voice.recording ? "On-device ASR · ~25 MB INT8 · nothing leaves the phone" : "Demo mode · scripted replies"}</p>
      </div>
    </div>
  );
}
