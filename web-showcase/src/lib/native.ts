/**
 * Bridge to the Tauri Rust core. In the browser (GitHub Pages demo) every call returns `null`
 * and callers fall back to scripted/demo behaviour. Inside Tauri v2 the injected
 * `__TAURI_INTERNALS__.invoke` is used, so we need no extra npm dependency.
 */
interface TauriInternals {
  invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
}

function internals(): TauriInternals | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { __TAURI_INTERNALS__?: TauriInternals };
  return w.__TAURI_INTERNALS__ ?? null;
}

export function isNative(): boolean {
  return internals() !== null;
}

/** Returns `null` when not running in Tauri or when the command is not registered yet. */
export async function invokeNative<T>(cmd: string, args?: Record<string, unknown>): Promise<T | null> {
  const t = internals();
  if (!t) return null;
  try {
    return (await t.invoke(cmd, args)) as T;
  } catch {
    return null;
  }
}
