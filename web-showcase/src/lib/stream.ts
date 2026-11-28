import { splitThink } from "@/lib/engine";

/**
 * Separates a raw model stream into the collapsible reasoning trace and the clean final answer.
 *
 * Sources of reasoning, all routed into `thought`:
 *  1. `delta.reasoning_content` / `delta.reasoning` (re-encoded as `<think>` by the cloud client),
 *  2. literal `<think>...</think>` blocks,
 *  3. plain-text planning monologue that some relays print before the artifact ("Let me build...", "First, I need to...").
 * Raw `<!doctype html>` / `<html>` output without a fence is wrapped in a ```html fence so it renders as a code block + live preview.
 */
export interface Split {
  thought: string;
  answer: string;
  open: boolean;
}

const HTML_START = /<!doctype html|<html[\s>]/i;
const ARTIFACT_LANG = /^```(html|htm|svg|xml)\b/i;
const PLAN_WORDS = /\b(let me|let's|i('|’)ll|i will|i need to|i should|i('|’)m going to|the user (wants|asks|is asking|requested)|first,|okay,|alright,|my plan|plan:|thinking|step \d|to (do|build|create) this)\b/i;

/** Wrap an un-fenced HTML document in a ```html fence (left unclosed while the stream is still inside the document). */
export function fenceRawHtml(text: string): string {
  if (/```(html|htm)\b/i.test(text)) return text;
  const m = HTML_START.exec(text);
  if (!m) return text;
  const before = text.slice(0, m.index);
  if ((before.match(/```/g) ?? []).length % 2 === 1) return text; // already inside some other fence
  const rest = text.slice(m.index);
  const end = rest.search(/<\/html\s*>/i);
  if (end === -1) return `${before}\n\`\`\`html\n${rest}`;
  const stop = end + rest.slice(end).indexOf(">") + 1;
  return `${before}\n\`\`\`html\n${rest.slice(0, stop)}\n\`\`\`\n${rest.slice(stop)}`;
}

/** A short lead-in such as "Here is your deck:" stays visible; anything that reads like planning is moved to the trace. */
function looksLikePlanning(pre: string): boolean {
  const t = pre.trim();
  if (!t) return false;
  if (t.length > 260) return true;
  return t.length > 40 && PLAN_WORDS.test(t);
}

export function splitReasoning(raw: string): Split {
  const base = splitThink(raw);
  let answer = fenceRawHtml(base.answer);
  let thought = base.thought;
  const f = answer.indexOf("```");
  if (f > 0 && ARTIFACT_LANG.test(answer.slice(f))) {
    const pre = answer.slice(0, f).trim();
    if (looksLikePlanning(pre)) {
      thought = [thought, pre].filter(Boolean).join("\n\n");
      answer = answer.slice(f);
    }
  }
  return { thought, answer: answer.trim(), open: base.open };
}
