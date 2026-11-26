"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { removeKey, useAccess, verifyKey, type AccessState, type Verdict } from "@/lib/access";
import { CIcon } from "./icons";
import { Sheet } from "./Chrome";

const dim = "text-[rgb(var(--ink-rgb)/var(--ink-3-a))]";

export function StatusBadge({ state, children }: { state: AccessState | "checking"; children: React.ReactNode }) {
  const ok = state === "active";
  const bad = state === "invalid" || state === "revoked" || state === "expired" || state === "disabled";
  return (
    <motion.span initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="inline-flex h-8 items-center gap-2 rounded-full px-3.5 text-[13px] font-medium" style={ok ? { background: "var(--halo-a)", color: "var(--halo-ink)" } : { background: "var(--surface-2)", color: bad ? "#d6685f" : undefined }}>
      <CIcon name={ok ? "check" : bad ? "alert" : "lock"} size={14} />
      {children}
    </motion.span>
  );
}

/** Enter / verify / change / remove the Keyless Cloud access key. Validates live against the owner's remote registry. */
export function AccessKeyModal({ open, onClose, onUnlocked }: { open: boolean; onClose: () => void; onUnlocked?: () => void }) {
  const access = useAccess();
  const [value, setValue] = useState("");
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [busy, setBusy] = useState(false);
  const [changing, setChanging] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    if (open) {
      setValue("");
      setVerdict(null);
      setChanging(false);
    }
  }, [open]);

  /** Live validation: debounce typing, then check the fresh registry. */
  useEffect(() => {
    const k = value.trim();
    if (k.length < 4) {
      setVerdict(null);
      return;
    }
    const id = ++seq.current;
    setBusy(true);
    const t = window.setTimeout(() => {
      void verifyKey(k).then((v) => {
        if (id !== seq.current) return;
        setVerdict(v);
        setBusy(false);
      });
    }, 450);
    return () => window.clearTimeout(t);
  }, [value]);

  const unlock = async () => {
    setBusy(true);
    const v = await verifyKey(value, true);
    setVerdict(v);
    setBusy(false);
    if (v.state === "active") {
      setChanging(false);
      setValue("");
      onUnlocked?.();
      onClose();
    }
  };

  const hasKey = !!access.key && !changing;
  return (
    <Sheet open={open} onClose={onClose} title="Keyless Access Key">
      <div className="px-2 pb-2 pt-1">
        <p className={`text-[13.5px] leading-relaxed ${dim}`}>Local models are always free and need no key. A key unlocks the Keyless Cloud models. It&apos;s managed by the Apex admin and can be revoked at any time.</p>

        <AnimatePresence mode="wait" initial={false}>
          {hasKey ? (
            <motion.div key="has" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-4">
              <div className="rounded-[22px] bg-[var(--surface-2)] p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block truncate text-[15px] font-medium">{access.label ?? "Access key"}</span>
                    <span className={`block font-mono text-[12.5px] ${dim}`}>{access.key ? `${access.key.slice(0, 4)}${"•".repeat(Math.max(4, Math.min(10, access.key.length - 6)))}${access.key.slice(-2)}` : ""}</span>
                  </span>
                  <StatusBadge state={access.state}>{access.state === "active" ? "Active · Verified" : access.state === "checking" ? "Checking…" : access.state === "revoked" ? "Revoked by Admin" : access.message}</StatusBadge>
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <button type="button" className="calm-btn flex-1" onClick={() => setChanging(true)}>
                  <CIcon name="refresh" size={15} /> Change key
                </button>
                <button type="button" className="calm-btn flex-1" onClick={() => { removeKey(); setVerdict(null); }}>
                  <CIcon name="trash" size={15} /> Remove
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.div key="enter" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-4">
              <label className="sr-only" htmlFor="access-key-input">Access key</label>
              <div className="relative">
                <CIcon name="key" size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 opacity-50" />
                <input id="access-key-input" className="calm-field !rounded-full !pl-11 !font-mono" value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void unlock()} placeholder="Enter Keyless Access Key..." autoComplete="off" autoCapitalize="off" spellCheck={false} />
              </div>
              <div className="mt-3 min-h-8">
                {busy && value.trim().length >= 4 ? (
                  <StatusBadge state="checking">Checking registry…</StatusBadge>
                ) : verdict && verdict.state !== "none" ? (
                  <StatusBadge state={verdict.state}>{verdict.state === "active" ? "Active · Verified" : verdict.state === "revoked" ? "Invalid / Revoked by Admin" : verdict.state === "invalid" ? "Invalid / Revoked by Admin" : verdict.message}</StatusBadge>
                ) : (
                  <span className={`text-[12.5px] ${dim}`}>Checked live against the admin registry.</span>
                )}
              </div>
              <div className="mt-3 flex gap-2">
                {changing && (
                  <button type="button" className="calm-btn" onClick={() => setChanging(false)}>
                    Cancel
                  </button>
                )}
                <button type="button" className="calm-btn flex-1 !h-12" data-primary="true" disabled={busy || value.trim().length < 4 || verdict?.state !== "active"} onClick={() => void unlock()}>
                  <CIcon name="unlock" size={16} /> Unlock Keyless Cloud
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Sheet>
  );
}
