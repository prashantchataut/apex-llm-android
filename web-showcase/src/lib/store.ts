"use client";

import { useSyncExternalStore } from "react";
import type { ChatSnapshot } from "@/components/app/useChat";

/* ───────── which engine answers: a local GGUF (default) or keyless cloud (needs an access key) ───────── */
export type Choice = { kind: "keyless"; id: string } | { kind: "local"; id: string };
const CHOICE_KEY = "apex.choice.v3";
/** Local models are the product: the default engine is the 145 MB starter. Keyless Cloud needs an access key. */
const DEFAULT_CHOICE: Choice = { kind: "local", id: "smollm2-135m" };
let choice: Choice = DEFAULT_CHOICE;
const cSubs = new Set<() => void>();
if (typeof window !== "undefined") {
  try {
    const raw = JSON.parse(localStorage.getItem(CHOICE_KEY) ?? "null") as Choice | null;
    if (raw && (raw.kind === "keyless" || raw.kind === "local")) choice = raw;
  } catch {
    /* corrupt */
  }
}
export function setChoice(c: Choice) {
  choice = c;
  try {
    localStorage.setItem(CHOICE_KEY, JSON.stringify(c));
  } catch {
    /* storage blocked */
  }
  cSubs.forEach((f) => f());
}
export const getChoice = () => choice;
export function useChoice(): Choice {
  return useSyncExternalStore(
    (cb) => {
      cSubs.add(cb);
      return () => cSubs.delete(cb);
    },
    () => choice,
    () => DEFAULT_CHOICE,
  );
}

/* ───────── conversation history ───────── */
export interface Convo {
  id: string;
  title: string;
  pinned: boolean;
  updated: number;
  snap: ChatSnapshot;
}
const CV_KEY = "apex.convos.v1";
const EMPTY: Convo[] = [];
let convos: Convo[] = EMPTY;
const vSubs = new Set<() => void>();
if (typeof window !== "undefined") {
  try {
    const raw = JSON.parse(localStorage.getItem(CV_KEY) ?? "[]") as Convo[];
    if (Array.isArray(raw)) convos = raw;
  } catch {
    /* corrupt */
  }
}
function commitConvos(next: Convo[]) {
  convos = next.sort((a, b) => b.updated - a.updated).slice(0, 80);
  try {
    localStorage.setItem(CV_KEY, JSON.stringify(convos));
  } catch {
    /* storage blocked */
  }
  vSubs.forEach((f) => f());
}
export function saveConvo(id: string, snap: ChatSnapshot, title: string) {
  const prev = convos.find((c) => c.id === id);
  commitConvos([{ id, title: prev?.title && prev.title !== "New chat" && prev.title !== title ? prev.title : title, pinned: prev?.pinned ?? false, updated: Date.now(), snap }, ...convos.filter((c) => c.id !== id)]);
}
export const getConvo = (id: string) => convos.find((c) => c.id === id);
export const deleteConvo = (id: string) => commitConvos(convos.filter((c) => c.id !== id));
export const renameConvo = (id: string, title: string) => commitConvos(convos.map((c) => (c.id === id ? { ...c, title: title.trim() || c.title } : c)));
export const pinConvo = (id: string) => commitConvos(convos.map((c) => (c.id === id ? { ...c, pinned: !c.pinned } : c)));
export function useConvos(): Convo[] {
  return useSyncExternalStore(
    (cb) => {
      vSubs.add(cb);
      return () => vSubs.delete(cb);
    },
    () => convos,
    () => EMPTY,
  );
}

/* ───────── calm appearance ───────── */
export type CalmMode = "light" | "dark" | "system";
const MODE_KEY = "apex.calm.mode";
export function readMode(): CalmMode {
  try {
    const v = localStorage.getItem(MODE_KEY);
    return v === "dark" || v === "system" ? v : "light";
  } catch {
    return "light";
  }
}
export function writeMode(m: CalmMode) {
  try {
    localStorage.setItem(MODE_KEY, m);
  } catch {
    /* storage blocked */
  }
}
