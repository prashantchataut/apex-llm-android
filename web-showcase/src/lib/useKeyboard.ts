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
