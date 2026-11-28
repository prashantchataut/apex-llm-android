"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { haptic } from "@/lib/haptics";
import { getVoicePrefs, startInstantStt } from "@/services/voiceEngine";
import { ASR_LABEL, loadAsr, micSupported, onAsrStatus, startMic, systemRecognizer, transcribe, type AsrStatus, type MicSession } from "@/lib/voice";
import type { VoiceState } from "./PromptBar";

const MB = 1_000_000;

/**
 * Real dictation: microphone -> AnalyserNode (live FFT bars) -> Whisper tiny.en on-device -> text in the prompt bar.
 * If Whisper cannot be fetched (first use while offline) the platform recogniser is used and labelled as such.
 */
export function useVoice(commit: (text: string) => void, interim?: (text: string) => void) {
  const [state, setState] = useState<VoiceState>({ recording: false, transcript: "", latencyMs: 0 });
  const session = useRef<MicSession | null>(null);
  const system = useRef<{ stop: () => void } | null>(null);
  const sysText = useRef("");
  const asrStatus = useRef<AsrStatus>({ phase: "idle", loaded: 0, total: 0 });
  const timer = useRef<number | null>(null);

  useEffect(() => onAsrStatus((s) => (asrStatus.current = s)), []);
  useEffect(
    () => () => {
      session.current?.cancel();
      system.current?.stop();
    },
    [],
  );

  const flash = useCallback((notice: string, ms = 3600) => {
    setState((s) => ({ ...s, notice }));
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState((s) => ({ ...s, notice: undefined })), ms);
  }, []);

  const stop = useCallback(async () => {
    haptic("detentClick");
    if (system.current) {
      system.current.stop();
      system.current = null;
      session.current?.cancel();
      session.current = null;
      setState({ recording: false, transcript: "", latencyMs: 0, asr: "system" });
      if (sysText.current && !interim) commit(sysText.current);
      return;
    }
    const s = session.current;
    session.current = null;
    if (!s) return;
    setState((p) => ({ ...p, recording: false, analyser: null, busy: true, status: "Transcribing on-device…" }));
    try {
      const pcm = await s.finish();
      if (pcm.length < 3200) {
        setState({ recording: false, transcript: "", latencyMs: 0, notice: "Too short — hold the mic a little longer." });
        return;
      }
      const t0 = performance.now();
      const text = await transcribe(pcm);
      const latency = Math.round(performance.now() - t0);
      setState({ recording: false, transcript: "", latencyMs: latency, asr: "whisper", notice: text ? `${ASR_LABEL} · ${latency} ms for ${(pcm.length / 16000).toFixed(1)} s of audio` : "Heard silence — nothing to transcribe." });
      if (text) {
        haptic("reasoningDone");
        commit(text);
      }
    } catch {
      setState({ recording: false, transcript: "", latencyMs: 0, notice: "On-device speech model could not load. Connect once to download it (≈40 MB)." });
    }
  }, [commit]);

  const toggle = useCallback(async () => {
    if (state.recording) return void stop();
    if (state.busy) return;
    if (!micSupported()) return flash("Microphone capture is not available in this browser.");
    try {
      const s = await startMic();
      session.current = s;
      haptic("detentClick");
      sysText.current = "";
      // Instant mode (default): interim words stream into the prompt box on the first tap. On-device mode: Whisper after you stop.
      const wantInstant = getVoicePrefs().stt === "instant" || asrStatus.current.phase === "failed";
      const inst = wantInstant
        ? startInstantStt(
            (t) => {
              sysText.current = t;
              setState((p) => ({ ...p, transcript: t }));
              interim?.(t);
            },
            () => undefined,
            (code) => {
              if (code === "not-allowed" || code === "service-not-allowed") flash("Speech recognition permission was denied.");
              else if (code === "network") flash("Instant recognition needs a connection. Switch to On-device in Settings to work offline.");
            },
          )
        : null;
      if (inst) {
        system.current = inst;
      } else void loadAsr().catch(() => undefined); // warm the model while the user speaks
      setState({ recording: true, transcript: "", latencyMs: 0, analyser: s.analyser, asr: system.current ? "system" : "whisper" });
    } catch (e) {
      flash(e instanceof DOMException && e.name === "NotAllowedError" ? "Microphone permission was denied." : "No microphone found.");
    }
  }, [state.recording, state.busy, stop, flash]);

  return { voice: state, toggleVoice: toggle };
}

/** Whisper download progress label (`Whisper tiny.en · 12.4 / 41.3 MB`) for the composer status line. */
export function asrProgressLabel(s: AsrStatus): string | null {
  if (s.phase === "downloading" && s.total > 0) return `${ASR_LABEL} · ${(s.loaded / MB).toFixed(1)} / ${(s.total / MB).toFixed(1)} MB`;
  if (s.phase === "ready") return `${ASR_LABEL} · ready, offline`;
  return null;
}

export function useAsrStatus(): AsrStatus {
  const [s, setS] = useState<AsrStatus>({ phase: "idle", loaded: 0, total: 0 });
  useEffect(() => onAsrStatus(setS), []);
  return s;
}
