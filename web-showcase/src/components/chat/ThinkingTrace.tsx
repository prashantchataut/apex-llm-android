"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ChatMsg } from "@/components/app/useChat";
import { CIcon } from "@/components/calm/icons";

const EASE = "cubic-bezier(0.23,1,0.32,1)";
const dim = "text-[rgb(var(--ink-rgb)/var(--ink-3-a))]";

export type TraceKind = "steps" | "reasoning" | "search" | "artifacts";

function domainOf(url?: string): string | null {
  if (!url) return null;
  try {
    return new URL(url.startsWith("http") ? url : `https://${url}`).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}
const isSearch = (icon: string) => icon === "globe" || icon === "search";

function useTick(active: boolean) {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(performance.now()), 150);
    return () => window.clearInterval(id);
  }, [active]);
  return now;
}

/** A spinning ring that settles into a crisp checkmark. */
function Node({ state }: { state: "active" | "done" | "fail" }) {
  return (
    <span className="relative z-[1] grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full bg-[var(--canvas)]" aria-hidden="true">
      {state === "active" ? (
        <svg width="16" height="16" viewBox="0 0 16 16" className="animate-spin" style={{ animationDuration: "0.9s" }}>
          <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeOpacity=".18" strokeWidth="1.5" />
          <path d="M8 2a6 6 0 0 1 6 6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      ) : state === "fail" ? (
        <CIcon name="x" size={14} className="text-[var(--bad)]" />
      ) : (
        <span className="grid h-4 w-4 place-items-center rounded-full bg-[var(--halo-a)] text-[var(--halo-ink)]" style={{ animation: `trace-pop .45s ${EASE}` }}>
          <CIcon name="check" size={11} />
        </span>
      )}
    </span>
  );
}

function Row({ state, children, last }: { state: "active" | "done" | "fail"; children: React.ReactNode; last?: boolean }) {
  return (
    <li className={`relative flex gap-3 ${last ? "" : "pb-3"}`}>
      <Node state={state} />
      <div className="min-w-0 flex-1 pt-px text-[13.5px] leading-[1.5]">{children}</div>
    </li>
  );
}

function Pill({ url, label }: { url?: string; label: string }) {
  const d = domainOf(url);
  const cls = "inline-flex min-h-7 items-center gap-1.5 rounded-full bg-[var(--surface-2)] px-2.5 text-[12px] active:scale-[0.97]";
  const body = (
    <>
      <span className="grid h-4 w-4 place-items-center rounded-full bg-[var(--halo-a)] text-[9px] font-semibold uppercase text-[var(--halo-ink)]">{(d ?? label).charAt(0)}</span>
      <span className="max-w-[160px] truncate">{d ?? label}</span>
    </>
  );
  return url ? (
    <a href={url} target="_blank" rel="noopener noreferrer" className={cls} style={{ transition: `transform .2s ${EASE}` }}>{body}</a>
  ) : (
    <span className={cls}>{body}</span>
  );
}

/**
 * Expandable ThinkingTrace. Collapsed it is one quiet line (shimmer while active, "Thought for 2.4s" once settled).
 * Expanded it opens with a grid-template-rows 0fr -> 1fr transition and shows a vertical timeline in up to four variants:
 *  Steps (checklist), Reasoning (live <think> prose), Search (query + source pills), Artifacts / Tools (PDF pages, slides, RAG chunks).
 */
