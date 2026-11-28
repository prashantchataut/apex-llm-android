"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { CIcon } from "@/components/calm/icons";

const EASE = "cubic-bezier(0.23,1,0.32,1)";
const dim = "text-[rgb(var(--ink-rgb)/var(--ink-3-a))]";

export type SelAction = "explain" | "improve" | "shorten" | "tone" | "grammar" | "translate" | "custom";
const GERUND: Record<SelAction, string> = { explain: "Explaining…", improve: "Improving…", shorten: "Shortening…", tone: "Changing tone…", grammar: "Fixing grammar…", translate: "Translating…", custom: "Editing…" };
const INSTRUCTION: Record<SelAction, string> = {
  explain: "Explain this passage simply and briefly, in 2 to 3 sentences.",
  improve: "Improve the clarity and flow of this passage. Keep the meaning and roughly the same length. Output only the rewritten passage.",
  shorten: "Shorten this passage to about half its length without losing key facts. Output only the rewritten passage.",
  tone: "Rewrite this passage in the requested tone. Output only the rewritten passage.",
  grammar: "Fix grammar, spelling and punctuation only. Do not change wording otherwise. Output only the corrected passage.",
  translate: "Translate this passage. Output only the translation.",
  custom: "Edit this passage as instructed. Output only the edited passage.",
};

export type RewriteFn = (instruction: string, text: string, onText: (full: string) => void, signal: AbortSignal) => Promise<void>;
interface Sel {
  text: string;
  msgId: string;
  left: number;
  top: number;
  width: number;
}
type Mode = "idle" | "running" | "done";

function Spinner() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" className="animate-spin" style={{ animationDuration: "0.85s" }} aria-hidden="true">
      <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeOpacity=".2" strokeWidth="1.5" />
      <path d="M8 2a6 6 0 0 1 6 6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function Btn({ children, onClick, strong, label }: { children: ReactNode; onClick: () => void; strong?: boolean; label?: string }) {
  return (
    <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={onClick} aria-label={label} className="relative flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[14px] px-3 text-[13px] font-medium after:absolute after:-inset-y-1 after:inset-x-0 after:content-[''] active:scale-[0.97]" style={{ transition: `transform .2s ${EASE}, background .3s ${EASE}`, background: strong ? "var(--ink-solid)" : "transparent", color: strong ? "var(--canvas)" : undefined }}>
      {children}
    </button>
  );
}

/**
 * Contextual selection bar. Select text inside any assistant message (or tap Refine on a passage) and a 36px concentric pill
 * anchors beneath the selection. Width morphs between states with a cubic-bezier(0.23,1,0.32,1) transition.
 */
