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

const BASE = "You are Apex, a helpful assistant running privately on the user's device. Be accurate and direct, and keep the conversation natural: use earlier turns to resolve follow-ups like \"make it shorter\" or \"now in Rust\".";

/** The four "assistant style" presets were removed: you pick a model and talk. One quiet Modelfile lives in Settings. */
export const DEFAULT_CARTRIDGE: Cartridge = { id: "default", name: "Apex", tagline: "Default", system: BASE, temperature: 0.7, topP: 0.9, ctx: 4096, hue: ["#7c6cff", "#2b1d8f"], builtin: true };
export const BUILTIN_CARTRIDGES: Cartridge[] = [DEFAULT_CARTRIDGE];

const MODELFILE_KEY = "apex.modelfile.v1";
export interface ModelfileSettings {
  instructions: string;
  temperature: number;
  ctx: number;
}
const DEFAULT_SETTINGS: ModelfileSettings = { instructions: "", temperature: 0.7, ctx: 4096 };

function loadSettings(): ModelfileSettings {
  try {
    const j = JSON.parse(localStorage.getItem(MODELFILE_KEY) ?? "null") as Partial<ModelfileSettings> | null;
    return { ...DEFAULT_SETTINGS, ...(j ?? {}) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function toModelfile(c: Cartridge, base = "MODEL"): string {
  return `FROM ${base}\nPARAMETER temperature ${c.temperature.toFixed(2)}\nPARAMETER top_p ${c.topP.toFixed(2)}\nPARAMETER num_ctx ${c.ctx}\nSYSTEM """${c.system}"""`;
}

/** Fast Direct Mode prompt for local models: the persona only (no choice-card hints, memory, tools). Keeps prompt processing minimal. */
export function minimalSystemFor(c: Cartridge | undefined): string {
  return c?.system ?? "You are Apex, a helpful assistant running privately on this device. Be accurate and direct.";
}
export function systemPromptFor(c: Cartridge | undefined): string {
  return `${c?.system ?? BASE}\n\n${CHOICES_HINT}`;
}

export function useCartridges() {
  const [cfg, setCfg] = useState<ModelfileSettings>(DEFAULT_SETTINGS);
  useEffect(() => setCfg(loadSettings()), []);
  const update = useCallback((p: Partial<ModelfileSettings>) => {
    setCfg((cur) => {
      const next = { ...cur, ...p };
      try {
        localStorage.setItem(MODELFILE_KEY, JSON.stringify(next));
      } catch {
        /* storage blocked */
      }
      return next;
    });
  }, []);
  const instr = cfg.instructions.trim();
  const selected: Cartridge = { ...DEFAULT_CARTRIDGE, system: instr ? `${BASE}\n\nCustom instructions from the user (always follow them):\n${instr}` : BASE, temperature: cfg.temperature, ctx: cfg.ctx };
  return { selected, settings: cfg, update };
}
