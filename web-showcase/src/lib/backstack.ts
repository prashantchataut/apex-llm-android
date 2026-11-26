"use client";

import { useEffect, useRef } from "react";

/**
 * Android back-gesture / browser back for overlays.
 * Every open overlay (drawer, sheet, popover, modal, secondary view) pushes one history entry. A back swipe pops it
 * (WebView `canGoBack()` is true because of these entries), and we close the TOP overlay instead of leaving the app.
 * With no overlay open there are no extra entries, so back exits the app as usual.
 */
interface Layer {
  id: number;
  close: () => void;
}
const stack: Layer[] = [];
let seq = 0;
let ignore = 0;
let wired = false;

function wire() {
  if (wired || typeof window === "undefined") return;
  wired = true;
  window.addEventListener("popstate", () => {
    if (ignore > 0) {
      ignore--;
      return;
    }
    const top = stack.pop();
    top?.close();
  });
}

/** Imperative API (used by tests): number of overlays currently holding a history entry. */
export const backDepth = () => stack.length;

/**
 * Register `open` as a back-closable layer. `onClose` MUST set the overlay's state to closed.
 * When the overlay is closed by UI (X, scrim, selecting an item) we pop our own history entry silently.
 */
export function useBackLayer(open: boolean, onClose: () => void): void {
  const cb = useRef(onClose);
  cb.current = onClose;
  useEffect(() => {
    if (!open || typeof window === "undefined") return;
    wire();
    const layer: Layer = { id: ++seq, close: () => cb.current() };
    stack.push(layer);
    history.pushState({ apexLayer: layer.id }, "");
    return () => {
      const i = stack.indexOf(layer);
      if (i >= 0) {
        // closed from the UI, not by the back gesture: drop the entry we pushed without re-triggering close()
        stack.splice(i, 1);
        ignore++;
        history.back();
      }
    };
  }, [open]);
}
