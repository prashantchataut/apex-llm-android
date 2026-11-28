"use client";

/**
 * Voice engine.
 *  - Text-to-speech: dual engine. A neural audio stream is tried first (4 s budget); any failure, rate limit or timeout falls
 *    through instantly to the platform voice (`window.speechSynthesis`, i.e. the Android WebView / browser voice).
 *  - Speech-to-text: instant mode (`SpeechRecognition` / `webkitSpeechRecognition`, streams interim words immediately) and
 *    on-device neural mode (Whisper tiny via transformers.js, see `lib/voice.ts`). The prefs below choose between them.
 */
import { useSyncExternalStore } from "react";

export interface VoicePrefs {
  autoSpeak: boolean;
  voice: string;
  rate: number;
  neural: boolean;
  stt: "instant" | "device";
  asrModel: "moonshine" | "whisper";
}
const KEY = "apex.voice.v1";
const DEFAULTS: VoicePrefs = { autoSpeak: false, voice: "", rate: 1, neural: true, stt: "instant", asrModel: "moonshine" };
let prefs: VoicePrefs = DEFAULTS;
const prefSubs = new Set<() => void>();
if (typeof window !== "undefined") {
  try {
    prefs = { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<VoicePrefs>) };
  } catch {
    /* defaults */
  }
}
export const getVoicePrefs = () => prefs;
export function setVoicePrefs(p: Partial<VoicePrefs>) {
  prefs = { ...prefs, ...p };
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    /* storage blocked */
  }
  prefSubs.forEach((f) => f());
}
export function useVoicePrefs(): VoicePrefs {
  return useSyncExternalStore((f) => (prefSubs.add(f), () => prefSubs.delete(f)), () => prefs, () => DEFAULTS);
}

/** Markdown -> plain speech: no fences, inline code, links, tables, tags, math or markup characters. */
export function cleanForSpeech(md: string): string {
  return md
    .replace(/<think>[\s\S]*?(<\/think>|$)/g, " ")
    .replace(/```[\s\S]*?(```|$)/g, " code block omitted. ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\$\$[\s\S]*?\$\$|\$[^$\n]+\$/g, " formula ")
    .replace(/<[^>]+>/g, " ")
    .replace(/^\s*\|.*\|\s*$/gm, " ")
    .replace(/^\s{0,3}#{1,6}\s*/gm, "")
    .replace(/^\s*([-*+]|\d+[.)])\s+/gm, "")
    .replace(/[*_~>#|]/g, "")
    .replace(/https?:\/\/\S+/g, "link")
    .replace(/\s+/g, " ")
    .trim();
}

function chunks(text: string, max = 220): string[] {
  const out: string[] = [];
  let cur = "";
  for (const s of text.split(/(?<=[.!?])\s+/)) {
    if ((cur + " " + s).length > max && cur) {
      out.push(cur.trim());
      cur = s;
    } else cur += " " + s;
  }
  if (cur.trim()) out.push(cur.trim());
  return out.flatMap((c) => (c.length > max * 1.5 ? c.match(new RegExp(`.{1,${max}}(\\s|$)`, "g")) ?? [c] : [c]));
}

export interface TtsState {
  id: string | number | null;
  status: "idle" | "loading" | "speaking" | "paused";
  engine: "neural" | "system" | null;
}
let tts: TtsState = { id: null, status: "idle", engine: null };
const ttsSubs = new Set<() => void>();
const set = (s: Partial<TtsState>) => {
  tts = { ...tts, ...s };
  ttsSubs.forEach((f) => f());
};
export const ttsSupported = () => typeof window !== "undefined" && "speechSynthesis" in window;
export function useTts(): TtsState {
  return useSyncExternalStore((f) => (ttsSubs.add(f), () => ttsSubs.delete(f)), () => tts, () => tts);
}

let audio: HTMLAudioElement | null = null;
let token = 0;

async function neural(text: string, signal: AbortSignal): Promise<string> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 4000);
  signal.addEventListener("abort", () => ctl.abort());
  try {
    const r = await fetch("https://text.pollinations.ai/openai", {
      method: "POST",
      signal: ctl.signal,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "openai-audio", modalities: ["text", "audio"], audio: { voice: prefs.voice && !prefs.voice.includes(" ") ? prefs.voice : "nova", format: "mp3" }, messages: [{ role: "system", content: "You are a text to speech engine. Say exactly the user text and nothing else." }, { role: "user", content: text.slice(0, 900) }] }),
    });
    if (!r.ok) throw new Error(`tts ${r.status}`);
    const j = (await r.json()) as { choices?: { message?: { audio?: { data?: string } } }[] };
    const b64 = j.choices?.[0]?.message?.audio?.data;
    if (!b64) throw new Error("no audio");
    return `data:audio/mpeg;base64,${b64}`;
  } finally {
    clearTimeout(t);
  }
}

