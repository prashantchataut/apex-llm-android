import type { CSSProperties, ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

export function Crosshair({ left, top }: { left: string; top: string }) {
  return <span className="cross" style={{ left, top }} aria-hidden="true" />;
}

/** Exposed structural grid: vertical hairlines run the full height, each GridRow adds a horizontal hairline with `+` markers at every column intersection. */
export function GridFrame({ children, cols = 4, className = "" }: { children: ReactNode; cols?: number; className?: string }) {
  return (
    <div className={`relative mx-auto w-full max-w-[1240px] ${className}`}>
      {Array.from({ length: cols + 1 }, (_, i) => (
        <span key={i} className="grid-v" style={{ left: `${(i / cols) * 100}%` }} aria-hidden="true" />
      ))}
      {children}
    </div>
  );
}

export function GridRow({ children, cols = 4, className = "", id }: { children: ReactNode; cols?: number; className?: string; id?: string }) {
  return (
    <section id={id} className={`relative ${className}`}>
      <span className="grid-h" style={{ top: 0 }} aria-hidden="true" />
      {Array.from({ length: cols + 1 }, (_, i) => (
        <Crosshair key={i} left={`${(i / cols) * 100}%`} top="0px" />
      ))}
      {children}
    </section>
  );
}

/** Progressive-opacity type: per-glyph opacity interpolated `from → to`, so the fade can land mid-word. */
export function Ph({ text, from = 1, to = 0.35 }: { text: string; from?: number; to?: number }) {
  const words = text.split(" ");
  const total = Math.max(1, text.replace(/ /g, "").length - 1);
  let idx = 0;
  return (
    <span aria-label={text}>
      {words.map((w, wi) => (
        <span key={wi} aria-hidden="true">
          {wi > 0 && " "}
          <span className="inline-block whitespace-nowrap">
            {[...w].map((ch, ci) => {
              const t = idx++ / total;
              return (
                <span key={ci} style={{ opacity: from + (to - from) * t }}>
                  {ch}
                </span>
              );
            })}
          </span>
        </span>
      ))}
    </span>
  );
}

const TONES = {
  violet: "linear-gradient(135deg,#a78bfa 0%,#6d28d9 55%,#2e1065 100%)",
  cobalt: "linear-gradient(135deg,#7dd3fc 0%,#1d4ed8 55%,#0b1b4d 100%)",
  sunset: "linear-gradient(135deg,#fdba74 0%,#e11d48 55%,#4c1d95 100%)",
} as const;

/** Inline rounded-square cutout that sits *between words* in a headline. */
export function Cutout({ tone = "violet", icon, tilt = -5, label }: { tone?: keyof typeof TONES; icon: IconName; tilt?: number; label: string }) {
  const style: CSSProperties = {
    background: `radial-gradient(120% 80% at 20% 0%, rgba(255,255,255,.55), transparent 45%), ${TONES[tone]}`,
    transform: `rotate(${tilt}deg)`,
    boxShadow: "inset 0 1px 0 rgba(255,255,255,.5), 0 14px 30px rgba(0,0,0,.45)",
  };
  return (
    <span
      role="img"
      aria-label={label}
      className="mx-[0.12em] inline-grid h-[0.82em] w-[1.05em] place-items-center rounded-[0.24em] align-[-0.08em] text-white"
      style={style}
    >
      <Icon name={icon} size={28} style={{ width: "0.42em", height: "0.42em" }} />
    </span>
  );
}

/** Handwritten annotation + curved SVG arrow. */
export function ScriptNote({ children, className = "", flip = false }: { children: ReactNode; className?: string; flip?: boolean }) {
  return (
    <span className={`pointer-events-none inline-flex items-start gap-1 ${className}`} style={flip ? { transform: "scaleX(-1)" } : undefined}>
      <span className="script text-[26px] leading-[1] whitespace-nowrap" style={flip ? { transform: "scaleX(-1) rotate(-6deg)" } : undefined}>
        {children}
      </span>
      <svg width="74" height="54" viewBox="0 0 74 54" fill="none" aria-hidden="true" className="mt-5">
        <path d="M3 6 C 30 0, 60 10, 66 44" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
        <path d="M55 38 L66 46 L70 31" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}
