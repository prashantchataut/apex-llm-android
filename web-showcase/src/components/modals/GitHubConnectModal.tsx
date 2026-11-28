"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { Sheet } from "@/components/calm/Chrome";
import { CIcon } from "@/components/calm/icons";
import { connectPublic, connectWithToken, openExternal } from "@/lib/github-auth";
import { TOKEN_URL } from "@/lib/github-browse";
import { scrollFieldIntoView } from "@/lib/useKeyboard";

const dim = "text-[rgb(var(--ink-rgb)/var(--ink-3-a))]";
type Tab = "username" | "token";

/**
 * Connect GitHub two ways, both stored only on this device:
 *  1. Username: no token. Loads the public profile and repositories, then browse files and attach them to chat.
 *  2. Personal token: private repositories and Gist creation. Verified against api.github.com/user.
 */
export function GitHubConnectModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("username");
  const [user, setUser] = useState("");
  const [pat, setPat] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async (f: () => Promise<unknown>) => {
    setBusy(true);
    setErr("");
    try {
      await f();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not connect.");
    }
    setBusy(false);
  };

  return (
    <Sheet open={open} onClose={onClose} title="Connect GitHub">
      <div className="px-2 pb-2 pt-1" data-testid="gh-modal">
        <p className={`text-[13px] leading-relaxed ${dim}`}>Your credentials stay in this device&apos;s local storage and are removed the moment you disconnect.</p>
        <div role="tablist" aria-label="Connection method" className="mt-3 grid grid-cols-2 gap-1 rounded-full bg-[var(--surface-2)] p-1">
          {([["username", "Username"], ["token", "Private repos (token)"]] as const).map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} data-testid={`gh-tab-${id}`} onClick={() => { setTab(id); setErr(""); }} className="min-h-10 truncate rounded-full px-2 text-[12.5px] font-medium active:scale-[0.97]" style={tab === id ? { background: "var(--ink-solid)", color: "var(--canvas)" } : { color: "rgb(var(--ink-rgb)/var(--ink-3-a))" }}>
              {label}
            </button>
          ))}
        </div>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }} className="mt-3">
            {tab === "username" ? (
              <form onSubmit={(e) => { e.preventDefault(); void run(() => connectPublic(user)); }}>
                <p className={`text-[13px] leading-snug ${dim}`}>No token needed. Type a GitHub username to load the profile and public repositories, browse files and READMEs, and attach them to the chat.</p>
                <input autoComplete="off" autoCapitalize="off" spellCheck={false} value={user} onChange={(e) => setUser(e.target.value)} onFocus={scrollFieldIntoView} placeholder="octocat" aria-label="GitHub username" data-testid="gh-username" className="calm-field !mt-3" />
                <button type="submit" className="calm-btn !mt-3 !h-12 w-full" data-primary="true" data-testid="gh-username-go" disabled={busy || !user.trim()}>{busy ? "Loading repositories" : "Connect"}</button>
              </form>
            ) : (
              <form onSubmit={(e) => { e.preventDefault(); void run(() => connectWithToken(pat)); }}>
                <p className={`text-[13px] leading-snug ${dim}`}>A personal access token unlocks private repositories and one-tap Gist creation. It is sent only to api.github.com.</p>
                <button type="button" onClick={() => openExternal(TOKEN_URL)} className="calm-btn !mt-3 !h-11 w-full active:scale-[0.97]" data-testid="gh-generate-token"><CIcon name="key" size={14} />Generate Token on GitHub</button>
                <input type="password" autoComplete="off" autoCapitalize="off" spellCheck={false} value={pat} onChange={(e) => setPat(e.target.value)} onFocus={scrollFieldIntoView} placeholder="ghp_ or github_pat_" aria-label="GitHub personal access token" data-testid="gh-token" className="calm-field !mt-3" />
                <button type="submit" className="calm-btn !mt-3 !h-12 w-full" data-primary="true" data-testid="gh-token-go" disabled={busy || pat.trim().length < 8}>{busy ? "Verifying" : "Connect with token"}</button>
              </form>
            )}
            {err && <p className="mt-2 text-[12.5px] text-[var(--bad)]" role="alert" data-testid="gh-error">{err}</p>}
          </motion.div>
        </AnimatePresence>
      </div>
    </Sheet>
  );
}
