"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { RippleButton } from "@/components/ui/Glass";
import { artifactKind, buildSrcDoc, download, KIND_LABEL, toPng, type ArtifactKind } from "@/lib/artifacts";
import { haptic } from "@/lib/haptics";

export interface Artifact {
  kind: ArtifactKind;
  lang: string;
  code: string;
}

/** Fenced code block. Previewable languages get the frosted "Open Live Artifact" pill. */
export function CodeBlock({ lang, code, closed, onOpen }: { lang: string; code: string; closed: boolean; onOpen?: (a: Artifact) => void }) {
  const kind = artifactKind(lang, code);
  const [copied, setCopied] = useState(false);
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/35">
      <div className="flex items-center justify-between px-3.5 pt-2.5">
        <span className="mono text-[10.5px] text-ink-3">{lang || "code"}</span>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(code);
            haptic("detentClick");
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1400);
          }}
          className="mono flex h-9 items-center gap-1.5 rounded-full px-2.5 text-[10.5px] text-ink-3 active:scale-95"
          aria-label="Copy code"
        >
          <Icon name={copied ? "check" : "copy"} size={13} /> {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="mono max-h-56 overflow-auto px-3.5 pb-3 pt-1 text-[12px] leading-[1.55] text-ink-2">
        <code>{code}</code>
      </pre>
      {kind && closed && (
        <div className="border-t border-white/10 p-2">
          <RippleButton type="button" onClick={() => onOpen?.({ kind, lang, code })} className="glass flex h-11 w-full items-center justify-center gap-2 rounded-full text-[13px] font-medium">
            <span className="relative z-[1] flex items-center gap-2">
              <Icon name="layers" size={15} /> Open Live Artifact
              <span className="mono text-[10px] font-normal text-ink-3">{KIND_LABEL[kind]}</span>
            </span>
          </RippleButton>
        </div>
      )}
    </div>
  );
}

let mermaidSeq = 0;

