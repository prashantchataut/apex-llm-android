/** Theme registry. Palettes live in packages/design-system/tokens.css; this file only names them. */
export type ThemeId = "obsidian" | "visionos" | "swiss" | "reasoning" | "graphite" | "paper";
export type ModePref = "system" | "light" | "dark";
export type Mode = "light" | "dark";

export interface ThemeMeta {
  id: ThemeId;
  name: string;
  tagline: string;
  archetype: "A" | "B" | "C" | "D" | "Clean";
}

export const THEMES: ThemeMeta[] = [
  { id: "obsidian", name: "Obsidian", tagline: "Black, violet glow", archetype: "A" },
  { id: "visionos", name: "Vision", tagline: "Frosted, cool blue", archetype: "B" },
  { id: "swiss", name: "Swiss", tagline: "Grid, signal red", archetype: "C" },
  { id: "reasoning", name: "Reasoning", tagline: "Cobalt canvas", archetype: "D" },
  { id: "graphite", name: "Graphite", tagline: "Neutral, quiet", archetype: "Clean" },
  { id: "paper", name: "Paper", tagline: "Warm, editorial", archetype: "Clean" },
];

export const MODES: { id: ModePref; label: string }[] = [
  { id: "system", label: "System" },
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
];

export interface ThemePrefs {
  theme: ThemeId;
  mode: ModePref;
}

export const DEFAULT_PREFS: ThemePrefs = { theme: "obsidian", mode: "system" };
export const THEME_STORAGE_KEY = "apex.theme.v1";

export function isThemeId(v: unknown): v is ThemeId {
  return typeof v === "string" && THEMES.some((t) => t.id === v);
}
export function isModePref(v: unknown): v is ModePref {
  return v === "system" || v === "light" || v === "dark";
}

/**
 * Runs before first paint (inlined in <head>) so there is no flash of the wrong theme.
 * Keep dependency-free; it is stringified.
 */
export const NO_FLASH_SCRIPT = `(function(){try{var k=${JSON.stringify(THEME_STORAGE_KEY)};var p=JSON.parse(localStorage.getItem(k)||"null")||{};var ids=${JSON.stringify(
  THEMES.map((t) => t.id),
)};var t=ids.indexOf(p.theme)>-1?p.theme:"obsidian";var m=p.mode==="light"||p.mode==="dark"?p.mode:"system";var r=m==="system"?(matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"):m;var d=document.documentElement;d.dataset.theme=t;d.dataset.mode=r;}catch(e){}})();`;
