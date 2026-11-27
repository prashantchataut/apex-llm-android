"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChatMsg } from "@/components/app/useChat";
import { useBackLayer } from "@/lib/backstack";
import { haptic } from "@/lib/haptics";
import { micSupported, startMic, transcribe, type MicSession } from "@/lib/voice";
import { CIcon } from "./icons";

type Phase = "idle" | "listening" | "thinking" | "speaking";
const PREF = "apex.live.prefs.v1";
const SPEEDS = [0.9, 1, 1.15, 1.3];
const ORB: Record<Phase, string> = { idle: "#7d8597", listening: "#6f9bff", thinking: "#a78bfa", speaking: "#4cc9b0" };
const LABEL: Record<Phase, string> = { idle: "Paused", listening: "Listening", thinking: "Thinking", speaking: "Speaking" };

/** Strip markdown, citations, code and think-blocks so the voice only reads prose. */
export function speakable(t: string): string {
  return t
    .replace(/<think>[\s\S]*?(<\/think>|$)/gi, "")
    .replace(/\[Source:[^\]]*\]/gi, "")
    .replace(/```[\s\S]*?(```|$)/g, " Code block omitted. ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\$\$[\s\S]*?\$\$/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/https?:\/\/\S+/g, " link ")
    .replace(/^\s*[-*]\s+/gm, "")
    .replace(/\*\*|__|\*|^#+\s?/gm, "")
    .replace(/[ \t]+/g, " ")
    .trim();
}

/** Next complete sentence in `text` after `from`; the unfinished tail is only released once the reply is final. */
export function nextChunk(text: string, from: number, final: boolean): { chunk: string; end: number } | null {
  const rest = text.slice(from);
  const m = rest.match(/^[\s\S]*?[.!?…](?=\s|$)|^[\s\S]*?\n/);
  if (m && m[0].trim().length > 1) return { chunk: m[0].trim(), end: from + m[0].length };
  if (final && rest.trim()) return { chunk: rest.trim(), end: text.length };
  return null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  msgs: ChatMsg[];
  busy: boolean;
  modelLabel: string;
  onSend: (text: string, voiceMs?: number) => void;
  onStopChat: () => void;
}

/**
 * Hands-free voice session. State machine: Listening (mic FFT + adaptive VAD, auto end-of-speech) -> Thinking (the active
 * local GGUF or Apex API model answers through the normal chat pipeline, so the transcript IS the chat thread) ->
 * Speaking (sentence-streamed TTS, the orb reacts to speech boundaries) -> Listening.
 * The mic is closed while the AI speaks (no echo loop); "tap anywhere" barges in.
 */
