"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Icon } from "@/components/ui/Icon";
import { RippleButton } from "@/components/ui/Glass";
import { Waveform } from "@/components/ui/Waveform";
import { haptic } from "@/lib/haptics";

export interface VoiceState {
  recording: boolean;
  transcript: string;
  latencyMs: number;
  /** Short status line shown under the composer (e.g. voice unavailable). */
  notice?: string;
  /** Live microphone analyser: drives the real FFT bars. */
  analyser?: AnalyserNode | null;
  /** Which recogniser produced / will produce the text. */
  asr?: "whisper" | "system";
  busy?: boolean;
  status?: string;
}

/** 21st.dev / UiHall-style prompt bar: attach · input · mic · send, with in-bar waveform + live transcript. */
export function PromptBar({
  value,
  onChange,
  onSubmit,
  voice,
  onMic,
  placeholder = "Ask anything, offline…",
  disabled,
  canSendEmpty,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  voice: VoiceState;
  onMic: () => void;
  placeholder?: string;
  disabled?: boolean;
  /** Allow sending with an empty prompt (attachments present). */
  canSendEmpty?: boolean;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if ((value.trim() || canSendEmpty) && !disabled) onSubmit();
      }}
      className="glass-dark relative flex min-h-[60px] items-center gap-2 rounded-[30px] p-2 pl-3"
    >
      <AnimatePresence mode="wait" initial={false}>
        {voice.recording ? (
          <motion.div key="rec" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="min-w-0 flex-1">
            <Waveform active height={30} analyser={voice.analyser} onBeat={() => haptic("detentClick")} />
            <div className="mt-0.5 flex items-center gap-2 text-[11px] text-ink-3">
              <span className="truncate">{voice.transcript || (voice.asr === "system" ? "Listening (system recogniser)…" : "Listening · Whisper transcribes when you stop")}</span>
              <span className="mono ml-auto shrink-0 text-ok/80">REC</span>
            </div>
          </motion.div>
        ) : (
          <motion.input
            key="in"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            aria-label="Prompt"
            className="min-w-0 flex-1 bg-transparent px-1 text-[15px] text-white outline-none placeholder:text-ink-3"
          />
        )}
      </AnimatePresence>
      <RippleButton
        type="button"
        onClick={onMic}
        aria-label={voice.recording ? "Stop dictation" : "Start voice input"}
        aria-pressed={voice.recording}
        className={`grid h-11 w-11 shrink-0 place-items-center rounded-full ${voice.recording ? "bg-bad/90 text-white shadow-[0_0_24px_rgba(244,63,94,0.6)]" : "bg-white/[0.07] text-ink-2"}`}
      >
        <Icon name="mic" size={20} />
      </RippleButton>
      <RippleButton
        type="submit"
        aria-label="Send"
        disabled={(!value.trim() && !canSendEmpty) || disabled}
        className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white text-black disabled:bg-white/20 disabled:text-ink-3"
      >
        <Icon name="send" size={20} strokeWidth={2.4} />
      </RippleButton>
    </form>
  );
}
