"use client";

import "./calm.css";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { loadVault, publishVault, verifyOwner } from "@/lib/admin";
import { MIN_KEY_LEN, OWNER_LOGIN, generateSecretKey, hashKey, keyStrength, mintRecord, openAsAdmin, openKeySecrets, randomHex, rekeyAdmin, type ApexCatalog, type KeySecret, type VaultFile, type VaultKey } from "@/lib/vault";
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
  /** Admin passphrase, memory only: needed to re-seal Envelope B whenever a key changes. */
  passphrase: string;
  /** Decrypted Envelope B per key id (memory only). */
  secrets: Record<string, KeySecret>;
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
      const secrets = await openKeySecrets(vault, pass);
      bfClear();
      const t = token.trim();
      const p = pass;
      setToken("");
      setPass("");
      onUnlock({ token: t, vault, sha, catalog, passphrase: p, secrets });
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
            <input className="calm-field !font-mono" type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="ghp_…" autoComplete="off" autoCapitalize="off" name="apex-admin-pat" spellCheck={false} aria-label="GitHub personal access token" />
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
        <div className="mt-4"><ZeroTrustBadge /></div>
        <p className={`mt-3 text-[12px] leading-relaxed ${dim}`}>The token is checked live against api.github.com/user and kept in memory only. The console locks itself after 15 minutes of inactivity or when this tab closes.</p>
      </motion.div>
    </div>
  );
}

/* ───────── zero-trust notice ───────── */
function ZeroTrustBadge() {
  return (
    <div className="flex items-start gap-3 rounded-2xl bg-[var(--surface-2)] px-4 py-3" data-testid="zero-trust-badge">
      <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full" style={{ background: "var(--halo-a)", color: "var(--halo-ink)" }}>
        <CIcon name="shield" size={15} />
      </span>
      <p className={`text-[12.5px] leading-relaxed ${dim}`}>
        <span className="font-medium text-[rgb(var(--ink-rgb))]">Client-Side Zero-Trust Mode:</span> Your GitHub PAT never leaves your browser memory and is only sent directly to <span className="font-mono">api.github.com</span> over TLS.
      </p>
    </div>
  );
}

/* ───────── one key card: reveal / copy / inline edit / rotate / revoke ───────── */
interface Draft {
  key: string;
  label: string;
  expires: string;
  allowed: string[];
}

function StrengthMeter({ value }: { value: string }) {
  const s = keyStrength(value);
  const pct = Math.min(100, Math.round((s.bits / 110) * 100));
  const color = s.label === "Weak" ? "#d6685f" : s.label === "Fair" ? "var(--warn)" : "var(--ok)";
  return (
    <div data-testid="key-strength">
      <div className="flex items-center justify-between text-[12px]">
        <span className={dim}>Key strength</span>
        <span className="font-medium" style={{ color }}>{value ? s.label : "—"}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--surface-2)]">
        <div className="h-full rounded-full transition-all" style={{ width: `${value ? pct : 0}%`, background: color }} />
      </div>
      {value && s.warn && <p className={`mt-1.5 text-[12px] leading-relaxed ${dim}`}>{s.note}</p>}
    </div>
  );
}

