"use client";

import { useSyncExternalStore } from "react";
import { fastComplete } from "./fast-ai";

/** Persistent long-term memory (localStorage). Active memories are injected into every model's system prompt. */
export type MemGroup = "Identity" | "Tech Stack" | "Projects" | "Preferences" | "Tone";
export const MEM_GROUPS: MemGroup[] = ["Identity", "Tech Stack", "Projects", "Preferences", "Tone"];

export interface Memory {
  id: string;
  text: string;
  group: MemGroup;
  on: boolean;
  ts: number;
  source: "auto" | "manual" | "explicit" | "ai";
  keywords?: string[];
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

export function addMemory(text: string, group: MemGroup, source: Memory["source"] = "manual", keywords?: string[]): Memory | null {
  const t = text.trim().replace(/\s+/g, " ").replace(/[.!?]+$/, "");
  if (t.length < 3 || t.length > 160) return null;
  if (mem.some((m) => norm(m.text) === norm(t))) return null;
  const m: Memory = { id: Math.random().toString(36).slice(2, 10), text: t, group, on: true, ts: Date.now(), source, ...(keywords?.length ? { keywords } : {}) };
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
  if ((m = s.match(/\b(?:my name is|I(?:'m| am)) ([A-Z][a-z'-]{1,20})(?=[,.!]| and|$)/))) push(`Name is ${m[1]}`, "Identity");
  if ((m = s.match(/\bI (?:build|make|develop|code in|write) ([A-Za-z+#&][\w\s+#&/-]{2,50}?)(?=[,.!?]|$| and (?:I|my))/i))) push(`Builds ${m[1]}`, /rust|kotlin|python|typescript|android|swift|\bgo\b/i.test(m[1]) ? "Tech Stack" : "Projects");
  if ((m = s.match(/\bI(?:'m| am) (?:a|an) ([a-z][\w\s/-]{2,40}?)(?=[.,!?]| and | who | at |$)/i))) push(`Is a ${m[1]}`, "Identity");
  if ((m = s.match(/\bI live in ([A-Z][\w\s,-]{2,30}?)(?=[.,!?]|$| and )/))) push(`Lives in ${m[1]}`, "Identity");
  if ((m = s.match(/\bI(?:'m| am)? ?(?:currently )?(?:building|making|developing|working on|writing) (.{4,70}?)(?=[.,!?]|$| and | using | with )/i))) push(`Working on ${m[1]}`, "Projects");
  if ((m = s.match(/\bI work (?:at|for) (.{3,40}?)(?=[.,!?]|$| and )/i))) push(`Works at ${m[1]}`, "Identity");
  for (const pm of s.matchAll(/\bI (?:really )?(prefer|like|love|enjoy|always use|use|hate|dislike) (.{3,60}?)(?=[.,!?]|$| but | because | and I )/gi)) {
    const verb = pm[1].toLowerCase();
    const thing = pm[2];
    if (!/^(it|this|that|them|to )\b/i.test(thing) && thing.split(" ").length <= 9) push(`${/hate|dislike/.test(verb) ? "Dislikes" : /^(use|always use)$/.test(verb) ? "Uses" : /prefer/.test(verb) ? "Prefers" : "Likes"} ${thing}`, /^(use|always use)$/.test(verb) ? "Tech Stack" : "Preferences");
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

const STOP = new Set("the a an and or of to in on for with is are was be i my me you your it this that what how can do does about from at as by".split(" "));
const words = (s: string) => norm(s).split(" ").filter((w) => w.length > 2 && !STOP.has(w));

/**
 * Memories injected into the system prompt. Identity + Preferences + Tone are always relevant; everything else is only
 * included when its text or keywords overlap the current question, so a large memory never bloats a small context window.
 */
export function memoryBlock(query = ""): string {
  const on = mem.filter((m) => m.on);
  if (!on.length) return "";
  const q = new Set(words(query));
  const pick = on.length <= 8 || q.size === 0 ? on : on.filter((m) => m.group === "Identity" || m.group === "Preferences" || m.group === "Tone" || [...words(m.text), ...(m.keywords ?? []).flatMap(words)].some((w) => q.has(w)));
  if (!pick.length) return "";
  return `\n\nLong-term memory about the user (use naturally, never recite unless asked):\n${pick.slice(0, 24).map((m) => `- ${m.text}`).join("\n")}`;
}

/* ───────── AI memory distiller ───────── */
/** Models invent their own labels ("Device", "Tools", "Name"…), so map by meaning, not by exact string. */
const groupOf = (c: string): MemGroup => (/name|identity|person|device|phone|location|role|job|age/i.test(c) ? "Identity" : /tech|stack|tool|lang|framework|skill|software|hardware/i.test(c) ? "Tech Stack" : /project|app|work|build/i.test(c) ? "Projects" : /tone|style|voice/i.test(c) ? "Tone" : "Preferences");
const SYSTEM = `You distill what a user tells an assistant about themselves into atomic memory facts.
Return ONLY a JSON array (max 8 items), no prose, no code fence. Each item: {"category":"Identity"|"Tech Stack"|"Preference","fact":"<=12 words, third person, no pronoun 'I'","keywords":["1-4 lowercase words"]}.
Only durable facts (name, device, languages, tools, projects, likes/dislikes, style rules). Skip greetings and one-off requests. Never invent facts.`;

export interface DistillResult {
  added: Memory[];
  via: "ai" | "rules";
  servedBy?: string;
  ms?: number;
}

/** True when a chat message looks like it states something durable about the user (cheap gate before any network call). */
export const looksPersonal = (t: string): boolean => t.length >= 18 && /\b(i am|i'm|i use|i build|i work|i live|i prefer|i hate|i love|i like|my name|my (?:phone|stack|project|laptop|job|app)|remember)\b/i.test(t);

export async function distillMemory(raw: string): Promise<DistillResult> {
  const input = raw.replace(/\s+/g, " ").trim().slice(0, 1200);
  try {
    const r = await fastComplete([{ role: "system", content: SYSTEM }, { role: "user", content: input }], { maxTokens: 400, timeoutMs: 7000 });
    const body = r.text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    const arr = JSON.parse(body.slice(body.indexOf("["), body.lastIndexOf("]") + 1)) as { category?: string; fact?: string; keywords?: string[] }[];
    const added: Memory[] = [];
    for (const it of arr.slice(0, 8)) {
      if (!it?.fact) continue;
      const g = groupOf(String(it.category ?? ""));
      const m = addMemory(String(it.fact), g, "ai", Array.isArray(it.keywords) ? it.keywords.map((k) => String(k).toLowerCase()).slice(0, 4) : undefined);
      if (m) added.push(m);
    }
    if (added.length || arr.length) return { added, via: "ai", servedBy: r.servedBy, ms: r.ms };
  } catch {
    /* offline, rate-limited or malformed JSON: fall through to the on-device rules */
  }
  return { added: learnFrom(input), via: "rules" };
}
