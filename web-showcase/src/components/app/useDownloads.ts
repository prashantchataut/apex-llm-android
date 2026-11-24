"use client";

import { useCallback, useEffect, useState } from "react";
import { invokeNative, isNative } from "@/lib/native";

export type DlStatus = "idle" | "downloading" | "paused" | "done";
export interface DlState {
  status: DlStatus;
  pct: number;
}
export type DlMap = Record<string, DlState>;

const IDLE: DlState = { status: "idle", pct: 0 };

/**
 * Download manager shared by Models, Studio and onboarding.
 * In Tauri it asks the Rust core (`hf_download`, resumable Range segments); progress arrives via
 * `hf_progress` polling until the Channel API is wired (UNVERIFIED — no Android build yet).
 * In the browser demo it simulates progress so the UI can be reviewed.
 */
export function useDownloads() {
  const [dl, setDl] = useState<DlMap>({});

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
            next[k] = pct >= 100 ? { status: "done", pct: 100 } : { status: "downloading", pct };
          }
        }
        return changed ? next : cur;
      });
    }, 120);
    return () => window.clearInterval(id);
  }, []);

  const get = useCallback((id: string): DlState => dl[id] ?? IDLE, [dl]);

  const start = useCallback((id: string) => {
    setDl((cur) => (cur[id]?.status === "done" || cur[id]?.status === "downloading" ? cur : { ...cur, [id]: { status: "downloading", pct: cur[id]?.pct ?? 0 } }));
    void invokeNative("hf_download", { id });
  }, []);

  const toggle = useCallback((id: string) => {
    setDl((cur) => {
      const v = cur[id] ?? IDLE;
      if (v.status === "done") return cur;
      const downloading = v.status === "downloading";
      void invokeNative(downloading ? "hf_pause" : "hf_download", { id });
      return { ...cur, [id]: { ...v, status: downloading ? "paused" : "downloading" } };
    });
  }, []);

  return { dl, get, start, toggle };
}

export type Downloads = ReturnType<typeof useDownloads>;
