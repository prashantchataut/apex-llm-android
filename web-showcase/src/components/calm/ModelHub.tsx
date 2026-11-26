"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useMemo, useState } from "react";
import { BLURBS, CATALOG, unregisterModel, type CatalogModel } from "@/lib/models";
import { importLocalModel } from "@/lib/downloader";
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

/** Circular progress that fills while a model downloads. */
function Ring({ pct, label }: { pct: number; label: string }) {
  const r = 11;
  const c = 2 * Math.PI * r;
  return (
    <svg width="30" height="30" viewBox="0 0 30 30" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <circle cx="15" cy="15" r={r} fill="none" stroke="currentColor" strokeOpacity="0.15" strokeWidth="2.5" />
      <circle cx="15" cy="15" r={r} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} transform="rotate(-90 15 15)" style={{ transition: "stroke-dashoffset .3s linear" }} />
    </svg>
  );
}

function Row({ m, d, active, onUse, busy }: { m: CatalogModel; d: DlItem; active: boolean; onUse: () => void; busy: boolean }) {
  const [info, setInfo] = useState(false);
  const pct = d.total ? Math.min(100, (d.loaded / d.total) * 100) : 0;
  const native = isNative();
  const live = d.status === "downloading" || d.status === "paused";
  const sub = `${BLURBS[m.id] ?? "Local model"} \u00b7 ${fmtSize(m.sizeGB * 1e9)}`;
  return (
    <li className="calm-row" aria-label={m.name}>
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => setInfo(!info)} aria-expanded={info} aria-label={`Details for ${m.name}`} className="min-w-0 flex-1 text-left">
          <span className="block truncate text-[16px] font-medium leading-snug tracking-[-0.02em]">{m.name}</span>
          <span className="mt-0.5 block text-[13.5px] leading-snug text-[rgb(var(--ink-rgb)/var(--ink-3-a))]">{sub}</span>
        </button>
        <div className="shrink-0">
          {d.status === "idle" && (
            <button type="button" className="calm-btn !h-9 !bg-[var(--surface-2)] !shadow-none" onClick={() => void startDownload(m.id)} aria-label={`Get ${m.name}`}>
              Get
            </button>
          )}
          {live && (
            <button type="button" className="grid h-10 w-10 place-items-center rounded-full text-[var(--accent)]" onClick={() => (d.status === "downloading" ? pauseDownload(m.id) : void resumeDownload(m.id))} disabled={native} aria-label={d.status === "downloading" ? "Pause download" : "Resume download"}>
              <span className="relative grid place-items-center">
                <Ring pct={pct} label={`${m.name} download`} />
                <span className="absolute"><CIcon name={d.status === "downloading" ? "pause" : "play"} size={10} /></span>
              </span>
            </button>
          )}
          {d.status === "done" && (
            <button type="button" className="calm-btn !h-9" data-tone={active ? "sage" : undefined} data-primary={!active} disabled={busy} onClick={onUse}>
              {active ? <><CIcon name="check" size={14} /> Active</> : busy ? "Loading…" : "Use"}
            </button>
          )}
          {d.status === "error" && (
            <button type="button" className="calm-btn !h-9" onClick={() => void startDownload(m.id)}>
              Retry
            </button>
          )}
        </div>
      </div>
      {live && (
        <p className="tnum mt-1.5 text-[12.5px] text-[rgb(var(--ink-rgb)/var(--ink-3-a))]">
          {mb(d.loaded)} of {mb(d.total)} MB{d.status === "downloading" ? ` \u00b7 ${d.mbps.toFixed(1)} MB/s` : " \u00b7 paused"}
          {!native && (
            <button type="button" className="ml-3 underline underline-offset-2" onClick={() => void cancelDownload(m.id)}>
              Cancel
            </button>
          )}
        </p>
      )}
      {d.error && d.status !== "downloading" && <p className="mt-1.5 text-[12.5px] text-[var(--bad)]">{d.error}</p>}
      <AnimatePresence initial={false}>
        {info && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }} className="overflow-hidden">
            <div className="mt-3 rounded-[18px] bg-[var(--surface)] p-3.5 text-[13px] leading-relaxed text-[rgb(var(--ink-rgb)/var(--ink-2-a))] shadow-[var(--specular),var(--shadow-card)]">
              <p>
                {m.quant} quantization \u00b7 about {(estimateRamMb(m) / 1000).toFixed(1)} GB of memory while running.
                {m.uncensored ? " Alignment refusals removed; adds a short freedom preset to the system prompt." : ""}
                {m.reasoning ? " Shows its reasoning before answering." : ""}
              </p>
              {d.status === "done" && (
                <button type="button" className="mt-2 text-[var(--bad)] underline underline-offset-2" onClick={() => { void deleteModel(m.id); if (m.custom) unregisterModel(m.id); }} aria-label={`Delete ${m.name} to free storage`}>
                  Remove from this device
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
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
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search Hugging Face" className="calm-field !rounded-full !pl-10" />
        </label>
        <button type="submit" className="calm-btn" data-primary="true">Search</button>
      </form>
      {err && <p className="text-[13px] text-[var(--bad)]">{err}</p>}
      {!repos && !err && <div className="shimmer h-40 rounded-[22px]" aria-label="Loading results" />}
      <ul className="space-y-1">
        {repos?.map((r) => (
          <li key={r.id} className="calm-row !p-0 overflow-hidden">
            <button type="button" onClick={() => expand(r.id)} aria-expanded={open === r.id} className="flex min-h-[56px] w-full items-center gap-3 px-4 text-left">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15.5px] font-medium tracking-[-0.015em]">{r.id}</span>
                <span className="tnum block text-[13px] text-[rgb(var(--ink-rgb)/var(--ink-3-a))]">{r.downloads.toLocaleString()} downloads</span>
              </span>
              <CIcon name="chevron" size={16} style={{ transform: open === r.id ? "rotate(180deg)" : undefined, transition: "transform .2s" }} />
            </button>
            {open === r.id && (
              <div className="px-4 pb-2">
                {!files && <div className="shimmer my-2 h-12 rounded-xl" />}
                {files?.length === 0 && <p className="py-2 text-[13px] text-[rgb(var(--ink-rgb)/var(--ink-3-a))]">No top-level .gguf files here (they may be in sub-folders).</p>}
                {files?.map((f) => (
                  <div key={f.path} className="flex min-h-12 items-center gap-3">
                    <span className="min-w-0 flex-1 truncate text-[12.5px]">{f.path}</span>
                    <span className="tnum text-[12px] text-[rgb(var(--ink-rgb)/var(--ink-3-a))]">{fmtSize(f.size)}</span>
                    <button type="button" className="calm-chip min-h-9" onClick={() => onInstall(registerCustom(r.id, f.path, f.size))} aria-label={`Install ${f.path}`}>
                      Install
                    </button>
                  </div>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
      <div className="px-3.5 pt-3">
        <h3 className="text-[14.5px] font-medium">Add a model by link</h3>
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

export function ModelHub({ dl, choice, onUse, loadingId, initialTab = "trending" }: { dl: Record<string, DlItem>; choice: Choice; onUse: (m: CatalogModel) => void; loadingId: string | null; initialTab?: Tab }) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [rev, setRev] = useState(0);
  const [store, setStore] = useState<{ used: number; quota: number } | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const [importMsg, setImportMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const doImport = async (f: File | undefined) => {
    if (!f) return;
    setImportMsg({ ok: true, text: `Importing ${f.name}…` });
    try {
      const m = await importLocalModel(f);
      setRev((r) => r + 1);
      setImportMsg({ ok: true, text: `${f.name} is on this device. Tap Use to load it.` });
      void m;
    } catch (e) {
      setImportMsg({ ok: false, text: e instanceof Error ? e.message : "Import failed" });
    }
  };
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
    { id: "trending", label: "Trending" },
    { id: "uncensored", label: "Uncensored" },
    { id: "search", label: "Search Hugging Face" },
  ];
  const install = (m: CatalogModel) => {
    setRev((r) => r + 1);
    void startDownload(m.id);
  };
  const card = (m: CatalogModel) => <Row key={m.id} m={m} d={dlOf(dl, m.id)} active={choice.kind === "local" && choice.id === m.id} busy={loadingId === m.id} onUse={() => onUse(m)} />;

  return (
    <div className="mx-auto w-full max-w-[640px] px-5 pb-12 pt-3">
      <ViewTitle title="Models" sub={installed ? `${installed} on this device${store ? ` \u00b7 ${fmtSize(store.used)} used` : ""}. Private and offline.` : "Run models on this phone. Private, offline, no account."} />
      <div role="tablist" aria-label="Model groups" className="seg mb-5">
        {TABS.map((t) => (
          <button key={t.id} role="tab" type="button" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>
            {tab === t.id && <motion.span layoutId="hub-thumb" className="seg-thumb" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
            {t.label}
          </button>
        ))}
      </div>

      <div className="mb-4 flex items-center gap-3 rounded-[22px] bg-[var(--surface)] p-3 pl-4 shadow-[var(--specular),var(--shadow-card)]">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--surface-2)]"><CIcon name="import" size={17} /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-medium">Import local .gguf</p>
          <p className="truncate text-[12px] text-[rgb(var(--ink-rgb)/var(--ink-3-a))]" aria-live="polite" style={importMsg && !importMsg.ok ? { color: "var(--bad)" } : undefined}>{importMsg?.text ?? "Pick a model from Downloads or any folder on this device"}</p>
        </div>
        <input ref={importRef} type="file" accept=".gguf,application/octet-stream,*/*" hidden data-testid="gguf-input" onChange={(e) => { void doImport(e.target.files?.[0]); e.target.value = ""; }} />
        <button type="button" className="calm-btn" data-primary="true" onClick={() => importRef.current?.click()}>Choose file</button>
      </div>

      {tab === "uncensored" && (
        <motion.p initial={{ opacity: 0, filter: "blur(4px)" }} animate={{ opacity: 1, filter: "blur(0px)" }} className="mb-3 max-w-[48ch] px-1 text-[14px] leading-relaxed text-[rgb(var(--ink-rgb)/var(--ink-2-a))]">
          Open-weight models with refusals removed. They run fully on your device, and what you create is yours to own.
        </motion.p>
      )}

      {tab === "search" ? (
        <SearchTab onInstall={install} />
      ) : (
        <motion.ul key={tab} className="space-y-0.5" initial={{ opacity: 0, y: 8, filter: "blur(4px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}>
          {list.map(card)}
        </motion.ul>
      )}

      {custom.length > 0 && (
        <>
          <h2 className="mb-1 mt-8 px-3.5 text-[13.5px] text-[rgb(var(--ink-rgb)/var(--ink-3-a))]">Added by you</h2>
          <ul className="space-y-0.5">{custom.map(card)}</ul>
        </>
      )}
    </div>
  );
}

export { activateModel };
