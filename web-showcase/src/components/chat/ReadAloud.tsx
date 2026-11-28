"use client";

import { CIcon } from "@/components/calm/icons";
import { pause, resume, speak, stop, useTts } from "@/services/voiceEngine";

/** Read Aloud for one assistant message: speaker -> play/pause/stop, with a live wave while speaking. */
export function ReadAloud({ id, text }: { id: string | number; text: string }) {
  const t = useTts();
  const mine = t.id === id;
  const status = mine ? t.status : "idle";
  return (
    <span className="inline-flex items-center" data-testid="read-aloud" data-state={status}>
      {status === "idle" || status === "loading" ? (
        <button type="button" aria-label="Read aloud" className="ibtn !h-9 !w-9" onClick={() => void speak(id, text)} disabled={status === "loading"}>
          <CIcon name="speaker" size={15} />
        </button>
      ) : (
        <span className="flex items-center gap-0.5 rounded-full bg-[var(--halo-a)] pl-2 text-[var(--halo-ink)]">
          <span className="vbars" aria-hidden="true" style={{ opacity: status === "speaking" ? 1 : 0.4 }}>
            {[9, 15, 8, 13, 7].map((h, i) => (
              <i key={i} style={{ height: h }} />
            ))}
          </span>
          <button type="button" aria-label={status === "paused" ? "Resume reading" : "Pause reading"} className="ibtn !h-9 !w-9" onClick={status === "paused" ? resume : pause}>
            <CIcon name={status === "paused" ? "play" : "pause"} size={14} />
          </button>
          <button type="button" aria-label="Stop reading" className="ibtn !h-9 !w-9" onClick={stop}>
            <CIcon name="x" size={14} />
          </button>
        </span>
      )}
    </span>
  );
}
