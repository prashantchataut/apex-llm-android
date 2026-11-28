"use client";

import { useEffect, useState } from "react";

/**
 * Soft-keyboard height in CSS px. Takes the larger of
 *  - `window.visualViewport` shrink (browsers / PWAs), and
 *  - `--apex-kb`, the IME inset the Android shell publishes from WindowInsets (adjustNothing window).
 * Using max() — never a sum — keeps the composer exactly one keyboard-height above the bottom in either case.
 */
export function useKeyboardInset(): number {
  const [kb, setKb] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    const read = () => {
      const fromVV = vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0;
      const native = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--apex-kb")) || 0;
      const v = Math.round(Math.max(fromVV > 80 ? fromVV : 0, native > 80 ? native : 0));
      setKb((p) => (p === v ? p : v));
    };
    read();
    vv?.addEventListener("resize", read);
    vv?.addEventListener("scroll", read);
    window.addEventListener("resize", read);
    const mo = new MutationObserver(read);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["style"] });
    return () => {
      vv?.removeEventListener("resize", read);
      vv?.removeEventListener("scroll", read);
      window.removeEventListener("resize", read);
      mo.disconnect();
    };
  }, []);
  return kb;
}

/**
 * Keep a focused field (and the message + primary button under it) above the Android soft keyboard.
 * Use as `onFocus={scrollFieldIntoView}`; the 150 ms delay lets the keyboard finish animating first.
 */
export function scrollFieldIntoView(e: { target: EventTarget | null }) {
  const el = e.target as HTMLElement;
  window.setTimeout(() => el.scrollIntoView?.({ behavior: "smooth", block: "center" }), 150);
}

/** Global safety net: every text-like field scrolls into view on focus, and again whenever `visualViewport` resizes (keyboard open/close). */
export function installKeyboardGuards(): () => void {
  const isField = (t: EventTarget | null): t is HTMLElement => t instanceof HTMLElement && (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t.isContentEditable);
  const onFocus = (e: FocusEvent) => {
    if (isField(e.target)) scrollFieldIntoView(e);
  };
  const vv = window.visualViewport;
  const onResize = () => {
    const a = document.activeElement;
    if (isField(a)) window.setTimeout(() => a.scrollIntoView?.({ behavior: "smooth", block: "center" }), 100);
  };
  document.addEventListener("focusin", onFocus);
  vv?.addEventListener("resize", onResize);
  return () => {
    document.removeEventListener("focusin", onFocus);
    vv?.removeEventListener("resize", onResize);
  };
}