function speakSystem(parts: string[], my: number) {
  const synth = window.speechSynthesis;
  synth.cancel();
  const voice = synth.getVoices().find((v) => v.name === prefs.voice);
  parts.forEach((p, i) => {
    const u = new SpeechSynthesisUtterance(p);
    if (voice) u.voice = voice;
    u.rate = prefs.rate;
    u.onstart = () => my === token && set({ status: "speaking", engine: "system" });
    u.onend = () => my === token && i === parts.length - 1 && set({ id: null, status: "idle", engine: null });
    u.onerror = () => my === token && i === parts.length - 1 && set({ id: null, status: "idle", engine: null });
    synth.speak(u);
  });
}

let ctlNeural: AbortController | null = null;
export async function speak(id: string | number, markdown: string): Promise<void> {
  stop();
  const text = cleanForSpeech(markdown);
  if (!text) return;
  const my = ++token;
  set({ id, status: "loading", engine: null });
  ctlNeural = new AbortController();
  if (prefs.neural && text.length < 900) {
    try {
      const src = await neural(text, ctlNeural.signal);
      if (my !== token) return;
      audio = new Audio(src);
      audio.playbackRate = prefs.rate;
      audio.onended = () => my === token && set({ id: null, status: "idle", engine: null });
      await audio.play();
      set({ status: "speaking", engine: "neural" });
      return;
    } catch {
      audio = null; // instant fallback to the platform voice
    }
  }
  if (my !== token) return;
  if (!ttsSupported()) return set({ id: null, status: "idle", engine: null });
  speakSystem(chunks(text), my);
  set({ status: "speaking", engine: "system" });
}
export function pause() {
  if (tts.status !== "speaking") return;
  audio ? audio.pause() : window.speechSynthesis?.pause();
  set({ status: "paused" });
}
export function resume() {
  if (tts.status !== "paused") return;
  audio ? void audio.play() : window.speechSynthesis?.resume();
  set({ status: "speaking" });
}
export function stop() {
  token++;
  ctlNeural?.abort();
  if (audio) {
    audio.pause();
    audio = null;
  }
  if (ttsSupported()) window.speechSynthesis.cancel();
  set({ id: null, status: "idle", engine: null });
}

/* ───────── Speech to text ───────── */
interface Rec {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  start: () => void;
  stop: () => void;
}
export function instantSttSupported(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
  return !!(w.SpeechRecognition ?? w.webkitSpeechRecognition);
}
/** Zero-wait recognition: interim words stream to `onText` on the very first tap. Returns a stopper. */
export function startInstantStt(onText: (t: string, final: boolean) => void, onEnd: () => void, onError: (code: string) => void): { stop: () => void } | null {
  if (!instantSttSupported()) return null;
  const w = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
  const R = (w.SpeechRecognition ?? w.webkitSpeechRecognition)!;
  const r = new R();
  r.lang = navigator.language || "en-US";
  r.interimResults = true;
  r.continuous = true;
  r.onresult = (e) => {
    const all = Array.from(e.results as ArrayLike<ArrayLike<{ transcript: string }> & { isFinal?: boolean }>);
    onText(all.map((x) => x[0].transcript).join(" ").replace(/\s+/g, " ").trim(), all.every((x) => x.isFinal));
  };
  r.onerror = (e) => onError(e.error ?? "error");
  r.onend = onEnd;
  r.start();
  return { stop: () => r.stop() };
}
