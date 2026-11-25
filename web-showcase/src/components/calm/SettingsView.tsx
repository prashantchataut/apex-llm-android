"use client";

import { useState } from "react";
import { HapticsControl } from "@/components/theme/HapticsControl";
import type { useCartridges } from "@/lib/cartridges";
import { CATALOG, registerModel, type CatalogModel } from "@/lib/models";
import type { CalmMode } from "@/lib/store";
import { REGISTRY_URL, ago, checkForUpdate, downloadApk, type UpdateState } from "@/lib/updater";
import { APP_VERSION } from "@/lib/version";
import { RELEASES_URL } from "@/lib/site";
import { CIcon } from "./icons";
import { ViewTitle } from "./Chrome";

const fmtMb = (b: number) => `${(b / 1e6).toFixed(1)} MB`;

export function SettingsView({ mode, setMode, cart, update }: { mode: CalmMode; setMode: (m: CalmMode) => void; cart: ReturnType<typeof useCartridges>; update: UpdateState }) {
  const [dl, setDl] = useState<{ loaded: number; total: number } | null>(null);
  const [dlMsg, setDlMsg] = useState("");
  const [sync, setSync] = useState<string>("");
  const [syncing, setSyncing] = useState(false);

  const install = async () => {
    if (update.s !== "available" || !update.apk) return;
    setDlMsg("");
    const r = await downloadApk(update.apk, (loaded, total) => setDl({ loaded, total }));
    setDl(null);
    setDlMsg(r === "saved" ? "Downloaded — open the file to install." : "Handed to your browser's downloader — open the APK when it finishes.");
  };

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
    { id: "light", label: "Porcelain Dawn", sub: "Light", icon: "sun" },
    { id: "dark", label: "Soft Carbon", sub: "Dark", icon: "moon" },
    { id: "system", label: "Match device", sub: "Auto", icon: "gear" },
  ];

  return (
    <div className="mx-auto w-full max-w-[720px] px-5 pb-10 pt-3">
      <ViewTitle title="Settings" sub="Appearance, voice and updates." />

      <h2 className="mb-2 text-[13px] font-medium text-[rgb(var(--ink-rgb)/var(--ink-3-a))]">Theme</h2>
      <div role="radiogroup" aria-label="Theme" className="grid grid-cols-3 gap-2">
        {MODES.map((m) => (
          <button key={m.id} type="button" role="radio" aria-checked={mode === m.id} onClick={() => setMode(m.id)} className="calm-card flex min-h-[84px] flex-col items-start justify-between p-3 text-left" style={mode === m.id ? { outline: "2px solid var(--accent)", outlineOffset: -1 } : undefined}>
            <CIcon name={m.icon} size={18} />
            <span>
              <span className="block text-[13px] font-medium leading-tight">{m.label}</span>
              <span className="block text-[11.5px] text-[rgb(var(--ink-rgb)/var(--ink-3-a))]">{m.sub}</span>
            </span>
          </button>
        ))}
      </div>

      <h2 className="mb-2 mt-8 text-[13px] font-medium text-[rgb(var(--ink-rgb)/var(--ink-3-a))]">Assistant style</h2>
      <div className="flex flex-wrap gap-1.5">
        {cart.all.map((c) => (
          <button key={c.id} type="button" aria-pressed={cart.selected.id === c.id} onClick={() => cart.select(c.id)} className="min-h-10 rounded-full border px-3.5 text-[13px]" style={cart.selected.id === c.id ? { background: "var(--ink-solid)", color: "var(--canvas)", borderColor: "transparent" } : { background: "var(--surface)", borderColor: "var(--hairline-strong)" }}>
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
          {update.s === "available" ? `✨ Update available (${update.latest})` : update.s === "error" ? "⚠️ Couldn't check for updates" : `✅ Apex v${APP_VERSION} · ${update.s === "checking" ? "Checking…" : "Up to date"}`}
        </p>
        <p className="mt-0.5 text-[12.5px] text-[rgb(var(--ink-rgb)/var(--ink-3-a))]">
          {update.s === "uptodate" && `Latest release ${update.latest} · checked ${ago(update.at)}`}
          {update.s === "error" && update.msg}
          {update.s === "available" && `You're on v${APP_VERSION}. Checked ${ago(update.at)}.`}
          {update.s === "idle" && "Not checked yet."}
        </p>
        {update.s === "available" && (
          <div className="mt-3">
            {update.notes && <p className="mb-3 max-h-28 overflow-y-auto whitespace-pre-wrap rounded-xl bg-[var(--surface-2)] p-3 text-[12.5px] leading-relaxed">{update.notes}</p>}
            {dl && (
              <div className="mb-2">
                <div className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-2)]">
                  <div className="h-full bg-[var(--accent)]" style={{ width: `${(dl.loaded / Math.max(1, dl.total)) * 100}%` }} />
                </div>
                <p className="tnum mt-1 text-[12px]">{fmtMb(dl.loaded)} / {fmtMb(dl.total)}</p>
              </div>
            )}
            {update.apk ? (
              <button type="button" className="calm-btn w-full !h-12" data-primary="true" onClick={() => void install()}>
                <CIcon name="download" size={16} /> Download &amp; install APK · {fmtMb(update.apk.size)}
              </button>
            ) : (
              <a className="calm-btn w-full" href={update.page} target="_blank" rel="noreferrer">View release</a>
            )}
            {dlMsg && <p className="mt-2 text-[12.5px]">{dlMsg}</p>}
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className="calm-btn" onClick={() => void checkForUpdate()} disabled={update.s === "checking"}>
            <CIcon name="refresh" size={15} /> Check now
          </button>
          <a className="calm-btn" href={RELEASES_URL} target="_blank" rel="noreferrer">All releases</a>
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
