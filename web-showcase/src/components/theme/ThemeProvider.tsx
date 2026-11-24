"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  DEFAULT_PREFS,
  THEME_STORAGE_KEY,
  isModePref,
  isThemeId,
  type Mode,
  type ModePref,
  type ThemeId,
  type ThemePrefs,
} from "@/lib/themes";
import { invokeNative } from "@/lib/native";

interface ThemeCtx extends ThemePrefs {
  resolved: Mode;
  setTheme: (t: ThemeId) => void;
  setMode: (m: ModePref) => void;
}

const Ctx = createContext<ThemeCtx | null>(null);

function readStored(): ThemePrefs {
  try {
    const raw = JSON.parse(localStorage.getItem(THEME_STORAGE_KEY) ?? "null") as Partial<ThemePrefs> | null;
    return {
      theme: isThemeId(raw?.theme) ? raw.theme : DEFAULT_PREFS.theme,
      mode: isModePref(raw?.mode) ? raw.mode : DEFAULT_PREFS.mode,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

function systemMode(): Mode {
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function apply(theme: ThemeId, resolved: Mode, animate: boolean) {
  const el = document.documentElement;
  if (animate) {
    el.classList.add("theme-switching");
    window.setTimeout(() => el.classList.remove("theme-switching"), 450);
  }
  el.dataset.theme = theme;
  el.dataset.mode = resolved;
  // Keep the browser / Android status bar in step with the canvas.
  const canvas = getComputedStyle(el).getPropertyValue("--canvas").trim();
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.appendChild(meta);
  }
  if (canvas) meta.content = canvas;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Server and first client render agree on the default; the real value is applied pre-paint by the inline script.
  const [prefs, setPrefs] = useState<ThemePrefs>(DEFAULT_PREFS);
  const [resolved, setResolved] = useState<Mode>("dark");

  useEffect(() => {
    const stored = readStored();
    setPrefs(stored);
    const r = stored.mode === "system" ? systemMode() : stored.mode;
    setResolved(r);
    apply(stored.theme, r, false);
  }, []);

  // Follow OS changes while in "system".
  useEffect(() => {
    if (prefs.mode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => {
      const r = mq.matches ? "light" : "dark";
      setResolved(r);
      apply(prefs.theme, r, true);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [prefs.mode, prefs.theme]);

  // Sync across tabs / WebViews.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== THEME_STORAGE_KEY) return;
      const next = readStored();
      setPrefs(next);
      const r = next.mode === "system" ? systemMode() : next.mode;
      setResolved(r);
      apply(next.theme, r, true);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const commit = useCallback((next: ThemePrefs) => {
    setPrefs(next);
    const r = next.mode === "system" ? systemMode() : next.mode;
    setResolved(r);
    apply(next.theme, r, true);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* private mode: theme still applies for this session */
    }
    // Native mirror (survives WebView storage clears). No-op in the browser.
    void invokeNative("settings_set", { key: "theme", value: JSON.stringify(next) });
  }, []);

  const setTheme = useCallback((theme: ThemeId) => commit({ ...prefs, theme }), [commit, prefs]);
  const setMode = useCallback((mode: ModePref) => commit({ ...prefs, mode }), [commit, prefs]);

  const value = useMemo<ThemeCtx>(() => ({ ...prefs, resolved, setTheme, setMode }), [prefs, resolved, setTheme, setMode]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme(): ThemeCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useTheme must be used inside <ThemeProvider>");
  return v;
}
