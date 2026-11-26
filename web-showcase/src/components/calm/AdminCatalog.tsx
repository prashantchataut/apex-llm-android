"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useState } from "react";
import { loadJsonFile, publishJsonFile } from "@/lib/admin";
import { repoGgufs } from "@/lib/hf";
import { buildOtaModel, OTA_PATH, type OtaCatalog } from "@/lib/ota";
import { APP_VERSION } from "@/lib/version";
import { BASE_PATH } from "@/lib/paths";
import { REPO } from "@/lib/site";
import type { Registry } from "@/lib/access";
import { CIcon } from "./icons";

const dim = "text-[rgb(var(--ink-rgb)/var(--ink-3-a))]";
const spring = { type: "spring", stiffness: 380, damping: 34 } as const;

/** Owner tools below the key list: OTA model catalog (featured Trending / Uncensored GGUFs), live system configuration, one-tap export. */
export function AdminCatalog({ token, registry }: { token: string; registry: Registry }) {
  const [cat, setCat] = useState<OtaCatalog | null>(null);
  const [sha, setSha] = useState("");
  const [saved, setSaved] = useState("");
  const [repo, setRepo] = useState("");
  const [file, setFile] = useState("");
  const [files, setFiles] = useState<{ path: string; size: number }[] | null>(null);
  const [size, setSize] = useState(0);
  const [group, setGroup] = useState<"trending" | "uncensored">("uncensored");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [commit, setCommit] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await loadJsonFile<OtaCatalog>(token, OTA_PATH);
      setCat(r.data);
      setSha(r.sha);
      setSaved(JSON.stringify(r.data));
      setErr("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't load the catalog.");
    }
  }, [token]);
  useEffect(() => void load(), [load]);

  const dirty = !!cat && JSON.stringify(cat) !== saved;
  const lookup = async () => {
    setErr("");
    setFiles(null);
    try {
      const f = await repoGgufs(repo.trim().replace(/^https?:\/\/huggingface\.co\//, ""));
      setFiles(f);
      if (!f.length) setErr("No top-level .gguf files in that repository.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Hugging Face lookup failed.");
    }
  };
  const add = () => {
    if (!cat || !repo || !file || !size) return;
    const m = buildOtaModel(repo.trim().replace(/^https?:\/\/huggingface\.co\//, ""), file, size, group);
    setCat({ ...cat, models: [...cat.models.filter((x) => x.id !== m.id), m] });
    setRepo("");
    setFile("");
    setFiles(null);
    setSize(0);
  };
  const publish = async () => {
    if (!cat) return;
    setBusy(true);
    setErr("");
    try {
      const next = { ...cat, version: (cat.version ?? 1) + 1, updatedAt: new Date().toISOString() };
      const r = await publishJsonFile(token, OTA_PATH, next, sha, `admin: update OTA model catalog (${next.models.length} models)`);
      setCat(next);
      setSha(r.sha);
      setSaved(JSON.stringify(next));
      setCommit(r.commitUrl);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Publish failed.");
    }
    setBusy(false);
  };
  const exportConfig = () => {
    const cfg = { exportedAt: new Date().toISOString(), app: { version: APP_VERSION, repo: REPO, basePath: BASE_PATH || "/" }, keylessRegistry: registry, otaCatalog: cat };
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(cfg, null, 2)], { type: "application/json" }));
    a.download = `apex-config-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const active = registry.keys.filter((k) => k.status === "active").length;
  const rows: [string, string][] = [
    ["App version", `v${APP_VERSION}`],
    ["Keyless Cloud", registry.keylessEnabled ? "Enabled" : "Kill-switch on"],
    ["Access keys", `${active} active · ${registry.keys.length - active} revoked`],
    ["Catalog", `${cat?.models.length ?? 0} OTA models · v${cat?.version ?? "?"}`],
    ["Served from", BASE_PATH || "root (app / local)"],
  ];

  return (
    <>
      <section className="calm-card mt-8 p-5" aria-labelledby="ota-h">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="ota-h" className="text-[15px] font-medium">Model catalog (OTA)</h2>
            <p className={`mt-0.5 text-[12.5px] ${dim}`}>Featured models appear in every app on the next launch. No APK release needed.</p>
          </div>
          {dirty && <button type="button" className="calm-btn" data-primary="true" disabled={busy} onClick={() => void publish()}>{busy ? "Publishing…" : "Publish catalog"}</button>}
        </div>
        {commit && !dirty && <p className="mt-3 text-[12.5px]">Published. <a className="underline underline-offset-2" href={commit} target="_blank" rel="noreferrer">View commit</a></p>}

        <ul className="mt-3 space-y-2" data-testid="ota-list">
          <AnimatePresence initial={false}>
            {cat?.models.map((m) => (
              <motion.li key={m.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }} transition={spring} className="flex items-center gap-3 rounded-2xl bg-[var(--surface-2)] p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px]">{m.name} <span className={`mono text-[11.5px] ${dim}`}>{m.quant}</span></p>
                  <p className={`truncate text-[12px] ${dim}`}>{m.repo} · {(m.sizeGB).toFixed(2)} GB</p>
                </div>
                <span className="calm-chip" style={m.group === "uncensored" ? { background: "var(--halo-a)", color: "var(--halo-ink)" } : undefined}>{m.group === "uncensored" ? "Uncensored" : "Trending"}</span>
                <button type="button" className="ibtn" aria-label={`Remove ${m.name}`} onClick={() => setCat({ ...cat, models: cat.models.filter((x) => x.id !== m.id) })}>
                  <CIcon name="trash" size={17} />
                </button>
              </motion.li>
            ))}
          </AnimatePresence>
          {cat && cat.models.length === 0 && <li className={`rounded-2xl bg-[var(--surface-2)] p-4 text-center text-[13px] ${dim}`}>No featured models yet. Add one below.</li>}
        </ul>

        <div className="mt-4 rounded-2xl border border-[rgb(var(--ink-rgb)/0.08)] p-3">
          <p className="text-[13.5px] font-medium">Add a model</p>
          <div className="mt-2 flex gap-2">
            <input className="calm-field !rounded-full" value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="bartowski/Llama-3.2-3B-Instruct-GGUF" aria-label="Hugging Face repository" autoCapitalize="none" spellCheck={false} />
            <button type="button" className="calm-btn" disabled={!repo.trim()} onClick={() => void lookup()}>Find files</button>
          </div>
          {files && files.length > 0 && (
            <div className="mt-2 max-h-40 overflow-y-auto">
              {files.map((f) => (
                <button key={f.path} type="button" onClick={() => { setFile(f.path); setSize(f.size); }} aria-pressed={file === f.path} className="flex min-h-10 w-full items-center justify-between gap-3 rounded-xl px-2.5 text-left text-[13px] hover:bg-[var(--surface-2)]" style={file === f.path ? { background: "var(--halo-a)" } : undefined}>
                  <span className="truncate">{f.path}</span>
                  <span className={`mono shrink-0 text-[11.5px] ${dim}`}>{(f.size / 1e9).toFixed(2)} GB</span>
                </button>
              ))}
            </div>
          )}
          <div className="mt-3 flex items-center justify-between gap-3">
            <div className="seg" role="tablist" aria-label="Catalog group">
              {(["trending", "uncensored"] as const).map((g) => (
                <button key={g} type="button" aria-pressed={group === g} onClick={() => setGroup(g)}>{g === "trending" ? "Trending" : "Uncensored"}</button>
              ))}
            </div>
            <button type="button" className="calm-btn" data-primary="true" disabled={!file || !size} onClick={add}>Add to catalog</button>
          </div>
        </div>
        {err && <p className="mt-3 text-[12.5px] text-[#d6685f]">{err}</p>}
      </section>

      <section className="calm-card mt-5 p-5" aria-labelledby="cfg-h">
        <div className="flex items-center justify-between gap-3">
          <h2 id="cfg-h" className="text-[15px] font-medium">System configuration</h2>
          <button type="button" className="calm-btn" onClick={exportConfig}><CIcon name="download" size={15} /> Export JSON</button>
        </div>
        <dl className="mt-3 divide-y divide-[rgb(var(--ink-rgb)/0.06)]">
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between gap-4 py-2.5 text-[13.5px]">
              <dt className={dim}>{k}</dt>
              <dd className="tnum text-right">{v}</dd>
            </div>
          ))}
        </dl>
      </section>
    </>
  );
}
