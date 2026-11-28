"use client";

import { useEffect, useMemo, useState } from "react";
import { API_FLAGSHIPS, FREE_MODELS, resolveTarget, type Cap } from "@/data/free-models";
import { FAMILY_LABEL, tailOf, type Family } from "@/data/frontier";
import { CIcon } from "@/components/calm/icons";
import { syncMesh, useMesh, type MeshModel } from "@/services/apexCloudMesh";
import type { CatalogModel } from "@/lib/models";
import { shortModelName } from "@/lib/engine";
import type { Choice } from "@/lib/store";

type Tab = "free" | "api" | "local" | "all";
const TABS: { id: Tab; label: string; full: string }[] = [
  { id: "free", label: "Auto & Free", full: "Auto and Free models" },
  { id: "api", label: "Apex API", full: "Apex API flagship models" },
  { id: "local", label: "On-Device", full: "On-Device Local models" },
  { id: "all", label: "All", full: "All models" },
];

const dim = "text-[rgb(var(--ink-rgb)/var(--ink-3-a))]";
const tagCls = "inline-flex h-[22px] shrink-0 items-center rounded-full bg-[var(--surface-1)] px-2 text-[11px] font-medium";
const pillCls = "tnum inline-flex h-[22px] shrink-0 items-center rounded-full px-2 text-[11px] font-medium bg-[var(--surface-2)]";

const ms = (n?: number) => (n ? (n >= 1000 ? `${(n / 1000).toFixed(1)}s` : `${n}ms`) : "");
const size = (gb: number) => (gb >= 1 ? `${gb.toFixed(1)} GB` : `${Math.round(gb * 1000)} MB`);
const capOfMesh = (m: MeshModel): Cap | undefined => (m.reasoning ? "Reasoning" : m.vision ? "Vision" : m.group === "Coding" || /code|coder/i.test(m.api) ? "Code" : m.ms && m.ms < 1500 ? "Fast" : undefined);
const MONO: Partial<Record<Family, string>> = { anthropic: "A", openai: "O", google: "G", xai: "X", "deepseek-qwen": "D", "llama-mistral": "L", uncensored: "U" };

/** Single-line row: icon, title, one capability tag, right-aligned latency or size pill. Nothing wraps, nothing overlaps. */
function Row({ icon, title, tag, pill, active, onClick, muted, testid }: { icon: string; title: string; tag?: string; pill?: string; active?: boolean; onClick?: () => void; muted?: boolean; testid?: string }) {
  return (
    <button type="button" onClick={onClick} disabled={!onClick} aria-pressed={active} data-testid={testid ?? "switcher-row"} className="flex h-[52px] w-full items-center gap-2.5 rounded-2xl px-2.5 text-left transition-colors hover:bg-[var(--surface-2)] disabled:cursor-default disabled:hover:bg-transparent" style={{ ...(active ? { background: "var(--halo-a)" } : undefined), opacity: muted ? 0.5 : 1 }}>
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-[var(--surface-2)] text-[13px] font-semibold" style={active ? { background: "var(--surface)", color: "var(--halo-ink)" } : undefined} aria-hidden="true">{icon}</span>
      <span className="min-w-0 flex-1 truncate text-[14px]">{title}</span>
      {tag && <span className={tagCls}>{tag}</span>}
      {pill && <span className={pillCls}>{pill}</span>}
      {active && <CIcon name="check" size={15} className="shrink-0 text-[var(--halo-ink)]" />}
    </button>
  );
}
const Head = ({ children, n }: { children: string; n?: number }) => (
  <p className={`flex items-center justify-between px-2.5 pb-1 pt-3 text-[11px] font-medium uppercase tracking-[0.06em] ${dim}`}><span>{children}</span>{n !== undefined && <span className="tnum">{n}</span>}</p>
);

const RECOMMENDED = ["qwen3-17b", "gemma3-1b", "lfm2-12b", "llama32-1b", "r1-1.5b", "dolphin3-1b"];
const PILLS: { id: string; label: string; test: (m: MeshModel) => boolean }[] = [
  { id: "all", label: "All", test: () => true },
  { id: "anthropic", label: "Anthropic", test: (m) => m.family === "anthropic" },
  { id: "openai", label: "OpenAI", test: (m) => m.family === "openai" },
  { id: "google", label: "Google", test: (m) => m.family === "google" },
  { id: "xai", label: "Grok", test: (m) => m.family === "xai" },
  { id: "deepseek", label: "DeepSeek", test: (m) => /deepseek/.test(tailOf(m.api)) },
  { id: "qwen", label: "Qwen", test: (m) => /qwen|qwq/.test(tailOf(m.api)) },
  { id: "llama", label: "Llama", test: (m) => /llama/.test(tailOf(m.api)) },
  { id: "uncensored", label: "Uncensored", test: (m) => m.uncensored },
];

