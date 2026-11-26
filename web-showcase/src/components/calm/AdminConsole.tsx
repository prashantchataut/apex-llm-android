"use client";

import "./calm.css";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { loadVault, publishVault, verifyOwner } from "@/lib/admin";
import { OWNER_LOGIN, generateSecretKey, mintRecord, openAsAdmin, type ApexCatalog, type VaultFile, type VaultKey } from "@/lib/vault";
import { REPO, REPO_URL } from "@/lib/site";
import { CIcon } from "./icons";
import { AdminCatalog } from "./AdminCatalog";

const dim = "text-[rgb(var(--ink-rgb)/var(--ink-3-a))]";
const spring = { type: "spring", stiffness: 380, damping: 34 } as const;
const IDLE_MS = 15 * 60 * 1000;
const BF_KEY = "apex.admin.bf";

/* ───────── brute-force protection: exponential back-off persisted per browser ───────── */
const bfRead = (): { fails: number; until: number } => {
  try {
    return JSON.parse(localStorage.getItem(BF_KEY) ?? "") as { fails: number; until: number };
  } catch {
    return { fails: 0, until: 0 };
  }
};
const bfFail = () => {
  const b = bfRead();
  const fails = b.fails + 1;
  // 1st failure is free; then 2s, 4s, 8s … capped at 15 min.
  const until = fails <= 1 ? 0 : Date.now() + Math.min(900, 2 ** (fails - 1)) * 1000;
  try {
    localStorage.setItem(BF_KEY, JSON.stringify({ fails, until }));
  } catch {
    /* ignore */
  }
  return until;
};
const bfClear = () => {
  try {
    localStorage.removeItem(BF_KEY);
  } catch {
    /* ignore */
  }
};

function Badge({ tone, children }: { tone: "ok" | "bad" | "warn" | "mute"; children: React.ReactNode }) {
  const c = { ok: "var(--ok)", bad: "#d6685f", warn: "var(--warn)", mute: "rgb(var(--ink-rgb)/0.4)" }[tone];
  return (
    <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-[var(--surface-2)] px-3 text-[12px] font-medium">
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: c }} />
      {children}
    </span>
  );
}
function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} className="switch" />;
}
const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "Never");

interface Session {
  token: string;
  vault: VaultFile;
  sha: string;
  catalog: ApexCatalog;
}

/* ───────── gate ───────── */
function Gate({ onUnlock }: { onUnlock: (s: Session) => void }) {
  const [token, setToken] = useState("");
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [wait, setWait] = useState(0);

  useEffect(() => {
    const tick = () => setWait(Math.max(0, Math.ceil((bfRead().until - Date.now()) / 1000)));
    tick();
    const id = window.setInterval(tick, 500);
    return () => window.clearInterval(id);
  }, []);

  const submit = async () => {
    if (busy || wait > 0) return;
    setBusy(true);
    setErr("");
    try {
      try {
        await verifyOwner(token.trim());
      } catch (e) {
        const m = e instanceof Error ? e.message : "";
        if (m === "rejected" || m === "not-owner") throw new Error("auth");
        throw e;
      }
      const { vault, sha } = await loadVault(token.trim());
      let catalog: ApexCatalog;
      try {
        catalog = await openAsAdmin(vault, pass);
      } catch {
        throw new Error("auth");
      }
      bfClear();
      setToken("");
      setPass("");
      onUnlock({ token: token.trim(), vault, sha, catalog });
    } catch (e) {
      const m = e instanceof Error ? e.message : "";
      if (m === "auth") {
        const until = bfFail();
        setErr("Couldn't unlock. Check the owner token and the passphrase.");
        setWait(Math.max(0, Math.ceil((until - Date.now()) / 1000)));
      } else setErr(m || "Network problem. Try again.");
    }
    setBusy(false);
  };

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[460px] flex-col justify-center px-5 py-10" data-testid="admin-gate">
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={spring} className="calm-card p-6">
        <span className="grid h-12 w-12 place-items-center rounded-full" style={{ background: "var(--halo-a)", color: "var(--halo-ink)" }}>
          <CIcon name="shield" size={22} />
        </span>
        <h1 className="mt-4 text-[22px] font-medium tracking-[-0.03em]">Apex API Vault</h1>
        <p className={`mt-1 text-[13.5px] leading-relaxed ${dim}`}>Owner access only. Nothing is loaded or rendered until both factors check out: a GitHub token that belongs to <span className="font-mono">{OWNER_LOGIN}</span>, and the vault passphrase.</p>
        <form
          className="mt-5 grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <label className="grid gap-1.5 text-[13px]">
            <span className={dim}>GitHub personal access token</span>
            <input className="calm-field !font-mono" type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="ghp_…" autoComplete="off" spellCheck={false} aria-label="GitHub personal access token" />
          </label>
          <label className="grid gap-1.5 text-[13px]">
            <span className={dim}>Admin master passphrase</span>
            <input className="calm-field !font-mono" type="password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="••••-••••-••••" autoComplete="off" spellCheck={false} aria-label="Admin master passphrase" />
          </label>
          {err && (
            <p role="alert" className="flex items-start gap-2 rounded-2xl bg-[var(--surface-2)] px-3.5 py-2.5 text-[13px] text-[#d6685f]">
              <CIcon name="alert" size={15} className="mt-0.5 shrink-0" /> {err}
            </p>
          )}
          {wait > 0 && <p className={`text-[12.5px] ${dim}`}>Too many attempts. Try again in {wait >= 60 ? `${Math.ceil(wait / 60)} min` : `${wait}s`}.</p>}
          <button type="submit" className="calm-btn !h-12" data-primary="true" disabled={busy || wait > 0 || token.trim().length < 20 || pass.length < 8}>
            <CIcon name="unlock" size={16} /> {busy ? "Verifying…" : "Unlock console"}
          </button>
        </form>
        <p className={`mt-4 text-[12px] leading-relaxed ${dim}`}>The token is checked live against api.github.com/user and kept in memory only. The console locks itself after 15 minutes of inactivity or when this tab closes.</p>
      </motion.div>
    </div>
  );
}

