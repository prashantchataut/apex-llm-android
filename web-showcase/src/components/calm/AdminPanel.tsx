"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { backendUrl } from "@/lib/managed-api";

/**
 * Apex admin. Passphrase-only login against the managed server (server/apex-api). The passphrase, Apex API keys and users'
 * GitHub sign-ins are three unrelated credentials. The session token lives in sessionStorage for the tab only and expires
 * server-side after a few minutes. Key values are masked everywhere; the only ways to see one are the one-time display right
 * after create/rotate and "Reveal" (which asks for the passphrase again).
 */
interface KeyRow { id: string; label: string; masked: string; status: "active" | "revoked"; createdAt: string; rotatedAt: string | null; expiresAt: string | null; allowedModels: string[]; lastUsedAt: string | null }
interface Provider { id: string; name: string; baseUrl: string; enabled: boolean; hasCredential: boolean; authHeader: string }
interface Health { state: "untested" | "working" | "rate_limited" | "auth_required" | "failed"; testedAt: string | null; latencyMs: number | null; detail: string }
interface Model { id: string; displayName: string; upstreamId: string; providerId: string; category: string; capabilities: string[]; enabled: boolean; fallbacks: string[]; health: Health }
interface State { enabled: boolean; keys: KeyRow[]; providers: Provider[]; models: Model[] }

const CATEGORIES = ["chat", "reasoning", "code", "vision", "image", "other"];
const CAPS = ["text", "vision", "reasoning", "tools", "json", "image"];
const SESSION = "apex.admin.session.v2";
const HEALTH_LABEL: Record<Health["state"], string> = { untested: "Untested", working: "Working", rate_limited: "Rate limited", auth_required: "Authentication required", failed: "Failed" };
const HEALTH_CLASS: Record<Health["state"], string> = { untested: "bg-[var(--surface-2)]", working: "bg-emerald-500/20 text-emerald-300", rate_limited: "bg-amber-500/20 text-amber-300", auth_required: "bg-amber-500/20 text-amber-300", failed: "bg-red-500/20 text-red-300" };
const input = "min-h-10 w-full rounded-xl bg-[var(--surface-2)] px-3 text-[14px] outline-none focus-visible:ring-2 focus-visible:ring-white/30";
const mute = "text-[rgb(var(--ink-rgb)/var(--ink-3-a))]";

