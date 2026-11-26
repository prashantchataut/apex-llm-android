"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { HapticsControl } from "@/components/theme/HapticsControl";
import type { useCartridges } from "@/lib/cartridges";
import { CATALOG, registerModel, type CatalogModel } from "@/lib/models";
import type { CalmMode } from "@/lib/store";
import { REGISTRY_URL, ago, checkForUpdate, openUpdateModal, simulateUpdate, type UpdateState } from "@/lib/updater";
import { APP_VERSION } from "@/lib/version";
import { RELEASES_URL } from "@/lib/site";
import { useAccess } from "@/lib/access";
import { CIcon } from "./icons";
import { ViewTitle } from "./Chrome";

const fmtMb = (b: number) => `${(b / 1e6).toFixed(1)} MB`;

export function SettingsView({ mode, setMode, onReplay, cart, update, onAccessKey }: { onReplay?: () => void; onAccessKey?: () => void; mode: CalmMode; setMode: (m: CalmMode) => void; cart: ReturnType<typeof useCartridges>; update: UpdateState }) {
  const access = useAccess();
  const [sync, setSync] = useState<string>("");
  const [syncing, setSyncing] = useState(false);

  /** Every time Settings opens, re-check both sources (version.json + GitHub releases). */
  useEffect(() => {
    void checkForUpdate();
  }, []);

  const syncRegistry = async () => {
    setSyncing(true);
    setSync("");
    try {
      const r = await fetch(REGISTRY_URL, { cache: "no-store" });
      if (!r.ok) throw new Error(`Registry answered ${r.status}`);
      const j = (await r.json()) as { version?: number; models?: CatalogModel[] };
      const before = CATALOG.length;
      for (const m of j.models ?? []) registerModel({ ...m, ota: true });
      const added = CATALOG.length - before;
      setSync(`Registry v${j.version ?? "?"} synced · ${added > 0 ? `${added} new model${added > 1 ? "s" : ""}` : "catalog already current"} (${ago(Date.now())})`);
    } catch (e) {
      setSync(e instanceof Error ? e.message : "Sync failed");
    }
    setSyncing(false);
  };

  const MODES: { id: CalmMode; label: string; sub: string; icon: "sun" | "moon" | "gear" }[] = [
    { id: "dark", label: "Obsidian Dark", sub: "Dark", icon: "moon" },
    { id: "light", label: "Porcelain Light", sub: "Light", icon: "sun" },
    { id: "system", label: "System", sub: "Auto", icon: "gear" },
  ];

  return (
    <div className="mx-auto w-full max-w-[640px] px-5 pb-10 pt-3">
      <ViewTitle title="Settings" sub="Appearance, voice and updates." />

      <h2 className="mb-2 text-[13px] font-medium text-[rgb(var(--ink-rgb)/var(--ink-3-a))]">Theme</h2>
      <div role="radiogroup" aria-label="Theme" className="seg">
        {MODES.map((m) => (
          <button key={m.id} type="button" role="radio" aria-checked={mode === m.id} onClick={() => setMode(m.id)} className="!inline-flex items-center gap-2">
            {mode === m.id && <motion.span layoutId="theme-thumb" className="seg-thumb" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
            <CIcon name={m.icon} size={16} /> {m.label}
          </button>
        ))}
      </div>

      {onReplay && (
        <button type="button" onClick={onReplay} className="calm-btn mt-3">
          <CIcon name="sparkle" size={15} /> Replay welcome
        </button>
      )}

      <h2 className="mb-2 mt-8 text-[13px] font-medium text-[rgb(var(--ink-rgb)/var(--ink-3-a))]">Apex API key</h2>
      <div className="calm-card p-4">
        <div className="flex items-center justify-between gap-3">
          <span className="min-w-0">
            <span className="block text-[14.5px] font-medium">{access.state === "active" ? (access.label ?? "Apex API key") : "Apex API is locked"}</span>
            <span className="mt-0.5 block text-[12.5px] text-[rgb(var(--ink-rgb)/var(--ink-3-a))]">{access.key ? access.message : "Local and uncensored models are free. A key unlocks cloud models."}</span>
          </span>
          <button type="button" className="calm-btn shrink-0" data-tone={access.state === "active" ? "sage" : undefined} onClick={onAccessKey}>
            <CIcon name={access.state === "active" ? "key" : "lock"} size={15} /> {access.key ? "Manage" : "Enter key"}
          </button>
        </div>
      </div>

      <h2 className="mb-2 mt-8 text-[13px] font-medium text-[rgb(var(--ink-rgb)/var(--ink-3-a))]">Assistant style</h2>
      <div className="flex flex-wrap gap-1.5">
        {cart.all.map((c) => (
          <button key={c.id} type="button" aria-pressed={cart.selected.id === c.id} onClick={() => cart.select(c.id)} className="min-h-10 rounded-full px-4 text-[13px] transition-colors" style={cart.selected.id === c.id ? { background: "var(--ink-solid)", color: "var(--canvas)" } : { background: "var(--surface-2)" }}>
            {c.name}
          </button>
        ))}
      </div>

      <h2 className="mb-2 mt-8 text-[13px] font-medium text-[rgb(var(--ink-rgb)/var(--ink-3-a))]">Voice & haptics</h2>
      <div className="calm-card p-4">
        <HapticsControl />
      </div>

      <h2 className="mb-2 mt-8 text-[13px] font-medium text-[rgb(var(--ink-rgb)/var(--ink-3-a))]">Version & updates</h2>
      <div className="calm-card p-4">
        <p className="text-[14.5px] font-medium">
          {update.s === "available" ? `Update available (${update.latest})` : update.s === "error" ? "Couldn't check for updates" : `Apex v${APP_VERSION} · ${update.s === "checking" ? "Checking…" : "Up to date"}`}
        </p>
        <p className="mt-0.5 text-[12.5px] text-[rgb(var(--ink-rgb)/var(--ink-3-a))]">
          {update.s === "uptodate" && `Latest release ${update.latest} · checked ${ago(update.at)}`}
          {update.s === "error" && update.msg}
          {update.s === "available" && `You're on v${APP_VERSION}. Checked ${ago(update.at)}.`}
          {update.s === "idle" && "Not checked yet."}
        </p>
        <div className="mt-3 grid gap-2">
          {update.s === "available" && (
            <button type="button" className="calm-btn w-full !h-12" data-primary="true" onClick={openUpdateModal}>
              <CIcon name="download" size={16} /> View update &amp; install APK
            </button>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="button" className="calm-btn" onClick={() => void checkForUpdate()} disabled={update.s === "checking"}>
              <CIcon name="refresh" size={15} /> Check for Updates
            </button>
            <button type="button" className="calm-btn" onClick={simulateUpdate}>
              <CIcon name="sparkle" size={15} /> Simulate Update Banner
            </button>
            <button type="button" className="calm-btn" onClick={openUpdateModal}>
              <CIcon name="download" size={15} /> Download latest APK
            </button>
            <a className="calm-btn" href={RELEASES_URL} target="_blank" rel="noreferrer">All releases</a>
          </div>
        </div>
      </div>

      <div className="calm-card mt-3 p-4">
        <p className="text-[14.5px] font-medium">Model & skill registry</p>
        <p className="mt-0.5 text-[12.5px] text-[rgb(var(--ink-rgb)/var(--ink-3-a))]">Pull the newest trending and uncensored model lists over the air — no new APK needed.</p>
        <button type="button" className="calm-btn mt-3" onClick={() => void syncRegistry()} disabled={syncing}>
          <CIcon name="refresh" size={15} /> {syncing ? "Syncing…" : "Sync registry"}
        </button>
        {sync && <p className="mt-2 text-[12.5px]" role="status">{sync}</p>}
      </div>
    </div>
  );
}
