"use client";

import { useEffect, useMemo, useState } from "react";
import { BLURBS, CATALOG, UNCENSORED_PROMPT, unregisterModel, type CatalogModel } from "@/lib/models";
import { estimateRamMb } from "@/lib/engine";
import { activateModel, cancelDownload, deleteModel, dlOf, pauseDownload, resumeDownload, startDownload, storageEstimate, type DlItem } from "@/lib/downloader";
import { isNative } from "@/lib/native";
import { headSize, parseGgufUrl, registerCustom, repoGgufs, searchHf, type HfFile, type HfRepo } from "@/lib/hf";
import type { Choice } from "@/lib/store";
import { CIcon } from "./icons";
import { ViewTitle } from "./Chrome";

type Tab = "trending" | "uncensored" | "search";
const mb = (b: number) => (b / 1e6).toFixed(b >= 1e9 ? 0 : 1);
const fmtSize = (b: number) => (b >= 1e9 ? `${(b / 1e9).toFixed(2)} GB` : `${Math.round(b / 1e6)} MB`);

function Card({ m, d, active, onUse, busy }: { m: CatalogModel; d: DlItem; active: boolean; onUse: () => void; busy: boolean }) {
  const pct = d.total ? Math.min(100, (d.loaded / d.total) * 100) : 0;
  const native = isNative();
  return (
    <article className="calm-card p-4" aria-label={m.name}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="flex flex-wrap items-center gap-x-2 text-[15px] font-medium leading-snug">
            {m.name}
            {m.uncensored && <span className="calm-chip !h-6 !px-2 text-[11px]" style={{ background: "var(--halo-a)", color: "var(--halo-ink)", borderColor: "transparent" }}>🔓 Uncensored</span>}
            {m.reasoning && <span className="calm-chip !h-6 !px-2 text-[11px]">💭 Reasoning</span>}
          </h3>
          <p className="mt-0.5 text-[12.5px] leading-snug text-[rgb(var(--ink-rgb)/var(--ink-3-a))]">{BLURBS[m.id] ?? `${m.repo}`}</p>
          <p className="tnum mt-1.5 text-[11.5px] text-[rgb(var(--ink-rgb)/var(--ink-3-a))]">
            {m.quant} · {fmtSize(m.sizeGB * 1e9)} · ~{(estimateRamMb(m) / 1000).toFixed(1)} GB RAM
          </p>
        </div>
        <div className="shrink-0">
          {d.status === "idle" && (
            <button type="button" className="calm-btn" data-primary="true" onClick={() => void startDownload(m.id)} aria-label={`Download ${m.name}`}>
              <CIcon name="download" size={15} /> Get
            </button>
          )}
          {d.status === "done" && (
            <button type="button" className="calm-btn" data-tone={active ? "sage" : undefined} data-primary={!active} disabled={busy} onClick={onUse}>
              {active ? <><CIcon name="check" size={15} /> Active</> : busy ? "Loading…" : "Use"}
            </button>
          )}
          {d.status === "error" && (
            <button type="button" className="calm-btn" onClick={() => void startDownload(m.id)}>
              <CIcon name="refresh" size={15} /> Retry
            </button>
          )}
        </div>
      </div>

      {(d.status === "downloading" || d.status === "paused") && (
        <div className="mt-3.5">
          <div className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-2)]" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={`${m.name} download`}>
            <div className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-300" style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="tnum text-[12px] text-[rgb(var(--ink-rgb)/var(--ink-2-a))]">
              {mb(d.loaded)} / {mb(d.total)} MB{d.status === "downloading" ? ` · ${d.mbps.toFixed(1)} MB/s` : " · paused"}
            </span>
            <span className="flex-1" />
            {!native && d.status === "downloading" && (
              <button type="button" className="calm-chip min-h-9" onClick={() => pauseDownload(m.id)}>
                <CIcon name="pause" size={13} /> Pause
              </button>
            )}
            {!native && d.status === "paused" && (
              <button type="button" className="calm-chip min-h-9" onClick={() => void resumeDownload(m.id)}>
                <CIcon name="play" size={12} /> Resume
              </button>
            )}
            {!native && (
              <button type="button" className="calm-chip min-h-9" onClick={() => void cancelDownload(m.id)}>
                <CIcon name="x" size={13} /> Cancel
              </button>
            )}
          </div>
        </div>
      )}
      {d.error && d.status !== "downloading" && <p className="mt-2 text-[12px] text-[var(--bad)]">{d.error}</p>}
      {d.status === "done" && (
        <div className="mt-2.5 flex items-center gap-2 text-[12px] text-[rgb(var(--ink-rgb)/var(--ink-3-a))]">
          <span>On device · {fmtSize(d.loaded)}</span>
          <span className="flex-1" />
          <button type="button" className="calm-chip min-h-9" style={{ color: "var(--bad)" }} onClick={() => { void deleteModel(m.id); if (m.custom) unregisterModel(m.id); }} aria-label={`Delete ${m.name} to free storage`}>
            <CIcon name="trash" size={13} /> Delete
          </button>
        </div>
      )}
    </article>
  );
}

