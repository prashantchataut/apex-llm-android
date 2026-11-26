"use client";

/**
 * Android WebViews rarely report `env(safe-area-inset-*)` correctly under edge-to-edge, so the header used to sit
 * underneath the status bar. The native shell exposes the real numbers through `window.ApexBars.insets()` and pushes
 * `--safe-top` / `--safe-bottom`; this module pulls them too (mount, resize, focus, orientation) and flags the
 * document so CSS can fall back to a 38px / 14px clearance while the native value is not known yet.
 */
interface Bars {
  insets?: () => string;
}

let started = false;

function pull() {
  const root = document.documentElement;
  const bars = (window as unknown as { ApexBars?: Bars }).ApexBars;
  if (!bars?.insets) return;
  try {
    const [top, bottom, kb] = bars.insets().split(",").map((n) => Math.max(0, Number.parseFloat(n) || 0));
    // A real status bar is never 0px tall in a fullscreen app; ignore a transient 0 and keep the CSS fallback.
    if (top > 0) {
      root.style.setProperty("--safe-top", `${top}px`);
      root.style.setProperty("--apex-inset-top", `${top}px`);
    }
    if (bottom >= 0) {
      root.style.setProperty("--safe-bottom", `${Math.max(bottom, 0)}px`);
      root.style.setProperty("--apex-inset-bottom", `${bottom}px`);
    }
    root.style.setProperty("--apex-kb", `${kb}px`);
    root.dataset.nativeInsets = "1";
  } catch {
    /* bridge not ready */
  }
}

export function initInsets(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  const root = document.documentElement;
  if (/Android/i.test(navigator.userAgent)) root.classList.add("is-android");
  pull();
  for (const ms of [60, 250, 600, 1200, 2400]) window.setTimeout(pull, ms);
  window.addEventListener("resize", pull);
  window.addEventListener("orientationchange", pull);
  window.addEventListener("focus", pull);
  document.addEventListener("visibilitychange", () => !document.hidden && pull());
}
