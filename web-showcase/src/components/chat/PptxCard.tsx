"use client";

import { useEffect, useState } from "react";
import { CIcon } from "@/components/calm/icons";
import { download } from "@/lib/artifacts";
import { buildPptx, parseDeck, pptxName, type DeckModel } from "@/services/pptxGenerator";

const dim = "text-[rgb(var(--ink-rgb)/var(--ink-3-a))]";

/** One-tap "Download .PPTX" card shown inside the chat bubble for every generated deck. The file is built as soon as the deck is complete. */
export function PptxCard({ code, kind = "html" }: { code: string; kind?: "html" | "md" }) {
  const [deck, setDeck] = useState<DeckModel | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    let live = true;
    const d = parseDeck(code, kind);
    setDeck(d);
    setBlob(null);
    setErr("");
    if (!d) return;
    buildPptx(d).then((b) => live && setBlob(b)).catch(() => live && setErr("PowerPoint export failed. Try again."));
    return () => {
      live = false;
    };
  }, [code, kind]);
  if (!deck) return null;
  const mb = blob ? `${Math.max(1, Math.round(blob.size / 1024))} KB` : "Building";
  return (
    <div className="flex items-center gap-3 rounded-[20px] bg-[var(--surface-2)] p-3 ring-1 ring-[rgb(var(--ink-rgb)/0.08)]" data-testid="pptx-card">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] bg-[var(--halo-a)] text-[var(--halo-ink)]"><CIcon name="layers" size={20} /></span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-medium">{pptxName(deck)}</span>
        <span className={`block text-[12px] ${dim}`}>{err || `PowerPoint · ${deck.slides.length} slides · ${mb}`}</span>
      </span>
      <button type="button" disabled={!blob} onClick={() => blob && download(pptxName(deck), blob, "application/vnd.openxmlformats-officedocument.presentationml.presentation")} className="calm-btn !h-10 shrink-0 active:scale-[0.97]" data-primary="true" data-testid="download-pptx">
        <CIcon name="download" size={14} />Download .PPTX
      </button>
    </div>
  );
}

/** Action-bar "Export .PPTX" for any response that reads like a deck (Markdown headings or `---` separated slides). */
export function PptxExportButton({ text }: { text: string }) {
  const deck = text.includes("```html") ? null : parseDeck(text, "md");
  const [busy, setBusy] = useState(false);
  if (!deck) return null;
  return (
    <button type="button" aria-label="Export .PPTX" className="ibtn !h-9 !w-9" disabled={busy} data-testid="export-pptx" onClick={async () => { setBusy(true); try { download(pptxName(deck), await buildPptx(deck), "application/vnd.openxmlformats-officedocument.presentationml.presentation"); } finally { setBusy(false); } }}>
      <CIcon name="layers" size={15} />
    </button>
  );
}
