"use client";

import { Icon } from "@/components/ui/Icon";
import { RippleButton } from "@/components/ui/Glass";
import { NANO_MODEL } from "@/lib/models";
import type { Downloads } from "./useDownloads";

/** 1-tap starter: a verified 145 MB Q8_0 GGUF (real weights, byte-accurate download). */
export function NanoCard({ downloads, className = "" }: { downloads: Downloads; className?: string }) {
  const s = downloads.get(NANO_MODEL.id);
  const mb = Math.round(NANO_MODEL.sizeGB * 1000);
  return (
    <div className={`bento relative overflow-hidden p-4 ${className}`}>
      <div className="flex items-center gap-3">
        <span className="icon-pill shrink-0 text-ok">
          <Icon name="prism" size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="mono text-[10px] uppercase tracking-[0.16em] text-ok">Instant Nano · {mb} MB</div>
          <div className="truncate text-[15px] font-medium tracking-tight">SmolLM2 135M Instruct</div>
          <div className="text-[11.5px] leading-snug text-ink-3">Real weights, cached on-device, runs fully offline. Tiny model: great for speed tests, not a flagship.</div>
        </div>
        {s.status === "done" ? (
          <span className="flex h-11 items-center gap-1 rounded-full bg-ok/15 px-3 text-[12px] font-semibold text-ok">
            <Icon name="check" size={14} /> Ready
          </span>
        ) : (
          <RippleButton onClick={() => downloads.toggle(NANO_MODEL.id)} className="flex h-11 shrink-0 items-center gap-1.5 rounded-full bg-white px-4 text-[13px] font-semibold text-black">
            <Icon name={s.status === "downloading" ? "pause" : "download"} size={15} />
            {s.status === "downloading" ? `${Math.round(s.pct)}%` : s.status === "paused" ? "Resume" : "Get"}
          </RippleButton>
        )}
      </div>
      {(s.status === "downloading" || s.status === "paused") && (
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuenow={Math.round(s.pct)} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-ok transition-[width] duration-200" style={{ width: `${s.pct}%` }} />
        </div>
      )}
      {s.error && <p className="mt-2 text-[11.5px] text-bad">{s.error}</p>}
    </div>
  );
}