function KeyCard({
  k, secret, catalog, busy, primary, autoReveal, onSave, onRotate, onSetStatus, onDelete,
}: {
  k: VaultKey;
  secret?: KeySecret;
  catalog: ApexCatalog;
  busy: boolean;
  primary: boolean;
  autoReveal: boolean;
  onSave: (d: Draft) => Promise<boolean>;
  onRotate: () => Promise<boolean>;
  onSetStatus: (active: boolean) => Promise<boolean>;
  onDelete: () => Promise<boolean>;
}) {
  const [shown, setShown] = useState(autoReveal);
  const [edit, setEdit] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirm, setConfirm] = useState<"rotate" | "revoke" | "delete" | null>(null);
  const [d, setD] = useState<Draft>({ key: "", label: k.label, expires: "", allowed: ["*"] });

  const expired = !!k.expiresAt && Date.parse(k.expiresAt) < Date.now();
  const tone = k.status === "revoked" ? "bad" : expired ? "warn" : "ok";
  const groups = [...new Set(catalog.models.map((m) => m.group))];
  const all = d.allowed.includes("*");
  const idsOf = (g: string) => catalog.models.filter((m) => m.group === g).map((m) => m.id);

  const openEdit = () => {
    setD({ key: secret?.key ?? "", label: k.label, expires: k.expiresAt ? k.expiresAt.slice(0, 10) : "", allowed: secret?.allowed ?? k.allowedModels ?? ["*"] });
    setEdit(true);
    setConfirm(null);
  };
  const toggleGroup = (g: string) => {
    const ids = idsOf(g);
    const base = all ? catalog.models.map((m) => m.id) : d.allowed;
    const on = ids.every((i) => base.includes(i));
    const next = on ? base.filter((i) => !ids.includes(i)) : [...new Set([...base, ...ids])];
    setD({ ...d, allowed: next.length === catalog.models.length ? ["*"] : next });
  };
  const copy = () => {
    if (!secret) return;
    void navigator.clipboard?.writeText(secret.key);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };
  const keyOk = d.key.trim().length >= MIN_KEY_LEN;
  const modelsOk = all || d.allowed.length > 0;

  return (
    <li className="calm-card min-w-0 p-4" data-testid="key-card" data-key-id={k.id}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 truncate text-[15.5px] font-medium">
            {k.label}
            {primary && <span className="rounded-full bg-[var(--halo-a)] px-2 py-0.5 text-[11px] font-medium" style={{ color: "var(--halo-ink)" }}>Primary</span>}
          </p>
        </div>
        <Badge tone={tone}>{k.status === "revoked" ? "Revoked" : expired ? "Expired" : "Active"}</Badge>
      </div>

      <div className="mt-3 flex items-center gap-2 rounded-2xl bg-[var(--surface-2)] py-1.5 pl-4 pr-1.5">
        <span className="min-w-0 flex-1 break-all py-1 font-mono text-[13.5px] leading-snug tracking-wide" data-testid="key-value">
          {secret ? (shown ? secret.key : "••••-••••-••••") : k.prefix}
        </span>
        {secret ? (
          <>
            <button type="button" className="calm-btn !h-9 !w-9 !p-0" onClick={() => setShown((s) => !s)} aria-label={shown ? "Hide key" : "Reveal key"} aria-pressed={shown} data-testid="key-reveal">
              <CIcon name={shown ? "eyeOff" : "eye"} size={16} />
            </button>
            <button type="button" className="calm-btn !h-9 !w-9 !p-0" onClick={copy} aria-label="Copy key" data-testid="key-copy">
              <CIcon name={copied ? "check" : "copy"} size={16} />
            </button>
          </>
        ) : (
          <span className={`pr-3 text-[12px] ${dim}`}>not recoverable · edit to set</span>
        )}
      </div>
      <p className={`mt-2 text-[12.5px] ${dim}`}>
        Created {fmtDate(k.createdAt)} · Expires {fmtDate(k.expiresAt)} · {(secret?.allowed ?? k.allowedModels ?? ["*"]).includes("*") ? `All ${catalog.models.length} models` : `${(secret?.allowed ?? k.allowedModels).length} models`}
      </p>

      <AnimatePresence initial={false}>
        {edit && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={spring} className="-mx-1.5 overflow-hidden px-1.5 pb-1" data-testid="key-editor">
            <div className="mt-4 grid gap-3 border-t border-[var(--hair,rgba(127,127,127,0.18))] pt-4">
              <label className="grid gap-1.5 text-[13px]">
                <span className={dim}>Key string (any text, {MIN_KEY_LEN}+ characters)</span>
                <input className="calm-field !font-mono" value={d.key} onChange={(e) => setD({ ...d, key: e.target.value })} placeholder="e.g. PRASHANT-VIP-999" autoComplete="off" autoCapitalize="off" spellCheck={false} aria-label="Key string" data-testid="key-input" />
              </label>
              <StrengthMeter value={d.key} />
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1.5 text-[13px]">
                  <span className={dim}>Label</span>
                  <input className="calm-field" value={d.label} onChange={(e) => setD({ ...d, label: e.target.value })} aria-label="Key label" data-testid="key-label-input" />
                </label>
                <label className="grid gap-1.5 text-[13px]">
                  <span className={dim}>Expires (optional)</span>
                  <input className="calm-field" type="date" value={d.expires} onChange={(e) => setD({ ...d, expires: e.target.value })} aria-label="Expiry date" />
                </label>
              </div>
              <div className="grid gap-2 text-[13px]">
                <span className={dim}>Allowed models</span>
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" className="calm-chip" data-on={all} aria-pressed={all} onClick={() => setD({ ...d, allowed: all ? [] : ["*"] })} style={all ? { background: "var(--halo-a)", color: "var(--halo-ink)" } : undefined}>
                    All models
                  </button>
                  {groups.map((g) => {
                    const on = all || idsOf(g).every((i) => d.allowed.includes(i));
                    return (
                      <button key={g} type="button" className="calm-chip" aria-pressed={on} onClick={() => toggleGroup(g)} style={on ? { background: "var(--halo-a)", color: "var(--halo-ink)" } : undefined}>
                        {g}
                      </button>
                    );
                  })}
                </div>
                {!modelsOk && <span className="text-[12px] text-[#d6685f]">Pick at least one group.</span>}
              </div>
              <p className={`text-[12px] leading-relaxed ${dim}`}>
                Saving re-seals the catalog under this exact string and commits it. The previous key string stops working for every device on its next check; the new one works immediately.
              </p>
              <div className="flex gap-2">
                <button type="button" className="calm-btn" onClick={() => setEdit(false)} disabled={busy}>Cancel</button>
                <button
                  type="button"
                  className="calm-btn flex-1"
                  data-primary="true"
                  data-testid="key-save"
                  disabled={busy || !keyOk || !modelsOk || !d.label.trim()}
                  onClick={async () => {
                    if (await onSave(d)) {
                      setEdit(false);
                      setShown(true);
                    }
                  }}
                >
                  <CIcon name="up" size={15} /> {busy ? "Sealing & publishing…" : "Save & Publish to Live App"}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!edit && (
        <div className="mt-3 flex flex-wrap gap-2">
          {confirm ? (
            <>
              <span className="flex items-center text-[13px]">
                {confirm === "rotate" ? "Rotate: the old key stops working." : confirm === "revoke" ? "Revoke this key for everyone?" : "Delete this key permanently?"}
              </span>
              <button type="button" className="calm-btn" onClick={() => setConfirm(null)}>Cancel</button>
              <button
                type="button"
                className="calm-btn"
                data-primary="true"
                disabled={busy}
                data-testid="confirm-action"
                onClick={async () => {
                  const kind = confirm;
                  const ok = kind === "rotate" ? await onRotate() : kind === "revoke" ? await onSetStatus(false) : await onDelete();
                  if (ok) {
                    setConfirm(null);
                    if (kind === "rotate") setShown(true);
                  }
                }}
              >
                Confirm {confirm}
              </button>
            </>
          ) : (
            <>
              <button type="button" className="calm-btn" disabled={busy} onClick={openEdit} data-testid="key-edit">
                <CIcon name="pencil" size={15} /> Edit Key
              </button>
              {k.status === "active" ? (
                <>
                  <button type="button" className="calm-btn" disabled={busy || !secret} onClick={() => setConfirm("rotate")} data-testid="key-rotate">
                    <CIcon name="refresh" size={15} /> Rotate Random
                  </button>
                  <button type="button" className="calm-btn" disabled={busy} onClick={() => setConfirm("revoke")} data-testid="key-revoke">
                    <CIcon name="x" size={15} /> Revoke
                  </button>
                </>
              ) : (
                <>
                  <button type="button" className="calm-btn" data-primary="true" disabled={busy || !secret} onClick={() => void onSetStatus(true)} data-testid="key-activate">
                    <CIcon name="check" size={15} /> Activate
                  </button>
                  <button type="button" className="calm-btn" disabled={busy} onClick={() => setConfirm("delete")}>
                    <CIcon name="trash" size={15} /> Delete
                  </button>
                </>
              )}
            </>
          )}
        </div>
      )}
    </li>
  );
}

