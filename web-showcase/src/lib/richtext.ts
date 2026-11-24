/** Assistant-message parsing: text / inline math / block math / MCQ blocks. */

export type Seg =
  | { kind: "text"; value: string }
  | { kind: "inline"; value: string }
  | { kind: "block"; value: string }
  | { kind: "mcq"; question: string; options: string[]; answer?: number };

const MCQ_OPEN = "[[mcq]]";
const MCQ_CLOSE = "[[/mcq]]";

/** While streaming, never expose half-open `$` or `[[mcq]]` — prevents flicker. */
export function safePrefix(text: string): string {
  let t = text;
  const open = t.lastIndexOf(MCQ_OPEN);
  if (open !== -1 && t.indexOf(MCQ_CLOSE, open) === -1) t = t.slice(0, open);
  // count unescaped $ ; odd → cut at last one
  const dollars: number[] = [];
  for (let i = 0; i < t.length; i++) if (t[i] === "$" && t[i - 1] !== "\\") dollars.push(i);
  // "$$" pairs count as two → parity logic still holds
  if (dollars.length % 2 === 1) t = t.slice(0, dollars[dollars.length - 1]);
  return t;
}

function splitMath(src: string): Seg[] {
  const out: Seg[] = [];
  const re = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    if (m.index > last) out.push({ kind: "text", value: src.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ kind: "block", value: m[1].trim() });
    else out.push({ kind: "inline", value: m[2].trim() });
    last = m.index + m[0].length;
  }
  if (last < src.length) out.push({ kind: "text", value: src.slice(last) });
  return out;
}

export function parseAssistant(text: string): Seg[] {
  const out: Seg[] = [];
  let rest = text;
  for (;;) {
    const o = rest.indexOf(MCQ_OPEN);
    if (o === -1) break;
    const c = rest.indexOf(MCQ_CLOSE, o);
    if (c === -1) break;
    out.push(...splitMath(rest.slice(0, o)));
    const raw = rest.slice(o + MCQ_OPEN.length, c);
    try {
      const j = JSON.parse(raw) as { question: string; options: string[]; answer?: number };
      if (Array.isArray(j.options) && j.options.length >= 2) {
        out.push({ kind: "mcq", question: j.question, options: j.options, answer: j.answer });
      }
    } catch {
      /* malformed block: drop silently (grammar-constrained generation prevents this on-device) */
    }
    rest = rest.slice(c + MCQ_CLOSE.length);
  }
  out.push(...splitMath(rest));
  return out;
}
