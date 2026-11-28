"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ApexMark } from "@/components/calm/ApexMark";
import { CIcon } from "@/components/calm/icons";
import { buildSrcDoc, download, KIND_LABEL, type ArtifactKind } from "@/lib/artifacts";
import { buildPptx, parseDeck, pptxName } from "@/services/pptxGenerator";

const EASE = "cubic-bezier(0.23,1,0.32,1)";
const dim = "text-[rgb(var(--ink-rgb)/var(--ink-3-a))]";

export interface PreviewArtifact {
  kind: ArtifactKind;
  lang: string;
  code: string;
}

const SLIDE_SEL = "section.slide, .slide, section[data-slide]";

/** Presentation = an HTML document with 2+ slide elements. */
export function slideCount(a: PreviewArtifact): number {
  if (a.kind !== "html") return 0;
  const n = (a.code.match(/<(section|div)[^>]*(class=["'][^"']*\bslide\b|data-slide)/gi) ?? []).length;
  return n >= 2 ? n : 0;
}

/** Same document, but only slide `i` visible. Runs inside the sandboxed iframe. */
export function slideDoc(code: string, i: number): string {
  const base = buildSrcDoc("html", code);
  const script = `<script>(function(){var s=[].slice.call(document.querySelectorAll(${JSON.stringify(SLIDE_SEL)}));s.forEach(function(e,k){if(k===${i}){e.classList.add('active');e.hidden=false;e.style.opacity='1';e.style.visibility='visible';e.style.transform='none';e.style.position='relative';if(getComputedStyle(e).display==='none')e.style.display='flex'}else{e.style.display='none'}});document.documentElement.style.overflow='hidden'})()<\/script>`;
  return /<\/body>/i.test(base) ? base.replace(/<\/body>/i, `${script}</body>`) : base + script;
}

/** Print-safe copy for "Export to PDF": every slide on its own landscape page, scripts removed. */
function printDoc(code: string): string {
  const base = buildSrcDoc("html", code).replace(/<script[\s\S]*?<\/script>/gi, "");
  const css = `<style>@page{size:landscape;margin:0}@media print{${SLIDE_SEL}{display:flex!important;opacity:1!important;visibility:visible!important;transform:none!important;position:relative!important;page-break-after:always;break-after:page;min-height:100vh;box-sizing:border-box}}</style>`;
  return /<\/head>/i.test(base) ? base.replace(/<\/head>/i, `${css}</head>`) : css + base;
}

/** Inline card inside a chat message: a framed live thumbnail with an "Open Preview" accent pill. */
export function LivePreviewCard({ artifact, onOpen }: { artifact: PreviewArtifact; onOpen: (a: PreviewArtifact) => void }) {
  const n = slideCount(artifact);
  const doc = useMemo(() => (artifact.kind === "mermaid" ? "" : n ? slideDoc(artifact.code, 0) : buildSrcDoc(artifact.kind, artifact.code)), [artifact, n]);
  return (
    <div className="group relative overflow-hidden rounded-[22px] bg-[var(--surface-2)] ring-1 ring-[rgb(var(--ink-rgb)/0.08)]" data-testid="live-preview-card">
      <div className="flex items-center justify-between px-3.5 pb-2 pt-3 text-[12px]">
        <span className="flex items-center gap-2 font-medium"><ApexMark size={18} />{n ? `Presentation · ${n} slides` : KIND_LABEL[artifact.kind]}</span>
        <span className={dim}>Live preview</span>
      </div>
      <button type="button" onClick={() => onOpen(artifact)} aria-label="Open Preview" className="relative block h-[200px] w-full overflow-hidden text-left active:scale-[0.99]" style={{ transition: `transform .3s ${EASE}` }}>
        {doc ? (
          <iframe title="Preview" sandbox="allow-scripts" srcDoc={doc} tabIndex={-1} className="pointer-events-none absolute left-0 top-0 origin-top-left border-0 bg-[#0b0b10]" style={{ width: "250%", height: "250%", transform: "scale(0.4)" }} />
        ) : (
          <span className={`grid h-full place-items-center text-[13px] ${dim}`}>Diagram preview opens full screen</span>
        )}
        <span className="absolute inset-0 grid place-items-end justify-items-center bg-gradient-to-t from-black/45 via-transparent to-transparent p-3 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100" style={{ transition: `opacity .35s ${EASE}` }}>
          <span className="flex h-9 items-center gap-1.5 rounded-full bg-[var(--ink-solid)] px-4 text-[13px] font-medium text-[var(--canvas)] shadow-lg">Open Preview <CIcon name="arrow" size={14} /></span>
        </span>
      </button>
    </div>
  );
}

type Device = "phone" | "desktop";

const chipCls = "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-medium active:scale-[0.97]";

/**
 * Virtual Localhost: compiles the artifact into an isolated Blob URL and serves it in a sandboxed iframe, with a browser-style
 * toolbar (address bar, live reload, phone/desktop, source, fullscreen, .html and .pptx downloads) and slide-deck controls.
 * The frame has no `allow-same-origin`, so generated code can never reach the app's storage.
 */
export function LivePreviewServer({ artifact, onClose }: { artifact: PreviewArtifact | null; onClose: () => void }) {
  const [device, setDevice] = useState<Device>("phone");
  const [source, setSource] = useState(false);
  const [i, setI] = useState(0);
  const [nonce, setNonce] = useState(0);
  const [svg, setSvg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState("");
  const stage = useRef<HTMLDivElement>(null);
  const touch = useRef<number | null>(null);
  const n = artifact ? slideCount(artifact) : 0;

  useEffect(() => {
    setDevice("phone");
    setSource(false);
    setI(0);
    setSvg(null);
    if (artifact?.kind !== "mermaid") return;
    let live = true;
    void (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({ startOnLoad: false, theme: "dark", securityLevel: "strict" });
        const out = await mermaid.render(`apex-lp-${Date.now()}`, artifact.code);
        if (live) setSvg(out.svg);
      } catch {
        if (live) setSvg(`<p style="color:#f88;font:14px sans-serif;padding:16px">This diagram could not be parsed.</p>`);
      }
    })();
    return () => {
      live = false;
    };
  }, [artifact]);

  const go = useCallback((d: number) => setI((c) => Math.max(0, Math.min(n - 1, c + d))), [n]);
  useEffect(() => {
    if (!artifact) return;
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (n && (e.key === "ArrowRight" || e.key === " ")) go(1);
      else if (n && e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [artifact, n, go, onClose]);

  const compiled = useMemo(() => {
    if (!artifact) return "";
    if (artifact.kind === "mermaid") return svg ? buildSrcDoc("svg", svg) : "";
    return n ? slideDoc(artifact.code, i) : buildSrcDoc(artifact.kind, artifact.code);
  }, [artifact, n, i, svg]);

  // Serve: one Blob URL per compiled document (and per Live Reload), revoked when replaced.
  useEffect(() => {
    if (!compiled) {
      setUrl("");
      return;
    }
    const u = URL.createObjectURL(new Blob([compiled], { type: "text/html" }));
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [compiled, nonce]);

  if (!artifact || typeof document === "undefined") return null;

  const file = (ext: string) => `apex-preview.${ext}`;
  const dlHtml = () => download(file("html"), buildSrcDoc(artifact.kind === "mermaid" ? "svg" : artifact.kind, artifact.kind === "mermaid" ? svg ?? "" : artifact.code), "text/html");
  const dlPptx = async () => {
    const d = parseDeck(artifact.code, "html");
    if (!d) return;
    setBusy(true);
    try {
      download(pptxName(d), await buildPptx(d), "application/vnd.openxmlformats-officedocument.presentationml.presentation");
    } finally {
      setBusy(false);
    }
  };
  const full = () => void stage.current?.requestFullscreen?.().catch(() => undefined);
  const frameW = device === "phone" ? 390 : 1100;
  const on = (v: boolean) => (v ? { background: "var(--ink-solid)", color: "var(--canvas)" } : { background: "var(--surface-2)" });

  return createPortal(
    <div className="calm fixed inset-0 z-[100] flex flex-col bg-[var(--canvas)]" data-cmode={document.documentElement.dataset.cmode} role="dialog" aria-modal="true" aria-label="Virtual Localhost" data-testid="live-preview-viewer" style={{ animation: `sel-in .45s ${EASE}` }}>
      <header className="px-3 pb-1.5 pt-safe">
        <div className="flex items-center gap-2">
          <button type="button" onClick={onClose} aria-label="Collapse back to chat" className="ibtn !h-10 !w-10 shrink-0 active:scale-[0.97]"><CIcon name="back" size={19} /></button>
          <div className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-full bg-[var(--surface-2)] px-3.5 text-[13px]" data-testid="localhost-address">
            <span className="relative flex h-2 w-2 shrink-0"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#34d399] opacity-50" /><span className="relative inline-flex h-2 w-2 rounded-full bg-[#34d399]" /></span>
            <span className="mono truncate">localhost:3000/preview</span>
            {n > 0 && <span className={`ml-auto shrink-0 text-[12px] tnum ${dim}`}>{i + 1}/{n}</span>}
          </div>
          <button type="button" onClick={() => setNonce((v) => v + 1)} aria-label="Live reload" className="ibtn !h-10 !w-10 shrink-0 active:scale-[0.97]" data-testid="live-reload"><CIcon name="refresh" size={17} /></button>
          <button type="button" onClick={onClose} aria-label="Close" className="ibtn !h-10 !w-10 shrink-0 active:scale-[0.97]"><CIcon name="x" size={19} /></button>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5" role="toolbar" aria-label="Preview tools">
          <button type="button" className={chipCls} style={on(device === "phone")} aria-pressed={device === "phone"} onClick={() => setDevice("phone")}><CIcon name="phone" size={13} />Phone</button>
          <button type="button" className={chipCls} style={on(device === "desktop")} aria-pressed={device === "desktop"} onClick={() => setDevice("desktop")}><CIcon name="sidebar" size={13} />Desktop</button>
          <button type="button" className={chipCls} style={on(source)} aria-pressed={source} onClick={() => setSource((v) => !v)} data-testid="view-source"><CIcon name="code" size={13} />Source</button>
          <button type="button" className={chipCls} style={on(false)} onClick={full} data-testid="fullscreen"><CIcon name="expand" size={13} />Fullscreen</button>
          <button type="button" className={chipCls} style={on(false)} onClick={dlHtml} data-testid="download-html"><CIcon name="download" size={13} />.HTML</button>
          {n > 0 && <button type="button" disabled={busy} className={chipCls} style={on(false)} onClick={() => void dlPptx()} data-testid="viewer-download-pptx"><CIcon name="download" size={13} />{busy ? "Building" : ".PPTX"}</button>}
        </div>
      </header>

      <div ref={stage} className="relative min-h-0 flex-1 overflow-auto bg-[var(--canvas)]" onTouchStart={(e) => { touch.current = e.touches[0].clientX; }} onTouchEnd={(e) => { if (touch.current === null || !n) return; const dx = e.changedTouches[0].clientX - touch.current; touch.current = null; if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1); }}>
        {source ? (
          <div className="mx-auto max-w-[900px] p-4">
            <div className="mb-2 flex justify-end"><button type="button" className="calm-btn active:scale-[0.97]" onClick={() => { void navigator.clipboard?.writeText(artifact.code); setCopied(true); window.setTimeout(() => setCopied(false), 1400); }}><CIcon name={copied ? "check" : "copy"} size={14} />{copied ? "Copied" : "Copy code"}</button></div>
            <pre className="mono overflow-auto rounded-[18px] bg-[var(--surface-2)] p-4 text-[12px] leading-[1.55]"><code>{artifact.code}</code></pre>
          </div>
        ) : (
          <div className="flex min-h-full items-center justify-center p-3">
            <div className="overflow-hidden rounded-[24px] bg-black shadow-[0_30px_80px_-30px_rgb(0_0_0/0.6)] ring-1 ring-[rgb(var(--ink-rgb)/0.12)]" style={{ width: `min(${frameW}px, 100%)`, height: device === "phone" ? "min(780px, calc(100dvh - 190px))" : "min(680px, calc(100dvh - 190px))", transform: "translateZ(0)" }}>
              {url ? <iframe key={url} title="Virtual Localhost" sandbox="allow-scripts allow-modals allow-forms allow-popups" src={url} className="h-full w-full border-0 bg-[#0b0b10]" data-testid="preview-frame" /> : <div className={`grid h-full place-items-center text-[13px] ${dim}`}>Rendering diagram</div>}
            </div>
          </div>
        )}
      </div>

      {n > 0 && !source && (
        <footer className="flex items-center justify-center gap-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-2">
          <button type="button" onClick={() => go(-1)} disabled={i === 0} aria-label="Previous slide" className="ibtn !h-10 !w-10 disabled:opacity-30 active:scale-[0.97]"><CIcon name="back" size={18} /></button>
          <div className="flex items-center gap-1.5" role="tablist" aria-label="Slides">
            {Array.from({ length: n }, (_, k) => (
              <button key={k} type="button" role="tab" aria-selected={k === i} aria-label={`Slide ${k + 1}`} onClick={() => setI(k)} className="h-2 rounded-full" style={{ width: k === i ? 22 : 8, background: k === i ? "var(--ink-solid)" : "rgb(var(--ink-rgb)/0.25)", transition: `width .3s ${EASE}, background .3s ${EASE}` }} />
            ))}
          </div>
          <button type="button" onClick={() => go(1)} disabled={i === n - 1} aria-label="Next slide" className="ibtn !h-10 !w-10 disabled:opacity-30 active:scale-[0.97]"><CIcon name="arrow" size={18} /></button>
        </footer>
      )}
    </div>,
    document.body,
  );
}
