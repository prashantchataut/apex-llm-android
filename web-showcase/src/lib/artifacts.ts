/** Fenced-code extraction and the "Apex Artifacts" preview pipeline (sandboxed, offline). */

export type ArtifactKind = "html" | "svg" | "mermaid" | "js";

export type Part = { kind: "md"; value: string } | { kind: "code"; lang: string; code: string; closed: boolean };

/** Split markdown into prose and ``` fenced blocks. An unterminated trailing fence (mid-stream) has `closed: false`. */
export function splitFences(text: string): Part[] {
  const parts: Part[] = [];
  const re = /```([\w+-]*)[^\n]*\n([\s\S]*?)(```|$)/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    const at = m.index ?? 0;
    if (at > last) parts.push({ kind: "md", value: text.slice(last, at) });
    parts.push({ kind: "code", lang: (m[1] || "").toLowerCase(), code: m[2].replace(/\n$/, ""), closed: m[3] === "```" });
    last = at + m[0].length;
  }
  if (last < text.length) parts.push({ kind: "md", value: text.slice(last) });
  return parts;
}

export function artifactKind(lang: string, code: string): ArtifactKind | null {
  const l = lang.toLowerCase();
  if (l === "html" || l === "htm") return "html";
  if (l === "svg") return "svg";
  if (l === "xml" && /<svg[\s>]/i.test(code)) return "svg";
  if (l === "mermaid") return "mermaid";
  if (l === "js" || l === "javascript") return /document\.|canvas|innerHTML|addEventListener/.test(code) ? "js" : null;
  if (!l && /^\s*<svg[\s>]/i.test(code)) return "svg";
  return null;
}

export const KIND_LABEL: Record<ArtifactKind, string> = { html: "HTML · CSS · JS", svg: "SVG", mermaid: "Mermaid diagram", js: "Interactive JS" };

const BASE_CSS = "html,body{margin:0;min-height:100%;background:#0b0b10;color:#f4f4f7;font-family:ui-sans-serif,system-ui,-apple-system,sans-serif}";

/** Complete HTML document for the sandboxed iframe (`sandbox="allow-scripts"`, opaque origin: no cookies, no storage, no parent access). */
export function buildSrcDoc(kind: ArtifactKind, code: string): string {
  if (kind === "svg") return `<!doctype html><meta charset="utf-8"><style>${BASE_CSS}body{display:grid;place-items:center;padding:16px;box-sizing:border-box}svg{max-width:100%;max-height:92vh;height:auto}</style>${code}`;
  if (kind === "js") return `<!doctype html><meta charset="utf-8"><style>${BASE_CSS}body{padding:12px;box-sizing:border-box}</style><div id="app"></div><script>try{${code.replace(/<\/script/gi, "<\\/script")}}catch(e){document.body.insertAdjacentHTML("beforeend","<pre style='color:#ff8a8a'>"+e+"</pre>")}</script>`;
  if (/<html[\s>]/i.test(code)) return code;
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${BASE_CSS}</style>${code}`;
}

export function download(name: string, data: Blob | string, type = "text/plain"): void {
  const blob = typeof data === "string" ? new Blob([data], { type }) : data;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/** Rasterise an SVG string (or static HTML through foreignObject) to a PNG blob. */
export async function toPng(markup: string, asHtml: boolean, w = 960, h = 640): Promise<Blob> {
  const svg = asHtml
    ? `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml" style="width:${w}px;height:${h}px;background:#0b0b10;color:#f4f4f7;font-family:sans-serif">${markup}</div></foreignObject></svg>`
    : markup.includes("xmlns") ? markup : markup.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
  const img = new Image();
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
  await new Promise<void>((res, rej) => {
    img.onload = () => res();
    img.onerror = () => rej(new Error("render failed"));
    img.src = url;
  });
  const scale = 2;
  const cw = (img.naturalWidth || w) * scale;
  const ch = (img.naturalHeight || h) * scale;
  const c = document.createElement("canvas");
  c.width = cw;
  c.height = ch;
  const g = c.getContext("2d");
  if (!g) throw new Error("no canvas");
  g.fillStyle = "#0b0b10";
  g.fillRect(0, 0, cw, ch);
  g.drawImage(img, 0, 0, cw, ch);
  URL.revokeObjectURL(url);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("encode failed"))), "image/png"));
}