export function AdminPanel() {
  const [base, setBase] = useState<string | null>(null);
  const [token, setToken] = useState("");
  const [st, setSt] = useState<State | null>(null);
  const [tab, setTab] = useState<"keys" | "models" | "providers">("models");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void backendUrl().then(setBase);
    try {
      setToken(sessionStorage.getItem(SESSION) ?? "");
    } catch {
      /* storage blocked */
    }
  }, []);

  const call = useCallback(
    async <T,>(method: string, path: string, body?: unknown, tok = token): Promise<{ ok: boolean; status: number; data: T & { error?: string } }> => {
      try {
        const r = await fetch(`${base}${path}`, { method, headers: { "Content-Type": "application/json", ...(tok ? { Authorization: `Bearer ${tok}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
        const data = (await r.json().catch(() => ({}))) as T & { error?: string };
        if (r.status === 401 && tok && path !== "/admin/login") {
          setToken("");
          setSt(null);
          try { sessionStorage.removeItem(SESSION); } catch { /* ignore */ }
          setMsg("Session expired. Sign in again.");
        }
        return { ok: r.ok, status: r.status, data };
      } catch {
        return { ok: false, status: 0, data: { error: "Could not reach the admin server." } as T & { error?: string } };
      }
    },
    [base, token],
  );
  const refresh = useCallback(async () => {
    const r = await call<State>("GET", "/admin/state");
    if (r.ok) setSt(r.data);
  }, [call]);
  useEffect(() => {
    if (token && base) void refresh();
  }, [token, base, refresh]);

  const logout = async () => {
    await call("POST", "/admin/logout");
    setToken("");
    setSt(null);
    try { sessionStorage.removeItem(SESSION); } catch { /* ignore */ }
  };

  if (base === null) return <Shell><p className={mute}>Loading...</p></Shell>;
  if (!base)
    return (
      <Shell>
        <div className="calm-card p-5" data-testid="admin-blocked">
          <h2 className="text-[16px] font-medium">Admin server not configured</h2>
          <p className={`mt-2 text-[13.5px] leading-relaxed ${mute}`}>
            This site has no managed Apex API server URL, so there is nothing to log in to. A static GitHub Pages file cannot verify a passphrase securely. Deploy <code>server/apex-api</code> and set its public URL in <code>config/backend.json</code>. Steps: docs/SETUP-GITHUB-AND-ADMIN.md.
          </p>
        </div>
      </Shell>
    );
  if (!token || !st) return <Login base={base} initialMsg={msg} onToken={(t) => { try { sessionStorage.setItem(SESSION, t); } catch { /* ignore */ } setMsg(""); setToken(t); }} />;

  const act = async (fn: () => Promise<{ ok: boolean; data: { error?: string } }>, ok = "") => {
    setBusy(true);
    const r = await fn();
    setMsg(r.ok ? ok : r.data.error ?? "Failed");
    await refresh();
    setBusy(false);
  };

  return (
    <Shell
      right={
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-[13px]">
            <input type="checkbox" checked={st.enabled} onChange={(e) => void act(() => call("POST", "/admin/enabled", { enabled: e.target.checked }), e.target.checked ? "Apex API is ON" : "Apex API is OFF for everyone")} /> Apex API on
          </label>
          <button type="button" className="calm-btn" onClick={() => void logout()}>Sign out</button>
        </div>
      }
    >
      <div role="tablist" className="mb-4 flex gap-2">
        {(["models", "keys", "providers"] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className="calm-btn aria-selected:bg-[var(--surface-3)]" data-testid={`tab-${t}`}>
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>
      {msg && <p role="status" className="mb-3 rounded-xl bg-[var(--surface-2)] px-3 py-2 text-[13px]" data-testid="admin-msg">{msg}</p>}
      {tab === "keys" && <Keys st={st} call={call} act={act} busy={busy} />}
      {tab === "providers" && <Providers st={st} call={call} act={act} busy={busy} />}
      {tab === "models" && <Models st={st} call={call} act={act} busy={busy} />}
    </Shell>
  );
}

function Shell({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <main className="mx-auto min-h-dvh max-w-4xl px-4 pb-16 pt-[max(1.5rem,env(safe-area-inset-top))]">
      <header className="mb-5 flex items-center justify-between gap-3">
        <h1 className="text-[20px] font-medium">Apex admin</h1>
        {right}
      </header>
      {children}
    </main>
  );
}

function Login({ base, onToken, initialMsg }: { base: string; onToken: (t: string) => void; initialMsg: string }) {
  const [pass, setPass] = useState("");
  const [err, setErr] = useState(initialMsg);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const r = await fetch(`${base}/admin/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ passphrase: pass }) });
      const j = (await r.json()) as { token?: string; error?: string; retryAfterSec?: number };
      if (r.ok && j.token) onToken(j.token);
      else setErr(r.status === 429 ? `Too many attempts. Try again in ${Math.ceil((j.retryAfterSec ?? 900) / 60)} min.` : j.error ?? "Login failed.");
    } catch {
      setErr("Could not reach the admin server.");
    }
    setPass("");
    setBusy(false);
  };
  return (
    <Shell>
      <form onSubmit={submit} className="calm-card mx-auto max-w-sm p-5" data-testid="admin-login">
        <label htmlFor="adm-pass" className="text-[14px] font-medium">Admin passphrase</label>
        <input id="adm-pass" type="password" autoComplete="current-password" value={pass} onChange={(e) => setPass(e.target.value)} className={`${input} mt-2`} data-testid="admin-pass" />
        {err && <p role="alert" className="mt-2 text-[13px] text-[var(--bad)]">{err}</p>}
        <button type="submit" disabled={busy || !pass} className="calm-btn mt-3 w-full" data-primary="true">{busy ? "Checking..." : "Sign in"}</button>
        <p className={`mt-3 text-[12px] leading-snug ${mute}`}>This is the admin passphrase only. Apex API keys and GitHub sign-in are separate and do not open this panel.</p>
      </form>
    </Shell>
  );
}

type Call = <T>(m: string, p: string, b?: unknown) => Promise<{ ok: boolean; status: number; data: T & { error?: string } }>;
type Act = (fn: () => Promise<{ ok: boolean; data: { error?: string } }>, ok?: string) => Promise<void>;
interface PanelProps { st: State; call: Call; act: Act; busy: boolean }

function Keys({ st, call, act, busy }: PanelProps) {
  const [label, setLabel] = useState("");
  const [secret, setSecret] = useState<{ id: string; value: string } | null>(null);
  const [shown, setShown] = useState(false);
  const [askReveal, setAskReveal] = useState<string | null>(null);
  const [pw, setPw] = useState("");
  const show = (id: string, value: string) => { setSecret({ id, value }); setShown(false); };
  return (
    <section aria-label="Apex API keys">
      <form className="calm-card mb-4 flex gap-2 p-3" onSubmit={(e) => { e.preventDefault(); void act(async () => { const r = await call<{ id: string; secret: string }>("POST", "/admin/keys", { label: label || "Untitled key" }); if (r.ok) show(r.data.id, r.data.secret); setLabel(""); return r; }, "Key created. Copy it now."); }}>
        <input className={input} placeholder="Key label (for example: Phone)" value={label} onChange={(e) => setLabel(e.target.value)} aria-label="New key label" />
        <button className="calm-btn" data-primary="true" disabled={busy}>Create key</button>
      </form>
      {secret && (
        <div className="calm-card mb-4 p-3" role="alert" data-testid="key-secret">
          <p className="text-[13px]">Shown once here. It is stored on the server encrypted; revealing it later needs your passphrase.</p>
          <div className="mt-2 flex gap-2">
            <input readOnly className={`${input} font-mono`} type={shown ? "text" : "password"} value={secret.value} aria-label="Apex API key value" />
            <button type="button" className="calm-btn" onClick={() => setShown(!shown)}>{shown ? "Hide" : "Show"}</button>
            <button type="button" className="calm-btn" onClick={() => void navigator.clipboard?.writeText(secret.value)}>Copy</button>
            <button type="button" className="calm-btn" onClick={() => setSecret(null)}>Done</button>
          </div>
        </div>
      )}
      <ul className="space-y-2">
        {st.keys.map((k) => (
          <li key={k.id} className="calm-card p-3" data-testid="key-row">
            <div className="flex flex-wrap items-center gap-2">
              <input className={`${input} max-w-56`} defaultValue={k.label} aria-label={`Label for ${k.masked}`} onBlur={(e) => e.target.value !== k.label && void act(() => call("PATCH", `/admin/keys/${k.id}`, { label: e.target.value }), "Renamed")} />
              <code className="text-[13px]">{k.masked}</code>
              <span className={`rounded-full px-2 py-0.5 text-[12px] ${k.status === "active" ? "bg-emerald-500/20 text-emerald-300" : "bg-red-500/20 text-red-300"}`}>{k.status}</span>
              <span className={`text-[12px] ${mute}`}>{k.lastUsedAt ? `used ${new Date(k.lastUsedAt).toLocaleString()}` : "never used"}{k.rotatedAt ? `, rotated ${new Date(k.rotatedAt).toLocaleDateString()}` : ""}</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <button className="calm-btn" disabled={busy} onClick={() => setAskReveal(askReveal === k.id ? null : k.id)}>Reveal</button>
              <button className="calm-btn" disabled={busy} onClick={() => { if (confirm("Rotate this key? The old key stops working immediately on every device.")) void act(async () => { const r = await call<{ secret: string }>("POST", `/admin/keys/${k.id}/rotate`); if (r.ok) show(k.id, r.data.secret); return r; }, "Rotated. The old key is now rejected."); }}>Rotate</button>
              <button className="calm-btn" disabled={busy} onClick={() => void act(() => call("PATCH", `/admin/keys/${k.id}`, { status: k.status === "active" ? "revoked" : "active" }), k.status === "active" ? "Revoked" : "Restored")}>{k.status === "active" ? "Revoke" : "Restore"}</button>
              <button className="calm-btn" disabled={busy} onClick={() => confirm("Delete this key permanently?") && void act(() => call("DELETE", `/admin/keys/${k.id}`), "Deleted")}>Delete</button>
            </div>
            {askReveal === k.id && (
              <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); void act(async () => { const r = await call<{ secret: string }>("POST", `/admin/keys/${k.id}/reveal`, { passphrase: pw }); if (r.ok) show(k.id, r.data.secret); setPw(""); setAskReveal(null); return r; }); }}>
                <input type="password" className={input} placeholder="Re-enter admin passphrase" value={pw} onChange={(e) => setPw(e.target.value)} aria-label="Admin passphrase to reveal key" autoComplete="current-password" />
                <button className="calm-btn" disabled={!pw}>Confirm</button>
              </form>
            )}
          </li>
        ))}
        {!st.keys.length && <li className={`text-[13px] ${mute}`}>No keys yet.</li>}
      </ul>
    </section>
  );
}

