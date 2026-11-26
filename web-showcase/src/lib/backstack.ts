"use client";

import { useEffect, useRef } from "react";

/**
 * Android back-gesture / browser back for overlays.
 *
 * Design: ONE sentinel history entry exists while at least one overlay is open (drawer, sheet, popover, modal, secondary
 * view). A back swipe consumes the sentinel and we close only the TOP overlay (re-arming the sentinel if more are open),
 * so the WebView never leaves the app while something is open. With nothing open there is no extra entry, so back exits
 * the app as usual.
 *
 * Why a single reconciled sentinel instead of one entry per overlay: closing overlay A and opening overlay B in the same
 * tick (drawer -> Models view) used to queue `history.back()` and then `pushState()`; Chromium resolves the back target at
 * call time, so the pop overshot by one and exited the app. Now history is only touched once per tick, after all effects ran.
 */
interface Layer {
  close: () => void;
}
const stack: Layer[] = [];
let have = false; // sentinel entry currently in history
let pendingBack = false; // we asked history.back() and its popstate has not arrived yet
let wired = false;
let scheduled = false;

function reconcile() {
  scheduled = false;
  if (pendingBack || typeof window === "undefined") return;
  const want = stack.length > 0;
  if (want && !have) {
    history.pushState({ apexLayer: true }, "");
    have = true;
  } else if (!want && have) {
    have = false;
    pendingBack = true;
    history.back();
  }
}
function schedule() {
  if (scheduled) return;
  scheduled = true;
  setTimeout(reconcile, 0);
}

function wire() {
  if (wired || typeof window === "undefined") return;
  wired = true;
  window.addEventListener("popstate", () => {
    if (pendingBack) {
      pendingBack = false;
      schedule();
      return;
    }
    if (!have) return; // not ours (hash change, real navigation)
    have = false; // the user consumed the sentinel
    const top = stack.pop();
    top?.close();
    schedule(); // re-arm if more overlays are still open
  });
}

/** Number of overlays currently registered (diagnostics / tests). */
export const backDepth = () => stack.length;

/** Register `open` as a back-closable layer. `onClose` MUST set the overlay's state to closed. */
export function useBackLayer(open: boolean, onClose: () => void): void {
  const cb = useRef(onClose);
  cb.current = onClose;
  useEffect(() => {
    if (!open || typeof window === "undefined") return;
    wire();
    const layer: Layer = { close: () => cb.current() };
    stack.push(layer);
    schedule();
    return () => {
      const i = stack.indexOf(layer);
      if (i >= 0) stack.splice(i, 1);
      schedule();
    };
  }, [open]);
}
