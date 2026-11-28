"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { loadJsonFile, publishJsonFile } from "@/lib/admin";
import { useRepoToken } from "./RepoToken";
import { CIcon } from "./icons";
import { FLAGSHIPS, flagshipOf } from "@/data/frontier";
import { allProviders, CATALOG_GENERATED_AT, customProvider, EMPTY_CONFIG, MESH_CONFIG_PATH, MESH_GROUP_ORDER, modelKey, pingModel, probeAll, probeOne, setModelEnabled, syncMesh, useMesh, type Health, type MeshConfig, type MeshGroup, type MeshModel, type MeshProvider, type ModelPing } from "@/services/apexCloudMesh";

const dim = "text-[rgb(var(--ink-rgb)/var(--ink-3-a))]";
const btn = "rounded-full bg-[var(--surface-2)] px-4 py-2 text-[13px] font-medium transition-transform active:scale-[0.97] disabled:opacity-40";
const PAGE = 60;

type Tab = "frontier" | "all" | "working" | "enabled" | "anthropic" | "openai" | "google" | "deepseek-qwen" | "llama-mistral" | "uncensored" | "untested";
const TAB_LABELS: [Tab, string][] = [
  ["frontier", "Frontier Flagships"],
  ["all", "All Models"],
  ["working", "Verified Working"],
  ["enabled", "Enabled in App"],
  ["anthropic", "Anthropic"],
  ["openai", "OpenAI"],
  ["google", "Google"],
  ["deepseek-qwen", "DeepSeek & Qwen"],
  ["llama-mistral", "Llama & Mistral"],
  ["uncensored", "Uncensored"],
  ["untested", "Offline / Untested"],
];
const FAMILY_TABS = new Set<Tab>(["anthropic", "openai", "google", "deepseek-qwen", "llama-mistral", "uncensored"]);
interface St {
  kind: "working" | "offline" | "testing" | "untested";
  ms?: number;
  live: boolean;
  why?: string;
}

function Dot({ h }: { h?: Health }) {
  const tone = !h ? "#9ca3af" : h.ok ? "#22c55e" : "#ef4444";
  return <span aria-hidden="true" className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: tone }} />;
}

function StatusBadge({ st }: { st: St }) {
  const tone = { working: ["#22c55e", "rgba(34,197,94,.14)"], offline: ["#ef4444", "rgba(239,68,68,.14)"], testing: ["#f59e0b", "rgba(245,158,11,.14)"], untested: ["rgb(156 163 175)", "rgba(156,163,175,.12)"] }[st.kind];
  const text = st.kind === "working" ? `WORKING ${st.ms ?? 0}ms` : st.kind === "offline" ? "OFFLINE" : st.kind === "testing" ? "TESTING" : "UNTESTED";
  return (
    <span data-testid="model-status" data-kind={st.kind} title={st.live ? (st.why ?? "Live completion just now") : st.kind === "untested" ? "Not probed yet" : `Result of the import-time probe (${CATALOG_GENERATED_AT.slice(0, 10)})`} className="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-semibold tracking-[0.02em]" style={{ color: tone[0], background: tone[1] }}>
      <span className={`h-1.5 w-1.5 rounded-full ${st.kind === "testing" ? "animate-pulse" : ""}`} style={{ background: tone[0] }} />
      {text}
      {!st.live && st.kind !== "untested" && <span className="font-normal opacity-60">· import</span>}
    </span>
  );
}

