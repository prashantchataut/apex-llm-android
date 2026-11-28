"use client";

import { useEffect, useState } from "react";
import { instantSttSupported, setVoicePrefs, speak, useVoicePrefs } from "@/services/voiceEngine";

const dim = "text-[rgb(var(--ink-rgb)/var(--ink-3-a))]";

/** Speech input mode, Auto-Speak, voice and speed. Stored on this device only. */
export function VoiceSettings() {
  const p = useVoicePrefs();
  const [voices, setVoices] = useState<string[]>([]);
  useEffect(() => {
    if (!("speechSynthesis" in window)) return;
    const load = () => setVoices(speechSynthesis.getVoices().filter((v) => /^en/i.test(v.lang)).map((v) => v.name).slice(0, 16));
    load();
    speechSynthesis.addEventListener("voiceschanged", load);
    return () => speechSynthesis.removeEventListener("voiceschanged", load);
  }, []);
  const seg = (on: boolean) => (on ? { background: "var(--ink-solid)", color: "var(--canvas)" } : { background: "var(--surface-2)" });
  return (
    <div className="space-y-4" data-testid="voice-settings">
      <div>
        <p className="text-[14.5px] font-medium">Speech input</p>
        <p className={`mt-0.5 text-[12.5px] leading-snug ${dim}`}>Instant streams words as you speak. On-device runs a small open speech model and works offline after a one-time download.</p>
        <div className="mt-2 grid grid-cols-2 gap-1 rounded-full bg-[var(--surface-2)] p-1" role="radiogroup" aria-label="Speech input mode">
          {(["instant", "device"] as const).map((m) => (
            <button key={m} type="button" role="radio" aria-checked={p.stt === m} onClick={() => setVoicePrefs({ stt: m })} className="min-h-10 rounded-full text-[13px] font-medium active:scale-[0.97]" style={seg(p.stt === m)} data-testid={`stt-${m}`}>
              {m === "instant" ? "Instant" : "On-device"}
            </button>
          ))}
        </div>
        {p.stt === "device" && (
          <div className="mt-2 grid grid-cols-2 gap-1 rounded-full bg-[var(--surface-2)] p-1" role="radiogroup" aria-label="On-device speech model">
            {([["moonshine", "Moonshine 28 MB"], ["whisper", "Whisper 40 MB"]] as const).map(([m, l]) => (
              <button key={m} type="button" role="radio" aria-checked={p.asrModel === m} onClick={() => setVoicePrefs({ asrModel: m })} className="min-h-10 rounded-full text-[13px] font-medium active:scale-[0.97]" style={seg(p.asrModel === m)} data-testid={`asr-${m}`}>
                {l}
              </button>
            ))}
          </div>
        )}
        {p.stt === "instant" && !instantSttSupported() && <p className="mt-2 text-[12px] text-[var(--bad)]">This browser has no instant recogniser. On-device will be used.</p>}
      </div>
      <div className="flex items-center gap-3">
        <span className="min-w-0 flex-1">
          <span className="block text-[14.5px] font-medium">Auto-Speak AI Responses</span>
          <span className={`mt-0.5 block text-[12.5px] leading-snug ${dim}`}>Read every finished reply aloud. Code is skipped.</span>
        </span>
        <button type="button" role="switch" aria-checked={p.autoSpeak} aria-label="Auto-Speak AI Responses" className="switch" data-testid="autospeak-switch" onClick={() => setVoicePrefs({ autoSpeak: !p.autoSpeak })} />
      </div>
      <label className="block">
        <span className="text-[14.5px] font-medium">Voice</span>
        <select className="calm-field mt-1.5" value={p.voice} onChange={(e) => setVoicePrefs({ voice: e.target.value })} aria-label="Voice">
          <option value="">Default voice</option>
          {voices.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
      </label>
      <label className="block">
        <span className="flex items-center justify-between text-[14.5px] font-medium">Speed <span className={`tnum text-[12.5px] ${dim}`}>{p.rate.toFixed(1)}x</span></span>
        <input type="range" min={0.6} max={1.6} step={0.1} value={p.rate} onChange={(e) => setVoicePrefs({ rate: Number(e.target.value) })} className="mt-2 w-full" aria-label="Speech speed" />
      </label>
      <button type="button" className="calm-btn w-full active:scale-[0.97]" onClick={() => void speak("settings-test", "This is how Apex reads replies aloud.")}>Play sample</button>
    </div>
  );
}
