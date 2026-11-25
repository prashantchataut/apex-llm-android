"use client";

import { AnimatePresence, motion } from "framer-motion";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { haptic } from "@/lib/haptics";
import { REPO, RELEASES_URL } from "@/lib/site";

export const APK_VERSION = "v0.4.0";
const API = `https://api.github.com/repos/${REPO}/releases/tags/${APK_VERSION}`;

interface Asset {
  name: string;
  size: number;
  url: string;
  sha256: string | null;
}
type State = { s: "loading" } | { s: "ready"; asset: Asset } | { s: "pending" };

/** Reads the live GitHub Release: the file name, size, direct URL and SHA-256 digest come from GitHub, never hard-coded. */
function useRelease(enabled: boolean): State {
  const [st, setSt] = useState<State>({ s: "loading" });
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    fetch(API, { headers: { Accept: "application/vnd.github+json" } })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: { assets?: { name: string; size: number; browser_download_url: string; digest?: string | null }[] }) => {
        const a = j.assets?.find((x) => x.name.endsWith(".apk"));
        if (!live) return;
        setSt(a ? { s: "ready", asset: { name: a.name, size: a.size, url: a.browser_download_url, sha256: a.digest?.startsWith("sha256:") ? a.digest.slice(7) : null } } : { s: "pending" });
      })
      .catch(() => live && setSt({ s: "pending" }));
    return () => {
      live = false;
    };
  }, [enabled]);
  return st;
}

function Badge({ children, tone = "" }: { children: React.ReactNode; tone?: string }) {
  return <span className={`mono inline-flex h-7 items-center rounded-full border border-white/15 bg-white/[0.07] px-3 text-[10.5px] uppercase tracking-[0.12em] text-ink-2 ${tone}`}>{children}</span>;
}

function Qr({ url }: { url: string }) {
  const [svg, setSvg] = useState("");
  useEffect(() => {
    let live = true;
    QRCode.toString(url, { type: "svg", margin: 1, color: { dark: "#0b0b10", light: "#ffffff" } }).then((x) => live && setSvg(x));
    return () => {
      live = false;
    };
  }, [url]);
  return <div className="hidden h-[116px] w-[116px] shrink-0 overflow-hidden rounded-xl bg-white p-1 sm:block [&>svg]:h-full [&>svg]:w-full" role="img" aria-label="QR code for the APK download link" dangerouslySetInnerHTML={{ __html: svg }} />;
}

function Modal({ onClose }: { onClose: () => void }) {
  const st = useRelease(true);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  const asset = st.s === "ready" ? st.asset : null;
  const href = asset?.url ?? `${RELEASES_URL}/tag/${APK_VERSION}`;
  return (
    <motion.div className="fixed inset-0 z-[100] grid place-items-end bg-black/60 p-3 backdrop-blur-md sm:place-items-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="Download Apex LLM for Android"
        onClick={(e) => e.stopPropagation()}
        initial={{ y: 60, scale: 0.96, opacity: 0 }}
        animate={{ y: 0, scale: 1, opacity: 1 }}
        exit={{ y: 40, opacity: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="glass-dark w-full max-w-[520px] rounded-[28px] p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="mono text-[10.5px] uppercase tracking-[0.18em] text-ink-3">Android · sideload</div>
            <h3 className="display mt-1 text-[28px] leading-[1.05]">Apex LLM {APK_VERSION}</h3>
          </div>
          <button onClick={onClose} aria-label="Close" className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/[0.08]">
            <Icon name="x" size={18} />
          </button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Badge>ARM64 · arm64-v8a</Badge>
          <Badge>Android 8.0+</Badge>
          <Badge tone="!text-warn">Alpha</Badge>
          {asset && <Badge>{(asset.size / 1048576).toFixed(0)} MB</Badge>}
        </div>

        <div className="mt-5 flex items-center gap-4">
          <div className="min-w-0 flex-1">
            <div className="mono text-[10px] uppercase tracking-[0.16em] text-ink-3">SHA-256</div>
            {st.s === "loading" && <p className="mt-1 text-[13px] text-ink-3">Reading the release from GitHub…</p>}
            {st.s === "pending" && <p className="mt-1 text-[13px] leading-snug text-ink-2">The {APK_VERSION} build is not published yet. The release page lists it as soon as CI finishes.</p>}
            {asset && (
              <button
                onClick={async () => {
                  if (!asset.sha256) return;
                  try {
                    await navigator.clipboard.writeText(asset.sha256);
                    setCopied(true);
                    haptic("detentClick");
                    window.setTimeout(() => setCopied(false), 1400);
                  } catch {
                    /* clipboard unavailable */
                  }
                }}
                className="mono mt-1 block w-full break-all rounded-xl bg-black/30 p-2.5 text-left text-[11px] leading-relaxed text-ink-2"
                aria-label="Copy SHA-256 checksum"
              >
                {asset.sha256 ?? "Checksum is on the release page"}
                {asset.sha256 && <span className="ml-2 text-ok">{copied ? "copied" : "tap to copy"}</span>}
              </button>
            )}
          </div>
          {asset && <Qr url={asset.url} />}
        </div>

        <a
          href={href}
          onClick={() => haptic("heavyLock")}
          className="mt-5 flex min-h-[52px] items-center justify-center gap-2 rounded-full bg-white px-6 text-[15px] font-semibold text-black transition-transform active:scale-[0.98]"
        >
          <Icon name="download" size={18} /> {asset ? `Download ${asset.name}` : "Open the release page"}
        </a>
        <ol className="mt-5 space-y-1.5 text-[12.5px] leading-snug text-ink-3">
          <li>1. Open the file on your phone and allow “Install unknown apps” for your browser.</li>
          <li>2. First launch: pick the Instant Nano model (145 MB) and start chatting offline.</li>
          <li>3. Alpha builds are signed with a per-build key — uninstall the previous alpha before installing a newer one.</li>
        </ol>
      </motion.div>
    </motion.div>
  );
}

export function ApkDownload({ variant = "hero", label }: { variant?: "hero" | "nav"; label?: string }) {
  const [open, setOpen] = useState(false);
  const cls =
    variant === "nav"
      ? "flex h-11 items-center gap-1.5 rounded-full bg-white px-4 text-[13px] font-semibold text-black transition-transform active:scale-[0.97]"
      : "group relative flex min-h-[52px] items-center gap-2.5 overflow-hidden rounded-full bg-white px-6 text-[15px] font-semibold text-black transition-transform hover:scale-[1.03] active:scale-95";
  return (
    <>
      <button
        onClick={() => {
          haptic("detentClick");
          setOpen(true);
        }}
        className={cls}
      >
        {variant === "hero" && <span aria-hidden className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-black/10 to-transparent transition-transform duration-700 group-hover:translate-x-full" />}
        <Icon name="download" size={variant === "nav" ? 15 : 18} />
        <span className="relative">{label ?? `Download Android APK · ${APK_VERSION}`}</span>
      </button>
      <AnimatePresence>{open && <Modal onClose={() => setOpen(false)} />}</AnimatePresence>
    </>
  );
}
