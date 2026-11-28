/** Smart code extraction + in-memory auto-close for the Virtual Localhost preview. */

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);

/**
 * Make a truncated / still-streaming HTML document renderable: drop a half-written tag, drop an unfinished <script>
 * (a cut-off script would throw), close an open <style>, and close every open element in reverse order. Pure string work, no DOM.
 */
export function autoCloseHtml(src: string): string {
  let html = src.replace(/\s+$/, "");
  // 1. unfinished tag at the very end: "<div cla"
  const lt = html.lastIndexOf("<");
  if (lt > html.lastIndexOf(">")) html = html.slice(0, lt);
  // 2. unfinished <script>/<style> blocks
  const openScript = html.search(/<script\b(?![^>]*\bsrc=)[^>]*>(?![\s\S]*<\/script\s*>)/i);
  if (openScript !== -1) html = html.slice(0, openScript);
  if (/<style\b[^>]*>(?![\s\S]*<\/style\s*>)/i.test(html)) html += "\n}</style>";
  // 3. close open elements
  const stack: string[] = [];
  const re = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][\w:-]*)\b[^>]*?(\/?)>/g;
  let skipTo = -1;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    if (m.index < skipTo) continue;
    if (m[0].startsWith("<!--")) continue;
    const name = m[2].toLowerCase();
    if (!m[1] && (name === "script" || name === "style")) {
      const close = html.toLowerCase().indexOf(`</${name}`, re.lastIndex);
      skipTo = close === -1 ? html.length : close;
      if (close !== -1) stack.push(name);
      continue;
    }
    if (VOID.has(name) || m[3]) continue;
    if (m[1]) {
      const at = stack.lastIndexOf(name);
      if (at !== -1) stack.length = at;
    } else stack.push(name);
  }
  const tail = stack.reverse().filter((n) => n !== "script" && n !== "style").map((n) => `</${n}>`).join("");
  return html + tail;
}

export const isCompleteHtml = (code: string) => /<\/html\s*>\s*$/i.test(code.trim());

/** True when the code looks like a document or fragment worth previewing. */
export const looksLikeHtml = (code: string) => /<(!doctype|html|body|div|section|main|svg|canvas|style|script)\b/i.test(code);
