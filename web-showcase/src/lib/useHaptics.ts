"use client";

import { useSyncExternalStore } from "react";
import { getHapticLevel, subscribeHapticLevel, type HapticLevel } from "./haptics";

export function useHapticLevel(): HapticLevel {
  return useSyncExternalStore(subscribeHapticLevel, getHapticLevel, () => "crisp" as HapticLevel);
}
