"use client";

import { useSyncExternalStore } from "react";

/**
 * Local-model harness. OFF by default (new installs, and legacy installs that have no stored value).
 *  OFF: a local request is sent straight to the on-device model: your system instructions, the conversation and any
 *       attachments/Knowledge Vault excerpts you chose, nothing else. No skill pre-runs, no tool loop, no background
 *       memory-extraction call, no network.
 *  ON : adds skill pre-runs (the skills you enabled), a bounded tool loop (at most 2 tool steps per reply, each one asks for
 *       your permission first, Stop cancels it) and background memory extraction. Extra model passes can add latency.
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