function SearchTab({ onInstall }: { onInstall: (m: CatalogModel) => void }) {
  const [q, setQ] = useState("");
  const [repos, setRepos] = useState<HfRepo[] | null>(null);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [files, setFiles] = useState<HfFile[] | null>(null);
  const [url, setUrl] = useState("");
  const [urlErr, setUrlErr] = useState("");

  const run = (term: string) => {
    setErr("");
    setRepos(null);
    searchHf(term)
      .then(setRepos)
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : "Search failed"));
  };
  useEffect(() => {
    const ac = new AbortController();
    searchHf("", ac.signal).then(setRepos).catch(() => undefined);
    return () => ac.abort();
  }, []);

  const expand = (id: string) => {
    if (open === id) return setOpen(null);
    setOpen(id);
    setFiles(null);
    repoGgufs(id).then(setFiles).catch(() => setFiles([]));
  };
  const installUrl = async () => {
    setUrlErr("");
    const p = parseGgufUrl(url);
    if (!p) return setUrlErr("Paste a direct link that ends in .gguf");
    const size = await headSize(p.url);
    if (!size) return setUrlErr("Could not read the file size (the host may block cross-origin requests).");
    onInstall(registerCustom(p.repo, p.file, size, p.url));
    setUrl("");
  };

  return (
    <div className="space-y-4">
      <form onSubmit={(e) => { e.preventDefault(); run(q); }} className="flex gap-2">
        <label className="relative flex-1">
          <span className="sr-only">Search Hugging Face GGUF models</span>
          <CIcon name="search" size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 opacity-50" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search any GGUF on Hugging Face" className="calm-field !rounded-full !pl-10" />
        </label>
        <button type="submit" className="calm-btn" data-primary="true">Search</button>
      </form>
      {err && <p className="text-[13px] text-[var(--bad)]">{err}</p>}
      {!repos && !err && <div className="shimmer h-40 rounded-[22px]" aria-label="Loading results" />}
      <ul className="space-y-2">
        {repos?.map((r) => (
          <li key={r.id} className="calm-card overflow-hidden">
            <button type="button" onClick={() => expand(r.id)} aria-expanded={open === r.id} className="flex min-h-[56px] w-full items-center gap-3 px-4 text-left">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-medium">{r.id}</span>
                <span className="tnum block text-[11.5px] text-[rgb(var(--ink-rgb)/var(--ink-3-a))]">↓ {r.downloads.toLocaleString()} · ♥ {r.likes}</span>
              </span>
              <CIcon name="chevron" size={16} style={{ transform: open === r.id ? "rotate(180deg)" : undefined, transition: "transform .2s" }} />
            </button>
            {open === r.id && (
              <div className="border-t border-[var(--hairline)] px-4 py-2">
                {!files && <div className="shimmer my-2 h-12 rounded-xl" />}
                {files?.length === 0 && <p className="py-2 text-[13px] text-[rgb(var(--ink-rgb)/var(--ink-3-a))]">No top-level .gguf files here (they may be in sub-folders).</p>}
                {files?.map((f) => (
                  <div key={f.path} className="flex min-h-12 items-center gap-3">
                    <span className="min-w-0 flex-1 truncate text-[12.5px]">{f.path}</span>
                    <span className="tnum text-[12px] text-[rgb(var(--ink-rgb)/var(--ink-3-a))]">{fmtSize(f.size)}</span>
                    <button type="button" className="calm-chip min-h-9" onClick={() => onInstall(registerCustom(r.id, f.path, f.size))} aria-label={`Install ${f.path}`}>
                      <CIcon name="download" size={13} /> Install
                    </button>
                  </div>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
      <div className="calm-card p-4">
        <h3 className="text-[14px] font-medium">Custom .gguf URL</h3>
        <div className="mt-2 flex gap-2">
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://huggingface.co/…/model-Q4_K_M.gguf" aria-label="Direct .gguf URL" className="calm-field !rounded-full" />
          <button type="button" className="calm-btn" data-primary="true" onClick={() => void installUrl()}>
            Install
          </button>
        </div>
        {urlErr && <p className="mt-2 text-[12.5px] text-[var(--bad)]">{urlErr}</p>}
      </div>
    </div>
  );
}

export function ModelHub({ dl, choice, onUse, loadingId }: { dl: Record<string, DlItem>; choice: Choice; onUse: (m: CatalogModel) => void; loadingId: string | null }) {
  const [tab, setTab] = useState<Tab>("trending");
  const [rev, setRev] = useState(0);
  const [store, setStore] = useState<{ used: number; quota: number } | null>(null);
  useEffect(() => {
    void storageEstimate().then(setStore);
  }, [dl]);

  const list = useMemo(() => {
    void rev;
    const g = (m: CatalogModel) => m.group ?? "trending";
    return CATALOG.filter((m) => g(m) === tab).sort((a, b) => a.sizeGB - b.sizeGB);
  }, [tab, rev]);
  const custom = useMemo(() => {
    void rev;
    return CATALOG.filter((m) => m.group === "custom");
  }, [rev]);
  const installed = CATALOG.filter((m) => dlOf(dl, m.id).status === "done").length;
  const TABS: { id: Tab; label: string }[] = [
    { id: "trending", label: "🔥 Trending" },
    { id: "uncensored", label: "🔓 Uncensored" },
    { id: "search", label: "🔍 Search" },
  ];
  const install = (m: CatalogModel) => {
    setRev((r) => r + 1);
    void startDownload(m.id);
  };
  const card = (m: CatalogModel) => <Card key={m.id} m={m} d={dlOf(dl, m.id)} active={choice.kind === "local" && choice.id === m.id} busy={loadingId === m.id} onUse={() => onUse(m)} />;

  return (
    <div className="mx-auto w-full max-w-[720px] px-5 pb-10 pt-3">
      <ViewTitle title="Model Hub" sub="Run models on this device — private, offline, no account. Downloads resume if you pause or lose signal." />
      <div className="mb-4 flex flex-wrap items-center gap-2 text-[12.5px] text-[rgb(var(--ink-rgb)/var(--ink-3-a))]">
        <span className="calm-chip">{installed} on device</span>
        {store && <span className="calm-chip tnum">Storage {fmtSize(store.used)} used of {fmtSize(store.quota)}</span>}
      </div>
      <div role="tablist" aria-label="Model groups" className="mb-4 flex gap-1.5 overflow-x-auto rounded-full bg-[var(--surface-2)] p-1 scroll-quiet">
        {TABS.map((t) => (
          <button key={t.id} role="tab" type="button" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className="min-h-10 flex-1 whitespace-nowrap rounded-full px-3 text-[13px] font-medium transition-colors" style={tab === t.id ? { background: "var(--surface)", boxShadow: "var(--shadow-card)" } : { opacity: 0.7 }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "uncensored" && (
        <div className="mb-4 rounded-2xl bg-[var(--halo-a)] p-4 text-[13px] leading-relaxed text-[var(--halo-ink)]">
          Open-weight models with alignment refusals removed (abliterated) or trained to comply. Selecting one adds this preset to the system prompt:
          <p className="mt-2 rounded-xl bg-[var(--surface)] p-3 text-[12.5px] italic text-[rgb(var(--ink-rgb)/0.8)]">“{UNCENSORED_PROMPT}”</p>
          <p className="mt-2 text-[12px] opacity-80">You are responsible for what you generate. Runs fully on your device.</p>
        </div>
      )}

      {tab === "search" ? (
        <SearchTab onInstall={install} />
      ) : (
        <div className="space-y-3">{list.map(card)}</div>
      )}

      {tab !== "search" && custom.length > 0 && (
        <>
          <h2 className="mb-2 mt-7 text-[13px] font-medium text-[rgb(var(--ink-rgb)/var(--ink-3-a))]">Your custom installs</h2>
          <div className="space-y-3">{custom.map(card)}</div>
        </>
      )}
      {tab === "search" && custom.length > 0 && (
        <>
          <h2 className="mb-2 mt-7 text-[13px] font-medium text-[rgb(var(--ink-rgb)/var(--ink-3-a))]">Your custom installs</h2>
          <div className="space-y-3">{custom.map(card)}</div>
        </>
      )}
    </div>
  );
}

export { activateModel };
