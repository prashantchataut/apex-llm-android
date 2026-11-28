"use client";

/**
 * Per-user secret storage.
 *  - Android app: `window.ApexSecure` (WebViewCompat.addWebMessageListener, see SecureStore.kt): AES-GCM with a
 *    non-exportable Android Keystore key. Restricted to the app's origin and main frame.
 *  - Web: `sessionStorage` (cleared when the tab closes). Never localStorage, never a cookie, never the bundle.
 */
interface Bridge {
  postMessage: (s: string) => void;
  onmessage: ((e: { data: string }) => void) | null;
}
const bridge = (): Bridge | null => {
  if (typeof window === "undefined") return null;
  return (window as unknown as { ApexSecure?: Bridge }).ApexSecure ?? null;
};

const pending = new Map<string, (r: { ok: boolean; value?: string }) => void>();
let wired = false;
function call(op: "get" | "set" | "remove", name: string, value = ""): Promise<{ ok: boolean; value?: string }> {
  const b = bridge()!;
  if (!wired) {
    wired = true;
    b.onmessage = (e) => {
      try {
        const r = JSON.parse(e.data) as { id: string; ok: boolean; value?: string };
        pending.get(r.id)?.(r);
        pending.delete(r.id);
      } catch {
        /* ignore malformed reply */
      }
    };
  }
  const id = Math.random().toString(36).slice(2);
  return new Promise((res) => {
    const t = setTimeout(() => {
      pending.delete(id);
      res({ ok: false });
    }, 4000);
    pending.set(id, (r) => {
      clearTimeout(t);
      res(r);
    });
    b.postMessage(JSON.stringify({ id, op, name, value }));
  });
}

export const secureBackend = (): "android-keystore" | "session" => (bridge() ? "android-keystore" : "session");

export async function secureGet(name: string): Promise<string> {
  if (bridge()) return (await call("get", name)).value ?? "";
  try {
    return sessionStorage.getItem(`apex.secure.${name}`) ?? "";
  } catch {
    return "";
  }
}
export async function secureSet(name: string, value: string): Promise<boolean> {
  if (bridge()) return (await call("set", name, value)).ok;
  try {
    sessionStorage.setItem(`apex.secure.${name}`, value);
    return true;
  } catch {
    return false;
  }
}
export async function secureRemove(name: string): Promise<void> {
  if (bridge()) {
    await call("remove", name);
    return;
  }
  try {
    sessionStorage.removeItem(`apex.secure.${name}`);
  } catch {
    /* storage blocked */
  }
}
