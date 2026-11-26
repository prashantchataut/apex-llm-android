"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useRef, useState } from "react";
import { addFile, clearCollection, docChunks, importGithubRepo, removeDocument, search, useVault, VAULT_ACCEPT, vaultStats, type Hit, type VaultDoc } from "@/lib/rag";
import { CIcon } from "./icons";
import { ViewTitle } from "./Chrome";
import { useBackLayer } from "@/lib/backstack";
import { resolveCitation, parseCitation } from "@/lib/rag";

const dim = "text-[rgb(var(--ink-rgb)/var(--ink-3-a))]";
const kb = (n: number) => (n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`);

/** Excerpt viewer opened by clicking a `[Source: file#L12]` citation anywhere in the app. */
export function SourceSheet({ cite, onClose }: { cite: string | null; onClose: () => void }) {
  useBackLayer(!!cite, onClose);
  const parsed = cite ? parseCitation(cite) : null;
  const chunk = parsed ? resolveCitation(parsed.name, parsed.line) : null;
  return (
    <AnimatePresence>
      {cite && (
        <div className="absolute inset-0 z-[60] flex items-end justify-center sm:items-center" role="presentation">
          <motion.div className="absolute inset-0 bg-black/30 backdrop-blur-[3px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div role="dialog" aria-modal="true" aria-label="Source excerpt" initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }} transition={{ type: "spring", stiffness: 380, damping: 36 }} className="calm-card relative max-h-[78%] w-full max-w-[560px] overflow-y-auto rounded-b-none p-4 pb-safe sm:rounded-b-[28px]">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className={`text-[12px] ${dim}`}>Source from your Knowledge Vault</p>
                <h2 className="truncate text-[16px] font-medium tracking-[-0.02em]">{parsed?.name ?? "Unknown source"}</h2>
                {chunk && <p className={`mono text-[12px] ${dim}`}>lines {chunk.startLine}-{chunk.endLine} · {chunk.collection}</p>}
              </div>
              <button type="button" className="ibtn" aria-label="Close source" onClick={onClose}>
                <CIcon name="x" size={18} />
              </button>
            </div>
            {chunk ? (
              <pre className="mono mt-3 max-h-[52vh] overflow-auto whitespace-pre-wrap rounded-2xl bg-[var(--surface-2)] p-3 text-[12.5px] leading-[1.6]">
                {chunk.text.split("\n").map((l, i) => (
                  <span key={i} className="block" style={chunk.startLine + i === parsed?.line ? { background: "var(--halo-a)", borderRadius: 6 } : undefined}>
                    <span className={`mr-3 inline-block w-8 select-none text-right ${dim}`}>{chunk.startLine + i}</span>
                    {l || " "}
                  </span>
                ))}
              </pre>
            ) : (
              <p className={`mt-3 text-[14px] ${dim}`}>That document is no longer in the vault.</p>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

export function VaultView({ ghToken, enabled, setEnabled }: { ghToken: string | null; enabled: boolean; setEnabled: (v: boolean) => void }) {
  const { docs } = useVault();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [repo, setRepo] = useState("");
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const groups = useMemo(() => {
    const m = new Map<string, VaultDoc[]>();
    for (const d of docs) m.set(d.collection, [...(m.get(d.collection) ?? []), d]);
    return [...m.entries()];
  }, [docs]);
  const st = vaultStats();

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setErr("");
    for (const f of [...files]) {
      setBusy(`Indexing ${f.name}…`);
      try {
        await addFile(f);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Couldn't read that file.");
      }
    }
    setBusy("");
  };
  const pull = async () => {
    setErr("");
    try {
      const r = await importGithubRepo(repo, ghToken, (d, t, f) => setBusy(f ? `Indexing ${d + 1}/${t} · ${f}` : "Finishing…"));
      setBusy("");
      setRepo("");
      if (!r.added) setErr("No indexable text files were found in that repository.");
    } catch (e) {
      setBusy("");
      setErr(e instanceof Error ? e.message : "Import failed.");
    }
  };
  const run = (v: string) => {
    setQ(v);
    setHits(v.trim() ? search(v, 5) : null);
  };

  return (
    <div className="mx-auto w-full max-w-[720px] px-5 pb-12 pt-3">
      <ViewTitle title="Knowledge Vault" sub="Documents and repositories indexed on this phone. Answers cite them, nothing is uploaded." />
      <input ref={fileRef} type="file" multiple accept={VAULT_ACCEPT} hidden onChange={(e) => { void upload(e.target.files); e.target.value = ""; }} />

      <div className="calm-card flex items-center justify-between gap-4 p-4">
        <div className="min-w-0">
          <p className="text-[15px] font-medium">Use the vault in chats</p>
          <p className={`text-[12.5px] ${dim}`}>{st.docs} document{st.docs === 1 ? "" : "s"} · {st.chunks} chunks · BM25 + n-gram vectors</p>
        </div>
        <button type="button" role="switch" aria-checked={enabled} aria-label="Use the vault in chats" onClick={() => setEnabled(!enabled)} className="switch" />
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <button type="button" onClick={() => fileRef.current?.click()} className="calm-card flex min-h-[88px] flex-col items-start justify-between p-4 text-left">
          <CIcon name="file" size={20} />
          <span>
            <span className="block text-[14.5px] font-medium">Add files</span>
            <span className={`block text-[12px] ${dim}`}>pdf, txt, md, json, csv, rs, py, ts</span>
          </span>
        </button>
        <div className="calm-card p-4">
          <p className="flex items-center gap-2 text-[14.5px] font-medium"><CIcon name="branch" size={18} /> GitHub repository</p>
          <div className="mt-2 flex gap-2">
            <input value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="owner/repo" aria-label="GitHub repository" className="calm-field !rounded-full" autoCapitalize="none" spellCheck={false} onKeyDown={(e) => e.key === "Enter" && void pull()} />
            <button type="button" className="calm-btn" data-primary="true" disabled={!repo.trim() || !!busy} onClick={() => void pull()}>Index</button>
          </div>
        </div>
      </div>
      {busy && <p className={`mt-3 flex items-center gap-2 text-[13px] ${dim}`}><span className="pulse-dot h-2 w-2 rounded-full bg-[var(--halo-ink)]" /> {busy}</p>}
      {err && <p className="mt-3 text-[13px] text-[var(--bad)]">{err}</p>}

      {st.docs > 0 && (
        <div className="calm-card mt-3 p-4">
          <label className="flex items-center gap-2">
            <CIcon name="search" size={17} className="opacity-50" />
            <input value={q} onChange={(e) => run(e.target.value)} placeholder="Test retrieval: ask something your files answer" aria-label="Test vault retrieval" className="bare w-full bg-transparent text-[14.5px] outline-none" />
          </label>
          {hits && (
            <ul className="mt-3 space-y-2">
              {hits.length === 0 && <li className={`text-[13px] ${dim}`}>No passage matched well enough. The assistant will answer without the vault.</li>}
              {hits.map((h) => (
                <li key={h.chunk.id} className="rounded-2xl bg-[var(--surface-2)] p-3">
                  <button type="button" className="cite-chip" onClick={() => window.dispatchEvent(new CustomEvent("apex:cite", { detail: `[Source: ${h.chunk.docName}#L${h.chunk.startLine}]` }))}>{h.chunk.docName}#L{h.chunk.startLine}</button>
                  <span className={`ml-2 mono text-[11.5px] ${dim}`}>score {h.score.toFixed(2)}</span>
                  <p className="mt-1.5 line-clamp-3 text-[13px] leading-[1.55]">{h.chunk.text}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {groups.length === 0 && !busy && (
        <p className={`mt-10 text-center text-[14px] leading-relaxed ${dim}`}>Your vault is empty. Add a few files or index a repository, then ask about them in any chat.</p>
      )}
      {groups.map(([name, list]) => (
        <section key={name} className="mt-6">
          <div className="flex items-center justify-between px-1">
            <h3 className={`text-[13px] font-medium ${dim}`}>{name} · {list.length}</h3>
            <button type="button" className="text-[12.5px] text-[var(--bad)]" onClick={() => void clearCollection(name)}>Remove all</button>
          </div>
          <ul className="mt-2 space-y-2">
            {list.map((d) => (
              <li key={d.id} className="calm-card p-3.5">
                <div className="flex items-center gap-3">
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setOpen(open === d.id ? null : d.id)} aria-expanded={open === d.id}>
                    <span className="block truncate text-[14px]">{d.name}</span>
                    <span className={`block text-[12px] ${dim}`}>{d.chunks} chunks · {d.lines} lines · {kb(d.size)} · {d.source}</span>
                  </button>
                  <button type="button" className="ibtn" aria-label={`Remove ${d.name}`} onClick={() => void removeDocument(d.id)}>
                    <CIcon name="trash" size={17} />
                  </button>
                </div>
                {open === d.id && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {docChunks(d.id).slice(0, 24).map((c) => (
                      <button key={c.id} type="button" className="cite-chip" onClick={() => window.dispatchEvent(new CustomEvent("apex:cite", { detail: `[Source: ${c.docName}#L${c.startLine}]` }))}>L{c.startLine}-{c.endLine}</button>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