/* ───────── one-time secret reveal ───────── */
function SecretModal({ secret, label, onClose }: { secret: string; label: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const [ack, setAck] = useState(false);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" role="dialog" aria-modal="true" aria-label="New Apex API key" data-testid="secret-modal">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[4px]" />
      <motion.div initial={{ opacity: 0, y: 18, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={spring} className="calm-card relative w-full max-w-[460px] p-5">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-full" style={{ background: "var(--halo-a)", color: "var(--halo-ink)" }}>
            <CIcon name="key" size={18} />
          </span>
          <div className="min-w-0">
            <h3 className="text-[17px] font-medium tracking-[-0.02em]">Save your secret key</h3>
            <p className={`truncate text-[12.5px] ${dim}`}>{label}</p>
          </div>
        </div>
        <p className={`mt-3 text-[13px] leading-relaxed ${dim}`}>This is the only time the full key is shown. Only its salted SHA-256 hash and an AES-256-GCM encrypted catalog were committed. If you lose it, rotate the key.</p>
        <div className="mt-3 break-all rounded-2xl bg-[var(--surface-2)] p-3.5 font-mono text-[13px] leading-relaxed" data-testid="secret-value">{secret}</div>
        <button
          type="button"
          className="calm-btn mt-3 w-full !h-12"
          data-primary="true"
          onClick={() => {
            void navigator.clipboard?.writeText(secret).then(() => setCopied(true));
            setCopied(true);
          }}
        >
          <CIcon name={copied ? "check" : "copy"} size={16} /> {copied ? "Copied" : "Copy Secret Key"}
        </button>
        <label className="mt-3 flex cursor-pointer items-center gap-2.5 text-[13px]">
          <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="h-4 w-4" /> I stored this key somewhere safe
        </label>
        <button type="button" className="calm-btn mt-3 w-full" disabled={!ack} onClick={onClose}>
          Done, hide it forever
        </button>
      </motion.div>
    </div>
  );
}

/* ───────── console ───────── */
function Console({ session, setSession, onLock }: { session: Session; setSession: (s: Session) => void; onLock: () => void }) {
  const { vault, token, catalog } = session;
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [secret, setSecret] = useState<{ value: string; label: string } | null>(null);
  const [form, setForm] = useState(false);
  const [label, setLabel] = useState("");
  const [expires, setExpires] = useState("");
  const [confirm, setConfirm] = useState<{ id: string; kind: "revoke" | "rotate" } | null>(null);

  const publish = async (next: VaultFile, text: string) => {
    const r = await publishVault(token, next, session.sha, text);
    setSession({ ...session, vault: next, sha: r.sha });
    setMsg({ ok: true, text: `Committed to ${REPO}. ${r.commitUrl}` });
  };
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Something went wrong." });
    }
    setBusy(false);
  };

  const create = () =>
    run(async () => {
      if (!label.trim()) throw new Error("Give the key a label so you remember who it is for.");
      const plain = generateSecretKey();
      const rec = await mintRecord(vault, catalog, plain, label, expires ? new Date(`${expires}T23:59:59`).toISOString() : null);
      await publish({ ...vault, keys: [...vault.keys, rec] }, `vault: create key “${rec.label}” (${rec.prefix})`);
      setForm(false);
      setLabel("");
      setExpires("");
      setSecret({ value: plain, label: rec.label });
    });
  const rotate = (k: VaultKey) =>
    run(async () => {
      const plain = generateSecretKey();
      const rec = await mintRecord(vault, catalog, plain, k.label, k.expiresAt, k.id);
      await publish({ ...vault, keys: vault.keys.map((x) => (x.id === k.id ? rec : x)) }, `vault: rotate key “${k.label}” (${rec.prefix})`);
      setConfirm(null);
      setSecret({ value: plain, label: `${k.label} (rotated)` });
    });
  const revoke = (k: VaultKey) =>
    run(async () => {
      await publish({ ...vault, keys: vault.keys.map((x) => (x.id === k.id ? { ...x, status: "revoked" as const, encryptedCatalogEnvelope: "" } : x)) }, `vault: revoke key “${k.label}”`);
      setConfirm(null);
    });
  const remove = (k: VaultKey) => run(() => publish({ ...vault, keys: vault.keys.filter((x) => x.id !== k.id) }, `vault: delete revoked key “${k.label}”`));
  const killSwitch = (on: boolean) => run(() => publish({ ...vault, enabled: on }, `vault: Apex API ${on ? "enabled" : "disabled (kill-switch)"}`));

  const active = vault.keys.filter((k) => k.status === "active").length;
  const groups = [...new Set(catalog.models.map((m) => m.group))];

  return (
    <div className="mx-auto w-full max-w-[720px] px-5 pb-16 pt-6" data-testid="admin-console">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[24px] font-medium tracking-[-0.03em]">Apex API Vault</h1>
          <p className={`mt-1 text-[13.5px] ${dim}`}>Signed in as <span className="font-mono">{OWNER_LOGIN}</span> · auto-locks after 15 min idle</p>
        </div>
        <button type="button" className="calm-btn shrink-0" onClick={onLock} data-testid="lock-console">
          <CIcon name="lock" size={15} /> Lock Console
        </button>
      </header>

      <section className="calm-card mt-5 grid grid-cols-2 gap-3 p-4 sm:grid-cols-4" aria-label="Vault status">
        {[
          ["Apex API", vault.enabled ? "Enabled" : "Kill-switch on"],
          ["Keys", `${active} active · ${vault.keys.length - active} revoked`],
          ["Models sealed", `${catalog.models.length} in ${groups.length} groups`],
          ["Cipher", "AES-256-GCM · PBKDF2 100k"],
        ].map(([k, v]) => (
          <div key={k}>
            <p className={`text-[12px] ${dim}`}>{k}</p>
            <p className="mt-0.5 text-[13.5px] font-medium leading-snug">{v}</p>
          </div>
        ))}
      </section>

      <div className="calm-card mt-3 flex items-center justify-between gap-4 p-4">
        <span>
          <span className="block text-[14.5px] font-medium">Kill-switch</span>
          <span className={`block text-[12.5px] ${dim}`}>Turn Apex API off for every device on its next check. Local models keep working.</span>
        </span>
        <Switch on={vault.enabled} onChange={(v) => void killSwitch(v)} label="Apex API enabled" />
      </div>

      <div className="mb-2 mt-8 flex items-center justify-between">
        <h2 className={`text-[13px] font-medium ${dim}`}>API keys</h2>
        <button type="button" className="calm-btn" onClick={() => setForm((f) => !f)} disabled={busy}>
          <CIcon name="key" size={15} /> New key
        </button>
      </div>

      <AnimatePresence>
        {form && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} transition={spring} className="calm-card mb-3 p-5">
            <h3 className="text-[17px] font-medium tracking-[-0.02em]">Generate Apex API key</h3>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1.5 text-[13px]">
                <span className={dim}>Label</span>
                <input className="calm-field" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Prashant · VIP" />
              </label>
              <label className="grid gap-1.5 text-[13px]">
                <span className={dim}>Expires (optional)</span>
                <input className="calm-field" type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
              </label>
            </div>
            <p className={`mt-3 text-[12.5px] leading-relaxed ${dim}`}>A 40-character random secret is generated in this tab. You will see it once; the commit holds only its salted SHA-256 hash and the AES-256-GCM sealed catalog.</p>
            <div className="mt-4 flex gap-2">
              <button type="button" className="calm-btn" onClick={() => setForm(false)}>Cancel</button>
              <button type="button" className="calm-btn flex-1" data-primary="true" disabled={busy} onClick={() => void create()}>
                {busy ? "Sealing & committing…" : "Generate & commit"}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {msg && (
        <p role="status" className={`mb-3 break-all rounded-2xl bg-[var(--surface-2)] px-3.5 py-2.5 text-[12.5px] ${msg.ok ? "" : "text-[#d6685f]"}`}>
          {msg.text}
        </p>
      )}

      <ul className="grid gap-3">
        {vault.keys.map((k) => {
          const expired = !!k.expiresAt && Date.parse(k.expiresAt) < Date.now();
          const tone = k.status === "revoked" ? "bad" : expired ? "warn" : "ok";
          return (
            <li key={k.id} className="calm-card p-4" data-testid="key-card">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-[15.5px] font-medium">{k.label}</p>
                  <p className="mt-0.5 font-mono text-[13px] tracking-wide" data-testid="key-prefix">{k.prefix}</p>
                </div>
                <Badge tone={tone}>{k.status === "revoked" ? "Revoked" : expired ? "Expired" : "Active"}</Badge>
              </div>
              <p className={`mt-2 text-[12.5px] ${dim}`}>Created {fmtDate(k.createdAt)} · Expires {fmtDate(k.expiresAt)}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {confirm?.id === k.id ? (
                  <>
                    <span className="flex items-center text-[13px]">{confirm.kind === "rotate" ? "Rotate: the old key stops working." : "Revoke this key for everyone?"}</span>
                    <button type="button" className="calm-btn" onClick={() => setConfirm(null)}>Cancel</button>
                    <button type="button" className="calm-btn" data-primary="true" disabled={busy} onClick={() => void (confirm.kind === "rotate" ? rotate(k) : revoke(k))}>
                      Confirm {confirm.kind}
                    </button>
                  </>
                ) : k.status === "active" ? (
                  <>
                    <button type="button" className="calm-btn" disabled={busy} onClick={() => setConfirm({ id: k.id, kind: "rotate" })}>
                      <CIcon name="refresh" size={15} /> Rotate
                    </button>
                    <button type="button" className="calm-btn" disabled={busy} onClick={() => setConfirm({ id: k.id, kind: "revoke" })}>
                      <CIcon name="x" size={15} /> Revoke
                    </button>
                  </>
                ) : (
                  <button type="button" className="calm-btn" disabled={busy} onClick={() => void remove(k)}>
                    <CIcon name="trash" size={15} /> Delete
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <h2 className={`mb-2 mt-8 text-[13px] font-medium ${dim}`}>Sealed catalog</h2>
      <div className="calm-card p-4">
        <p className={`text-[13px] leading-relaxed ${dim}`}>Decrypted here with your passphrase only. Provider endpoints are never displayed and never written in plaintext.</p>
        <div className="mt-3 grid gap-3">
          {groups.map((g) => (
            <div key={g}>
              <p className="text-[12px] font-medium uppercase tracking-[0.06em] opacity-60">{g}</p>
              <p className="mt-1 flex flex-wrap gap-1.5">
                {catalog.models.filter((m) => m.group === g).map((m) => (
                  <span key={m.id} className="calm-chip">{m.label}</span>
                ))}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-8">
        <AdminCatalog token={token} vault={vault} />
      </div>

      <p className={`mt-10 text-center text-[12px] ${dim}`}>
        <a href={REPO_URL} target="_blank" rel="noreferrer" className="underline">{REPO}</a>
      </p>

      {secret && <SecretModal secret={secret.value} label={secret.label} onClose={() => setSecret(null)} />}
    </div>
  );
}

export function AdminConsole() {
  const [session, setSession] = useState<Session | null>(null);
  const timer = useRef<number | null>(null);
  const lock = useCallback(() => setSession(null), []);

  /* auto-lock: 15 min idle, tab hidden for 5 min, or the page going away */
  useEffect(() => {
    if (!session) return;
    const arm = () => {
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(lock, IDLE_MS);
    };
    let hiddenAt = 0;
    const vis = () => {
      if (document.hidden) hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt > 5 * 60 * 1000) lock();
    };
    arm();
    const ev = ["pointerdown", "keydown", "scroll", "touchstart"] as const;
    ev.forEach((e) => window.addEventListener(e, arm, { passive: true }));
    document.addEventListener("visibilitychange", vis);
    window.addEventListener("pagehide", lock);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
      ev.forEach((e) => window.removeEventListener(e, arm));
      document.removeEventListener("visibilitychange", vis);
      window.removeEventListener("pagehide", lock);
    };
  }, [session, lock]);

  return (
    <div className="calm relative min-h-dvh overflow-x-clip" data-cmode="dark">
      <div className="calm-glow" style={{ height: 520 }} aria-hidden="true" />
      <div className="relative z-10 pt-safe">
      {session ? <Console session={session} setSession={setSession} onLock={lock} /> : <Gate onUnlock={setSession} />}
      </div>
    </div>
  );
}
