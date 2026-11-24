/**
 * Bridge to the Tauri Rust core. In a plain browser every call returns `null`
 * and callers use the built-in sample content. Inside Tauri v2 the injected
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

/** Calls a Rust command that streams through a Tauri `Channel` (`on_event`). Resolves true when the command ran. */
export async function streamNative<E>(cmd: string, args: Record<string, unknown>, onEvent: (e: E) => void): Promise<{ ok: boolean; error?: string }> {
  if (!isNative()) return { ok: false };
  try {
    const { Channel, invoke } = await import("@tauri-apps/api/core");
    const ch = new Channel<E>();
    ch.onmessage = onEvent;
    await invoke(cmd, { ...args, onEvent: ch });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: typeof e === "string" ? e : e instanceof Error ? e.message : "native call failed" };
  }
}
