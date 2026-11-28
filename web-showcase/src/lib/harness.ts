"use client";

import { useSyncExternalStore } from "react";

/**
 * "Enable Agent Harness for Local Models". OFF by default.
 *  OFF (Fast Direct Mode): a local request goes straight to the on-device engine with a minimal system prompt. No skill pre-runs, no
 *      tool loop, no memory extraction and no memory/vault injection, so the first token streams with zero pre-execution delay.
 *  ON: the multi-step harness for local models: enabled skills pre-run, a bounded tool/thinking loop, memory extraction and memory context.
 */
const KEY = "apex.harness.v1";
const subs = new Set<() => void>();
export function getHarness(): boolean {
  try {
    return localStorage.getItem(KEY) === "on";
  } catch {
    return false;
  }
}
export function setHarness(on: boolean) {
  try {
    if (on) localStorage.setItem(KEY, "on");
    else localStorage.removeItem(KEY);
  } catch {
    /* storage blocked */
  }
  subs.forEach((f) => f());
}
export const useHarness = (): boolean => useSyncExternalStore((cb) => (subs.add(cb), () => subs.delete(cb)), getHarness, () => false);
