"use client";

/**
 * Real microphone pipeline.
 *  1. `getUserMedia` → `AudioContext` → `AnalyserNode`: the waveform reads `getByteFrequencyData` at display rate.
 *  2. `MediaRecorder` keeps the take; on stop it is decoded to 16 kHz mono PCM.
 *  3. Whisper-tiny.en (ONNX Runtime WebAssembly via transformers.js, int8 ≈ 40 MB) transcribes it on-device.
 *     The model is fetched once from Hugging Face and then served from the browser Cache API (offline afterwards).
 *  Fallback: the platform speech recogniser (`SpeechRecognition`) when Whisper cannot load. That one may use the cloud.
 *  NOT implemented: Android `SpeechRecognizer` through a Tauri command (STUB — no such command exists in the Rust core).
 */

import { absoluteAssetUrl } from "./paths";

const ASR_REPO = "Xenova/whisper-tiny.en";
export const ASR_LABEL = "Whisper tiny.en · int8";

export interface MicSession {
  analyser: AnalyserNode;
  /** Stop recording and return the take as 16 kHz mono PCM. */
  finish: () => Promise<Float32Array>;
  cancel: () => void;
}

export function micSupported(): boolean {
  return typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined";
}

export async function startMic(): Promise<MicSession> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  const ctx = new AudioContext();
  const src = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  analyser.smoothingTimeConstant = 0.55;
  src.connect(analyser);
  const rec = new MediaRecorder(stream);
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  rec.start(250);
  const close = () => {
    stream.getTracks().forEach((t) => t.stop());
    void ctx.close().catch(() => undefined);
  };
  return {
    analyser,
    cancel: () => {
      if (rec.state !== "inactive") rec.stop();
      close();
    },
    finish: () =>
      new Promise<Float32Array>((resolve, reject) => {
        rec.onstop = async () => {
          close();
          try {
            const buf = await new Blob(chunks, { type: rec.mimeType }).arrayBuffer();
            const dctx = new AudioContext({ sampleRate: 16000 });
            const audio = await dctx.decodeAudioData(buf);
            void dctx.close();
            resolve(audio.getChannelData(0).slice());
          } catch (e) {
            reject(e);
          }
        };
        if (rec.state !== "inactive") rec.stop();
        else rec.onstop?.(new Event("stop"));
      }),
  };
}

/** Log-spaced band levels (0‥1) from the analyser, `n` bands covering ~80 Hz–8 kHz. */
export function bandLevels(analyser: AnalyserNode, buf: Uint8Array<ArrayBuffer>, n: number, out: Float32Array): void {
  analyser.getByteFrequencyData(buf);
  const nyq = analyser.context.sampleRate / 2;
  const lo = 80;
  const hi = Math.min(8000, nyq);
  for (let i = 0; i < n; i++) {
    const f0 = lo * Math.pow(hi / lo, i / n);
    const f1 = lo * Math.pow(hi / lo, (i + 1) / n);
    const b0 = Math.max(0, Math.floor((f0 / nyq) * buf.length));
    const b1 = Math.max(b0 + 1, Math.ceil((f1 / nyq) * buf.length));
    let sum = 0;
    for (let b = b0; b < b1 && b < buf.length; b++) sum += buf[b];
    out[i] = sum / (b1 - b0) / 255;
  }
}

interface AsrResult {
  text: string;
}
type AsrPipeline = (audio: Float32Array, opts?: Record<string, unknown>) => Promise<AsrResult | AsrResult[]>;
interface TransformersModule {
  env: { allowLocalModels: boolean; useBrowserCache: boolean; backends: { onnx: { wasm: { wasmPaths: string | Record<string, string> } } } };
  pipeline: (task: string, model: string, opts: Record<string, unknown>) => Promise<AsrPipeline>;
}

let asr: Promise<AsrPipeline> | null = null;
export type AsrStatus = { phase: "idle" | "downloading" | "ready" | "failed"; loaded: number; total: number };
let status: AsrStatus = { phase: "idle", loaded: 0, total: 0 };
const subs = new Set<(s: AsrStatus) => void>();
function setStatus(s: AsrStatus) {
  status = s;
  subs.forEach((f) => f(s));
}
export function onAsrStatus(f: (s: AsrStatus) => void): () => void {
  subs.add(f);
  f(status);
  return () => subs.delete(f);
}

/** Load (once) the on-device ASR pipeline. */
export function loadAsr(): Promise<AsrPipeline> {
  if (asr) return asr;
  asr = (async () => {
    const root = absoluteAssetUrl("vendor/transformers/");
    const mod = (await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ `${root}transformers.web.min.js`)) as TransformersModule;
    mod.env.allowLocalModels = false;
    mod.env.useBrowserCache = true;
    mod.env.backends.onnx.wasm.wasmPaths = root;
    const files = new Map<string, { loaded: number; total: number }>();
    setStatus({ phase: "downloading", loaded: 0, total: 0 });
    const p = await mod.pipeline("automatic-speech-recognition", ASR_REPO, {
      dtype: "q8",
      device: "wasm",
      progress_callback: (e: { status?: string; file?: string; loaded?: number; total?: number }) => {
        if (e.status === "progress" && e.file && e.total) {
          files.set(e.file, { loaded: e.loaded ?? 0, total: e.total });
          const all = [...files.values()];
          setStatus({ phase: "downloading", loaded: all.reduce((a, f) => a + f.loaded, 0), total: all.reduce((a, f) => a + f.total, 0) });
        }
      },
    });
    setStatus({ phase: "ready", loaded: 1, total: 1 });
    return p;
  })().catch((e: unknown) => {
    asr = null;
    setStatus({ phase: "failed", loaded: 0, total: 0 });
    throw e;
  });
  return asr;
}

export async function transcribe(pcm: Float32Array): Promise<string> {
  const pipe = await loadAsr();
  const out = await pipe(pcm, { chunk_length_s: 30, stride_length_s: 5 });
  const r = Array.isArray(out) ? out[0] : out;
  return (r?.text ?? "").replace(/\[[A-Z_ ]+\]|\([a-z ]+\)/gi, "").trim();
}

interface RecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
}

export function systemRecognizer(): (new () => RecognitionLike) | null {
  const w = window as unknown as { SpeechRecognition?: new () => RecognitionLike; webkitSpeechRecognition?: new () => RecognitionLike };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}
