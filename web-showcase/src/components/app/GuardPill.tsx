"use client";

import { Icon } from "@/components/ui/Icon";
import { useTelemetry } from "@/lib/telemetry";

export const fmtK = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(Math.round(n)));

export type GuardLevel = "ok" | "warn" | "hot";

/** Live RAM pressure · battery temperature · KV-cache fill. Warns before the OS kills the app (OOM). */
export function GuardPill({ kvUsed, kvMax, className = "", expanded = false }: { kvUsed: number; kvMax: number; className?: string; expanded?: boolean }) {
  const t = useTelemetry();
  const kv = Math.min(1, kvUsed / kvMax);
  let level: GuardLevel = "ok";
  let advice = "";
  if ((t.ramPressure ?? 0) > 0.82 || kv > 0.9 || (t.tempC ?? 0) >= 44) {
    level = "hot";
    advice = (t.tempC ?? 0) >= 44 ? "Phone is hot — pause generation to let it cool." : kv > 0.9 ? "Context is nearly full — start a new chat." : "Memory is critical — close apps or use a smaller model.";
  } else if ((t.ramPressure ?? 0) > 0.7 || kv > 0.75 || (t.tempC ?? 0) >= 40) {
    level = "warn";
    advice = kv > 0.75 ? "Context is filling up — long chats slow down." : (t.tempC ?? 0) >= 40 ? "Getting warm — speed may drop soon." : "Memory is getting tight.";
  }
  const dot = level === "ok" ? "bg-ok" : level === "warn" ? "bg-warn" : "bg-bad";
  const ram = t.ramPressure === null ? "—" : `${Math.round(t.ramPressure * 100)}%`;
  const label = t.source === "device" ? "RAM" : "Heap";
  return (
    <div className={className}>
      <div className="glass-dark mono inline-flex max-w-full items-center gap-2.5 rounded-full px-3 py-1.5 text-[10.5px] text-ink-2" role="status" aria-label={`Device guard: ${level}`}>
        <span className={`h-2 w-2 shrink-0 rounded-full ${dot} ${level !== "ok" ? "animate-pulse" : ""}`} />
        <span className="tnum whitespace-nowrap">{label} {ram}</span>
        <span className="h-3 w-px bg-white/15" />
        <span className="tnum flex items-center gap-1 whitespace-nowrap">
          <Icon name="thermo" size={11} />
          {t.tempC === null ? "—" : `${t.tempC.toFixed(0)}°C`}
          {t.batteryPct !== null && <span className="text-ink-3">· {t.batteryPct}%{t.charging ? "⚡" : ""}</span>}
        </span>
        <span className="h-3 w-px bg-white/15" />
        <span className="tnum whitespace-nowrap">KV {fmtK(kvUsed)} / {fmtK(kvMax)}</span>
      </div>
      {(level !== "ok" || expanded) && advice && <p className={`mt-1.5 pl-1 text-[11.5px] ${level === "hot" ? "text-bad" : "text-warn"}`}>{advice}</p>}
    </div>
  );
}
