"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ApexMark } from "@/components/calm/ApexMark";
import { CIcon } from "@/components/calm/icons";
import { buildSrcDoc, download, KIND_LABEL, type ArtifactKind } from "@/lib/artifacts";

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
function slideDoc(code: string, i: number): string {
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

type Tab = "phone" | "tablet" | "code";

/** Full-screen Live Artifact & Presentation Viewer. Sandboxed frame, device tabs, slide deck controls. */
export function LivePreviewViewer({ artifact, onClose }: { artifact: PreviewArtifact | null; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("phone");
  const [i, setI] = useState(0);
  const [svg, setSvg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const touch = useRef<number | null>(null);
  const n = artifact ? slideCount(artifact) : 0;

  useEffect(() => {
    setTab("phone");
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

  const doc = useMemo(() => {
    if (!artifact) return "";
    if (artifact.kind === "mermaid") return svg ? buildSrcDoc("svg", svg) : "";
    return n ? slideDoc(artifact.code, i) : buildSrcDoc(artifact.kind, artifact.code);
  }, [artifact, n, i, svg]);

  if (!artifact || typeof document === "undefined") return null;

  const exportPdf = () => {
    if (!n) return download("preview.html", buildSrcDoc(artifact.kind, artifact.code), "text/html");
    const w = window.open("", "_blank");
    if (!w) return download("presentation.html", printDoc(artifact.code), "text/html");
    w.document.open();
    w.document.write(printDoc(artifact.code));
    w.document.close();
    w.focus();
    window.setTimeout(() => w.print(), 400);
  };
  const full = () => void stage.current?.requestFullscreen?.().catch(() => undefined);
  const frameW = tab === "phone" ? 390 : 820;

  const tabs: { id: Tab; label: string; icon: "phone" | "sidebar" | "code" }[] = [
    { id: "phone", label: "Phone", icon: "phone" },
    { id: "tablet", label: "Tablet", icon: "sidebar" },
    { id: "code", label: "Code", icon: "code" },
  ];

  return createPortal(
    <div className="calm fixed inset-0 z-[100] flex flex-col bg-[var(--canvas)]" data-cmode={document.documentElement.dataset.cmode} role="dialog" aria-modal="true" aria-label="Live Preview" data-testid="live-preview-viewer" style={{ animation: `sel-in .45s ${EASE}` }}>
      <header className="flex items-center gap-2 px-3 pb-2 pt-safe">
        <button type="button" onClick={onClose} aria-label="Collapse back to chat" className="ibtn !h-11 !w-11 active:scale-[0.97]"><CIcon name="back" size={20} /></button>
        <div role="tablist" aria-label="Preview mode" className="mx-auto flex gap-1 rounded-full bg-[var(--surface-2)] p-1">
          {tabs.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className="flex min-h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium active:scale-[0.97]" style={{ transition: `background .35s ${EASE}, color .35s ${EASE}, transform .2s ${EASE}`, ...(tab === t.id ? { background: "var(--ink-solid)", color: "var(--canvas)" } : { color: "rgb(var(--ink-rgb)/var(--ink-3-a))" }) }}>
              <CIcon name={t.icon} size={14} />{t.label}
            </button>
          ))}
        </div>
        <button type="button" onClick={exportPdf} className="calm-btn !hidden sm:!inline-flex active:scale-[0.97]">Export to PDF</button>
        <button type="button" onClick={onClose} aria-label="Close" className="ibtn !h-11 !w-11 active:scale-[0.97]"><CIcon name="x" size={20} /></button>
      </header>

      <div ref={stage} className="relative min-h-0 flex-1 overflow-auto bg-[var(--canvas)]" onTouchStart={(e) => { touch.current = e.touches[0].clientX; }} onTouchEnd={(e) => { if (touch.current === null || !n) return; const dx = e.changedTouches[0].clientX - touch.current; touch.current = null; if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1); }}>
        {tab === "code" ? (
          <div className="mx-auto max-w-[820px] p-4">
            <div className="mb-2 flex justify-end"><button type="button" className="calm-btn active:scale-[0.97]" onClick={() => { void navigator.clipboard?.writeText(artifact.code); setCopied(true); window.setTimeout(() => setCopied(false), 1400); }}><CIcon name={copied ? "check" : "copy"} size={14} />{copied ? "Copied" : "Copy code"}</button></div>
            <pre className="mono overflow-auto rounded-[18px] bg-[var(--surface-2)] p-4 text-[12px] leading-[1.55]"><code>{artifact.code}</code></pre>
          </div>
        ) : (
          <div className="flex min-h-full items-center justify-center p-3">
            <div className="overflow-hidden rounded-[28px] bg-black shadow-[0_30px_80px_-30px_rgb(0_0_0/0.6)] ring-1 ring-[rgb(var(--ink-rgb)/0.12)]" style={{ width: `min(${frameW}px, 100%)`, height: tab === "phone" ? "min(780px, calc(100dvh - 190px))" : "min(620px, calc(100dvh - 190px))", transition: `width .5s ${EASE}, height .5s ${EASE}` }}>
              {doc ? <iframe key={n ? `s${i}` : "doc"} title="Live preview" sandbox="allow-scripts" srcDoc={doc} className="h-full w-full border-0 bg-[#0b0b10]" /> : <div className={`grid h-full place-items-center text-[13px] ${dim}`}>Rendering…</div>}
            </div>
          </div>
        )}
      </div>

      {n > 0 && tab !== "code" && (
        <footer className="flex items-center justify-between gap-2 px-3 pb-safe pt-2" data-testid="deck-controls">
          <button type="button" onClick={() => go(-1)} disabled={i === 0} aria-label="Previous slide" className="ibtn !h-11 !w-11 disabled:opacity-30 active:scale-[0.97]"><CIcon name="back" size={20} /></button>
          <div className="flex items-center gap-2">
            <span className="tnum text-[13.5px] font-medium" aria-live="polite">Slide {i + 1} of {n}</span>
            <button type="button" onClick={full} className="calm-btn active:scale-[0.97]" aria-label="Fullscreen deck">Fullscreen</button>
            <button type="button" onClick={exportPdf} className="calm-btn sm:!hidden active:scale-[0.97]">Export to PDF</button>
          </div>
          <button type="button" onClick={() => go(1)} disabled={i === n - 1} aria-label="Next slide" className="ibtn !h-11 !w-11 disabled:opacity-30 active:scale-[0.97]"><CIcon name="arrow" size={20} /></button>
        </footer>
      )}
    </div>,
    document.body,
  );
}
