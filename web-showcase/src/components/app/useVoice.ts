"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { haptic } from "@/lib/haptics";
import { isNative } from "@/lib/native";
import type { VoiceState } from "./PromptBar";

const PHRASES = ["Explain Q4_K_M versus Q5_K_M for my phone", "Expand (a+b)² step by step", "Summarise my GitHub repo into context"];

/**
 * Dictation. The browser build previews the interaction with sample phrases (no mic access, nothing recorded).
 * The Android app has no speech model bundled yet, so it says so instead of inventing a transcript.
 */
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
    if (isNative()) {
      haptic("detentClick");
      setState({ recording: false, transcript: "", latencyMs: 0, notice: "Voice input needs an on-device speech model — coming in the next build." });
      timers.current.push(window.setTimeout(() => setState((s) => ({ ...s, notice: undefined })), 3200));
      return;
    }
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