/** Split-sheet drawer: [Preview] [Code] · Copy · Export. HTML/JS run in a `sandbox="allow-scripts"` iframe with an opaque origin. */
export function ArtifactDrawer({ artifact, onClose }: { artifact: Artifact | null; onClose: () => void }) {
  const [tab, setTab] = useState<"preview" | "code">("preview");
  const [svg, setSvg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const kind = artifact?.kind;
  const code = artifact?.code ?? "";
  const srcDoc = useMemo(() => (kind && kind !== "mermaid" ? buildSrcDoc(kind, code) : ""), [kind, code]);

  useEffect(() => {
    setTab("preview");
    setSvg(null);
    setErr(null);
    if (kind !== "mermaid") return;
    let live = true;
    void (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({ startOnLoad: false, theme: "dark", securityLevel: "strict", fontFamily: "ui-sans-serif, system-ui, sans-serif" });
        const out = await mermaid.render(`apex-mmd-${mermaidSeq++}`, code);
        if (live) setSvg(out.svg);
      } catch (e) {
        if (live) setErr(e instanceof Error ? e.message.split("\n")[0] : "Diagram could not be parsed");
      }
    })();
    return () => {
      live = false;
    };
  }, [kind, code]);

  const say = (t: string) => {
    setToast(t);
    window.setTimeout(() => setToast(null), 1800);
  };
  const exportHtml = () => {
    if (!kind) return;
    haptic("heavyLock");
    if (kind === "mermaid") download("diagram.svg", svg ?? "", "image/svg+xml");
    else if (kind === "svg") download("artifact.svg", code, "image/svg+xml");
    else download("artifact.html", srcDoc, "text/html");
  };
  const exportPng = async () => {
    if (!kind) return;
    try {
      haptic("heavyLock");
      const blob = kind === "mermaid" ? await toPng(svg ?? "", false) : kind === "svg" ? await toPng(code, false) : await toPng(code, true);
      download("apex-artifact.png", blob);
      say(kind === "html" || kind === "js" ? "PNG is a static snapshot" : "PNG saved");
    } catch {
      say("PNG export is not available for this artifact");
    }
  };

  return (
    <AnimatePresence>
      {artifact && (
        <>
          <motion.button type="button" aria-label="Close artifact" className="absolute inset-0 z-[60] bg-black/55" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.section
            role="dialog"
            aria-label="Apex Artifact"
            className="glass-dark absolute inset-x-0 bottom-0 top-[9%] z-[60] flex flex-col overflow-hidden rounded-t-[30px]"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 34, mass: 0.9 }}
          >
            <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-white/25" />
            <header className="flex items-center gap-2 px-4 pb-2 pt-2">
              <span className="icon-pill shrink-0">
                <Icon name="layers" size={16} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[15px] font-medium tracking-tight">Apex Artifact</div>
                <div className="mono text-[10.5px] text-ink-3">{kind ? KIND_LABEL[kind] : ""} · sandboxed</div>
              </div>
              <button type="button" onClick={onClose} aria-label="Close" className="grid h-11 w-11 place-items-center rounded-full text-ink-2 active:scale-90">
                <Icon name="x" size={18} />
              </button>
            </header>

            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-2 px-4 pb-3">
              <div className="flex rounded-full border border-white/10 bg-white/[0.06] p-1" role="tablist">
                {(["preview", "code"] as const).map((t) => (
                  <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => { haptic("detentClick"); setTab(t); }} className={`relative h-9 rounded-full px-4 text-[12.5px] font-medium capitalize ${tab === t ? "text-black" : "text-ink-2"}`}>
                    {tab === t && <motion.span layoutId="art-tab" className="absolute inset-0 rounded-full bg-white" transition={{ type: "spring", stiffness: 420, damping: 32 }} />}
                    <span className="relative">{t}</span>
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1.5 sm:ml-auto">
                <button type="button" onClick={() => { void navigator.clipboard?.writeText(code); haptic("detentClick"); say("Copied"); }} className="mono flex h-10 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.06] px-2.5 text-[11px] active:scale-95">
                  <Icon name="copy" size={13} /> Copy
                </button>
                <button type="button" onClick={exportHtml} className="mono flex h-10 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.06] px-2.5 text-[11px] active:scale-95">
                  <Icon name="download" size={13} /> {kind === "svg" || kind === "mermaid" ? "SVG" : "HTML"}
                </button>
                <button type="button" onClick={() => void exportPng()} className="mono flex h-10 items-center gap-1.5 rounded-full bg-white px-2.5 text-[11px] font-medium text-black active:scale-95">
                  <Icon name="image" size={13} /> PNG
                </button>
              </div>
            </div>

            <div className="relative mx-3 mb-3 min-h-0 flex-1 overflow-hidden rounded-[22px] border border-white/10 bg-[#0b0b10]">
              {tab === "preview" ? (
                kind === "mermaid" ? (
                  err ? (
                    <p className="p-5 text-[13px] text-bad">Mermaid could not parse this diagram: {err}</p>
                  ) : svg ? (
                    <div className="grid h-full place-items-center overflow-auto p-4 [&_svg]:h-auto [&_svg]:max-w-full" dangerouslySetInnerHTML={{ __html: svg }} />
                  ) : (
                    <div className="grid h-full place-items-center text-[13px] text-ink-3">Rendering diagram…</div>
                  )
                ) : (
                  <iframe title="Artifact preview" sandbox="allow-scripts" srcDoc={srcDoc} className="h-full w-full border-0 bg-[#0b0b10]" />
                )
              ) : (
                <pre className="mono h-full overflow-auto p-4 text-[12px] leading-[1.6] text-ink-2">
                  <code>{code}</code>
                </pre>
              )}
              <AnimatePresence>
                {toast && (
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="glass-dark mono absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full px-4 py-2 text-[11px]">
                    {toast}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.section>
        </>
      )}
    </AnimatePresence>
  );
}
