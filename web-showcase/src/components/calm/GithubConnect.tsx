"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { connectPublic, connectWithToken, fetchRepos, getSelectedRepo, loadOauthConfig, openExternal, pollDeviceFlow, refreshSession, setSelectedRepo, signOutGithub, startDeviceFlow, useGithub, type DeviceCode, type GhRepo } from "@/lib/github-auth";
import { getGithubToken } from "@/lib/skills";
import { CIcon } from "./icons";
import { Sheet } from "./Chrome";
import { scrollFieldIntoView } from "@/lib/useKeyboard";

const dim = "text-[rgb(var(--ink-rgb)/var(--ink-3-a))]";
const EASE = "cubic-bezier(0.23,1,0.32,1)";

function Octocat({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

type Tab = "device" | "token" | "public";
type Phase = { s: "idle" } | { s: "starting" } | { s: "code"; d: DeviceCode; copied: boolean } | { s: "setup" } | { s: "error"; msg: string };

/** The modal: every user connects THEIR OWN account. Nothing about any account ships with the app. */
function ConnectModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("device");
  const [phase, setPhase] = useState<Phase>({ s: "idle" });
  const [pat, setPat] = useState("");
  const [user, setUser] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const ctl = useRef<AbortController | null>(null);

  useEffect(() => {
    if (open) {
      setErr("");
      setPhase({ s: "idle" });
      void loadOauthConfig();
    } else ctl.current?.abort();
  }, [open]);
  useEffect(() => () => ctl.current?.abort(), []);

  const begin = async () => {
    setPhase({ s: "starting" });
    try {
      const d = await startDeviceFlow();
      let copied = false;
      try {
        await navigator.clipboard.writeText(d.user_code);
        copied = true;
      } catch {
        /* clipboard blocked */
      }
      setPhase({ s: "code", d, copied });
      openExternal(d.verification_uri);
      ctl.current = new AbortController();
      const token = await pollDeviceFlow(d, ctl.current.signal);
      await connectWithToken(token);
      onClose();
    } catch (e) {
      if (ctl.current?.signal.aborted) return setPhase({ s: "idle" });
      const msg = e instanceof Error ? e.message : "Sign-in failed";
      setPhase(msg === "setup" ? { s: "setup" } : { s: "error", msg });
    }
  };
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setErr("");
    try {
      await fn();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not connect");
    }
    setBusy(false);
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: "device", label: "GitHub login" },
    { id: "token", label: "Token" },
    { id: "public", label: "Username" },
  ];

  return (
    <Sheet open={open} onClose={onClose} title="Connect Your GitHub Account">
      <div className="px-2 pb-2 pt-1" data-testid="gh-modal">
        <p className={`text-[13px] leading-relaxed ${dim}`}>Connect your own account. Your token and profile are stored only on this device and are removed the moment you disconnect.</p>
        <div role="tablist" aria-label="Connection method" className="mt-3 grid grid-cols-3 gap-1 rounded-full bg-[var(--surface-2)] p-1">
          {tabs.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => { setTab(t.id); setErr(""); }} className="min-h-10 rounded-full text-[13px] font-medium active:scale-[0.97]" style={{ transition: `background .35s ${EASE}, color .35s ${EASE}, transform .2s ${EASE}`, ...(tab === t.id ? { background: "var(--ink-solid)", color: "var(--canvas)" } : { color: "rgb(var(--ink-rgb)/var(--ink-3-a))" }) }}>
              {t.label}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={tab} initial={{ opacity: 0, y: 8, filter: "blur(4px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} exit={{ opacity: 0 }} transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1] }} className="mt-4">
            {tab === "device" && (
              <div>
                {phase.s === "code" ? (
                  <div className="text-center">
                    <p className={`text-[12.5px] ${dim}`}>{phase.copied ? "Code copied. Paste it on GitHub and tap" : "Enter this code on GitHub and tap"} <b className="font-medium">Authorize</b></p>
                    <button type="button" onClick={() => void navigator.clipboard?.writeText(phase.d.user_code)} className="mx-auto mt-3 block rounded-[18px] bg-[var(--surface-2)] px-6 py-3 font-mono text-[26px] font-medium tracking-[0.18em]" aria-label={`One-time code ${phase.d.user_code}. Tap to copy`} data-testid="gh-code">{phase.d.user_code}</button>
                    <div className="mt-3 flex justify-center gap-2">
                      <button type="button" className="calm-btn" data-primary="true" onClick={() => openExternal(phase.d.verification_uri)}>Open github.com/login/device</button>
                      <button type="button" className="calm-btn" onClick={() => { ctl.current?.abort(); setPhase({ s: "idle" }); }}>Cancel</button>
                    </div>
                    <p className={`mt-3 flex items-center justify-center gap-2 text-[12.5px] ${dim}`} role="status"><span className="inline-block h-2 w-2 animate-pulse rounded-full bg-current" /> Waiting for you to authorize…</p>
                  </div>
                ) : (
                  <>
                    <p className={`text-[13px] leading-snug ${dim}`}>Sign in with the official GitHub device login. You get a short code, approve it on github.com/login/device, and Apex receives a token for your account only.</p>
                    <button type="button" onClick={() => void begin()} disabled={phase.s === "starting"} className="mt-3 flex min-h-12 w-full items-center justify-center gap-2.5 rounded-full bg-[#1f2328] px-5 text-[15px] font-medium text-white active:scale-[0.97] disabled:opacity-60" style={{ transition: `transform .25s ${EASE}` }}>
                      <Octocat size={20} /> {phase.s === "starting" ? "Contacting GitHub…" : "Continue with GitHub"}
                    </button>
                    {phase.s === "setup" && <p className="mt-2 text-[12.5px] leading-snug text-[var(--bad)]" role="alert">GitHub login is not switched on for this build yet. Use the Token or Username tab.</p>}
                    {phase.s === "error" && <p className="mt-2 text-[12.5px] text-[var(--bad)]" role="alert">{phase.msg}</p>}
                  </>
                )}
              </div>
            )}

            {tab === "token" && (
              <form onSubmit={(e) => { e.preventDefault(); void run(() => connectWithToken(pat)); }}>
                <p className={`text-[13px] leading-snug ${dim}`}>Paste a personal access token from github.com/settings/tokens. It stays in this device&apos;s local storage and is sent only to api.github.com.</p>
                <input type="password" autoComplete="off" autoCapitalize="off" spellCheck={false} value={pat} onChange={(e) => setPat(e.target.value)} onFocus={scrollFieldIntoView} placeholder="ghp_… or github_pat_…" aria-label="GitHub personal access token" className="calm-field !mt-3 !rounded-full !font-mono" />
                <button type="submit" className="calm-btn !mt-3 !h-12 w-full" data-primary="true" disabled={busy || pat.trim().length < 8}>{busy ? "Verifying…" : "Connect with token"}</button>
              </form>
            )}

            {tab === "public" && (
              <form onSubmit={(e) => { e.preventDefault(); void run(() => connectPublic(user)); }}>
                <p className={`text-[13px] leading-snug ${dim}`}>No token needed. Enter a public username to browse and attach that account&apos;s public repositories.</p>
                <input autoComplete="off" autoCapitalize="off" spellCheck={false} value={user} onChange={(e) => setUser(e.target.value)} onFocus={scrollFieldIntoView} placeholder="your-github-username" aria-label="Public GitHub username" className="calm-field !mt-3 !rounded-full" data-testid="gh-username" />
                <button type="submit" className="calm-btn !mt-3 !h-12 w-full" data-primary="true" disabled={busy || user.trim().length < 1}>{busy ? "Loading repositories…" : "Connect username"}</button>
              </form>
            )}
            {err && <p className="mt-2 text-[12.5px] text-[var(--bad)]" role="alert">{err}</p>}
          </motion.div>
        </AnimatePresence>
      </div>
    </Sheet>
  );
}

/** GitHub card: "Connect GitHub" opens the modal; once connected it shows the user's own avatar, @login and repositories. */
export function GithubConnect() {
  const gh = useGithub();
  const [open, setOpen] = useState(false);
  const [repos, setRepos] = useState<GhRepo[]>([]);
  const [picked, setPicked] = useState("");

  useEffect(() => {
    setPicked(getSelectedRepo());
    void refreshSession();
  }, []);
  useEffect(() => {
    if (!gh.connected) return setRepos([]);
    void fetchRepos(getGithubToken()).then(setRepos);
  }, [gh.connected, gh.profile?.login]);

  return (
    <div className="calm-card mt-3 overflow-hidden p-4" data-beam="true" data-testid="github-connect">
      <h3 className="flex items-center gap-2 text-[14px] font-medium"><Octocat size={17} /> GitHub</h3>
      {gh.connected ? (
        <div className="mt-3">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {gh.profile?.avatar_url ? <img src={gh.profile.avatar_url} alt="" width={44} height={44} className="h-11 w-11 rounded-full" /> : <span className="grid h-11 w-11 place-items-center rounded-full bg-[var(--surface-2)]"><Octocat /></span>}
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14.5px] font-medium" data-testid="gh-login">@{gh.profile?.login ?? "github"}</p>
              <p className={`truncate text-[12.5px] ${dim}`}>{gh.profile?.name ?? (gh.publicOnly ? "Public repositories" : "Signed in")}</p>
            </div>
            <button type="button" className="calm-btn active:scale-[0.97]" onClick={signOutGithub} data-testid="gh-disconnect">Disconnect Account</button>
          </div>
          {gh.publicOnly && <p className={`mt-2 text-[12px] ${dim}`}>Showing public repositories only. Connect with GitHub login or a token for private ones.</p>}
          {repos.length > 0 && (
            <div className="mt-3">
              <p className={`mb-1.5 text-[12.5px] ${dim}`}>Attach a repository to Knowledge Vault &amp; the GitHub skill</p>
              <div className="flex max-h-36 flex-wrap gap-1.5 overflow-auto" role="listbox" aria-label="Repositories">
                {repos.map((r) => (
                  <button key={r.full_name} type="button" role="option" aria-selected={picked === r.full_name} onClick={() => { setPicked(r.full_name); setSelectedRepo(r.full_name); }} className="min-h-9 rounded-full px-3 text-[12.5px] active:scale-[0.97]" style={picked === r.full_name ? { background: "var(--ink-solid)", color: "var(--canvas)" } : { background: "var(--surface-2)" }}>
                    {r.full_name}{r.private && <CIcon name="lock" size={12} className="ml-1 inline align-[-1px] opacity-60" aria-label="private" />}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="mt-3">
          <p className={`text-[12.5px] leading-snug ${dim}`}>Connect your own GitHub account to read your repositories, index them into the Knowledge Vault and create Gists.</p>
          <button type="button" onClick={() => setOpen(true)} data-testid="gh-connect" className="mt-3 flex min-h-12 w-full items-center justify-center gap-2.5 rounded-full bg-[var(--ink-solid)] px-5 text-[15px] font-medium text-[var(--canvas)] active:scale-[0.97]" style={{ transition: `transform .25s ${EASE}` }}>
            <Octocat size={20} /> Connect GitHub
          </button>
        </div>
      )}
      <ConnectModal open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
