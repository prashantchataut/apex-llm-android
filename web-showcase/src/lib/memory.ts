"use client";

import { useSyncExternalStore } from "react";

/** Persistent long-term memory (localStorage). Active memories are injected into every model's system prompt. */
export type MemGroup = "Identity" | "Projects" | "Preferences" | "Tone";
export const MEM_GROUPS: MemGroup[] = ["Identity", "Projects", "Preferences", "Tone"];

export interface Memory {
  id: string;
  text: string;
  group: MemGroup;
  on: boolean;
  ts: number;
  source: "auto" | "manual" | "explicit";
}

const KEY = "apex.memory.v1";
const EMPTY: Memory[] = [];
let mem: Memory[] = EMPTY;
const subs = new Set<() => void>();

function load(): Memory[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]") as Memory[];
    return Array.isArray(raw) ? raw : EMPTY;
  } catch {
    return EMPTY;
  }
}
if (typeof window !== "undefined") mem = load();

function commit(next: Memory[]) {
  mem = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage blocked */
  }
  subs.forEach((f) => f());
}

export function getMemories(): Memory[] {
  return mem;
}
export function useMemories(): Memory[] {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => mem,
    () => EMPTY,
  );
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export function addMemory(text: string, group: MemGroup, source: Memory["source"] = "manual"): Memory | null {
  const t = text.trim().replace(/\s+/g, " ").replace(/[.!?]+$/, "");
  if (t.length < 3 || t.length > 160) return null;
  if (mem.some((m) => norm(m.text) === norm(t))) return null;
  const m: Memory = { id: Math.random().toString(36).slice(2, 10), text: t, group, on: true, ts: Date.now(), source };
  commit([m, ...mem]);
  return m;
}
export function updateMemory(id: string, p: Partial<Pick<Memory, "text" | "group" | "on">>) {
  commit(mem.map((m) => (m.id === id ? { ...m, ...p } : m)));
}
export function removeMemory(id: string) {
  commit(mem.filter((m) => m.id !== id));
}
export function wipeMemories() {
  commit([]);
}

const cut = (s: string) => s.trim().replace(/[.!?,;]+$/, "").slice(0, 90);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

interface Candidate {
  text: string;
  group: MemGroup;
  explicit?: boolean;
}

/** Cheap, local, deterministic fact extraction from one user message. */
export function extractMemories(input: string): Candidate[] {
  const s = input.replace(/\s+/g, " ").trim();
  const out: Candidate[] = [];
  const push = (text: string, group: MemGroup, explicit = false) => {
    const t = cap(cut(text));
    if (t.length >= 4) out.push({ text: t, group, explicit });
  };
  const explicit = s.match(/\bremember (?:that )?(.{4,140})/i);
  if (explicit) {
    const body = explicit[1].replace(/^(i am|i'm)\b/i, "User is").replace(/^i\b/i, "User").replace(/^my\b/i, "User's");
    push(body, /\b(prefer|like|love|use|always|never|style|tone)\b/i.test(body) ? "Preferences" : /\b(build|project|working|app)\b/i.test(body) ? "Projects" : "Identity", true);
    return out;
  }
  let m: RegExpMatchArray | null;
  if ((m = s.match(/\bmy name is ([A-Z][\w'-]{1,20})/))) push(`Name is ${m[1]}`, "Identity");
  if ((m = s.match(/\bI(?:'m| am) (?:a|an) ([a-z][\w\s/-]{2,40}?)(?=[.,!?]| and | who | at |$)/i))) push(`Is a ${m[1]}`, "Identity");
  if ((m = s.match(/\bI live in ([A-Z][\w\s,-]{2,30}?)(?=[.,!?]|$| and )/))) push(`Lives in ${m[1]}`, "Identity");
  if ((m = s.match(/\bI(?:'m| am)? ?(?:currently )?(?:building|making|developing|working on|writing) (.{4,70}?)(?=[.,!?]|$| and | using | with )/i))) push(`Working on ${m[1]}`, "Projects");
  if ((m = s.match(/\bI work (?:at|for) (.{3,40}?)(?=[.,!?]|$| and )/i))) push(`Works at ${m[1]}`, "Identity");
  if ((m = s.match(/\bI (?:really )?(prefer|like|love|enjoy|always use|use|hate|dislike) (.{3,60}?)(?=[.,!?]|$| but | because )/i))) {
    const verb = m[1].toLowerCase();
    const thing = m[2];
    if (!/^(it|this|that|them|to )\b/i.test(thing) && thing.split(" ").length <= 9) push(`${/hate|dislike/.test(verb) ? "Dislikes" : /^(use|always use)$/.test(verb) ? "Uses" : /prefer/.test(verb) ? "Prefers" : "Likes"} ${thing}`, "Preferences");
  }
  if ((m = s.match(/\bmy (?:tech )?stack is (.{3,70}?)(?=[.!?]|$)/i))) push(`Stack: ${m[1]}`, "Preferences");
  if ((m = s.match(/\b(?:always|never) (?:answer|reply|respond|write|explain|use) (.{3,70}?)(?=[.!?]|$)/i))) push(`${/never/i.test(m[0]) ? "Never" : "Always"} ${m[0].replace(/^(always|never) /i, "")}`, "Tone");
  return out;
}

/** Store extracted facts; returns the ones that were new. */
export function learnFrom(input: string): Memory[] {
  const added: Memory[] = [];
  for (const c of extractMemories(input)) {
    const m = addMemory(c.text, c.group, c.explicit ? "explicit" : "auto");
    if (m) added.push(m);
  }
  return added;
}

export function memoryBlock(): string {
  const on = mem.filter((m) => m.on);
  if (!on.length) return "";
  return `\n\nLong-term memory about the user (use naturally, never recite unless asked):\n${on.map((m) => `- ${m.text}`).join("\n")}`;
}
