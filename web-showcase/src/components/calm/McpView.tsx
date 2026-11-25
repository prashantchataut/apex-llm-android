"use client";

import { useState } from "react";
import { SKILLS, getGithubToken, setGithubToken, toggleSkill, useSkills } from "@/lib/skills";
import { addMcpServer, connectMcp, removeMcpServer, toggleMcpServer, toggleMcpTool, useMcp } from "@/lib/mcp";
import { CIcon } from "./icons";
import { ViewTitle } from "./Chrome";

export function McpView() {
  const on = useSkills();
  const servers = useMcp();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [err, setErr] = useState("");
  const [pat, setPat] = useState(() => getGithubToken());
  const [saved, setSaved] = useState(false);

  const add = () => {
    setErr("");
    try {
      const u = new URL(url.trim());
      if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("scheme");
      addMcpServer(name, u.href);
      setUrl("");
      setName("");
    } catch {
      setErr("Enter a full http(s) URL, e.g. https://example.com/mcp");
    }
  };

  return (
    <div className="mx-auto w-full max-w-[720px] px-5 pb-10 pt-3">
      <ViewTitle title="MCP Servers & Skills" sub="Skills run inside Apex. MCP servers add outside tools over HTTP (JSON-RPC 2.0). Enabled tools are offered to the model in keyless chats." />

      <h2 className="mb-2 text-[13px] font-medium text-[rgb(var(--ink-rgb)/var(--ink-3-a))]">Agent skills</h2>
      <div className="calm-card divide-y divide-[var(--hairline)]">
        {SKILLS.map((s) => (
          <div key={s.id} className="flex items-center gap-3 px-4 py-3">
            <span className="text-[20px]" aria-hidden="true">{s.emoji}</span>
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-medium">{s.name}</p>
              <p className="text-[12.5px] leading-snug text-[rgb(var(--ink-rgb)/var(--ink-3-a))]">{s.desc}</p>
            </div>
            <button type="button" role="switch" aria-checked={on.includes(s.id)} aria-label={s.name} className="switch" onClick={() => toggleSkill(s.id)} />
          </div>
        ))}
      </div>

      <div className="calm-card mt-3 p-4">
        <h3 className="flex items-center gap-2 text-[14px] font-medium">🐙 GitHub token <span className="text-[12px] font-normal text-[rgb(var(--ink-rgb)/var(--ink-3-a))]">optional · private repos, higher rate limit, Gists</span></h3>
        <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); setGithubToken(pat); setSaved(true); window.setTimeout(() => setSaved(false), 1600); }}>
          <input type="password" autoComplete="off" value={pat} onChange={(e) => setPat(e.target.value)} placeholder="ghp_… (stored only on this device)" aria-label="GitHub personal access token" className="calm-field !rounded-full" />
          <button type="submit" className="calm-btn" data-primary="true">{saved ? "Saved ✓" : "Save"}</button>
        </form>
      </div>

      <h2 className="mb-2 mt-8 text-[13px] font-medium text-[rgb(var(--ink-rgb)/var(--ink-3-a))]">MCP servers</h2>
      <form onSubmit={(e) => { e.preventDefault(); add(); }} className="calm-card flex flex-col gap-2 p-3 sm:flex-row">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (optional)" aria-label="Server name" className="calm-field !rounded-full sm:!w-[34%]" />
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://host/mcp  (Streamable HTTP or SSE)" aria-label="Server URL" className="calm-field !rounded-full" />
        <button type="submit" className="calm-btn" data-primary="true" disabled={!url.trim()}>
          <CIcon name="plug" size={15} /> Connect
        </button>
      </form>
      {err && <p className="mt-2 text-[12.5px] text-[var(--bad)]">{err}</p>}
      <p className="mt-2 text-[12px] leading-snug text-[rgb(var(--ink-rgb)/var(--ink-3-a))]">Browser connections need the server to allow CORS. The Apex Android app has no such limit.</p>

      <div className="mt-4 space-y-3">
        {servers.length === 0 && <p className="text-[13.5px] text-[rgb(var(--ink-rgb)/var(--ink-3-a))]">No servers yet.</p>}
        {servers.map((s) => (
          <article key={s.id} className="calm-card p-4" aria-label={s.name}>
            <div className="flex items-center gap-3">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.status === "ready" ? "var(--ok)" : s.status === "error" ? "var(--bad)" : "var(--warn)" }} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14.5px] font-medium">{s.name}</p>
                <p className="truncate text-[12px] text-[rgb(var(--ink-rgb)/var(--ink-3-a))]">{s.url}{s.transport ? ` · ${s.transport === "sse" ? "HTTP+SSE" : "Streamable HTTP"}` : ""}</p>
              </div>
              <button type="button" role="switch" aria-checked={s.enabled} aria-label={`Enable ${s.name}`} className="switch" onClick={() => toggleMcpServer(s.id, !s.enabled)} />
              <button type="button" className="ibtn" aria-label={`Reconnect ${s.name}`} onClick={() => void connectMcp(s.id)}>
                <CIcon name="refresh" size={16} />
              </button>
              <button type="button" className="ibtn" aria-label={`Remove ${s.name}`} onClick={() => removeMcpServer(s.id)}>
                <CIcon name="trash" size={16} />
              </button>
            </div>
            {s.status === "connecting" && <p className="mt-2 text-[12.5px] text-[rgb(var(--ink-rgb)/var(--ink-3-a))]">Connecting…</p>}
            {s.error && <p className="mt-2 text-[12.5px] text-[var(--bad)]">{s.error}</p>}
            {s.tools.length > 0 && (
              <ul className="mt-3 space-y-1">
                {s.tools.map((t) => (
                  <li key={t.name} className="flex items-center gap-3 rounded-xl bg-[var(--surface-2)] px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-mono text-[12.5px]">{t.name}</p>
                      {t.description && <p className="line-clamp-2 text-[12px] leading-snug text-[rgb(var(--ink-rgb)/var(--ink-3-a))]">{t.description}</p>}
                    </div>
                    <button type="button" role="switch" aria-checked={t.enabled} aria-label={`Enable tool ${t.name}`} className="switch" onClick={() => toggleMcpTool(s.id, t.name, !t.enabled)} />
                  </li>
                ))}
              </ul>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
