"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { assetUrl } from "@/lib/paths";
import { chunkText, estimateTokens, type Attachment } from "@/lib/attachments";

/* pdf.js is loaded on demand (≈400 KB) and its worker is our own vendored copy: works offline, no CDN. */
type PdfDoc = import("pdfjs-dist").PDFDocumentProxy;
let libPromise: Promise<typeof import("pdfjs-dist")> | null = null;
function lib() {
  libPromise ??= import("pdfjs-dist/legacy/build/pdf.mjs").then((m) => {
    m.GlobalWorkerOptions.workerSrc = assetUrl("vendor/pdfjs/pdf.worker.min.mjs");
    return m as unknown as typeof import("pdfjs-dist");
  });
  return libPromise;
}

const dim = "text-[rgb(var(--ink-rgb)/var(--ink-3-a))]";
const MAX_CONTEXT_CHARS = 24_000;

interface Hit {
  page: number;
  snippet: string;
}

/** Full-screen PDF reader: pages, zoom, jump-to-page, text search, "Summarize" and "Ask AI about this PDF". Runs entirely on-device. */
export function PdfViewer({ file, onClose, onAsk }: { file: File; onClose: () => void; onAsk: (prompt: string, att: Attachment) => void }) {
  const [doc, setDoc] = useState<PdfDoc | null>(null);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [err, setErr] = useState("");
  const [jump, setJump] = useState("1");
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [searching, setSearching] = useState(false);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const pageText = useRef<string[]>([]);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let dead = false;
    let loaded: PdfDoc | null = null;
    (async () => {
      try {
        const pdfjs = await lib();
        const data = new Uint8Array(await file.arrayBuffer());
        loaded = await pdfjs.getDocument({ data }).promise;
        if (!dead) setDoc(loaded);
      } catch (e) {
        if (!dead) setErr(e instanceof Error ? e.message : "This PDF could not be opened.");
      }
    })();
    return () => {
      dead = true;
      void loaded?.destroy();
    };
  }, [file]);

  // render the current page
  useEffect(() => {
    if (!doc || !canvas.current) return;
    let task: { cancel: () => void; promise: Promise<unknown> } | null = null;
    let dead = false;
    (async () => {
      const pg = await doc.getPage(page);
      if (dead || !canvas.current) return;
      const avail = (wrap.current?.clientWidth ?? 360) - 24;
      const base = pg.getViewport({ scale: 1 });
      const scale = (avail / base.width) * zoom;
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      const vp = pg.getViewport({ scale: scale * dpr });
      const c = canvas.current;
      c.width = Math.floor(vp.width);
      c.height = Math.floor(vp.height);
      c.style.width = `${Math.floor(vp.width / dpr)}px`;
      c.style.height = `${Math.floor(vp.height / dpr)}px`;
      const ctx = c.getContext("2d");
      if (!ctx) return;
      task = pg.render({ canvasContext: ctx, viewport: vp });
      await task.promise.catch(() => undefined);
    })();
    return () => {
      dead = true;
      task?.cancel();
    };
  }, [doc, page, zoom]);

  const go = useCallback(
    (n: number) => {
      if (!doc) return;
      const v = Math.min(Math.max(1, Math.round(n)), doc.numPages);
      setPage(v);
      setJump(String(v));
      wrap.current?.scrollTo({ top: 0 });
    },
    [doc],
  );

  /** Text of every page (cached); used for search, summary and Q&A. */
  const allText = useCallback(async (): Promise<string[]> => {
    if (!doc) return [];
    if (pageText.current.length === doc.numPages) return pageText.current;
    const out: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const pg = await doc.getPage(i);
      const tc = await pg.getTextContent();
      out.push(tc.items.map((it) => ("str" in it ? it.str : "")).join(" ").replace(/\s+/g, " ").trim());
    }
    pageText.current = out;
    return out;
  }, [doc]);

  const search = async () => {
    const term = q.trim().toLowerCase();
    if (!term) return setHits([]);
    setSearching(true);
    const pages = await allText();
    const found: Hit[] = [];
    pages.forEach((t, i) => {
      const at = t.toLowerCase().indexOf(term);
      if (at >= 0) found.push({ page: i + 1, snippet: `${at > 30 ? "…" : ""}${t.slice(Math.max(0, at - 30), at + term.length + 50)}…` });
    });
    setHits(found);
    setSearching(false);
    if (found[0]) go(found[0].page);
  };

  const ask = async (prompt: string) => {
    setBusy(true);
    const pages = await allText();
    const text = pages.map((t, i) => `[Page ${i + 1}]\n${t}`).join("\n\n");
    if (!text.replace(/\[Page \d+\]/g, "").trim()) {
      setBusy(false);
      return setErr("This PDF has no selectable text (scanned or encrypted), so there is nothing to send to the model.");
    }
    const clipped = text.length > MAX_CONTEXT_CHARS ? `${text.slice(0, MAX_CONTEXT_CHARS)}\n\n[Truncated: first ${MAX_CONTEXT_CHARS.toLocaleString()} characters of ${text.length.toLocaleString()}]` : text;
    const att: Attachment = { id: Math.random().toString(36).slice(2, 9), kind: "text", name: file.name, size: file.size, tokens: estimateTokens(clipped), chunks: chunkText(clipped, 2400) };
    setBusy(false);
    onAsk(prompt, att);
  };

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === "ArrowRight") go(page + 1);
      if (e.key === "ArrowLeft") go(page - 1);
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [go, onClose, page]);

  const n = doc?.numPages ?? 0;
  const tbtn = "grid h-10 min-w-10 place-items-center rounded-full bg-[var(--surface-2)] px-3 text-[13px] font-medium active:scale-[0.96] disabled:opacity-40";

  return (
    <div role="dialog" aria-modal="true" aria-label={`PDF reader: ${file.name}`} data-testid="pdf-viewer" className="fixed inset-0 z-[70] flex flex-col" style={{ background: "var(--bg, #0b0c10)", paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}>
      <header className="flex items-center gap-2 px-3 py-2">
        <button type="button" className={tbtn} onClick={onClose} aria-label="Close PDF reader">Close</button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-medium">{file.name}</p>
          <p className={`text-[11.5px] tabular-nums ${dim}`}>{doc ? `${n} page${n === 1 ? "" : "s"} · ${(file.size / 1048576).toFixed(1)} MB · on-device` : err ? "Could not open" : "Opening…"}</p>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2 px-3 pb-2">
        <button type="button" className={tbtn} onClick={() => go(page - 1)} disabled={page <= 1} aria-label="Previous page">‹</button>
        <form className="flex items-center gap-1.5" onSubmit={(e) => { e.preventDefault(); go(Number(jump) || 1); }}>
          <input value={jump} onChange={(e) => setJump(e.target.value.replace(/\D/g, ""))} inputMode="numeric" aria-label="Jump to page" data-testid="pdf-jump" className="h-10 w-14 rounded-full bg-[var(--surface-2)] text-center text-[13px] tabular-nums outline-none" />
          <span className={`text-[13px] tabular-nums ${dim}`}>/ {n || "–"}</span>
        </form>
        <button type="button" className={tbtn} onClick={() => go(page + 1)} disabled={!n || page >= n} aria-label="Next page">›</button>
        <span className="flex-1" />
        <button type="button" className={tbtn} onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))} aria-label="Zoom out">−</button>
        <span className={`w-12 text-center text-[12.5px] tabular-nums ${dim}`}>{Math.round(zoom * 100)}%</span>
        <button type="button" className={tbtn} onClick={() => setZoom((z) => Math.min(4, +(z + 0.25).toFixed(2)))} aria-label="Zoom in">+</button>
      </div>

      <form className="flex gap-2 px-3 pb-2" onSubmit={(e) => { e.preventDefault(); void search(); }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search text in this PDF" aria-label="Search text in PDF" data-testid="pdf-search" className="h-10 min-w-0 flex-1 rounded-full bg-[var(--surface-2)] px-4 text-[13.5px] outline-none" />
        <button type="submit" className={tbtn} disabled={!doc || searching}>{searching ? "…" : "Find"}</button>
      </form>
      {hits.length > 0 && (
        <ul className="mx-3 mb-2 max-h-24 space-y-1 overflow-y-auto" data-testid="pdf-hits">
          {hits.slice(0, 20).map((h) => (
            <li key={h.page}>
              <button type="button" onClick={() => go(h.page)} className="w-full truncate rounded-xl bg-[var(--surface-2)] px-3 py-1.5 text-left text-[12px]"><b className="tabular-nums">p.{h.page}</b> <span className={dim}>{h.snippet}</span></button>
            </li>
          ))}
        </ul>
      )}
      {q && !searching && hits.length === 0 && doc && pageText.current.length > 0 && <p className={`px-4 pb-2 text-[12px] ${dim}`}>No matches for “{q}”.</p>}

      <div ref={wrap} className="min-h-0 flex-1 overflow-auto px-3" style={{ background: "var(--surface-1)" }}>
        {err ? <p role="alert" className="p-6 text-[13.5px]" style={{ color: "#dc2626" }}>{err}</p> : <div className="mx-auto w-fit py-3"><canvas ref={canvas} className="rounded-md bg-white shadow-lg" data-testid="pdf-canvas" /></div>}
      </div>

      <footer className="space-y-2 px-3 py-2.5">
        <div className="flex gap-2">
          <button type="button" className={`${tbtn} flex-1 !text-[13.5px]`} style={{ background: "var(--halo-a)", color: "var(--halo-ink)" }} disabled={!doc || busy} onClick={() => void ask("Summarize this PDF. Give the main points as short bullets, then a one-sentence takeaway.")} data-testid="pdf-summarize">{busy ? "Reading…" : "Summarize PDF"}</button>
        </div>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (question.trim()) void ask(question.trim()); }}>
          <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ask AI about this PDF…" aria-label="Ask AI about this PDF" data-testid="pdf-ask" className="h-11 min-w-0 flex-1 rounded-full bg-[var(--surface-2)] px-4 text-[14px] outline-none" />
          <button type="submit" className={tbtn} disabled={!doc || busy || !question.trim()}>Ask AI</button>
        </form>
      </footer>
    </div>
  );
}