export function LiveVoice({ open, onClose, msgs, busy, modelLabel, onSend, onStopChat }: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [muted, setMuted] = useState(false);
  const [subs, setSubs] = useState(true);
  const [panel, setPanel] = useState(false);
  const [rate, setRate] = useState(1);
  const [voiceName, setVoiceName] = useState("");
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [note, setNote] = useState("");
  const [heard, setHeard] = useState("");

  const sess = useRef<MicSession | null>(null);
  const raf = useRef(0);
  const orb = useRef<HTMLDivElement>(null);
  const bars = useRef<(HTMLSpanElement | null)[]>([]);
  const level = useRef(0);
  const phaseRef = useRef<Phase>("idle");
  const mutedRef = useRef(false);
  const alive = useRef(false);
  const base = useRef(0);
  const spoken = useRef(0);
  const pending = useRef(0);
  const turnAt = useRef(0);
  const rateRef = useRef(1);
  const voiceRef = useRef("");
  const t0 = useRef(0);
  const msgsLen = useRef(msgs.length);
  msgsLen.current = msgs.length;
  const onSendRef = useRef(onSend);
  onSendRef.current = onSend;
  const ttsOk = typeof window !== "undefined" && "speechSynthesis" in window;

  const go = useCallback((p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  }, []);

  const stopMic = useCallback(() => {
    cancelAnimationFrame(raf.current);
    sess.current?.cancel();
    sess.current = null;
  }, []);

  const end = useCallback(() => {
    alive.current = false;
    stopMic();
    if (ttsOk) speechSynthesis.cancel();
    onStopChat();
    onClose();
  }, [stopMic, ttsOk, onStopChat, onClose]);
  useBackLayer(open, end);

  useEffect(() => {
    try {
      const p = JSON.parse(localStorage.getItem(PREF) ?? "{}") as { rate?: number; voice?: string; subs?: boolean };
      if (p.rate) setRate(p.rate);
      if (p.voice) setVoiceName(p.voice);
      if (typeof p.subs === "boolean") setSubs(p.subs);
    } catch {
      /* defaults */
    }
  }, []);
  useEffect(() => {
    rateRef.current = rate;
    voiceRef.current = voiceName;
    try {
      localStorage.setItem(PREF, JSON.stringify({ rate, voice: voiceName, subs }));
    } catch {
      /* private mode */
    }
  }, [rate, voiceName, subs]);
  useEffect(() => {
    if (!ttsOk) return;
    const load = () => setVoices(speechSynthesis.getVoices().filter((v) => /^en/i.test(v.lang)).slice(0, 12));
    load();
    speechSynthesis.addEventListener("voiceschanged", load);
    return () => speechSynthesis.removeEventListener("voiceschanged", load);
  }, [ttsOk]);

  const listenRef = useRef<() => Promise<void>>(async () => undefined);

  const finish = useCallback(
    async (s: MicSession) => {
      cancelAnimationFrame(raf.current);
      go("thinking");
      setNote("Transcribing on-device…");
      level.current = 0;
      try {
        const pcm = await s.finish();
        sess.current = null;
        if (!alive.current) return;
        const text = pcm.length < 6400 ? "" : await transcribe(pcm);
        if (!alive.current) return;
        if (!text.trim()) {
          setNote("");
          void listenRef.current();
          return;
        }
        setHeard(text);
        setNote("");
        base.current = msgsLen.current;
        spoken.current = 0;
        pending.current = 0;
        turnAt.current = performance.now();
        onSendRef.current(text, Math.max(900, performance.now() - t0.current));
      } catch {
        sess.current = null;
        setNote("The on-device speech model could not load. Connect once to download it (about 40 MB), then tap the orb.");
        go("idle");
      }
    },
    [go],
  );

  /* ───────── listening: mic + FFT + adaptive voice-activity detection ───────── */
  const listen = useCallback(async () => {
    if (!alive.current) return;
    stopMic();
    go("listening");
    setNote("");
    if (!micSupported()) {
      setNote("Microphone capture is not available here.");
      go("idle");
      return;
    }
    let s: MicSession;
    try {
      s = await startMic();
    } catch {
      setNote("Microphone permission was denied. Allow it, then tap the orb.");
      go("idle");
      return;
    }
    if (!alive.current) return s.cancel();
    sess.current = s;
    const buf = new Uint8Array(s.analyser.fftSize);
    let floor = 0.012;
    let voiced = 0;
    let talking = false;
    let quietSince = 0;
    let begin = performance.now();
    let ended = false;
    const tick = () => {
      if (!alive.current || sess.current !== s || ended) return;
      s.analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) {
        const v = (buf[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / buf.length);
      const now = performance.now();
      const thr = Math.max(0.03, floor * 3.2);
      if (!talking) floor = Math.min(0.05, floor * 0.96 + rms * 0.04);
      level.current = mutedRef.current ? 0 : Math.max(level.current, Math.min(1, rms * 7));
      if (!mutedRef.current) {
        if (rms > thr) {
          voiced++;
          quietSince = 0;
          if (!talking && voiced > 6) {
            talking = true;
            begin = now;
            t0.current = now;
            haptic("detentClick");
          }
        } else if (talking) {
          quietSince ||= now;
          if (now - quietSince > 1150 || now - begin > 28000) {
            ended = true;
            void finish(s);
            return;
          }
        } else voiced = Math.max(0, voiced - 1);
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  }, [go, stopMic, finish]);
  listenRef.current = listen;

  /* ───────── thinking -> speaking: sentence-streamed TTS ───────── */
  const say = useCallback(
    (chunk: string) => {
      if (!ttsOk) return;
      const u = new SpeechSynthesisUtterance(chunk);
      u.rate = rateRef.current;
      const v = speechSynthesis.getVoices().find((x) => x.name === voiceRef.current);
      if (v) {
        u.voice = v;
        u.lang = v.lang;
      }
      u.onboundary = () => (level.current = 0.85);
      u.onend = u.onerror = () => {
        pending.current = Math.max(0, pending.current - 1);
      };
      pending.current++;
      speechSynthesis.speak(u);
    },
    [ttsOk],
  );

  const reply = useMemo(() => {
    const last = msgs[msgs.length - 1];
    return last && last.role === "assistant" && msgs.length > base.current ? last : null;
  }, [msgs]);

  useEffect(() => {
    if (!open || !alive.current) return;
    if (phaseRef.current !== "thinking" && phaseRef.current !== "speaking") return;
    if (!reply) {
      if (!busy && performance.now() - turnAt.current > 2500 && phaseRef.current === "thinking" && turnAt.current > 0) {
        setNote("Nothing came back. Check the model, then keep talking.");
        void listen();
      }
      return;
    }
    const text = speakable(reply.text);
    const final = !busy && !reply.streaming;
    if (!text) {
      if (final) void listen();
      return;
    }
    if (!ttsOk) {
      if (phaseRef.current !== "speaking") {
        go("speaking");
        window.setTimeout(() => alive.current && void listen(), Math.min(7000, 900 + text.length * 24));
      }
      return;
    }
    let guard = 0;
    for (let c = nextChunk(text, spoken.current, final); c && guard < 6; c = nextChunk(text, spoken.current, final), guard++) {
      if (phaseRef.current !== "speaking") go("speaking");
      spoken.current = c.end;
      say(c.chunk);
    }
  }, [reply, busy, open, ttsOk, say, go, listen]);

  /* back to listening once the last utterance has really finished */
  useEffect(() => {
    if (!open || phase !== "speaking" || !ttsOk) return;
    const id = window.setInterval(() => {
      if (pending.current === 0 && !speechSynthesis.speaking && !busy && alive.current) void listenRef.current();
    }, 250);
    return () => window.clearInterval(id);
  }, [open, phase, ttsOk, busy]);

  /* orb + bars: write CSS variables from a rAF loop (no React re-render) */
  useEffect(() => {
    if (!open) return;
    let id = 0;
    let smooth = 0;
    const loop = (t: number) => {
      const p = phaseRef.current;
      let target = level.current;
      if (p === "speaking") target = Math.max(level.current, 0.22 + 0.12 * Math.sin(t / 140));
      if (p === "thinking") target = 0.12 + 0.06 * Math.sin(t / 300);
      level.current *= 0.9;
      smooth += (target - smooth) * 0.35;
      orb.current?.style.setProperty("--lvl", smooth.toFixed(3));
      bars.current.forEach((b, i) => {
        if (!b) return;
        b.style.height = `${(8 + smooth * 64 * (0.45 + 0.55 * Math.abs(Math.sin(t / 170 + i * 0.9)))).toFixed(1)}px`;
      });
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    alive.current = true;
    base.current = msgsLen.current;
    turnAt.current = 0;
    setHeard("");
    setPanel(false);
    void listen();
    let wake: { release: () => Promise<void> } | null = null;
    (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock?.request("screen").then((w) => (wake = w)).catch(() => undefined);
    return () => {
      alive.current = false;
      stopMic();
      if (ttsOk) speechSynthesis.cancel();
      void wake?.release();
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const interrupt = () => {
    if (phaseRef.current !== "speaking" && phaseRef.current !== "thinking") return;
    haptic("detentClick");
    if (ttsOk) speechSynthesis.cancel();
    pending.current = 0;
    onStopChat();
    base.current = msgsLen.current + 1; // ignore the cut-off reply
    void listen();
  };
  const toggleMute = () => {
    mutedRef.current = !mutedRef.current;
    setMuted(mutedRef.current);
    haptic("detentClick");
  };

  const shown = reply ? speakable(reply.text) : "";
  const lastUser = heard || [...msgs].reverse().find((m) => m.role === "user")?.text || "";
  const hint = phase === "listening" ? (muted ? "Mic is muted" : "Speak naturally. I will answer when you pause.") : phase === "speaking" || phase === "thinking" ? "Tap anywhere to interrupt" : "Tap the orb to start listening";

  const ctl = "flex flex-col items-center gap-1.5 text-[11.5px] text-[rgb(var(--ink-rgb)/var(--ink-3-a))]";
  const round = "grid h-14 w-14 place-items-center rounded-full bg-[var(--surface)] shadow-[var(--specular),var(--shadow-card)] transition-transform active:scale-95";
  const on = { background: "var(--halo-a)", color: "var(--halo-ink)" } as const;

  return (
    <AnimatePresence>
      {open && (
        <motion.div role="dialog" aria-modal="true" aria-label="Live voice session" data-testid="live-voice" className="absolute inset-0 z-[60] flex flex-col" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 24 }} transition={{ type: "spring", stiffness: 340, damping: 36 }} style={{ background: "var(--canvas, var(--surface))" }}>
          <div className="calm-glow" aria-hidden="true" />
          <header className="relative z-10 flex items-center justify-between px-4 pb-2 pt-safe">
            <span className="flex h-9 items-center gap-2 rounded-full bg-[var(--surface)] px-3.5 text-[12.5px] font-medium shadow-[var(--specular),var(--shadow-card)]" aria-live="polite">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: ORB[phase], boxShadow: `0 0 0 4px color-mix(in oklab, ${ORB[phase]} 22%, transparent)` }} />
              {LABEL[phase]}
            </span>
            <span className="max-w-[46vw] truncate text-[12.5px] text-[rgb(var(--ink-rgb)/var(--ink-3-a))]">{modelLabel}</span>
            <button type="button" className="ibtn !h-10 !w-10" aria-label="Close live voice" onClick={end}>
              <CIcon name="chevron" size={18} />
            </button>
          </header>

          <div className="relative z-10 flex min-h-0 flex-1 flex-col items-center justify-center px-6" onClick={interrupt} role="presentation">
            <button
              type="button"
              aria-label={phase === "idle" ? "Start listening" : "Voice orb"}
              onClick={(e) => {
                if (phase === "idle") {
                  e.stopPropagation();
                  void listen();
                }
              }}
              className="grid place-items-center"
            >
              <div ref={orb} className="live-orb" data-state={phase} style={{ ["--orb" as string]: ORB[phase] }} />
            </button>
            <div className="mt-10 flex h-[76px] items-center gap-[5px]" style={{ color: ORB[phase] }} aria-hidden="true">
              {Array.from({ length: 17 }).map((_, i) => (
                <span key={i} ref={(el) => void (bars.current[i] = el)} className="live-bar" style={{ height: 8, opacity: 0.35 + 0.65 * Math.sin((i / 16) * Math.PI) }} />
              ))}
            </div>
            <p className="mt-6 text-center text-[13.5px] text-[rgb(var(--ink-rgb)/var(--ink-3-a))]">{note || hint}</p>

            {subs && (lastUser || shown) && (
              <div className="scroll-quiet mt-5 max-h-[24vh] w-full max-w-[520px] overflow-y-auto text-center" aria-live="polite" data-testid="live-subtitles">
                {lastUser && <p className="mb-2 line-clamp-2 text-[13.5px] text-[rgb(var(--ink-rgb)/var(--ink-3-a))]">{lastUser}</p>}
                {shown && <p className="text-[16px] leading-[1.55]">{shown.slice(-420)}</p>}
              </div>
            )}
          </div>

          <div className="relative z-10 px-4 pb-safe">
            <AnimatePresence>
              {panel && (
                <motion.div initial={{ opacity: 0, y: 10, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8 }} transition={{ type: "spring", stiffness: 420, damping: 32 }} className="calm-card mx-auto mb-4 w-full max-w-[420px] p-3">
                  <p className="px-1 text-[12.5px] text-[rgb(var(--ink-rgb)/var(--ink-3-a))]">Speed</p>
                  <div className="seg mt-1.5 w-full" style={{ gridAutoColumns: "1fr" }}>
                    {SPEEDS.map((s) => (
                      <button key={s} type="button" aria-pressed={rate === s} onClick={() => setRate(s)}>
                        {s}x
                      </button>
                    ))}
                  </div>
                  <p className="mt-3 px-1 text-[12.5px] text-[rgb(var(--ink-rgb)/var(--ink-3-a))]">Voice</p>
                  <div className="mt-1 max-h-[148px] overflow-y-auto">
                    {!ttsOk || voices.length === 0 ? (
                      <p className="px-1 py-2 text-[13px] text-[rgb(var(--ink-rgb)/var(--ink-3-a))]">{ttsOk ? "Using the system default voice." : "This device exposes no speech synthesis. Replies appear as subtitles."}</p>
                    ) : (
                      [{ name: "", lang: "" } as SpeechSynthesisVoice, ...voices].map((v) => (
                        <button
                          key={v.name || "default"}
                          type="button"
                          aria-pressed={voiceName === v.name}
                          onClick={() => {
                            setVoiceName(v.name);
                            speechSynthesis.cancel();
                            const u = new SpeechSynthesisUtterance("This is how I sound.");
                            u.rate = rate;
                            if (v.name) u.voice = v;
                            speechSynthesis.speak(u);
                          }}
                          className="flex min-h-10 w-full items-center gap-2 rounded-xl px-2 text-left text-[13.5px] hover:bg-[var(--surface-2)]"
                          style={voiceName === v.name ? { background: "var(--halo-a)" } : undefined}
                        >
                          <span className="min-w-0 flex-1 truncate">{v.name || "System default"}</span>
                          {voiceName === v.name && <CIcon name="check" size={15} />}
                        </button>
                      ))
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            <div className="mx-auto flex max-w-[420px] items-start justify-between pb-3">
              <div className={ctl}>
                <button type="button" className={round} aria-pressed={muted} aria-label={muted ? "Unmute microphone" : "Mute microphone"} onClick={toggleMute} style={muted ? on : undefined}>
                  <CIcon name={muted ? "micoff" : "mic"} size={22} />
                </button>
                {muted ? "Unmute" : "Mute"}
              </div>
              <div className={ctl}>
                <button type="button" className={round} aria-pressed={subs} aria-label="Toggle live transcript" onClick={() => setSubs(!subs)} style={subs ? on : undefined}>
                  <CIcon name="caption" size={22} />
                </button>
                Transcript
              </div>
              <div className={ctl}>
                <button type="button" className={round} aria-expanded={panel} aria-label="Voice and speed" onClick={() => setPanel(!panel)} style={panel ? on : undefined}>
                  <CIcon name="sliders" size={22} />
                </button>
                Voice
              </div>
              <div className={ctl}>
                <button type="button" className={`${round} !bg-[var(--bad)] !text-white`} aria-label="End voice session" onClick={end}>
                  <CIcon name="x" size={22} />
                </button>
                End
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
