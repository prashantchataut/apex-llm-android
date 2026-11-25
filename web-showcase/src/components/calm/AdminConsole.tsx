"use client";

import "./calm.css";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DEFAULT_KEY, evaluate, hashKey, hintFor, randomKey, REGISTRY_PATH, type KeyRecord, type Registry } from "@/lib/access";
import { getToken, loadRegistry, publishRegistry, setToken, verifyAdmin, type Who } from "@/lib/admin";
import { KEYLESS_MODELS } from "@/lib/keyless";
import { REPO, REPO_URL } from "@/lib/site";
import { CIcon } from "./icons";

const dim = "text-[rgb(var(--ink-rgb)/var(--ink-3-a))]";
const spring = { type: "spring", stiffness: 380, damping: 34 } as const;

type FormState = null | { kind: "create" } | { kind: "rotate"; id: string } | { kind: "edit"; id: string };

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

function CopyBtn({ text, label = "Copy" }: { text: string; label?: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      type="button"
      className="calm-btn"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setOk(true);
          setTimeout(() => setOk(false), 1400);
        });
      }}
    >
      <CIcon name={ok ? "check" : "copy"} size={15} /> {ok ? "Copied" : label}
    </button>
  );
}

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "Never");

/** Create / rotate / edit sheet (BeautifulUI-style inset fields + chip multi-select). */
function KeyForm({ form, reg, onCancel, onSave }: { form: Exclude<FormState, null>; reg: Registry; onCancel: () => void; onSave: (rec: KeyRecord, plain?: string) => void }) {
  const existing = form.kind === "create" ? undefined : reg.keys.find((k) => k.id === form.id);
  const [label, setLabel] = useState(existing?.label ?? "");
  const [key, setKey] = useState("");
  const [expires, setExpires] = useState(existing?.expiresAt ? existing.expiresAt.slice(0, 10) : "");
  const [daily, setDaily] = useState(String(existing?.maxDailyRequests ?? 0));
  const [models, setModels] = useState<string[]>(existing?.allowedModels ?? ["*"]);
  const [err, setErr] = useState("");
  const needsKey = form.kind !== "edit";

  const toggle = (id: string) => {
    if (id === "*") return setModels(["*"]);
    const base = models.filter((m) => m !== "*");
    const next = base.includes(id) ? base.filter((m) => m !== id) : [...base, id];
    setModels(next.length ? next : ["*"]);
  };

  const submit = () => {
    if (needsKey) {
      if (key.trim().length < 6) return setErr("Use at least 6 characters (longer is safer — the registry is public, only hashes are stored).");
      if (reg.keys.some((k) => k.id !== existing?.id && k.keyHashOrValue === hashKey(key))) return setErr("Another key already uses this exact value.");
    }
    if (form.kind !== "rotate" && !label.trim()) return setErr("Give the key a label so you remember who it's for.");
    const rec: KeyRecord = {
      id: existing?.id ?? `key-${Date.now().toString(36)}`,
      keyHashOrValue: needsKey ? hashKey(key) : (existing as KeyRecord).keyHashOrValue,
      hint: needsKey ? hintFor(key) : existing?.hint,
      label: label.trim() || existing?.label || "Untitled key",
      status: form.kind === "rotate" ? "active" : (existing?.status ?? "active"),
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      expiresAt: expires ? new Date(`${expires}T23:59:59`).toISOString() : null,
      maxDailyRequests: Math.max(0, Math.floor(Number(daily) || 0)),
      allowedModels: models,
    };
    onSave(rec, needsKey ? key.trim() : undefined);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} transition={spring} className="calm-card p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-[17px] font-medium tracking-[-0.02em]">{form.kind === "create" ? "New access key" : form.kind === "rotate" ? `Rotate “${existing?.label}”` : `Edit “${existing?.label}”`}</h3>
        <button type="button" className="ibtn" aria-label="Close" onClick={onCancel}>
          <CIcon name="x" size={18} />
        </button>
      </div>
      <div className="mt-4 grid gap-4">
        {form.kind !== "rotate" && (
          <label className="grid gap-1.5 text-[13px]">
            <span className={dim}>Label</span>
            <input className="calm-field" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Prashant · VIP" />
          </label>
        )}
        {needsKey && (
          <label className="grid gap-1.5 text-[13px]">
            <span className={dim}>{form.kind === "rotate" ? "New key value" : "Key value"} — type any code or generate one</span>
            <div className="flex gap-2">
              <input className="calm-field !font-mono" value={key} onChange={(e) => setKey(e.target.value)} placeholder="vip-prashant-2025" autoComplete="off" spellCheck={false} />
              <button type="button" className="calm-btn shrink-0" onClick={() => setKey(randomKey())}>
                <CIcon name="dice" size={15} /> Generate
              </button>
            </div>
          </label>
        )}
        {form.kind !== "rotate" && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <label className="grid gap-1.5 text-[13px]">
                <span className={dim}>Expires (optional)</span>
                <input type="date" className="calm-field" value={expires} onChange={(e) => setExpires(e.target.value)} />
              </label>
              <label className="grid gap-1.5 text-[13px]">
                <span className={dim}>Requests / day (0 = ∞)</span>
                <input type="number" min={0} className="calm-field" value={daily} onChange={(e) => setDaily(e.target.value)} />
              </label>
            </div>
            <div className="grid gap-1.5 text-[13px]">
              <span className={dim}>Allowed Keyless models</span>
              <div className="flex flex-wrap gap-1.5">
                {[{ id: "*", label: "All models" }, ...KEYLESS_MODELS].map((m) => {
                  const on = models.includes(m.id);
                  return (
                    <button key={m.id} type="button" aria-pressed={on} onClick={() => toggle(m.id)} className="min-h-9 rounded-full px-3.5 text-[13px] transition-colors" style={on ? { background: "var(--ink-solid)", color: "var(--canvas)" } : { background: "var(--surface-2)" }}>
                      {m.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}
        {err && (
          <p role="alert" className="text-[13px] text-[#d6685f]">
            {err}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" className="calm-btn" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="calm-btn" data-primary="true" onClick={submit}>
            {form.kind === "create" ? "Add key" : form.kind === "rotate" ? "Rotate key" : "Save"}
          </button>
        </div>
      </div>
    </motion.div>
  );
}

export function AdminConsole() {
  const [dark, setDark] = useState(true);
  const [who, setWho] = useState<Who | null>(null);
  const [tokenInput, setTokenInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [reg, setReg] = useState<Registry | null>(null);
  const [sha, setSha] = useState("");
  const [saved, setSaved] = useState("");
  const [form, setForm] = useState<FormState>(null);
  const [fresh, setFresh] = useState<{ label: string; key: string; what: string } | null>(null);
  const [commit, setCommit] = useState<string | null>(null);
  const [test, setTest] = useState("");

  const dirty = !!reg && JSON.stringify(reg) !== saved;

  const enter = useCallback(async (token: string) => {
    setBusy(true);
    setErr("");
    try {
      const w = await verifyAdmin(token);
      if (!w.canPush) throw new Error(`@${w.login} can't push to ${REPO}. Use the owner's token.`);
      const r = await loadRegistry(token);
      setToken(token);
      setWho(w);
      setReg(r.registry);
      setSha(r.sha);
      setSaved(JSON.stringify(r.registry));
    } catch (e) {
      setToken(null);
      setErr(e instanceof Error ? e.message : "Sign-in failed");
    }
    setBusy(false);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.cmode = "dark";
    const t = getToken();
    if (t) void enter(t);
  }, [enter]);
  useEffect(() => {
    document.documentElement.dataset.cmode = dark ? "dark" : "light";
  }, [dark]);

  useEffect(() => {
    if (!dirty) return;
    const f = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", f);
    return () => window.removeEventListener("beforeunload", f);
  }, [dirty]);

  const mutate = (fn: (r: Registry) => Registry) => setReg((r) => (r ? fn(r) : r));
  const upsert = (rec: KeyRecord, plain?: string) => {
    const was = reg?.keys.some((k) => k.id === rec.id);
    mutate((r) => ({ ...r, keys: was ? r.keys.map((k) => (k.id === rec.id ? rec : k)) : [rec, ...r.keys] }));
    if (plain) setFresh({ label: rec.label, key: plain, what: form?.kind === "rotate" ? "rotated" : "created" });
    setForm(null);
    setCommit(null);
  };

  const publish = async () => {
    const token = getToken();
    if (!token || !reg) return;
    setBusy(true);
    setErr("");
    try {
      const active = reg.keys.filter((k) => k.status === "active").length;
      const r = await publishRegistry(token, reg, sha, `admin: keyless registry — ${active} active key${active === 1 ? "" : "s"}, cloud ${reg.keylessEnabled ? "ON" : "OFF"}`);
      setSha(r.sha);
      setSaved(JSON.stringify(reg));
      setCommit(r.commitUrl);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Publish failed");
    }
    setBusy(false);
  };

  const verdict = useMemo(() => (reg && test.trim() ? evaluate(reg, test) : null), [reg, test]);
  const defaultStillActive = reg?.keys.some((k) => k.keyHashOrValue === hashKey(DEFAULT_KEY) && k.status === "active");

  return (
    <div className="calm relative min-h-dvh overflow-x-clip" data-cmode={dark ? "dark" : "light"}>
      <div className="calm-glow" style={{ height: 520 }} aria-hidden="true" />
      <header className="relative z-10 mx-auto flex w-[min(880px,calc(100%-32px))] items-center justify-between pb-4 pt-safe-lg">
        <a href="../" className="flex items-center gap-2 text-[17px] font-medium tracking-[-0.025em]">
          Apex <span className={`calm-chip ${dim}`}>Admin</span>
        </a>
        <div className="flex items-center gap-2">
          <button type="button" className="ibtn" aria-label={dark ? "Switch to light" : "Switch to dark"} onClick={() => setDark((d) => !d)}>
            <CIcon name={dark ? "sun" : "moon"} size={18} />
          </button>
          {who && (
            <button
              type="button"
              className="calm-btn"
              onClick={() => {
                setToken(null);
                setWho(null);
                setReg(null);
              }}
            >
              Sign out
            </button>
          )}
        </div>
      </header>

      <main className="relative z-10 mx-auto w-[min(880px,calc(100%-32px))] pb-24">
        {!who || !reg ? (
          <motion.section initial={{ opacity: 0, y: 18, filter: "blur(8px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }} className="mx-auto mt-10 max-w-[460px] sm:mt-20">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-[var(--surface)] shadow-[var(--specular),var(--shadow-card)]">
              <CIcon name="shield" size={24} />
            </span>
            <h1 className="mt-6 text-[34px] font-normal leading-[1.08] tracking-[-0.03em]">Keyless Control Center</h1>
            <p className={`mt-3 text-[15px] leading-relaxed ${dim}`}>Create, rotate and revoke the access keys that unlock Keyless Cloud in the Apex app. Local models are always free and are never affected.</p>
            <form
              className="mt-7 grid gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (tokenInput.trim()) void enter(tokenInput.trim());
              }}
            >
              <label className="grid gap-1.5 text-[13px]">
                <span className={dim}>Owner GitHub token (needs contents: write on {REPO})</span>
                <input className="calm-field !font-mono" type="password" autoComplete="off" spellCheck={false} placeholder="github_pat_… or ghp_…" value={tokenInput} onChange={(e) => setTokenInput(e.target.value)} />
              </label>
              {err && (
                <p role="alert" className="text-[13px] text-[#d6685f]">
                  {err}
                </p>
              )}
              <button type="submit" className="calm-btn !h-12" data-primary="true" disabled={busy || !tokenInput.trim()}>
                {busy ? "Verifying…" : "Unlock console"}
              </button>
              <p className={`text-[12.5px] leading-relaxed ${dim}`}>The token stays in this tab&apos;s session storage only. It is sent to api.github.com and nowhere else, and closing the tab signs you out.</p>
            </form>
            <p className={`mt-8 text-[13px] ${dim}`}>
              Default key for testing: <code className="rounded-md bg-[var(--surface-2)] px-1.5 py-0.5 font-mono text-[12.5px] text-[rgb(var(--ink-rgb))]">{DEFAULT_KEY}</code>. Sign in to rotate or revoke it.
            </p>
          </motion.section>
        ) : (
          <>
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mt-4">
              <h1 className="text-[30px] font-normal tracking-[-0.03em]">Access keys</h1>
              <p className={`mt-1 text-[14px] ${dim}`}>
                Signed in as <b className="font-medium text-[rgb(var(--ink-rgb))]">@{who.login}</b> · <a className="underline underline-offset-2" href={`${REPO_URL}/blob/main/${REGISTRY_PATH}`} target="_blank" rel="noreferrer">{REGISTRY_PATH.split("/").pop()}</a>
              </p>
            </motion.div>

            {defaultStillActive && (
              <div className="mt-5 flex items-start gap-3 rounded-[22px] bg-[var(--surface-2)] p-4 text-[13.5px] leading-relaxed">
                <CIcon name="alert" size={18} className="mt-0.5 shrink-0 text-[var(--warn)]" />
                <p>
                  The default key <code className="font-mono">{DEFAULT_KEY}</code> is still active and is published in the project docs. Rotate or revoke it once you have created your own.
                </p>
              </div>
            )}

            <div className="calm-card mt-5 flex items-center justify-between gap-4 p-5">
              <div>
                <p className="text-[16px] font-medium tracking-[-0.015em]">Keyless Cloud kill-switch</p>
                <p className={`mt-0.5 text-[13px] ${dim}`}>{reg.keylessEnabled ? "On — keys below unlock cloud models." : "Off — every key is refused and apps fall back to local models."}</p>
              </div>
              <Switch on={reg.keylessEnabled} label="Keyless Cloud enabled" onChange={(v) => mutate((r) => ({ ...r, keylessEnabled: v }))} />
            </div>

            <AnimatePresence>
              {fresh && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-4 rounded-[22px] p-4" style={{ background: "var(--halo-a)", color: "var(--halo-ink)" }}>
                  <p className="text-[13.5px]">Key for “{fresh.label}” {fresh.what}. Copy it now — only its hash is stored, so it can&apos;t be shown again after you leave.</p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <code className="rounded-xl bg-[var(--surface)] px-3 py-2 font-mono text-[13.5px] text-[rgb(var(--ink-rgb))]">{fresh.key}</code>
                    <CopyBtn text={fresh.key} />
                    <button type="button" className="calm-btn" onClick={() => setFresh(null)}>
                      Done
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="mt-8 flex items-center justify-between">
              <h2 className={`text-[13px] font-medium ${dim}`}>{reg.keys.length} key{reg.keys.length === 1 ? "" : "s"}</h2>
              <button type="button" className="calm-btn" data-tone="sage" onClick={() => setForm({ kind: "create" })}>
                <CIcon name="plus" size={15} /> New key
              </button>
            </div>

            <AnimatePresence initial={false}>
              {form && (
                <div className="mt-3">
                  <KeyForm key={`${form.kind}-${"id" in form ? form.id : "new"}`} form={form} reg={reg} onCancel={() => setForm(null)} onSave={upsert} />
                </div>
              )}
            </AnimatePresence>

            <ul className="mt-3 grid gap-3">
              <AnimatePresence initial={false}>
                {reg.keys.map((k) => {
                  const expired = !!k.expiresAt && Date.parse(k.expiresAt) < Date.now();
                  return (
                    <motion.li key={k.id} layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }} transition={spring} className="calm-card p-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-[16.5px] font-medium tracking-[-0.015em]">{k.label}</p>
                          <p className={`mt-0.5 font-mono text-[12.5px] ${dim}`}>{k.hint ?? "••••••"} · {k.id}</p>
                        </div>
                        {k.status === "revoked" ? <Badge tone="bad">Revoked</Badge> : expired ? <Badge tone="warn">Expired</Badge> : <Badge tone="ok">Active</Badge>}
                      </div>
                      <div className={`mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[12.5px] ${dim}`}>
                        <span>Created {fmtDate(k.createdAt)}</span>
                        <span>Expires {fmtDate(k.expiresAt)}</span>
                        <span>{k.maxDailyRequests ? `${k.maxDailyRequests}/day` : "Unlimited/day"}</span>
                        <span>{k.allowedModels.includes("*") ? "All models" : k.allowedModels.map((m) => KEYLESS_MODELS.find((x) => x.id === m)?.label ?? m).join(", ")}</span>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button type="button" className="calm-btn" onClick={() => setForm({ kind: "rotate", id: k.id })}>
                          <CIcon name="refresh" size={15} /> Rotate
                        </button>
                        <button type="button" className="calm-btn" onClick={() => setForm({ kind: "edit", id: k.id })}>
                          <CIcon name="pencil" size={15} /> Edit
                        </button>
                        <button type="button" className="calm-btn" onClick={() => mutate((r) => ({ ...r, keys: r.keys.map((x) => (x.id === k.id ? { ...x, status: x.status === "active" ? "revoked" : "active" } : x)) }))}>
                          <CIcon name={k.status === "active" ? "lock" : "unlock"} size={15} /> {k.status === "active" ? "Revoke" : "Reactivate"}
                        </button>
                        <button type="button" className="calm-btn" aria-label={`Delete ${k.label}`} onClick={() => mutate((r) => ({ ...r, keys: r.keys.filter((x) => x.id !== k.id) }))}>
                          <CIcon name="trash" size={15} />
                        </button>
                      </div>
                    </motion.li>
                  );
                })}
              </AnimatePresence>
              {reg.keys.length === 0 && <li className={`calm-card p-6 text-center text-[14px] ${dim}`}>No keys. Keyless Cloud stays locked for everyone until you add one.</li>}
            </ul>

            <div className="calm-card mt-8 p-5">
              <p className="text-[15px] font-medium">Test a key against this draft</p>
              <input className="calm-field mt-3 !font-mono" value={test} onChange={(e) => setTest(e.target.value)} placeholder="Paste a key to see how the app will treat it" autoComplete="off" spellCheck={false} />
              {verdict && (
                <p className="mt-3">
                  <Badge tone={verdict.state === "active" ? "ok" : verdict.state === "revoked" || verdict.state === "invalid" ? "bad" : "warn"}>{verdict.message}</Badge>
                </p>
              )}
            </div>
          </>
        )}
      </main>

      <AnimatePresence>
        {reg && (dirty || commit) && (
          <motion.div initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }} transition={spring} className="fixed inset-x-0 bottom-0 z-30 flex justify-center px-4 pb-safe-lg">
            <div className="flex w-full max-w-[560px] items-center justify-between gap-3 rounded-[26px] bg-[var(--surface)] p-3 pl-5 shadow-[var(--specular),var(--shadow-lift)]">
              {dirty ? (
                <>
                  <p className="text-[13.5px]">
                    Unpublished changes
                    {err && <span className="block text-[12.5px] text-[#d6685f]">{err}</span>}
                  </p>
                  <div className="flex gap-2">
                    <button type="button" className="calm-btn" disabled={busy} onClick={() => who && void enter(getToken() ?? "")}>
                      Discard
                    </button>
                    <button type="button" className="calm-btn" data-primary="true" disabled={busy} onClick={() => void publish()}>
                      {busy ? "Publishing…" : "Publish changes"}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-[13.5px]">Published to GitHub. Apps re-check before every cloud request.</p>
                  <a className="calm-btn" href={commit ?? "#"} target="_blank" rel="noreferrer">
                    View commit
                  </a>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
