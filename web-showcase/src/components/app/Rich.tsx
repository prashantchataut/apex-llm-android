"use client";

import katex from "katex";
import "katex/dist/katex.min.css";
import { Fragment, useMemo, type ReactNode } from "react";
import { parseAssistant, safePrefix, type Seg } from "@/lib/richtext";
import { ChoiceCards } from "./ChoiceCards";

function tex(src: string, display: boolean): string {
  return katex.renderToString(src, { displayMode: display, throwOnError: false, output: "html", strict: "ignore" });
}

export function Math({ src, display = false }: { src: string; display?: boolean }) {
  const html = useMemo(() => tex(src, display), [src, display]);
  return display ? (
    <div className="math-block" dangerouslySetInnerHTML={{ __html: html }} />
  ) : (
    <span className="math-inline" dangerouslySetInnerHTML={{ __html: html }} />
  );
}

/** **bold** + `code` micro-markdown inside plain text. */
function Inline({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("**") && p.endsWith("**") && p.length > 4 ? (
          <strong key={i} className="font-semibold text-white">
            {p.slice(2, -2)}
          </strong>
        ) : p.startsWith("`") && p.endsWith("`") && p.length > 2 ? (
          <code key={i} className="mono rounded-md bg-white/10 px-1.5 py-0.5 text-[0.85em]">
            {p.slice(1, -1)}
          </code>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </>
  );
}

/** Text with `$inline$` math — also used for choice labels and hints. */
export function RichInline({ text }: { text: string }) {
  const segs = parseAssistant(text);
  return (
    <>
      {segs.map((s, i) =>
        s.kind === "text" ? <Inline key={i} text={s.value} /> : s.kind === "inline" || s.kind === "block" ? <Math key={i} src={s.value} /> : null,
      )}
    </>
  );
}

export function AssistantBody({ text, streaming, onChoice }: { text: string; streaming: boolean; onChoice?: (answer: string) => void }) {
  const segs: Seg[] = useMemo(() => parseAssistant(streaming ? safePrefix(text) : text), [text, streaming]);
  const out: ReactNode[] = [];
  let group: ReactNode[] = [];
  const flush = (key: string) => {
    if (group.length) {
      out.push(
        <p key={key} className="whitespace-pre-wrap">
          {group}
        </p>,
      );
      group = [];
    }
  };
  segs.forEach((s, i) => {
    if (s.kind === "text") group.push(<Inline key={i} text={s.value} />);
    else if (s.kind === "inline") group.push(<Math key={i} src={s.value} />);
    else {
      flush(`p${i}`);
      if (s.kind === "block") out.push(<Math key={i} src={s.value} display />);
      else out.push(<ChoiceCards key={i} question={s.question} options={s.options} multi={s.multi} onAnswer={onChoice} />);
    }
  });
  flush("tail");
  return <div className="space-y-3 text-[15px] leading-[1.6] text-ink-2">{out}</div>;
}
