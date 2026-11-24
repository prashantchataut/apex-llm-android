import type { ReactNode } from "react";

/** Device bezel. `responsive`: full-bleed on small screens, framed from `md` up (used by the /app route inside Tauri/mobile). */
export function PhoneFrame({ children, responsive = false }: { children: ReactNode; responsive?: boolean }) {
  const outer = responsive
    ? "relative h-dvh w-full md:h-[820px] md:w-[392px] md:rounded-[56px] md:border md:border-white/15 md:bg-[#0b0b10] md:p-[10px] md:shadow-[0_40px_120px_rgba(109,40,217,0.35),0_0_0_1px_rgba(255,255,255,0.04)]"
    : "relative h-[820px] w-[min(392px,92vw)] rounded-[56px] border border-white/15 bg-[#0b0b10] p-[10px] shadow-[0_40px_120px_rgba(109,40,217,0.35),0_0_0_1px_rgba(255,255,255,0.04)]";
  const inner = responsive ? "md:rounded-[46px]" : "rounded-[46px]";
  const island = responsive ? "hidden md:block" : "block";
  return (
    <div className={outer}>
      <div className={`relative h-full w-full overflow-hidden bg-[#050507] ${inner}`}>
        {children}
        <div className={`pointer-events-none absolute left-1/2 top-3 z-30 h-[26px] w-[92px] -translate-x-1/2 rounded-full bg-black ${island}`} aria-hidden="true" />
      </div>
    </div>
  );
}
