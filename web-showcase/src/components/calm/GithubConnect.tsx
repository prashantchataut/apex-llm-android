"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { connectPublic, connectWithToken, fetchRepos, getSelectedRepo, loadOauthConfig, openExternal, pollDeviceFlow, refreshSession, setSelectedRepo, signOutGithub, startDeviceFlow, useGithub, type DeviceCode, type GhRepo } from "@/lib/github-auth";
import { getGithubToken } from "@/lib/skills";
import { CIcon } from "./icons";
import { GitHubConnectModal } from "@/components/modals/GitHubConnectModal";
import { RepoBrowser } from "./RepoBrowser";

const dim = "text-[rgb(var(--ink-rgb)/var(--ink-3-a))]";
const EASE = "cubic-bezier(0.23,1,0.32,1)";

function Octocat({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
    </svg>
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
              {picked && <RepoBrowser repo={picked} token={getGithubToken()} />}
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
      <GitHubConnectModal open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
