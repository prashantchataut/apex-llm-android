"use client";

import { useEffect, useState } from "react";
import { invokeNative, isNative } from "./native";

export interface Telemetry {
  ramTotalMB: number | null;
  ramFreeMB: number | null;
  /** 0..1 share of RAM in use. */
  ramPressure: number | null;
  batteryPct: number | null;
  tempC: number | null;
  charging: boolean | null;
  source: "device" | "browser";
}

interface NativeTelemetry {
  mem_total_mb: number;
  mem_available_mb: number;
  battery_pct: number | null;
  battery_temp_c: number | null;
  charging: boolean | null;
}

const EMPTY: Telemetry = { ramTotalMB: null, ramFreeMB: null, ramPressure: null, batteryPct: null, tempC: null, charging: null, source: "browser" };

/** Polls real readings: Rust `device_telemetry` in the app, Battery/Memory APIs where a browser exposes them. Never invents values. */
export function useTelemetry(everyMs = 4000): Telemetry {
  const [t, setT] = useState<Telemetry>(EMPTY);
  useEffect(() => {
    let live = true;
    const tick = async () => {
      if (isNative()) {
        const n = await invokeNative<NativeTelemetry>("device_telemetry");
        if (n && live && n.mem_total_mb > 0) {
          setT({
            ramTotalMB: n.mem_total_mb,
            ramFreeMB: n.mem_available_mb,
            ramPressure: 1 - n.mem_available_mb / n.mem_total_mb,
            batteryPct: n.battery_pct,
            tempC: n.battery_temp_c,
            charging: n.charging,
            source: "device",
          });
        }
        return;
      }
      const next: Telemetry = { ...EMPTY };
      const dm = (navigator as unknown as { deviceMemory?: number }).deviceMemory;
      const pm = (performance as unknown as { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
      if (dm) next.ramTotalMB = dm * 1024;
      if (pm) next.ramPressure = Math.min(1, pm.usedJSHeapSize / pm.jsHeapSizeLimit);
      try {
        const b = await (navigator as unknown as { getBattery?: () => Promise<{ level: number; charging: boolean }> }).getBattery?.();
        if (b) {
          next.batteryPct = Math.round(b.level * 100);
          next.charging = b.charging;
        }
      } catch {
        /* Battery API unavailable */
      }
      if (live) setT(next);
    };
    void tick();
    const id = window.setInterval(() => void tick(), everyMs);
    return () => {
      live = false;
      window.clearInterval(id);
    };
  }, [everyMs]);
  return t;
}