export function SelectionActionsBar({ scope, rewrite, onKeep }: { scope: RefObject<HTMLElement | null>; rewrite: RewriteFn; onKeep: (msgId: string, original: string, replacement: string, action: SelAction) => void }) {
  const [sel, setSel] = useState<Sel | null>(null);
  const [mode, setMode] = useState<Mode>("idle");
  const [more, setMore] = useState(false);
  const [pending, setPending] = useState<SelAction | null>(null);
  const [text, setText] = useState("");
  const [verb, setVerb] = useState("");
  const [out, setOut] = useState("");
  const [last, setLast] = useState<{ action: SelAction; arg: string } | null>(null);
  const ctl = useRef<AbortController | null>(null);
  const bar = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [w, setW] = useState<number | undefined>();
  const frozen = mode !== "idle";

  const read = useCallback(() => {
    if (frozen) return;
    const s = window.getSelection();
    const root = scope.current;
    if (!s || s.isCollapsed || !root || s.rangeCount === 0) return setSel(null);
    const raw = s.toString().trim();
    const host = (s.anchorNode instanceof Element ? s.anchorNode : s.anchorNode?.parentElement)?.closest("[data-sel-msg]");
    if (raw.length < 3 || !host || !root.contains(host) || !host.contains(s.focusNode)) return setSel(null);
    const r = s.getRangeAt(0).getBoundingClientRect();
    setSel({ text: raw, msgId: host.getAttribute("data-sel-msg") ?? "", left: r.left + r.width / 2, top: r.bottom, width: r.width });
  }, [frozen, scope]);

  useEffect(() => {
    let t = 0;
    const f = () => {
      window.clearTimeout(t);
      t = window.setTimeout(read, 140);
    };
    document.addEventListener("selectionchange", f);
    return () => {
      document.removeEventListener("selectionchange", f);
      window.clearTimeout(t);
    };
  }, [read]);

  const close = useCallback(() => {
    ctl.current?.abort();
    setSel(null);
    setMode("idle");
    setMore(false);
    setPending(null);
    setText("");
    setOut("");
    window.getSelection()?.removeAllRanges();
  }, []);

  useEffect(() => {
    if (!sel) return;
    const f = (e: PointerEvent) => {
      if (bar.current && !bar.current.contains(e.target as Node) && mode === "idle") setSel(null);
    };
    const k = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("pointerdown", f);
    window.addEventListener("keydown", k);
    return () => {
      document.removeEventListener("pointerdown", f);
      window.removeEventListener("keydown", k);
    };
  }, [sel, mode, close]);

  /* width morph: measure the content and animate the pill to it */
  useLayoutEffect(() => {
    const el = inner.current;
    if (!el) return;
    const measure = () => setW(Math.min(el.scrollWidth + 8, window.innerWidth - 16));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [sel, mode, more, pending]);

  const run = async (action: SelAction, arg = "") => {
    if (!sel) return;
    setLast({ action, arg });
    setMode("running");
    setVerb(GERUND[action]);
    setOut("");
    setMore(false);
    setPending(null);
    ctl.current?.abort();
    const c = new AbortController();
    ctl.current = c;
    const instr = `${INSTRUCTION[action]}${arg ? ` ${action === "translate" ? "Language" : action === "tone" ? "Tone" : "Instruction"}: ${arg}.` : ""}`;
    try {
      await rewrite(instr, sel.text, (full) => setOut(full), c.signal);
      if (!c.signal.aborted) setMode("done");
    } catch {
      if (!c.signal.aborted) {
        setOut((o) => o || "Could not reach a model. Check your engine and retry.");
        setMode("done");
      }
    }
  };

  if (!sel || typeof document === "undefined") return null;
  const vw = window.innerWidth;
  const barW = w ?? 220;
  const left = Math.max(8, Math.min(sel.left - barW / 2, vw - barW - 8));
  const top = Math.min(sel.top + 10, window.innerHeight - 52);
  const submit = () => {
    const v = text.trim();
    if (!v) return;
    setText("");
    void run(pending ?? "custom", v);
  };

  return createPortal(
    <div ref={bar} className="fixed z-[90]" style={{ left, top, width: barW, transition: `left .45s ${EASE}, width .45s ${EASE}`, animation: `sel-in .35s ${EASE}` }} data-testid="selection-bar" role="toolbar" aria-label="Selection actions">
      <div className="h-9 overflow-hidden rounded-[18px] bg-[var(--surface)] shadow-[var(--specular),0_10px_30px_-10px_rgb(0_0_0/0.45)] ring-1 ring-[rgb(var(--ink-rgb)/0.08)]">
        <div ref={inner} className="flex h-9 w-max max-w-none items-center gap-0.5 p-1" key={mode}>
          {mode === "idle" && (
            <>
              {pending ? (
                <>
                  <button type="button" aria-label="Back" className="grid h-7 w-7 shrink-0 place-items-center rounded-[14px]" onClick={() => setPending(null)}><CIcon name="back" size={14} /></button>
                  <input autoFocus value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder={pending === "translate" ? "Language, e.g. Spanish" : "Tone, e.g. friendly"} aria-label="Option" className="h-7 w-44 rounded-[14px] bg-transparent px-2 text-[13px] outline-none placeholder:opacity-50" />
                  <Btn onClick={submit} strong label="Run">Go</Btn>
                </>
              ) : (
                <>
                  <Btn onClick={() => void run("explain")}>Explain</Btn>
                  <Btn onClick={() => void run("improve")}>Improve</Btn>
                  {more && (
                    <>
                      <Btn onClick={() => void run("shorten")}>Shorten</Btn>
                      <Btn onClick={() => setPending("tone")}>Change Tone</Btn>
                      <Btn onClick={() => void run("grammar")}>Fix Grammar</Btn>
                      <Btn onClick={() => setPending("translate")}>Translate</Btn>
                      <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="Describe edits" aria-label="Describe edits" className="ml-1 h-7 w-36 rounded-[14px] bg-[var(--surface-2)] px-3 text-[13px] outline-none placeholder:opacity-50" />
                    </>
                  )}
                  <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setMore((o) => !o)} aria-label={more ? "Fewer actions" : "More actions"} aria-expanded={more} className="grid h-7 w-7 shrink-0 place-items-center rounded-[14px] active:scale-[0.97]" style={{ transition: `transform .2s ${EASE}` }}>
                    <CIcon name="chevron" size={14} style={{ transform: more ? "rotate(-90deg)" : "rotate(-90deg) scaleX(-1)", transition: `transform .45s ${EASE}` }} />
                  </button>
                </>
              )}
            </>
          )}
          {mode === "running" && (
            <span className="flex items-center gap-2 px-3 text-[13px]" role="status"><Spinner /><span className="shimmer-text">{verb}</span>
              <button type="button" aria-label="Stop" className="grid h-6 w-6 place-items-center rounded-full" onClick={close}><CIcon name="x" size={13} /></button>
            </span>
          )}
          {mode === "done" && (
            <>
              <Btn strong onClick={() => { onKeep(sel.msgId, sel.text, out, last?.action ?? "improve"); close(); }}>Keep</Btn>
              <Btn onClick={close}>Discard</Btn>
              <Btn onClick={() => last && void run(last.action, last.arg)}>Retry</Btn>
            </>
          )}
        </div>
      </div>
      {mode !== "idle" && (
        <div className="mt-2 max-h-48 overflow-y-auto rounded-[18px] bg-[var(--surface)] p-3 text-[13.5px] leading-[1.55] shadow-[var(--specular),0_10px_30px_-10px_rgb(0_0_0/0.4)] ring-1 ring-[rgb(var(--ink-rgb)/0.08)]" style={{ animation: `sel-in .4s ${EASE}` }} aria-live="polite">
          {out ? <span>{out}</span> : <span className={dim}>Starting…</span>}
        </div>
      )}
    </div>,
    document.body,
  );
}