/**
 * Model Switcher Sheet. Four segmented tabs: Auto & Free (instant, no key), Apex API (flagships + Apex Auto Pro),
 * On-Device Local (downloaded phone models) and All (searchable full catalog with provider pills).
 */
export function ModelSwitcher({ choice, onPick, installed, loadedId, loading, unlocked, onKey, onHub, initialTab }: { choice: Choice; onPick: (c: Choice) => void; installed: CatalogModel[]; loadedId?: string; loading: string | null; unlocked: boolean; onKey: () => void; onHub: (t: "trending" | "uncensored" | "search") => void; initialTab?: Tab }) {
  const mesh = useMesh();
  const [tab, setTab] = useState<Tab>(initialTab ?? (choice.kind === "local" ? "local" : choice.kind === "apex" ? "api" : "free"));
  const [q, setQ] = useState("");
  const [pill, setPill] = useState("all");
  const [limit, setLimit] = useState(40);
  useEffect(() => {
    if (!mesh.synced && !mesh.syncing) void syncMesh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const models = useMemo(() => mesh.models.filter((m) => !m.nativeOnly && !m.disabled), [mesh.models]);
  const isApex = (id: string) => choice.kind === "apex" && choice.id === id;
  const meshRow = (m: MeshModel, title?: string, cap?: Cap) => <Row key={m.id} icon={MONO[m.family] ?? (m.label[0] ?? "M").toUpperCase()} title={title ?? m.label} tag={cap ?? capOfMesh(m)} pill={m.verified ? ms(m.ms) : "untested"} active={isApex(m.id)} onClick={() => onPick({ kind: "apex", id: m.id })} />;

  const free = useMemo(() => FREE_MODELS.map((t) => ({ t, ...resolveTarget(models, t) })).filter((r) => r.model && r.live), [models]);
  const api = useMemo(() => API_FLAGSHIPS.map((t) => ({ t, ...resolveTarget(models, t) })), [models]);
  const needle = q.trim().toLowerCase();
  const def = PILLS.find((p) => p.id === pill) ?? PILLS[0];
  const all = useMemo(() => models.filter((m) => def.test(m) && (!needle || `${m.label} ${m.api} ${FAMILY_LABEL[m.family]}`.toLowerCase().includes(needle))).sort((a, b) => Number(!!b.verified) - Number(!!a.verified) || (a.ms ?? 1e9) - (b.ms ?? 1e9)), [models, def, needle]);
  const rec = RECOMMENDED.map((id) => ({ id })).filter((r) => !installed.some((m) => m.id === r.id));
  const autoRow = (label: string, test: string) => <Row testid={test} icon="A" title={label} tag="Fast" pill="<0.5ms" active={choice.kind === "auto"} onClick={() => onPick({ kind: "auto", id: "auto" })} />;

  return (
    <div data-testid="model-switcher" className="min-w-0">
      <div role="tablist" aria-label="Model source" className="grid grid-cols-4 gap-1 rounded-full bg-[var(--surface-2)] p-1">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} aria-label={t.full} data-testid={`tab-${t.id}`} onClick={() => setTab(t.id)} className="h-9 min-w-0 truncate rounded-full px-1 text-[12px] font-medium active:scale-[0.97]" style={{ transition: "background .3s cubic-bezier(0.23,1,0.32,1), color .3s", ...(tab === t.id ? { background: "var(--ink-solid)", color: "var(--canvas)" } : { color: "rgb(var(--ink-rgb)/var(--ink-3-a))" }) }}>
            {t.id === "all" ? `All (${models.length + installed.length})` : t.label}
          </button>
        ))}
      </div>

      <div className="mt-1 max-h-[min(58vh,520px)] overflow-y-auto scroll-quiet pr-0.5">
        {tab === "free" && (
          <div data-testid="pane-free">
            <Head>Smart router</Head>
            {autoRow("Apex Auto Free", "auto-free")}
            <Head n={free.length}>Free Cloud Models (Instant)</Head>
            {free.map((r) => meshRow(r.model!, r.t.label, r.t.cap))}
            <p className={`px-2.5 pt-2 text-[12px] leading-snug ${dim}`}>No key, no download. Each model is tested live before it is listed.</p>
          </div>
        )}

        {tab === "api" && (
          <div data-testid="pane-api">
            {!unlocked && (
              <button type="button" onClick={onKey} data-testid="apex-locked-card" className="mt-2 flex h-[52px] w-full items-center gap-2.5 rounded-2xl bg-[var(--surface-2)] px-3 text-left">
                <CIcon name="key" size={16} className="shrink-0" />
                <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">Connect an Apex API key</span>
                <span className={`shrink-0 text-[11.5px] ${dim}`}>Unlock vault</span>
              </button>
            )}
            <Head>Smart router</Head>
            {autoRow("Apex Auto Pro", "auto-pro")}
            <Head n={api.filter((r) => r.live).length}>Flagships</Head>
            {api.filter((r) => r.live).map((r) => meshRow(r.model!, r.t.label, r.t.cap))}
            {api.some((r) => !r.live) && (
              <>
                <Head n={api.filter((r) => !r.live).length}>No live route right now</Head>
                {api.filter((r) => !r.live).map((r) => <Row key={r.t.key} testid="switcher-offline" icon={(r.t.label[0] ?? "M").toUpperCase()} title={r.t.label} pill="offline" muted />)}
              </>
            )}
          </div>
        )}

        {tab === "local" && (
          <div data-testid="pane-local">
            <Head n={installed.length}>Ready on this phone</Head>
            {installed.length === 0 && <p className={`px-2.5 py-2 text-[13px] ${dim}`}>No on-device models yet. Get one below, it runs fully offline.</p>}
            {installed.map((m) => (
              <Row key={m.id} icon={(m.family[0] ?? "L").toUpperCase()} title={shortModelName(m)} tag={m.reasoning ? "Reasoning" : "Fast"} pill={loading === m.id ? "loading" : size(m.sizeGB)} active={choice.kind === "local" && choice.id === m.id} onClick={() => onPick({ kind: "local", id: m.id })} />
            ))}
            {rec.length > 0 && <Head>Get more</Head>}
            {rec.map((r) => (
              <Row key={r.id} icon="+" title={(() => { const c = (installedCatalog(r.id)); return c ? shortModelName(c) : r.id; })()} tag={installedCatalog(r.id)?.reasoning ? "Reasoning" : "Fast"} pill={(() => { const c = installedCatalog(r.id); return c ? size(c.sizeGB) : ""; })()} onClick={() => onHub(r.id === "dolphin3-1b" ? "uncensored" : "trending")} />
            ))}
          </div>
        )}

        {tab === "all" && (
          <div data-testid="pane-all">
            <label className="relative mt-2 block">
              <CIcon name="search" size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 opacity-50" />
              <input className="calm-field !pl-9" value={q} onChange={(e) => { setQ(e.target.value); setLimit(40); }} placeholder="Search every model" aria-label="Search models" data-testid="switcher-search" autoCapitalize="none" spellCheck={false} />
            </label>
            <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1 scroll-quiet" role="tablist" aria-label="Provider">
              {PILLS.map((p) => (
                <button key={p.id} type="button" role="tab" aria-selected={pill === p.id} onClick={() => { setPill(p.id); setLimit(40); }} className="h-8 shrink-0 whitespace-nowrap rounded-full px-3 text-[12.5px] font-medium" style={pill === p.id ? { background: "var(--halo-a)", color: "var(--halo-ink)" } : { background: "var(--surface-2)" }}>{p.label}</button>
              ))}
            </div>
            <Head n={all.length}>Models</Head>
            {all.slice(0, limit).map((m) => meshRow(m))}
            {all.length === 0 && <p className={`px-2.5 py-3 text-[13px] ${dim}`}>No model matches that search.</p>}
            {all.length > limit && <button type="button" className="calm-btn mt-2 w-full" onClick={() => setLimit((l) => l + 60)}>Show more ({all.length - limit})</button>}
          </div>
        )}
      </div>
      {loadedId && tab === "local" && <p className={`px-2.5 pt-2 text-[11.5px] ${dim}`}>One model stays in memory at a time.</p>}
    </div>
  );
}

import { CATALOG } from "@/lib/models";
const installedCatalog = (id: string) => CATALOG.find((c) => c.id === id);
