"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { APP_VERSION } from "@/lib/version";
import { checkForUpdate, closeUpdateModal, compareSemver, dismissBanner, downloadApk, openUpdateModal, releaseOf, useUpdateUi, useUpdater } from "@/lib/updater";
import { CIcon } from "./icons";
import { Sheet } from "./Chrome";

const dim = "text-[rgb(var(--ink-rgb)/var(--ink-3-a))]";
const mb = (n: number) => (n > 0 ? `${(n / 1e6).toFixed(0)} MB` : "");

/** Dismissible pill below the safe-area header: `Update v1.0.0 Available · Tap to Install APK`. */
export function UpdateBanner() {
  const u = useUpdater();
  const ui = useUpdateUi();
  const show = u.s === "available" && ui.dismissed !== u.latest;
  return (
    <AnimatePresence>
      {show && u.s === "available" && (
        <motion.div key="upd" data-testid="update-banner" initial={{ opacity: 0, y: -10, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: 0.97 }} transition={{ type: "spring", stiffness: 420, damping: 32 }} className="relative z-10 mx-auto -mt-0.5 mb-1 flex w-[min(460px,calc(100%-24px))] items-center gap-1 rounded-full bg-[var(--halo-a)] p-1 pl-1 text-[var(--halo-ink)] shadow-[var(--specular),var(--shadow-card)]">
          <button type="button" onClick={openUpdateModal} className="flex min-h-10 min-w-0 flex-1 items-center gap-2.5 rounded-full px-3 text-left text-[13px] font-medium">
            <span className="relative grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--halo-ink)] text-[var(--canvas)]">
              <span className="upd-ping absolute inset-0 rounded-full" aria-hidden="true" />
              <CIcon name="download" size={13} />
            </span>
            <span className="min-w-0 truncate">
              Update {u.latest} Available <span className="opacity-60">·</span> Tap to Install APK
            </span>
          </button>
          <button type="button" onClick={dismissBanner} aria-label="Dismiss update banner" className="grid h-10 w-10 shrink-0 place-items-center rounded-full opacity-70 transition-opacity hover:opacity-100">
            <CIcon name="x" size={16} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Release modal: changelog, real download progress (or native hand-off), and Reinstall even when up to date. */
export function UpdateModal() {
  const u = useUpdater();
  const ui = useUpdateUi();
  const rel = releaseOf(u);
  const newer = u.s === "available";
  const [dl, setDl] = useState<{ loaded: number; total: number } | null>(null);
  const [msg, setMsg] = useState("");
  const install = async () => {
    setMsg("");
    setDl({ loaded: 0, total: rel.apkSize || 1 });
    const how = await downloadApk({ name: `apex-llm-${rel.tag}-arm64-v8a.apk`, size: rel.apkSize, url: rel.apkUrl }, (loaded, total) => setDl({ loaded, total }));
    setDl(null);
    setMsg(how === "saved" ? "Downloaded. Open the file to install it." : "Download started in your browser. When it finishes, tap it to open Android's installer.");
  };
  const pct = dl ? Math.min(100, (dl.loaded / Math.max(1, dl.total)) * 100) : 0;
  return (
    <Sheet open={ui.modal} onClose={closeUpdateModal} title={newer ? `Update ${rel.tag} available` : `Apex ${rel.tag}`}>
      <div className="px-2 pb-2 pt-1" data-testid="update-modal">
        <div className="flex items-center gap-2 text-[12.5px]">
          <span className="inline-flex h-7 items-center rounded-full bg-[var(--surface-2)] px-3 font-mono">v{APP_VERSION}</span>
          <CIcon name="chevron" size={12} className="-rotate-90 opacity-40" />
          <span className="inline-flex h-7 items-center rounded-full px-3 font-mono font-medium" style={{ background: "var(--halo-a)", color: "var(--halo-ink)" }}>{rel.tag}</span>
          {u.s === "available" && u.simulated && <span className={`ml-auto ${dim}`}>Simulated</span>}
        </div>
        <p className={`mt-3 text-[12px] font-medium uppercase tracking-[0.06em] ${dim}`}>What&apos;s new</p>
        <ul className="mt-1.5 space-y-1.5">
          {(rel.changelog.length ? rel.changelog : ["Bug fixes and polish."]).map((c) => (
            <li key={c} className="flex items-start gap-2.5 text-[13.5px] leading-snug">
              <CIcon name="check" size={14} className="mt-0.5 shrink-0 text-[var(--halo-ink)]" />
              <span>{c}</span>
            </li>
          ))}
        </ul>
        {dl && (
          <div className="mt-4" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label="APK download progress">
            <div className="meter"><i style={{ width: `${Math.max(3, pct)}%` }} /></div>
            <p className={`tnum mt-1 text-[12px] ${dim}`}>{(dl.loaded / 1e6).toFixed(1)} / {(dl.total / 1e6).toFixed(1)} MB</p>
          </div>
        )}
        <div className="mt-4 grid gap-2">
          {newer && (
            <button type="button" className="calm-btn w-full !h-12" data-primary="true" onClick={() => void install()} disabled={!!dl}>
              <CIcon name="download" size={16} /> Download &amp; Install APK {mb(rel.apkSize) && `· ${mb(rel.apkSize)}`}
            </button>
          )}
          <button type="button" className="calm-btn w-full" onClick={() => void install()} disabled={!!dl} data-primary={newer ? undefined : "true"}>
            <CIcon name="refresh" size={15} /> Download Latest APK anyway (Reinstall)
          </button>
          <div className="flex gap-2">
            <button type="button" className="calm-btn flex-1" onClick={() => void checkForUpdate()} disabled={u.s === "checking"}>
              <CIcon name="refresh" size={15} /> {u.s === "checking" ? "Checking…" : "Check again"}
            </button>
            <a className="calm-btn flex-1" href={rel.releaseUrl} target="_blank" rel="noreferrer">Release notes</a>
          </div>
        </div>
        {msg && <p className="mt-3 text-[12.5px] leading-snug" role="status">{msg}</p>}
        {!newer && compareSemver(rel.version, APP_VERSION) <= 0 && <p className={`mt-3 text-[12px] ${dim}`}>You&apos;re on the latest version. Reinstalling keeps your data when the signing key matches.</p>}
      </div>
    </Sheet>
  );
}
