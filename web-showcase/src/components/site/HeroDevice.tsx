"use client";

import { ApexLogo } from "@/components/brand/ApexLogo";
import { HapticPulse } from "@/components/ui/HapticPulse";
import { CountUp, Tilt } from "./Choreo";

/** Hero device: tilts toward the pointer with a moving specular spot; telemetry counts up when it scrolls in. */
export function HeroDevice() {
  return (
    <Tilt max={11} className="rounded-[48px]">
      <div className="relative h-[470px] w-[250px] rounded-[48px] border border-white/15 bg-surface-2 p-[9px] shadow-[0_50px_120px_-30px_color-mix(in_oklab,var(--accent)_55%,transparent)]">
        <div className="relative flex h-full w-full flex-col overflow-hidden rounded-[40px] bg-canvas px-4 pb-5 pt-10">
          <div className="aurora" data-tone="violet" />
          <div className="grain pointer-events-none absolute inset-0" />
          <div className="pointer-events-none absolute left-1/2 top-2.5 z-10 h-[20px] w-[70px] -translate-x-1/2 rounded-full bg-black" aria-hidden />
          <div className="relative flex flex-1 flex-col items-center justify-center text-center" style={{ transform: "translateZ(40px)" }}>
            <ApexLogo size={74} state="idle" />
            <div className="display mt-4 text-[26px] leading-none">Apex</div>
            <div className="mono mt-1.5 text-[9.5px] uppercase tracking-[0.2em] text-ink-3">on-device · offline</div>
          </div>
          <div className="relative grid grid-cols-2 gap-2" style={{ transform: "translateZ(24px)" }}>
            {[
              { l: "tokens / s", n: 18.4, d: 1 },
              { l: "RAM free GB", n: 4.6, d: 1 },
            ].map((c) => (
              <div key={c.l} className="mini-card px-3 py-2.5">
                <div className="mono text-[9px] uppercase tracking-[0.12em] opacity-60">{c.l}</div>
                <div className="text-[22px] font-semibold leading-tight tracking-tight">
                  <CountUp to={c.n} decimals={c.d} />
                </div>
              </div>
            ))}
          </div>
          <div className="relative mt-2.5 flex justify-center" style={{ transform: "translateZ(30px)" }}>
            <HapticPulse className="!px-3 !py-1.5 [&_span:nth-child(2)]:!min-w-[78px]" />
          </div>
        </div>
      </div>
    </Tilt>
  );
}
