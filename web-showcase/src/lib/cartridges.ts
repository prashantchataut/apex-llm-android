"use client";

import { useCallback, useEffect, useState } from "react";

/** An Ollama-style Modelfile preset: system prompt + sampling + context window. */
export interface Cartridge {
  id: string;
  name: string;
  tagline: string;
  system: string;
  temperature: number;
  topP: number;
  ctx: number;
  /** CSS gradient stops (from, to) for the 3D glass body. */
  hue: [string, string];
  builtin: boolean;
}

/** Appended to every system prompt so capable models ask structured clarifying questions instead of guessing. */
export const CHOICES_HINT =
  'If the request is ambiguous, ask ONE short clarifying question and offer 2-4 options on their own lines in exactly this format: [[choices]]{"question":"…","options":[{"label":"…","hint":"…"}]}[[/choices]]. Otherwise just answer.';

export const BUILTIN_CARTRIDGES: Cartridge[] = [
  { id: "architect", name: "System Architect", tagline: "Trade-offs, diagrams, boundaries", system: "You are a principal systems architect. Reason about constraints first, name the trade-offs, propose a concrete design with component boundaries, and call out failure modes. Be direct and structured.", temperature: 0.4, topP: 0.9, ctx: 4096, hue: ["#7c6cff", "#2b1d8f"], builtin: true },
  { id: "latex", name: "LaTeX Math Solver", tagline: "Step-by-step, typeset with KaTeX", system: "You are a careful mathematics tutor. Solve step by step. Write every formula in LaTeX using $inline$ and $$display$$ delimiters. State the final result clearly.", temperature: 0.1, topP: 0.8, ctx: 4096, hue: ["#38bdf8", "#0b3b8f"], builtin: true },
  { id: "reviewer", name: "Code Reviewer", tagline: "Bugs, safety, naming, tests", system: "You are a senior code reviewer. Find correctness bugs first, then safety, performance and readability issues. Quote the exact lines, explain the risk, and give a minimal fix. No flattery.", temperature: 0.2, topP: 0.85, ctx: 8192, hue: ["#34d399", "#065f46"], builtin: true },
  { id: "concise", name: "Concise Assistant", tagline: "Short, plain, no filler", system: "You are a concise assistant. Answer in the fewest words that are still correct. No preamble, no apologies.", temperature: 0.6, topP: 0.9, ctx: 2048, hue: ["#f472b6", "#7a1450"], builtin: true },
];

const CUSTOM_KEY = "apex.cartridges.v1";
const SELECTED_KEY = "apex.cartridge.v1";

function loadCustom(): Cartridge[] {
  try {
    const raw = localStorage.getItem(CUSTOM_KEY);
    return raw ? (JSON.parse(raw) as Cartridge[]).map((c) => ({ ...c, builtin: false })) : [];
  } catch {
    return [];
  }
}

export function toModelfile(c: Cartridge, base = "MODEL"): string {
  return `FROM ${base}\nPARAMETER temperature ${c.temperature.toFixed(2)}\nPARAMETER top_p ${c.topP.toFixed(2)}\nPARAMETER num_ctx ${c.ctx}\nSYSTEM """${c.system}"""`;
}

export function systemPromptFor(c: Cartridge | undefined): string {
  return `${c?.system ?? "You are Apex, a helpful assistant running privately on the user's device."}\n\n${CHOICES_HINT}`;
}

export function useCartridges() {
  const [custom, setCustom] = useState<Cartridge[]>([]);
  const [selectedId, setSelectedId] = useState<string>("concise");

  useEffect(() => {
    setCustom(loadCustom());
    try {
      setSelectedId(localStorage.getItem(SELECTED_KEY) ?? "concise");
    } catch {
      /* storage blocked */
    }
  }, []);

  const all = [...BUILTIN_CARTRIDGES, ...custom];
  const selected = all.find((c) => c.id === selectedId) ?? BUILTIN_CARTRIDGES[3];

  const select = useCallback((id: string) => {
    setSelectedId(id);
    try {
      localStorage.setItem(SELECTED_KEY, id);
    } catch {
      /* storage blocked */
    }
  }, []);

  const save = useCallback(
    (c: Cartridge) => {
      setCustom((cur) => {
        const next = cur.some((x) => x.id === c.id) ? cur.map((x) => (x.id === c.id ? c : x)) : [...cur, c];
        try {
          localStorage.setItem(CUSTOM_KEY, JSON.stringify(next));
        } catch {
          /* storage blocked */
        }
        return next;
      });
      select(c.id);
    },
    [select],
  );

  const remove = useCallback(
    (id: string) => {
      setCustom((cur) => {
        const next = cur.filter((x) => x.id !== id);
        try {
          localStorage.setItem(CUSTOM_KEY, JSON.stringify(next));
        } catch {
          /* storage blocked */
        }
        return next;
      });
      if (selectedId === id) select("concise");
    },
    [select, selectedId],
  );

  return { all, selected, select, save, remove };
}

export function newCustomCartridge(): Cartridge {
  return { id: `custom-${Date.now().toString(36)}`, name: "My Modelfile", tagline: "Custom system prompt", system: "You are a helpful assistant.", temperature: 0.7, topP: 0.9, ctx: 4096, hue: ["#fbbf24", "#78350f"], builtin: false };
}
