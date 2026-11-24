/** Assistant-message parsing: text / inline math / block math / clarifying-choice blocks. */

export interface ChoiceOption {
  label: string;
  hint?: string;
}

export type Seg =
  | { kind: "text"; value: string }
  | { kind: "inline"; value: string }
  | { kind: "block"; value: string }
  | { kind: "choices"; question: string; options: ChoiceOption[]; multi: boolean };

/** `[[choices]]` is canonical; `[[mcq]]` is accepted so older transcripts and models trained on it still render. */
const TAGS: [string, string][] = [
  ["[[choices]]", "[[/choices]]"],
  ["[[mcq]]", "[[/mcq]]"],
];

function nextBlock(text: string, from = 0): { open: number; close: number; tagOpen: string; tagClose: string } | null {
  let best: { open: number; close: number; tagOpen: string; tagClose: string } | null = null;
  for (const [o, c] of TAGS) {
    const open = text.indexOf(o, from);
    if (open === -1) continue;
    const close = text.indexOf(c, open);
    if (!best || open < best.open) best = { open, close, tagOpen: o, tagClose: c };
  }
  return best;
}

/** While streaming, never expose half-open `$` or an unfinished choices block — prevents flicker. */
export function safePrefix(text: string): string {
  let t = text;
  for (const [o, c] of TAGS) {
    const open = t.lastIndexOf(o);
    if (open !== -1 && t.indexOf(c, open) === -1) t = t.slice(0, open);
  }
  const dollars: number[] = [];
  for (let i = 0; i < t.length; i++) if (t[i] === "$" && t[i - 1] !== "\\") dollars.push(i);
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

function normaliseOptions(raw: unknown): ChoiceOption[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((o): ChoiceOption | null => {
      if (typeof o === "string") return { label: o };
      if (o && typeof o === "object" && typeof (o as ChoiceOption).label === "string") {
        const x = o as ChoiceOption;
        return { label: x.label, hint: typeof x.hint === "string" ? x.hint : undefined };
      }
      return null;
    })
    .filter((o): o is ChoiceOption => o !== null)
    .slice(0, 6);
}

export function parseAssistant(text: string): Seg[] {
  const out: Seg[] = [];
  let rest = text;
  for (;;) {
    const b = nextBlock(rest);
    if (!b || b.close === -1) break;
    out.push(...splitMath(rest.slice(0, b.open)));
    const raw = rest.slice(b.open + b.tagOpen.length, b.close);
    try {
      const j = JSON.parse(raw) as { question?: string; options?: unknown; multi?: boolean };
      const options = normaliseOptions(j.options);
      if (options.length >= 2) out.push({ kind: "choices", question: j.question ?? "Which do you mean?", options, multi: j.multi === true });
    } catch {
      /* malformed block: drop silently (grammar-constrained generation prevents this on-device) */
    }
    rest = rest.slice(b.close + b.tagClose.length);
  }
  out.push(...splitMath(rest));
  return out;
}