function Providers({ st, call, act, busy }: PanelProps) {
  const [f, setF] = useState({ name: "", baseUrl: "", credential: "", authHeader: "Authorization" });
  return (
    <section aria-label="Providers">
      <form className="calm-card mb-4 grid gap-2 p-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); void act(async () => { const r = await call("POST", "/admin/providers", f); if (r.ok) setF({ name: "", baseUrl: "", credential: "", authHeader: "Authorization" }); return r; }, "Provider added"); }}>
        <input className={input} placeholder="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} aria-label="Provider name" />
        <input className={input} placeholder="https://api.example.com/v1" value={f.baseUrl} onChange={(e) => setF({ ...f, baseUrl: e.target.value })} aria-label="Endpoint URL" inputMode="url" />
        <input className={input} type="password" autoComplete="off" placeholder="Credential (stays on the server, optional)" value={f.credential} onChange={(e) => setF({ ...f, credential: e.target.value })} aria-label="Provider credential" />
        <select className={input} value={f.authHeader} onChange={(e) => setF({ ...f, authHeader: e.target.value })} aria-label="Credential header"><option>Authorization</option><option>x-api-key</option></select>
        <p className={`text-[12px] sm:col-span-2 ${mute}`}>Endpoints must be public HTTPS addresses. Private, loopback and metadata addresses, redirects and URL credentials are refused.</p>
        <button className="calm-btn sm:col-span-2" data-primary="true" disabled={busy || !f.name || !f.baseUrl}>Add provider</button>
      </form>
      <ul className="space-y-2">
        {st.providers.map((p) => (
          <li key={p.id} className="calm-card flex flex-wrap items-center gap-2 p-3">
            <b className="text-[14px] font-medium">{p.name}</b>
            <code className="text-[12px]">{p.baseUrl}</code>
            <span className={`text-[12px] ${mute}`}>{p.hasCredential ? "credential set" : "no credential"}</span>
            <label className="ml-auto flex items-center gap-2 text-[13px]"><input type="checkbox" checked={p.enabled} onChange={(e) => void act(() => call("PATCH", `/admin/providers/${p.id}`, { enabled: e.target.checked }))} /> Enabled</label>
            <button className="calm-btn" onClick={() => { const c = prompt("New credential (leave empty to remove)"); if (c !== null) void act(() => call("PATCH", `/admin/providers/${p.id}`, { credential: c }), "Credential updated"); }}>Set credential</button>
            <button className="calm-btn" onClick={() => confirm("Delete provider and its models?") && void act(() => call("DELETE", `/admin/providers/${p.id}`))}>Delete</button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Models({ st, call, act, busy }: PanelProps) {
  const [q, setQ] = useState("");
  const [f, setF] = useState({ displayName: "", upstreamId: "", providerId: "", category: "chat" });
  const prov = useMemo(() => Object.fromEntries(st.providers.map((p) => [p.id, p.name])), [st.providers]);
  const list = useMemo(() => st.models.filter((m) => `${m.displayName} ${m.upstreamId} ${m.category} ${prov[m.providerId] ?? ""}`.toLowerCase().includes(q.toLowerCase())), [st.models, q, prov]);
  const when = (h: Health) => (h.testedAt ? `${new Date(h.testedAt).toLocaleTimeString()}${h.latencyMs != null ? `, ${h.latencyMs} ms` : ""}` : "never tested");
  return (
    <section aria-label="Models">
      <div className="mb-3 flex flex-wrap gap-2">
        <input className={`${input} max-w-xs`} type="search" placeholder="Search models" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search models" />
        <button className="calm-btn" disabled={busy || !list.length} onClick={() => void act(() => call("POST", "/admin/models/test-batch", { ids: list.slice(0, 10).map((m) => m.id) }), `Tested up to ${Math.min(10, list.length)} models`)} data-testid="batch-test">Test shown (max 10)</button>
      </div>
      <form className="calm-card mb-4 grid gap-2 p-3 sm:grid-cols-4" onSubmit={(e) => { e.preventDefault(); void act(async () => { const r = await call("POST", "/admin/models", f); if (r.ok) setF({ ...f, displayName: "", upstreamId: "" }); return r; }, "Model added (off until you enable it)"); }}>
        <input className={input} placeholder="Display name" value={f.displayName} onChange={(e) => setF({ ...f, displayName: e.target.value })} aria-label="Display name" />
        <input className={input} placeholder="Model ID" value={f.upstreamId} onChange={(e) => setF({ ...f, upstreamId: e.target.value })} aria-label="Upstream model ID" />
        <select className={input} value={f.providerId} onChange={(e) => setF({ ...f, providerId: e.target.value })} aria-label="Provider"><option value="">Provider</option>{st.providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        <select className={input} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} aria-label="Category">{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
        <button className="calm-btn sm:col-span-4" data-primary="true" disabled={busy || !f.displayName || !f.upstreamId || !f.providerId}>Add model</button>
      </form>
      <ul className="space-y-2">
        {list.map((m) => {
          const compatible = st.models.filter((x) => x.id !== m.id && x.upstreamId.toLowerCase() === m.upstreamId.toLowerCase() && x.category === m.category);
          return (
            <li key={m.id} className="calm-card p-3" data-testid="model-row">
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-2"><input type="checkbox" checked={m.enabled} onChange={(e) => void act(() => call("PATCH", `/admin/models/${m.id}`, { enabled: e.target.checked }), e.target.checked ? "Enabled" : "Disabled: removed from the app and blocked in the API")} aria-label={`Enable ${m.displayName}`} /></label>
                <input className={`${input} max-w-60`} defaultValue={m.displayName} aria-label={`Display name of ${m.upstreamId}`} onBlur={(e) => e.target.value !== m.displayName && void act(() => call("PATCH", `/admin/models/${m.id}`, { displayName: e.target.value }), "Renamed")} />
                <code className="text-[12px]">{m.upstreamId}</code>
                <span className={`text-[12px] ${mute}`}>{prov[m.providerId] ?? "?"}</span>
                <span className={`ml-auto rounded-full px-2 py-0.5 text-[12px] ${HEALTH_CLASS[m.health.state]}`} data-testid="health">{HEALTH_LABEL[m.health.state]}</span>
                <span className={`text-[12px] ${mute}`}>{when(m.health)}</span>
                <button className="calm-btn" disabled={busy} onClick={() => void act(() => call("POST", `/admin/models/${m.id}/test`), "Test finished")}>Test</button>
                <button className="calm-btn" disabled={busy} onClick={() => confirm("Delete this model?") && void act(() => call("DELETE", `/admin/models/${m.id}`))}>Delete</button>
              </div>
              {m.health.detail && m.health.state !== "working" && <p className={`mt-1 text-[12px] ${mute}`}>{m.health.detail}</p>}
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[12.5px]">
                <select className="min-h-9 rounded-lg bg-[var(--surface-2)] px-2" value={m.category} onChange={(e) => void act(() => call("PATCH", `/admin/models/${m.id}`, { category: e.target.value }))} aria-label={`Category of ${m.displayName}`}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
                {CAPS.map((c) => (
                  <label key={c} className="flex items-center gap-1"><input type="checkbox" checked={m.capabilities.includes(c)} onChange={(e) => void act(() => call("PATCH", `/admin/models/${m.id}`, { capabilities: e.target.checked ? [...m.capabilities, c] : m.capabilities.filter((x) => x !== c) }))} /> {c}</label>
                ))}
              </div>
              {compatible.length > 0 && (
                <div className="mt-2 text-[12.5px]">
                  <span className={mute}>Fallback routes for the same model (used only if verified Working): </span>
                  {compatible.map((c) => (
                    <label key={c.id} className="mr-3 inline-flex items-center gap-1"><input type="checkbox" checked={m.fallbacks.includes(c.id)} onChange={(e) => void act(() => call("PATCH", `/admin/models/${m.id}`, { fallbacks: e.target.checked ? [...m.fallbacks, c.id] : m.fallbacks.filter((x) => x !== c.id) }))} /> {prov[c.providerId]}</label>
                  ))}
                </div>
              )}
            </li>
          );
        })}
        {!list.length && <li className={`text-[13px] ${mute}`}>No models. Add a provider first, then a model.</li>}
      </ul>
    </section>
  );
}
