"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { VoiceState } from "./PromptBar";

const PHRASES = ["Explain Q4_K_M versus Q5_K_M for my phone", "Expand (a+b)² and quiz me", "Summarise my GitHub repo into context"];

/** Simulated dictation for the web demo (no mic access, nothing recorded). The app streams real partials from cortex-voice. */
export function useVoiceDemo(commit: (text: string) => void) {
  const [state, setState] = useState<VoiceState>({ recording: false, transcript: "", latencyMs: 0 });
  const timers = useRef<number[]>([]);
  const phraseIdx = useRef(0);
  const transcript = useRef("");

  const clear = useCallback(() => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  }, []);
  useEffect(() => clear, [clear]);

  const stop = useCallback(() => {
    clear();
    commit(transcript.current);
    setState((s) => ({ ...s, recording: false }));
  }, [clear, commit]);

  const toggle = useCallback(() => {
    if (state.recording) return stop();
    const words = PHRASES[phraseIdx.current++ % PHRASES.length].split(" ");
    transcript.current = "";
    setState({ recording: true, transcript: "", latencyMs: 0 });
    words.forEach((_, i) =>
      timers.current.push(
        window.setTimeout(() => {
          transcript.current = words.slice(0, i + 1).join(" ");
          setState({ recording: true, transcript: transcript.current, latencyMs: 96 + ((i * 17) % 41) });
        }, 450 + i * 320),
      ),
    );
    timers.current.push(window.setTimeout(stop, 450 + words.length * 320 + 500));
  }, [state.recording, stop]);

  return { voice: state, toggleVoice: toggle };
}
