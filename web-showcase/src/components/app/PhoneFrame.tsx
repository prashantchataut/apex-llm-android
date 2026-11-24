import type { ReactNode } from "react";

/** Device bezel. `responsive`: full-bleed on small screens, framed from `md` up (used by the /app route inside Tauri/mobile). */
export function PhoneFrame({ children, responsive = false }: { children: ReactNode; responsive?: boolean }) {
  const outer = responsive
    ? "relative h-dvh w-full md:h-[820px] md:w-[392px] md:rounded-[56px] md:border md:border-white/15 md:bg-surface-2 md:p-[10px] md:shadow-[0_40px_120px_-30px_color-mix(in_oklab,var(--accent)_45%,transparent)]"
    : "relative h-[820px] w-[min(392px,92vw)] rounded-[56px] border border-white/15 bg-surface-2 p-[10px] shadow-[0_40px_120px_-30px_color-mix(in_oklab,var(--accent)_45%,transparent)]";
  const inner = responsive ? "md:rounded-[46px]" : "rounded-[46px]";
  const island = responsive ? "hidden md:block" : "block";
  return (
    <div className={outer}>
      <div className={`relative h-full w-full overflow-hidden bg-canvas ${inner}`}>
        {children}
        <div className={`pointer-events-none absolute left-1/2 top-3 z-30 h-[26px] w-[92px] -translate-x-1/2 rounded-full bg-[#000] ${island}`} aria-hidden="true" />
      </div>
    </div>
  );
}