export function ThinkingTrace({ m }: { m: ChatMsg }) {
  const born = useRef(performance.now());
  const thinkOpen = m.thinkEnd === null || (m.thinkEnd === undefined && !!m.streaming);
  const active = !!m.streaming && (thinkOpen || !m.text);
  const now = useTick(!!m.streaming);
  const [open, setOpen] = useState<boolean | null>(null);
  const isOpen = open ?? false;

  const tools = m.tools ?? [];
  const searches = tools.filter((t) => isSearch(t.icon));
  const others = tools.filter((t) => !isSearch(t.icon));
  const reasoning = m.steps ?? [];
  const text = m.text ?? "";
  const slides = (text.match(/<section[^>]*class=["'][^"']*\bslide\b/gi) ?? []).length;
  const chunks = new Set([...text.matchAll(/\[Source:\s*([^\]\n]+)\]/gi)].map((x) => x[1].trim()));
  const building = !!m.streaming && /```(html|svg|mermaid)/i.test(text) && !/```(html|svg|mermaid)[\s\S]*?```\s*$/i.test(text.replace(/\s+$/, "")) ;
  const pdfNote = tools.find((t) => /pdf|page/i.test(t.label));
  const readingDoc = !!m.attach?.length && !!m.streaming && !text;

  const label = useMemo(() => {
    if (!active && !building) return null;
    if (building) return "Building preview";
    if (searches.length && !text) return "Searching the web";
    if (readingDoc || (pdfNote && !text)) return "Reading document";
    return "Thinking";
  }, [active, building, searches.length, text, readingDoc, pdfNote]);

  const t0 = m.thinkStart ?? born.current;
  const end = m.thinkEnd ?? (active || building ? now : (m.stats?.totalMs ? t0 + Math.min(m.stats.totalMs, 60000) : now));
  const secs = Math.max(0.1, (end - t0) / 1000);
  const settled = !label;

  const kinds: TraceKind[] = [];
  if (reasoning.length) kinds.push("reasoning");
  if (searches.length) kinds.push("search");
  if (others.length || slides || chunks.size || readingDoc) kinds.push("artifacts");
  if (kinds.length === 0 || tools.length || m.streaming) kinds.unshift("steps");

  const hasBody = settled ? reasoning.length > 0 || tools.length > 0 || slides > 0 || chunks.size > 0 : true;
  if (settled && !hasBody) return null;

  return (
    <div data-testid="thinking-trace" className="-mx-1">
      <button type="button" onClick={() => setOpen(!isOpen)} aria-expanded={isOpen} className="group inline-flex min-h-9 items-center gap-1.5 rounded-full px-1 text-[14px] active:scale-[0.97]" style={{ transition: `transform .2s ${EASE}` }}>
        <span className={label ? "shimmer-text" : dim}>{label ?? `Thought for ${secs.toFixed(1)}s`}</span>
        <CIcon name="chevron" size={14} className={dim} style={{ transform: isOpen ? "rotate(180deg)" : undefined, transition: `transform .45s ${EASE}` }} />
      </button>
      <div className="grid" style={{ gridTemplateRows: isOpen ? "1fr" : "0fr", transition: `grid-template-rows .5s ${EASE}` }}>
        <div className="overflow-hidden">
          <div className="relative px-1 pb-1 pt-2" style={{ opacity: isOpen ? 1 : 0, transition: `opacity .4s ${EASE}` }}>
            {/* animated vertical timeline spine */}
            <span className="bg-line absolute bottom-3 left-[9.5px] top-3 w-px origin-top" style={{ transform: isOpen ? "scaleY(1)" : "scaleY(0)", transition: `transform .6s ${EASE}` }} aria-hidden="true" />
            <ul className="relative">
              {kinds.includes("steps") && (
                <>
                  <Row state="done">Understood the request</Row>
                  {reasoning.length > 0 && <Row state={thinkOpen ? "active" : "done"}>{thinkOpen ? "Reasoning" : `Reasoned for ${secs.toFixed(1)}s`}</Row>}
                  {tools.map((t, i) => (
                    <Row key={`t${i}`} state={t.ok ? "done" : "fail"}>{t.label}</Row>
                  ))}
                  {building && <Row state="active">Building preview</Row>}
                  {slides > 0 && <Row state={building ? "active" : "done"}>Generated {slides} slide{slides > 1 ? "s" : ""}</Row>}
                  <Row state={m.streaming ? "active" : "done"} last>{m.streaming ? "Writing the answer" : "Answer ready"}</Row>
                </>
              )}
            </ul>

            {kinds.includes("reasoning") && (
              <div className="mt-3 pl-[30px]">
                <p className={`mb-1 text-[11.5px] font-medium uppercase tracking-[0.06em] ${dim}`}>Reasoning</p>
                <div className="think-trace max-h-48 overflow-y-auto !border-0 !pl-0" aria-live="off">
                  {reasoning.map((st, i) => <p key={i} className="mb-1.5 last:mb-0">{st}</p>)}
                </div>
              </div>
            )}

            {kinds.includes("search") && (
              <div className="mt-3 pl-[30px]">
                <p className={`mb-1.5 text-[11.5px] font-medium uppercase tracking-[0.06em] ${dim}`}>Search</p>
                {searches.map((s, i) => <p key={i} className="mb-1.5 text-[13px]">{s.label}</p>)}
                <div className="flex flex-wrap gap-1.5">{searches.map((s, i) => <Pill key={i} url={s.url} label={s.label} />)}</div>
              </div>
            )}

            {kinds.includes("artifacts") && (
              <div className="mt-3 pl-[30px]">
                <p className={`mb-1.5 text-[11.5px] font-medium uppercase tracking-[0.06em] ${dim}`}>Artifacts &amp; tools</p>
                <ul className="space-y-1 text-[13px]">
                  {pdfNote && <li className="flex items-center gap-2"><CIcon name="file" size={14} className={dim} />{pdfNote.label}</li>}
                  {readingDoc && <li className="flex items-center gap-2"><CIcon name="file" size={14} className={dim} />Reading {m.attach?.[0]?.name}</li>}
                  {slides > 0 && <li className="flex items-center gap-2"><CIcon name="layers" size={14} className={dim} />{slides} presentation slide{slides > 1 ? "s" : ""} generated</li>}
                  {chunks.size > 0 && <li className="flex items-center gap-2"><CIcon name="db" size={14} className={dim} />{chunks.size} local knowledge chunk{chunks.size > 1 ? "s" : ""} matched</li>}
                  {others.filter((o) => o !== pdfNote).map((o, i) => <li key={i} className="flex items-center gap-2"><CIcon name="code" size={14} className={dim} />{o.label}</li>)}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