/** Click-to-edit text. Enter / blur commits, Escape cancels. */
function InlineName({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [edit, setEdit] = useState(false);
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  if (!edit)
    return (
      <button type="button" onClick={() => setEdit(true)} className="group flex min-w-0 items-center gap-1.5 text-left" title="Click to rename" data-testid="model-name">
        <span className="truncate text-[14px] font-medium">{value}</span>
        <CIcon name="pencil" size={12} className="shrink-0 opacity-0 transition-opacity group-hover:opacity-50 group-focus-visible:opacity-50" />
      </button>
    );
  const done = (save: boolean) => {
    setEdit(false);
    if (save && v.trim() !== value) onCommit(v.trim());
    else setV(value);
  };
  return (
    <input
      autoFocus
      className="calm-field !h-8 !rounded-lg !px-2 !text-[14px]"
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => done(true)}
      onKeyDown={(e) => {
        if (e.key === "Enter") done(true);
        if (e.key === "Escape") done(false);
      }}
      aria-label="Model name"
    />
  );
}

/** Owner tool: full imported catalog with per-model switches, inline rename / category, live health and OTA publish (no rebuild). */
export function AdminMesh() {
  const mesh = useMesh();
  const sync = useRepoToken();
  const token = sync.token;
  const [cfg, setCfg] = useState<MeshConfig>(EMPTY_CONFIG);
  const [sha, setSha] = useState("");
  const [saved, setSaved] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [name, setName] = useState("");
  const [base, setBase] = useState("");
  const [pings, setPings] = useState<Record<string, ModelPing | "running">>({});
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<Tab>("frontier");
  const [prov, setProv] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [showProv, setShowProv] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const providers = useMemo(() => allProviders(cfg), [cfg]);
  const provName = useMemo(() => new Map(providers.map((p) => [p.id, p.name])), [providers]);

  const load = useCallback(async () => {
    let c = EMPTY_CONFIG;
    try {
      const r = await loadJsonFile<MeshConfig>(token, MESH_CONFIG_PATH);
      c = { ...EMPTY_CONFIG, ...r.data };
      setSha(r.sha);
    } catch {
      setSha("");
    }
    setCfg(c);
    setSaved(JSON.stringify(c));
    await syncMesh(c);
  }, [token]);
  useEffect(() => void load(), [load]);

  const dirty = JSON.stringify(cfg) !== saved;
  const say = (ok: boolean, text: string) => setMsg({ ok, text });

  /* ───── derived per-model view (live from cfg, so edits show before publish) ───── */
  const off = useMemo(() => new Set(cfg.disabledModels ?? []), [cfg.disabledModels]);
  const forced = useMemo(() => new Set(cfg.enabledModels ?? []), [cfg.enabledModels]);
  const isOn = useCallback((m: MeshModel) => !off.has(modelKey(m.provider, m.api)) && (m.defaultOn !== false || forced.has(modelKey(m.provider, m.api))) && !cfg.disabled.includes(m.provider), [off, forced, cfg.disabled]);
  const labelOf = (m: MeshModel) => cfg.renames?.[modelKey(m.provider, m.api)]?.trim() || m.baseLabel || m.label;
  const groupOf = (m: MeshModel): MeshGroup => cfg.categories?.[modelKey(m.provider, m.api)] ?? m.baseGroup ?? m.group;
  const statusOf = useCallback(
    (m: MeshModel): St => {
      const pg = pings[modelKey(m.provider, m.api)];
      if (pg === "running") return { kind: "testing", live: true };
      if (pg) return pg.ok ? { kind: "working", ms: pg.ms, live: true } : { kind: "offline", live: true, why: pg.error };
      if (m.imported && m.verified === true) return { kind: "working", ms: m.ms, live: false };
      if (m.imported && m.verified === false) return { kind: "offline", live: false };
      return { kind: "untested", live: false };
    },
    [pings],
  );

  const inTab = useCallback(
    (m: MeshModel, t: Tab): boolean => {
      const s = statusOf(m).kind;
      switch (t) {
        case "all": return true;
        case "frontier": return m.frontier && !m.uncensored;
        case "working": return s === "working";
        case "enabled": return isOn(m);
        case "untested": return s === "offline" || s === "untested";
        default: return m.family === t;
      }
    },
    [statusOf, isOn],
  );
  const counts = useMemo(() => {
    const c = {} as Record<Tab, number>;
    for (const [t] of TAB_LABELS) c[t] = mesh.allModels.filter((m) => inTab(m, t)).length;
    return c;
  }, [mesh.allModels, inTab]);
  const failedCount = useMemo(() => mesh.allModels.filter((m) => statusOf(m).kind === "offline" && isOn(m)).length, [mesh.allModels, statusOf, isOn]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = mesh.allModels.filter((m) => {
      if (prov && m.provider !== prov) return false;
      if (!inTab(m, tab)) return false;
      if (!needle) return true;
      return `${labelOf(m)} ${m.api} ${groupOf(m)} ${m.family} ${provName.get(m.provider) ?? ""}`.toLowerCase().includes(needle);
    });
    if (tab === "frontier") {
      const idx = (m: MeshModel) => { const f = flagshipOf(m.api); return f ? FLAGSHIPS.indexOf(f) : 999; };
      const st = (m: MeshModel) => (statusOf(m).kind === "working" ? 0 : 1);
      list.sort((a, b) => idx(a) - idx(b) || st(a) - st(b) || (a.ms ?? 1e9) - (b.ms ?? 1e9));
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mesh.allModels, q, tab, prov, statusOf, inTab, cfg, provName]);
  useEffect(() => setLimit(PAGE), [q, tab, prov]);

  /* ───── actions ───── */
  const recheck = async () => {
    setBusy(true);
    await probeAll(providers.filter((p) => !p.id.startsWith("z-")));
    setBusy(false);
  };
  const syncNow = async () => {
    setBusy(true);
    const s = await syncMesh(cfg);
    say(true, `Synced ${s.allModels.length} models from ${s.providers.length} providers (${s.models.length} enabled in the app).`);
    setBusy(false);
  };
  const toggleProvider = (p: MeshProvider) => setCfg((c) => ({ ...c, disabled: c.disabled.includes(p.id) ? c.disabled.filter((x) => x !== p.id) : [...c.disabled, p.id] }));
  const removeProvider = (p: MeshProvider) => setCfg((c) => ({ ...c, custom: c.custom.filter((x) => x.id !== p.id), disabled: c.disabled.filter((x) => x !== p.id) }));
  const toggleModel = (m: MeshModel) => setCfg((c) => setModelEnabled(c, m, !isOn(m)));
  const rename = (m: MeshModel, v: string) =>
    setCfg((c) => {
      const next = { ...(c.renames ?? {}) };
      const k = modelKey(m.provider, m.api);
      if (v && v !== (m.baseLabel ?? m.label)) next[k] = v;
      else delete next[k];
      return { ...c, renames: next };
    });
  const recat = (m: MeshModel, g: MeshGroup) =>
    setCfg((c) => {
      const next = { ...(c.categories ?? {}) };
      const k = modelKey(m.provider, m.api);
      if (g !== (m.baseGroup ?? m.group)) next[k] = g;
      else delete next[k];
      return { ...c, categories: next };
    });

  const ping = async (m: MeshModel) => {
    const p = providers.find((x) => x.id === m.provider);
    if (!p) return;
    const k = modelKey(m.provider, m.api);
    if (!p.cors) {
      say(false, `${labelOf(m)}: ${p.name} sends no CORS header, so it can't be tested from the browser. The import-time result is shown.`);
      return;
    }
    setPings((s) => ({ ...s, [k]: "running" }));
    const r = await pingModel(p, m.api);
    setPings((s) => ({ ...s, [k]: r }));
  };
  /** One worker per provider, gentle gap: anonymous tiers rate-limit per IP, a burst would only measure the limiter. */
  const batchVerify = async (list: MeshModel[]) => {
    const queue = list.filter((m) => providers.find((p) => p.id === m.provider)?.cors).slice(0, 200);
    if (!queue.length) return say(false, "Nothing to verify here: these providers can't be called from a browser.");
    setBusy(true);
    setProgress({ done: 0, total: queue.length });
    const by = new Map<string, MeshModel[]>();
    for (const m of queue) by.set(m.provider, [...(by.get(m.provider) ?? []), m]);
    let done = 0;
    await Promise.all(
      [...by.values()].map(async (l) => {
        for (const m of l) {
          const p = providers.find((x) => x.id === m.provider)!;
          const k = modelKey(m.provider, m.api);
          setPings((s) => ({ ...s, [k]: "running" }));
          const r = await pingModel(p, m.api, 15_000);
          setPings((s) => ({ ...s, [k]: r }));
          setProgress({ done: ++done, total: queue.length });
          await new Promise((res) => setTimeout(res, 400));
        }
      }),
    );
    setBusy(false);
    setProgress(null);
    say(true, `Verified ${queue.length} models with a real completion.`);
  };
  /** Flip every model of the active family tab (or the whole visible list) ON or OFF in one go. */
  const setAll = (list: MeshModel[], enabled: boolean) => {
    setCfg((c) => list.reduce((acc, m) => setModelEnabled(acc, m, enabled), c));
    say(true, `${enabled ? "Enabled" : "Disabled"} ${list.length} models. Press Save & Publish to apply.`);
  };
  const disableOffline = () => {
    setCfg((c) => {
      let next = c;
      for (const m of mesh.allModels) {
        if (statusOf(m).kind === "offline" && isOn(m)) next = setModelEnabled(next, m, false);
      }
      return next;
    });
    say(true, "Switched every OFFLINE model off. Press Save & Publish to apply.");
  };

  const add = async () => {
    try {
      const p = customProvider(name, base);
      if (providers.some((x) => x.id === p.id)) return say(false, "That host is already in the mesh.");
      setBusy(true);
      const r = await probeOne({ ...p, builtin: false });
      setBusy(false);
      if (!r.health.ok) return say(false, `Not added: ${r.health.error ?? "no answer"}. The endpoint must accept anonymous requests and send CORS headers.`);
      setCfg((c) => ({ ...c, custom: [...c.custom, { ...p, fallbackModel: r.models[0]?.api }] }));
      setName("");
      setBase("");
      say(true, `Found ${r.models.length} models in ${r.health.ms}ms. Press Save & Publish to add them.`);
    } catch (e) {
      setBusy(false);
      say(false, e instanceof Error ? e.message : "Invalid URL.");
    }
  };

  const publish = async () => {
    setBusy(true);
    try {
      const t = await sync.ensure();
      const data = { ...cfg, schema: 1 as const, updatedAt: new Date().toISOString() };
      const r = await publishJsonFile(t, MESH_CONFIG_PATH, data, sha, `chore(mesh): ${cfg.custom.length} custom, ${(cfg.disabledModels ?? []).length} off, ${(cfg.enabledModels ?? []).length} forced on, ${Object.keys(cfg.renames ?? {}).length} renamed, ${Object.keys(cfg.categories ?? {}).length} recategorised`);
      setSha(r.sha);
      setSaved(JSON.stringify(cfg));
      await syncMesh(cfg);
      say(true, "Published to GitHub. Apps pick it up on the next launch, no rebuild.");
    } catch (e) {
      say(false, e instanceof Error ? e.message : "Publish failed.");
    }
    setBusy(false);
  };

  const tabs = TAB_LABELS;
  const shown = rows.slice(0, limit);
  const healthyProviders = providers.filter((p) => mesh.health[p.id]?.ok).length;

  return (
    <section data-testid="admin-mesh" className="rounded-[26px] bg-[var(--surface-1)] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[17px] font-medium tracking-[-0.01em]">Provider &amp; Model Catalog</h2>
          <p className={`mt-1 text-[12.5px] leading-snug ${dim}`}>
            {counts.all} models across {providers.length} providers ({healthyProviders} answering). Imported from the reference catalog and live discovery; automatic failover walks the fastest verified gateways when one answers 429, 5xx or times out.
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" className={btn} onClick={recheck} disabled={busy}>Re-check health</button>
          <button type="button" className={btn} style={{ background: "var(--halo-a)", color: "var(--halo-ink)" }} onClick={syncNow} disabled={busy} data-testid="mesh-sync">Sync live models</button>
        </div>
      </div>

      {/* providers */}
      <div className="mt-4">
        <button type="button" className="calm-chip" onClick={() => setShowProv((v) => !v)} aria-expanded={showProv} data-testid="toggle-providers">
          {showProv ? "Hide" : "Show"} {providers.length} providers
        </button>
        {showProv && (
          <ul className="mt-3 space-y-2" data-testid="mesh-providers">
            {providers.map((p) => {
              const h = mesh.health[p.id];
              const pOff = cfg.disabled.includes(p.id);
              return (
                <li key={p.id} className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl bg-[var(--surface-2)] px-4 py-2.5 ${pOff ? "opacity-50" : ""}`}>
                  <Dot h={pOff ? undefined : h} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium">{p.name}</p>
                    <p className={`truncate text-[12px] ${dim}`}>{new URL(p.chat).host}{h?.ok ? ` · ${h.ms}ms · ${h.count} models` : h?.error ? ` · ${h.error}` : ""}{p.cors ? "" : " · native only"}</p>
                  </div>
                  <button type="button" className="calm-chip" onClick={() => setProv(prov === p.id ? "" : p.id)}>{prov === p.id ? "Clear filter" : "Filter"}</button>
                  <button type="button" className="calm-chip" onClick={() => toggleProvider(p)}>{pOff ? "Enable" : "Disable"}</button>
                  {!p.builtin && <button type="button" className="calm-chip" onClick={() => removeProvider(p)}>Remove</button>}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* explorer */}
      <div className="mt-5" data-testid="mesh-models">
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative min-w-[200px] flex-1">
            <CIcon name="search" size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 opacity-50" />
            <input className="calm-field !pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search models, providers, categories" aria-label="Search models" data-testid="model-search" />
          </label>
          <button type="button" className={btn} onClick={() => batchVerify(rows.filter((m) => isOn(m) || statusOf(m).kind === "working"))} disabled={busy || rows.length === 0} data-testid="batch-verify">
            {progress ? `Verifying ${progress.done}/${progress.total}` : "Batch Verify Working Models"}
          </button>
          <button type="button" className={btn} style={{ background: "var(--halo-a)", color: "var(--halo-ink)" }} onClick={() => batchVerify(mesh.allModels.filter((m) => m.frontier && !m.uncensored && !m.nativeOnly))} disabled={busy} data-testid="batch-verify-frontier">
            Batch Verify Frontier Models
          </button>
        </div>

        <div role="tablist" aria-label="Filter models" className="mt-3 flex max-w-full gap-1 overflow-x-auto rounded-full bg-[var(--surface-2)] p-1 [scrollbar-width:none]">
          {tabs.map(([id, label]) => (
            <button key={id} role="tab" aria-selected={tab === id} data-testid={`tab-${id}`} onClick={() => setTab(id)} className={`h-8 shrink-0 whitespace-nowrap rounded-full px-3.5 text-[12.5px] font-medium transition-colors ${tab === id ? "bg-[var(--halo-a)] text-[var(--halo-ink)]" : dim}`}>
              {label} <span className="opacity-60">{counts[id]}</span>
            </button>
          ))}
        </div>
        {prov && <p className={`mt-2 text-[12px] ${dim}`}>Provider: {provName.get(prov) ?? prov}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {FAMILY_TABS.has(tab) && (
            <>
              <button type="button" className={btn} onClick={() => setAll(rows, true)} data-testid="family-on">Turn all {rows.length} ON</button>
              <button type="button" className={btn} onClick={() => setAll(rows, false)} data-testid="family-off">Turn all {rows.length} OFF</button>
            </>
          )}
          {failedCount > 0 && <button type="button" className={btn} onClick={disableOffline}>Turn off {failedCount} offline</button>}
        </div>

        <ul className="mt-3 space-y-1.5">
          {shown.map((m) => {
            const k = modelKey(m.provider, m.api);
            const on = isOn(m);
            const st = statusOf(m);
            return (
              <li key={k} data-testid="mesh-model-row" className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-2xl bg-[var(--surface-2)] px-3 py-2.5 ${on ? "" : "opacity-55"}`}>
                <button type="button" role="switch" aria-checked={on} aria-label={`${on ? "Disable" : "Enable"} ${labelOf(m)}`} onClick={() => toggleModel(m)} className="relative h-6 w-10 shrink-0 rounded-full transition-colors" style={{ background: on ? "#22c55e" : "rgb(var(--ink-rgb) / 0.2)" }}>
                  <span className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all" style={{ left: on ? 18 : 2 }} />
                </button>
                <div className="min-w-0 flex-1 basis-[180px]">
                  <InlineName value={labelOf(m)} onCommit={(v) => rename(m, v)} />
                  <p className={`truncate text-[11.5px] ${dim}`}>{provName.get(m.provider) ?? m.provider} · <span className="font-mono">{m.api}</span></p>
                </div>
                <select aria-label="Category" value={groupOf(m)} onChange={(e) => recat(m, e.target.value as MeshGroup)} className="h-7 rounded-full bg-[var(--surface-1)] px-2.5 text-[11.5px] font-medium">
                  {MESH_GROUP_ORDER.map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
                <StatusBadge st={st} />
                <button type="button" className="calm-chip" onClick={() => void ping(m)} disabled={st.kind === "testing"} data-testid="model-test">
                  Test Live
                </button>
              </li>
            );
          })}
          {rows.length === 0 && <li className={`rounded-2xl bg-[var(--surface-2)] px-4 py-6 text-center text-[13px] ${dim}`}>No models match. {tab === "working" ? "Run Batch Verify to fill this tab." : ""}</li>}
        </ul>
        {rows.length > limit && (
          <button type="button" className={`${btn} mt-3 w-full`} onClick={() => setLimit((l) => l + PAGE)}>
            Show {Math.min(PAGE, rows.length - limit)} more ({rows.length - limit} left)
          </button>
        )}
      </div>

      {/* add custom */}
      <div className="mt-6 rounded-2xl bg-[var(--surface-2)] p-4">
        <p className="text-[14px] font-medium">Add an open endpoint</p>
        <p className={`mt-0.5 text-[12px] ${dim}`}>OpenAI-compatible base URL (https, CORS enabled, no key). It is probed before it is added.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <input className="calm-field flex-1 basis-[120px]" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" aria-label="Provider name" />
          <input className="calm-field flex-[2] basis-[200px] !font-mono" value={base} onChange={(e) => setBase(e.target.value)} placeholder="https://host/v1" aria-label="Base URL" />
          <button type="button" className={btn} onClick={add} disabled={busy || !base.trim()}>Test &amp; add</button>
        </div>
      </div>

      {msg && (
        <p role="status" className={`mt-3 break-words rounded-2xl bg-[var(--surface-2)] px-3.5 py-2.5 text-[12.5px] ${msg.ok ? "" : "text-[#d6685f]"}`} data-testid="mesh-status">
          {msg.text}
        </p>
      )}

      <div className="sticky bottom-3 z-10 mt-4 flex items-center justify-between gap-3 rounded-full bg-[var(--surface-2)] py-2 pl-5 pr-2 shadow-lg" data-testid="publish-bar">
        <span className={`text-[12.5px] ${dim}`}>{dirty ? "Unsaved changes" : "All changes published"}</span>
        <button type="button" className="calm-btn" data-primary="true" onClick={publish} disabled={busy || !dirty} data-testid="mesh-publish">
          <CIcon name="cloud" size={15} /> Save &amp; Publish
        </button>
      </div>
    </section>
  );
}
