"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import {
  connectWithToken,
  fetchRepos,
  getSelectedRepo,
  initGithubSession,
  loadOauthConfig,
  openExternal,
  pollDeviceFlow,
  scopesFor,
  setSelectedRepo,
  signOutGithub,
  startDeviceFlow,
  useGithub,
  type DeviceCode,
  type GhConsent,
  type GhRepo,
} from "@/lib/github-auth";
import { getGithubToken } from "@/lib/github-token";
import { CIcon } from "./icons";

function Octocat({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

type Phase = { s: "idle" } | { s: "starting" } | { s: "code"; d: DeviceCode; copied: boolean } | { s: "setup" } | { s: "error"; msg: string };

const mute = "text-[rgb(var(--ink-rgb)/var(--ink-3-a))]";

export function GithubConnect() {
  const gh = useGithub();
  const [phase, setPhase] = useState<Phase>({ s: "idle" });
  const [consent, setConsent] = useState<GhConsent>({ privateRepos: false, gists: false });
  const [repos, setRepos] = useState<GhRepo[]>([]);
  const [picked, setPicked] = useState("");
  const ctl = useRef<AbortController | null>(null);

  useEffect(() => {
    setPicked(getSelectedRepo());
    void loadOauthConfig();
    void initGithubSession();
  }, []);
  useEffect(() => {
    if (!gh.connected) return setRepos([]);
    void fetchRepos(getGithubToken(), gh.canReadPrivate).then(setRepos);
  }, [gh.connected, gh.canReadPrivate, gh.profile?.login]);
  useEffect(() => () => ctl.current?.abort(), []);

  const begin = async () => {
    setPhase({ s: "starting" });
    ctl.current?.abort();
    const ac = new AbortController();
    ctl.current = ac;
    try {
      const d = await startDeviceFlow(consent);
      let copied = false;
      try {
        await navigator.clipboard.writeText(d.user_code);
        copied = true;
      } catch {
        /* clipboard blocked */
      }
      setPhase({ s: "code", d, copied });
      openExternal(d.verification_uri);
      const token = await pollDeviceFlow(d, ac.signal);
      await connectWithToken(token);
      setPhase({ s: "idle" });
    } catch (e) {
      if (ac.signal.aborted) return setPhase({ s: "idle" });
      const msg = e instanceof Error ? e.message : "Sign-in failed";
      setPhase(msg === "setup" ? { s: "setup" } : { s: "error", msg });
    }
  };
  const cancel = () => {
    ctl.current?.abort();
    setPhase({ s: "idle" });
  };
  const switchAccount = async () => {
    await signOutGithub();
    setPhase({ s: "idle" });
  };

  const fade = { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0 }, transition: { duration: 0.2 } } as const;

  return (
    <div className="calm-card mt-3 overflow-hidden p-4" data-testid="github-connect">
      <h3 className="flex items-center gap-2 text-[14px] font-medium">
        <Octocat size={17} /> GitHub
      </h3>

      <AnimatePresence mode="wait" initial={false}>
        {gh.connected ? (
          <motion.div key="on" {...fade} className="mt-3">
            <div className="flex items-center gap-3">
              {gh.profile?.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={gh.profile.avatar_url} alt="" width={44} height={44} className="h-11 w-11 rounded-full" />
              ) : (
                <span className="grid h-11 w-11 place-items-center rounded-full bg-[var(--surface-2)]">
                  <Octocat size={22} />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14.5px] font-medium" data-testid="gh-username">
                  Connected as @{gh.profile?.login}
                </p>
                {gh.profile?.name && <p className={`truncate text-[12.5px] ${mute}`}>{gh.profile.name}</p>}
              </div>
            </div>
            <ul className={`mt-3 space-y-1 text-[12.5px] ${mute}`} aria-label="Granted permissions">
              <li>Identity and public repositories: granted</li>
              <li>Private repositories: {gh.canReadPrivate ? "granted" : "not granted"}</li>
              <li>Create Gists: {gh.canCreateGists ? "granted" : "not granted"}</li>
              <li>Token stored in: {gh.storage === "android-keystore" ? "Android Keystore (encrypted, this device only)" : "this browser tab only (cleared on close)"}</li>
            </ul>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className="calm-btn" onClick={() => void signOutGithub()} data-testid="gh-disconnect">
                Disconnect
              </button>
              <button type="button" className="calm-btn" onClick={() => void switchAccount()} data-testid="gh-switch">
                Switch account
              </button>
              <button type="button" className="calm-btn" onClick={() => openExternal("https://github.com/settings/applications")}>
                Revoke on GitHub
              </button>
            </div>
            <p className={`mt-2 text-[12px] leading-snug ${mute}`}>Disconnect removes the token from this device. To revoke it on GitHub as well, use Revoke on GitHub. To switch, sign in to the other account on github.com first.</p>
            {repos.length > 0 && (
              <div className="mt-3">
                <p className={`mb-1.5 text-[12.5px] ${mute}`}>Pick a repository for Knowledge Vault &amp; the GitHub skill</p>
                <div className="flex max-h-36 flex-wrap gap-1.5 overflow-auto" role="listbox" aria-label="Repositories">
                  {repos.map((r) => (
                    <button
                      key={r.full_name}
                      type="button"
                      role="option"
                      aria-selected={picked === r.full_name}
                      onClick={() => {
                        setPicked(r.full_name);
                        setSelectedRepo(r.full_name);
                      }}
                      className="min-h-9 rounded-full px-3 text-[12.5px] aria-selected:bg-[var(--surface-3)] bg-[var(--surface-2)]"
                    >
                      {r.full_name}
                      {r.private && <CIcon name="lock" size={12} className="ml-1 inline align-[-1px] opacity-60" aria-label="private" />}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        ) : phase.s === "code" ? (
          <motion.div key="code" {...fade} className="mt-3 text-center">
            <p className={`text-[12.5px] ${mute}`}>
              {phase.copied ? "Code copied. Paste it on GitHub" : "Enter this code on GitHub"}, sign in as yourself, check the permissions and tap <b className="font-medium">Authorize</b>.
            </p>
            <button
              type="button"
              onClick={() => void navigator.clipboard?.writeText(phase.d.user_code)}
              className="mx-auto mt-3 block rounded-[18px] bg-[var(--surface-2)] px-6 py-3 font-mono text-[28px] font-medium tracking-[0.18em]"
              aria-label={`Sign-in code ${phase.d.user_code.split("").join(" ")}. Tap to copy.`}
            >
              {phase.d.user_code}
            </button>
            <p className={`mt-2 text-[12px] ${mute}`}>Requested: {scopesFor(consent)}</p>
            <div className="mt-3 flex justify-center gap-2">
              <button type="button" className="calm-btn" data-primary="true" onClick={() => openExternal(phase.d.verification_uri)}>
                Open github.com/login/device
              </button>
              <button type="button" className="calm-btn" onClick={cancel}>
                Cancel
              </button>
            </div>
            <p className={`mt-3 flex items-center justify-center gap-2 text-[12.5px] ${mute}`} role="status">
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-current motion-reduce:animate-none" /> Waiting for you to approve on GitHub. The code expires in {Math.round(phase.d.expires_in / 60)} minutes.
            </p>
          </motion.div>
        ) : (
          <motion.div key="off" {...fade} className="mt-3">
            <p className={`text-[12.5px] leading-snug ${mute}`}>Sign in with your own GitHub account to use your repositories in Knowledge Vault. Nothing is shared: this app never connects you to anyone else&apos;s account.</p>
            <fieldset className="mt-3 space-y-2">
              <legend className={`mb-1 text-[12.5px] ${mute}`}>Extra permissions (optional, off by default)</legend>
              <label className="flex items-start gap-2.5 text-[13px]">
                <input type="checkbox" className="mt-0.5 h-4 w-4" checked={consent.privateRepos} onChange={(e) => setConsent({ ...consent, privateRepos: e.target.checked })} data-testid="consent-private" />
                <span>
                  Read my private repositories
                  <span className={`block text-[12px] ${mute}`}>Grants GitHub&apos;s broad &quot;repo&quot; scope, which also allows writing. Apex only reads.</span>
                </span>
              </label>
              <label className="flex items-start gap-2.5 text-[13px]">
                <input type="checkbox" className="mt-0.5 h-4 w-4" checked={consent.gists} onChange={(e) => setConsent({ ...consent, gists: e.target.checked })} data-testid="consent-gist" />
                <span>
                  Create Gists on my account
                  <span className={`block text-[12px] ${mute}`}>Used only when you ask Apex to share something.</span>
                </span>
              </label>
            </fieldset>
            <motion.button
              type="button"
              whileTap={{ scale: 0.97 }}
              onClick={() => void begin()}
              disabled={phase.s === "starting"}
              data-testid="gh-continue"
              className="mt-3 flex min-h-12 w-full items-center justify-center gap-2.5 rounded-full bg-[#1f2328] px-4 text-[14px] font-medium text-white disabled:opacity-60"
            >
              <Octocat size={20} /> {phase.s === "starting" ? "Contacting GitHub..." : "Continue with GitHub"}
            </motion.button>
            {phase.s === "setup" && (
              <p className="mt-2 text-[12.5px] leading-snug text-[var(--bad)]" role="alert" data-testid="gh-setup-blocked">
                GitHub sign-in is not switched on in this build yet. The site owner must register a GitHub OAuth App (Device Flow enabled) and publish its Client ID. See docs/SETUP-GITHUB-AND-ADMIN.md.
              </p>
            )}
            {phase.s === "error" && (
              <p className="mt-2 text-[12.5px] text-[var(--bad)]" role="alert">
                {phase.msg}
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
