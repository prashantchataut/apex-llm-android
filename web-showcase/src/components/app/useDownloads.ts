"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { haptic } from "@/lib/haptics";
import { invokeNative, isNative, streamNative } from "@/lib/native";
import { CATALOG } from "@/lib/models";
import { MODEL_KEY } from "./useChat";

export type DlStatus = "idle" | "downloading" | "paused" | "done";
export interface DlState {
  status: DlStatus;
  pct: number;
  error?: string;
}
export type DlMap = Record<string, DlState>;

const IDLE: DlState = { status: "idle", pct: 0 };
const SOURCES = new Map(CATALOG.map((m) => [m.id, { repo: m.repo, file: m.file }]));

type DlEvent = { kind: "progress"; done: number; total: number } | { kind: "done"; path: string } | { kind: "error"; message: string };

/**
 * Download manager shared by Models, Studio and onboarding.
 * In the Android app, text models stream from Hugging Face through the Rust core (`hf_download`, resumable ranges),
 * and a finished model is loaded into the engine immediately (heavyLock haptic). In a plain browser there is no
 * filesystem, so progress is previewed locally.
 */
export function useDownloads() {
  const [dl, setDl] = useState<DlMap>({});
  const dlRef = useRef(dl);
  dlRef.current = dl;

  useEffect(() => {
    const id = window.setInterval(() => {
      setDl((cur) => {
        if (isNative()) return cur;
        let changed = false;
        const next: DlMap = { ...cur };
        for (const [k, v] of Object.entries(cur)) {
          if (v.status === "downloading") {
            changed = true;
            const pct = Math.min(100, v.pct + 1.6 + Math.random() * 1.4);
            if (pct >= 100) {
              next[k] = { status: "done", pct: 100 };
              haptic("heavyLock");
            } else next[k] = { status: "downloading", pct };
          }
        }
        return changed ? next : cur;
      });
    }, 120);
    return () => window.clearInterval(id);
  }, []);

  const get = useCallback((id: string): DlState => dl[id] ?? IDLE, [dl]);
  const patch = useCallback((id: string, p: Partial<DlState>) => setDl((cur) => ({ ...cur, [id]: { ...(cur[id] ?? IDLE), ...p } })), []);

  const runNative = useCallback(
    async (id: string) => {
      const src = SOURCES.get(id);
      if (!src) {
        patch(id, { status: "idle", pct: 0, error: "Voice and media models are not downloadable in this build yet." });
        return;
      }
      patch(id, { status: "downloading", error: undefined });
      let finished = false;
      const r = await streamNative<DlEvent>("hf_download", { id, repo: src.repo, file: src.file }, (e) => {
        if (e.kind === "progress") patch(id, { status: "downloading", pct: e.total > 0 ? Math.min(99.5, (e.done / e.total) * 100) : 0 });
        else if (e.kind === "done") finished = true;
        else if (e.kind === "error") patch(id, { status: "idle", error: e.message });
      });
      if (finished) {
        patch(id, { status: "done", pct: 100 });
        try {
          localStorage.setItem(MODEL_KEY, src.file);
        } catch {
          /* storage blocked */
        }
        const loaded = await invokeNative<string>("model_load", { name: src.file });
        if (loaded !== null) haptic("heavyLock");
      } else if (!r.ok && dlRef.current[id]?.status !== "paused") patch(id, { status: "idle", error: r.error ?? "Download failed." });
    },
    [patch],
  );

  const start = useCallback(
    (id: string) => {
      const cur = dlRef.current[id];
      if (cur?.status === "done" || cur?.status === "downloading") return;
      if (isNative()) void runNative(id);
      else patch(id, { status: "downloading" });
    },
    [patch, runNative],
  );

  const toggle = useCallback(
    (id: string) => {
      const v = dlRef.current[id] ?? IDLE;
      if (v.status === "done") return;
      if (v.status === "downloading") {
        patch(id, { status: "paused" });
        void invokeNative("hf_pause", { id });
      } else if (isNative()) void runNative(id);
      else patch(id, { status: "downloading" });
    },
    [patch, runNative],
  );

  return { dl, get, start, toggle };
}

export type Downloads = ReturnType<typeof useDownloads>;
