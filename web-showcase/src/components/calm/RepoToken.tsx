"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { forgetToken, sealToken, unsealToken, verifyOwner } from "@/lib/admin";
import { OWNER_LOGIN } from "@/lib/vault";
import { CIcon } from "./icons";

/**
 * Repository sync for /admin. The console unlocks with the passphrase ONLY. The GitHub token needed to commit is sealed on
 * this device under the passphrase (see lib/admin.ts); it is requested at most once per device, and only at the moment of
 * "Save & Publish" if this device has none yet. It is never part of the vault, the repo or the bundle.
 */
interface Ctx {
  token: string;
  connected: boolean;
  /** Resolves with a usable token, asking for it (once) if this device has none sealed. Rejects if cancelled. */
  ensure: () => Promise<string>;
  disconnect: () => void;
}
const RepoCtx = createContext<Ctx>({ token: "", connected: false, ensure: async () => "", disconnect: () => undefined });
export const useRepoToken = () => useContext(RepoCtx);

const dim = "text-[rgb(var(--ink-rgb)/var(--ink-3-a))]";

export function RepoTokenProvider({ passphrase, salt, children }: { passphrase: string; salt: string; children: React.ReactNode }) {
  const [token, setToken] = useState("");
  const [ask, setAsk] = useState(false);
  const waiter = useRef<{ resolve: (t: string) => void; reject: (e: Error) => void } | null>(null);
  const tokenRef = useRef("");
  tokenRef.current = token;

  useEffect(() => {
    let live = true;
    void unsealToken(passphrase, salt).then((t) => live && t && setToken(t));
    return () => {
      live = false;
    };
    // unseal once per unlock; passphrase / salt changes are handled by the re-seal effect below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (token) void sealToken(token, passphrase, salt);
  }, [token, passphrase, salt]);

  const ensure = useCallback(
    () =>
      tokenRef.current
        ? Promise.resolve(tokenRef.current)
        : new Promise<string>((resolve, reject) => {
            waiter.current = { resolve, reject };
            setAsk(true);
          }),
    [],
  );
  const disconnect = useCallback(() => {
    forgetToken();
    setToken("");
  }, []);

  const value = useMemo<Ctx>(() => ({ token, connected: !!token, ensure, disconnect }), [token, ensure, disconnect]);

  return (
    <RepoCtx.Provider value={value}>
      {children}
      <AnimatePresence>
        {ask && (
          <ConnectSheet
            onDone={(t) => {
              setToken(t);
              setAsk(false);
              waiter.current?.resolve(t);
              waiter.current = null;
            }}
            onCancel={() => {
              setAsk(false);
              waiter.current?.reject(new Error("Publishing needs the repository connected on this device. Nothing was changed."));
              waiter.current = null;
            }}
          />
        )}
      </AnimatePresence>
    </RepoCtx.Provider>
  );
}

function ConnectSheet({ onDone, onCancel }: { onDone: (t: string) => void; onCancel: () => void }) {
  const [t, setT] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const go = async () => {
    setBusy(true);
    setErr("");
    try {
      const who = await verifyOwner(t.trim());
      if (!who.canPush) throw new Error("That token can't push to the repository. It needs Contents: read and write.");
      onDone(t.trim());
    } catch (e) {
      const m = e instanceof Error ? e.message : "";
      setErr(m === "rejected" ? "GitHub rejected that token." : m === "not-owner" ? `That token doesn't belong to ${OWNER_LOGIN}.` : m || "Network problem.");
    }
    setBusy(false);
  };
  return (
    <motion.div className="fixed inset-0 z-[60] grid place-items-end bg-black/60 p-3 sm:place-items-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} data-testid="repo-connect">
      <motion.form
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 40, opacity: 0 }}
        transition={{ type: "spring", stiffness: 380, damping: 34 }}
        onSubmit={(e) => {
          e.preventDefault();
          void go();
        }}
        className="calm-card w-full max-w-[440px] p-5"
      >
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-full" style={{ background: "var(--halo-a)", color: "var(--halo-ink)" }}>
            <CIcon name="key" size={18} />
          </span>
          <div>
            <h2 className="text-[17px] font-medium tracking-[-0.02em]">Connect repository, once</h2>
            <p className={`text-[12.5px] ${dim}`}>So Save &amp; Publish can commit for you.</p>
          </div>
        </div>
        <p className={`mt-3 text-[12.5px] leading-relaxed ${dim}`}>
          Paste a fine-grained token for <span className="font-mono">{OWNER_LOGIN}</span> with <b>Contents: read and write</b> on this repository only. It is sealed on this device under your passphrase, so from now on the passphrase alone unlocks and publishes. It is never written to the repo.
        </p>
        <input className="calm-field !font-mono mt-3" type="password" value={t} onChange={(e) => setT(e.target.value)} placeholder="github_pat_…" autoComplete="off" spellCheck={false} aria-label="GitHub token" />
        {err && <p role="alert" className="mt-2 text-[13px] text-[#d6685f]">{err}</p>}
        <div className="mt-4 flex gap-2">
          <button type="button" className="calm-btn" onClick={onCancel}>Not now</button>
          <button type="submit" className="calm-btn flex-1" data-primary="true" disabled={busy || t.trim().length < 20}>
            {busy ? "Checking…" : "Connect & seal"}
          </button>
        </div>
      </motion.form>
    </motion.div>
  );
}