/* ───────── change admin passphrase ───────── */
function PassphraseCard({ busy, onChange }: { busy: boolean; onChange: (next: string) => Promise<boolean> }) {
  const [open, setOpen] = useState(false);
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const ok = a.length >= 16 && a === b;
  const gen = () => {
    const p = randomHex(12).replace(/(.{4})/g, "$1-").slice(0, -1);
    setA(p);
    setB(p);
  };
  return (
    <div className="calm-card mt-3 p-4" data-testid="passphrase-card">
      <div className="flex items-center justify-between gap-3">
        <span>
          <span className="block text-[14.5px] font-medium">Admin passphrase</span>
          <span className={`block text-[12.5px] ${dim}`}>Re-encrypts Envelope B for every key and commits it to GitHub.</span>
        </span>
        <button type="button" className="calm-btn shrink-0" onClick={() => setOpen((o) => !o)} data-testid="change-pass-toggle">
          <CIcon name="lock" size={15} /> Change
        </button>
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={spring} className="-mx-1.5 overflow-hidden px-1.5 pb-1">
            <div className="mt-4 grid gap-3">
              <label className="grid gap-1.5 text-[13px]">
                <span className={dim}>New passphrase (16+ characters)</span>
                <input className="calm-field !font-mono" type="password" value={a} onChange={(e) => setA(e.target.value)} autoComplete="off" spellCheck={false} aria-label="New admin passphrase" />
              </label>
              <label className="grid gap-1.5 text-[13px]">
                <span className={dim}>Repeat</span>
                <input className="calm-field !font-mono" type="password" value={b} onChange={(e) => setB(e.target.value)} autoComplete="off" spellCheck={false} aria-label="Repeat admin passphrase" />
              </label>
              {a && b && a !== b && <p className="text-[12px] text-[#d6685f]">The two passphrases differ.</p>}
              <p className={`text-[12px] leading-relaxed ${dim}`}>The vault file is public, so the passphrase is the only thing protecting Envelope B from offline guessing. Use a long random one; the generator makes 96 bits.</p>
              <div className="flex gap-2">
                <button type="button" className="calm-btn" onClick={gen}>
                  <CIcon name="refresh" size={15} /> Generate
                </button>
                <button
                  type="button"
                  className="calm-btn flex-1"
                  data-primary="true"
                  disabled={busy || !ok}
                  onClick={async () => {
                    if (await onChange(a)) {
                      setA("");
                      setB("");
                      setOpen(false);
                    }
                  }}
                >
                  Change &amp; re-encrypt
                </button>
              </div>
              {a && a === b && <p className={`break-all font-mono text-[12px] ${dim}`}>Keep it somewhere safe. It is never stored anywhere by this page.</p>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ───────── console ───────── */
function Console({ session, setSession, onLock }: { session: Session; setSession: (s: Session) => void; onLock: () => void }) {
  const { vault, token, catalog, secrets, passphrase } = session;
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [form, setForm] = useState(false);
  const [label, setLabel] = useState("");
  const [custom, setCustom] = useState("");
  const [expires, setExpires] = useState("");
  const [reveal, setReveal] = useState<string | null>(null);

  /** Commit a new vault to GitHub, then adopt it (and the secrets / passphrase that go with it) as the live session. */
  const commit = async (next: VaultFile, nextSecrets: Record<string, KeySecret>, text: string, nextPass = passphrase) => {
    const r = await publishVault(token, next, session.sha, text);
    setSession({ ...session, vault: next, sha: r.sha, secrets: nextSecrets, passphrase: nextPass });
    setMsg({ ok: true, text: `Committed to ${REPO} and live. ${r.commitUrl}` });
  };
  const run = async (fn: () => Promise<void>): Promise<boolean> => {
    setBusy(true);
    setMsg(null);
    let ok = true;
    try {
      await fn();
    } catch (e) {
      ok = false;
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Something went wrong." });
    }
    setBusy(false);
    return ok;
  };
  const replace = (rec: VaultKey) => vault.keys.map((x) => (x.id === rec.id ? rec : x));
  const dupe = async (key: string, id?: string) => {
    const h = await hashKey(vault.salt, key);
    if (vault.keys.some((x) => x.keyHash === h && x.id !== id)) throw new Error("Another key already uses that exact string.");
  };

  const create = () =>
    run(async () => {
      if (!label.trim()) throw new Error("Give the key a label so you remember who it is for.");
      const plain = custom.trim() || generateSecretKey();
      if (plain.length < MIN_KEY_LEN) throw new Error(`A key needs at least ${MIN_KEY_LEN} characters.`);
      await dupe(plain);
      const rec = await mintRecord(vault, catalog, plain, label, expires ? new Date(`${expires}T23:59:59`).toISOString() : null, passphrase);
      await commit({ ...vault, keys: [...vault.keys, rec] }, { ...secrets, [rec.id]: { key: plain, allowed: ["*"] } }, `vault: create key “${rec.label}” (${rec.prefix})`);
      setReveal(rec.id);
      setForm(false);
      setLabel("");
      setCustom("");
      setExpires("");
    });
  const save = (k: VaultKey, d: Draft) =>
    run(async () => {
      const plain = d.key.trim();
      await dupe(plain, k.id);
      const rec = await mintRecord(vault, catalog, plain, d.label, d.expires ? new Date(`${d.expires}T23:59:59`).toISOString() : null, passphrase, { id: k.id, allowed: d.allowed, status: k.status, createdAt: k.createdAt });
      await commit({ ...vault, keys: replace(rec) }, { ...secrets, [k.id]: { key: plain, allowed: d.allowed } }, `vault: edit key “${rec.label}” (${rec.prefix})`);
    });
  const rotate = (k: VaultKey) =>
    run(async () => {
      const prev = secrets[k.id];
      const plain = generateSecretKey();
      const rec = await mintRecord(vault, catalog, plain, k.label, k.expiresAt, passphrase, { id: k.id, allowed: prev?.allowed ?? k.allowedModels, status: "active", createdAt: k.createdAt });
      await commit({ ...vault, keys: replace(rec) }, { ...secrets, [k.id]: { key: plain, allowed: prev?.allowed ?? ["*"] } }, `vault: rotate key “${k.label}” (${rec.prefix})`);
    });
  const setStatus = (k: VaultKey, active: boolean) =>
    run(async () => {
      const sec = secrets[k.id];
      if (!sec) throw new Error("This key's string isn't recoverable. Use Edit Key to set a new one.");
      const rec = await mintRecord(vault, catalog, sec.key, k.label, k.expiresAt, passphrase, { id: k.id, allowed: sec.allowed, status: active ? "active" : "revoked", createdAt: k.createdAt });
      await commit({ ...vault, keys: replace(rec) }, secrets, `vault: ${active ? "activate" : "revoke"} key “${k.label}”`);
    });
  const remove = (k: VaultKey) =>
    run(async () => {
      const { [k.id]: _gone, ...rest } = secrets;
      void _gone;
      await commit({ ...vault, keys: vault.keys.filter((x) => x.id !== k.id) }, rest, `vault: delete key “${k.label}”`);
    });
  const killSwitch = (on: boolean) => run(() => commit({ ...vault, enabled: on }, secrets, `vault: Apex API ${on ? "enabled" : "disabled (kill-switch)"}`));
  const changePass = (next: string) =>
    run(async () => {
      const nextVault = await rekeyAdmin(vault, catalog, secrets, next);
      await commit(nextVault, secrets, "vault: change admin passphrase (re-encrypted Envelope B)", next);
    });

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

      <div className="mt-4">
        <ZeroTrustBadge />
      </div>

      <section className="calm-card mt-3 grid grid-cols-2 gap-3 p-4 sm:grid-cols-4" aria-label="Vault status">
        {[
          ["Apex API", vault.enabled ? "Enabled" : "Kill-switch on"],
          ["Keys", `${active} active · ${vault.keys.length - active} revoked`],
          ["Models sealed", `${catalog.models.length} in ${groups.length} groups`],
          ["Cipher", "AES-256-GCM · PBKDF2 200k"],
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

      <PassphraseCard busy={busy} onChange={changePass} />

      <div className="mb-2 mt-8 flex items-center justify-between">
        <h2 className={`text-[13px] font-medium ${dim}`}>API keys</h2>
        <button type="button" className="calm-btn" onClick={() => setForm((f) => !f)} disabled={busy} data-testid="new-key">
          <CIcon name="key" size={15} /> New key
        </button>
      </div>

      <AnimatePresence>
        {form && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} transition={spring} className="calm-card mb-3 p-5">
            <h3 className="text-[17px] font-medium tracking-[-0.02em]">Add Apex API key</h3>
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
            <label className="mt-3 grid gap-1.5 text-[13px]">
              <span className={dim}>Key string (leave empty to generate a random one)</span>
              <input className="calm-field !font-mono" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="auto-generated" autoComplete="off" spellCheck={false} />
            </label>
            {custom && <div className="mt-3"><StrengthMeter value={custom} /></div>}
            <div className="mt-4 flex gap-2">
              <button type="button" className="calm-btn" onClick={() => setForm(false)}>Cancel</button>
              <button type="button" className="calm-btn flex-1" data-primary="true" disabled={busy} onClick={() => void create()}>
                {busy ? "Sealing & committing…" : "Create & commit"}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {msg && (
        <p role="status" className={`mb-3 break-all rounded-2xl bg-[var(--surface-2)] px-3.5 py-2.5 text-[12.5px] ${msg.ok ? "" : "text-[#d6685f]"}`} data-testid="admin-status">
          {msg.text}
        </p>
      )}

      <ul className="grid grid-cols-[minmax(0,1fr)] gap-3">
        {vault.keys.map((k, i) => (
          <KeyCard
            key={k.id}
            k={k}
            secret={secrets[k.id]}
            catalog={catalog}
            busy={busy}
            primary={i === 0}
            autoReveal={reveal === k.id}
            onSave={(d) => save(k, d)}
            onRotate={() => rotate(k)}
            onSetStatus={(a) => setStatus(k, a)}
            onDelete={() => remove(k)}
          />
        ))}
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
    window.addEventListener("beforeunload", lock);
    return () => {
      window.removeEventListener("beforeunload", lock);
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
