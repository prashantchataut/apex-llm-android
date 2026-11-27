"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { connectPublic, connectWithToken, fetchRepos, OWNER_PUBLIC_LOGIN, getSelectedRepo, loadOauthConfig, openExternal, pollDeviceFlow, setSelectedRepo, signOutGithub, startDeviceFlow, useGithub, type DeviceCode, type GhRepo } from "@/lib/github-auth";
import { getGithubToken } from "@/lib/skills";
import { CIcon } from "./icons";

function Octocat({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

type Phase = { s: "idle" } | { s: "starting" } | { s: "code"; d: DeviceCode; copied: boolean } | { s: "setup" } | { s: "error"; msg: string };

/** Continue with GitHub (Device Flow) -> connected profile card + repo picker. A raw token stays available, collapsed, under Advanced. */
export function GithubConnect() {
  const gh = useGithub();
  const [phase, setPhase] = useState<Phase>({ s: "idle" });
  const [repos, setRepos] = useState<GhRepo[]>([]);
  const [picked, setPicked] = useState("");
  const [pat, setPat] = useState("");
  const [patErr, setPatErr] = useState("");
  const ctl = useRef<AbortController | null>(null);
  const [quick, setQuick] = useState<"" | "busy" | string>("");

  useEffect(() => {
    setPicked(getSelectedRepo());
    void loadOauthConfig();
  }, []);
  useEffect(() => {
    if (!gh.connected) return setRepos([]);
    void fetchRepos(getGithubToken()).then(setRepos);
  }, [gh.connected]);
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
      setPhase({ s: "idle" });
    } catch (e) {
      if (ctl.current?.signal.aborted) return setPhase({ s: "idle" });
      const msg = e instanceof Error ? e.message : "Sign-in failed";
      setPhase(msg === "setup" ? { s: "setup" } : { s: "error", msg });
    }
  };
  const connectOwner = async () => {
    setQuick("busy");
    try {
      await connectPublic();
      setQuick("");
    } catch (e) {
      setQuick(e instanceof Error ? e.message : "Could not reach GitHub");
    }
  };
  const cancel = () => {
    ctl.current?.abort();
    setPhase({ s: "idle" });
  };

  return (
    <div className="calm-card mt-3 overflow-hidden p-4" data-beam="true" data-testid="github-connect">
      <h3 className="flex items-center gap-2 text-[14px] font-medium"><Octocat size={17} /> GitHub</h3>

      <AnimatePresence mode="wait" initial={false}>
        {gh.connected ? (
          <motion.div key="on" initial={{ opacity: 0, y: 8, filter: "blur(6px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} exit={{ opacity: 0 }} className="mt-3">
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {gh.profile?.avatar_url ? <img src={gh.profile.avatar_url} alt="" width={44} height={44} className="h-11 w-11 rounded-full" /> : <span className="grid h-11 w-11 place-items-center rounded-full bg-[var(--surface-2)]"><Octocat /></span>}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14.5px] font-medium">Connected as @{gh.profile?.login ?? "github"}</p>
                {gh.profile?.name && <p className="truncate text-[12.5px] text-[rgb(var(--ink-rgb)/var(--ink-3-a))]">{gh.profile.name}</p>}
              </div>
              <button type="button" className="calm-btn" onClick={signOutGithub}>Sign out</button>
            </div>
            {gh.publicOnly && <p className="mt-2 text-[12px] text-[rgb(var(--ink-rgb)/var(--ink-3-a))]">Showing public repositories. Sign out and use Continue with GitHub for private ones.</p>}
            {repos.length > 0 && (
              <div className="mt-3">
                <p className="mb-1.5 text-[12.5px] text-[rgb(var(--ink-rgb)/var(--ink-3-a))]">Pick a repository for Knowledge Vault &amp; the GitHub skill</p>
                <div className="flex max-h-36 flex-wrap gap-1.5 overflow-auto" role="listbox" aria-label="Repositories">
                  {repos.map((r) => (
                    <button key={r.full_name} type="button" role="option" aria-selected={picked === r.full_name} onClick={() => { setPicked(r.full_name); setSelectedRepo(r.full_name); }} className="min-h-9 rounded-full px-3 text-[12.5px]" style={picked === r.full_name ? { background: "var(--ink-solid)", color: "var(--canvas)" } : { background: "var(--surface-2)" }}>
                      {r.full_name}{r.private && <CIcon name="lock" size={12} className="ml-1 inline align-[-1px] opacity-60" aria-label="private" />}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        ) : phase.s === "code" ? (
          <motion.div key="code" initial={{ opacity: 0, y: 8, filter: "blur(6px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} exit={{ opacity: 0 }} className="mt-3 text-center">
            <p className="text-[12.5px] text-[rgb(var(--ink-rgb)/var(--ink-3-a))]">{phase.copied ? "Code copied. Paste it on GitHub and tap" : "Enter this code on GitHub and tap"} <b className="font-medium">Authorize Apex</b></p>
            <button type="button" onClick={() => void navigator.clipboard?.writeText(phase.d.user_code)} className="mx-auto mt-3 block rounded-[18px] bg-[var(--surface-2)] px-6 py-3 font-mono text-[28px] font-medium tracking-[0.18em]" aria-label={`One-time code ${phase.d.user_code}. Tap to copy`} data-testid="gh-code">{phase.d.user_code}</button>
            <div className="mt-3 flex justify-center gap-2">
              <button type="button" className="calm-btn" data-primary="true" onClick={() => openExternal(phase.d.verification_uri)}>Open github.com/login/device</button>
              <button type="button" className="calm-btn" onClick={cancel}>Cancel</button>
            </div>
            <p className="mt-3 flex items-center justify-center gap-2 text-[12.5px] text-[rgb(var(--ink-rgb)/var(--ink-3-a))]" role="status"><span className="inline-block h-2 w-2 animate-pulse rounded-full bg-current" /> Waiting for you to authorize…</p>
          </motion.div>
        ) : (
          <motion.div key="off" initial={{ opacity: 0, y: 8, filter: "blur(6px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} exit={{ opacity: 0 }} className="mt-3">
            <motion.button type="button" whileTap={{ scale: 0.97 }} onClick={() => void connectOwner()} disabled={quick === "busy"} data-testid="gh-connect-owner" className="flex min-h-12 w-full items-center justify-center gap-2.5 rounded-full bg-[var(--ink-solid)] px-5 text-[15px] font-medium text-[var(--canvas)] disabled:opacity-60">
              <Octocat size={20} /> {quick === "busy" ? "Loading repositories…" : `Connect @${OWNER_PUBLIC_LOGIN}`}
            </motion.button>
            {quick && quick !== "busy" && <p className="mt-2 text-[12.5px] text-[var(--bad)]" role="alert">{quick}</p>}
            <p className="mt-2 text-[12px] leading-snug text-[rgb(var(--ink-rgb)/var(--ink-3-a))]">One tap loads the public repositories. No token to paste. Private repositories need the sign-in below.</p>
            <p className="mt-4 text-[12.5px] leading-snug text-[rgb(var(--ink-rgb)/var(--ink-3-a))]">Sign in to read your repositories, index them into the Knowledge Vault and create Gists. No token to copy.</p>
            <motion.button type="button" whileTap={{ scale: 0.97 }} onClick={() => void begin()} disabled={phase.s === "starting"} className="mt-3 flex min-h-12 w-full items-center justify-center gap-2.5 rounded-full bg-[#1f2328] px-5 text-[15px] font-medium text-white shadow-[inset_0_1px_0_rgba(255,255,255,.14),0_6px_18px_-6px_rgba(0,0,0,.5)] disabled:opacity-60">
              <Octocat size={20} /> {phase.s === "starting" ? "Contacting GitHub…" : "Continue with GitHub"}
            </motion.button>
            {phase.s === "setup" && <p className="mt-2 text-[12.5px] leading-snug text-[var(--bad)]" role="alert">GitHub sign-in is not switched on for this build yet: the owner registers a GitHub OAuth App with Device Flow enabled and adds its public Client ID to <code>config/github-oauth.json</code>. Until then use the token option below.</p>}
            {phase.s === "error" && <p className="mt-2 text-[12.5px] text-[var(--bad)]" role="alert">{phase.msg}</p>}
          </motion.div>
        )}
      </AnimatePresence>

      <details className="mt-4 text-[12.5px]">
        <summary className="cursor-pointer text-[rgb(var(--ink-rgb)/var(--ink-3-a))]">Advanced: use a custom token</summary>
        <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); setPatErr(""); connectWithToken(pat).then(() => setPat("")).catch((x: unknown) => setPatErr(x instanceof Error ? x.message : "Could not verify token")); }}>
          <input type="password" autoComplete="off" value={pat} onChange={(e) => setPat(e.target.value)} placeholder="Enterprise / self-hosted token (stored only on this device)" aria-label="Custom GitHub token" className="calm-field !rounded-full" />
          <button type="submit" className="calm-btn" disabled={pat.trim().length < 8}>Save</button>
        </form>
        {patErr && <p className="mt-1.5 text-[var(--bad)]">{patErr}</p>}
      </details>
    </div>
  );
}
