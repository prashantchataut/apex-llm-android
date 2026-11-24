/** Prompt-bar attachments: read locally, chunk, estimate tokens, build model context. Nothing leaves the device. */
export interface Attachment {
  id: string;
  kind: "text" | "image";
  name: string;
  size: number;
  tokens: number;
  chunks: string[];
  /** Small data-URL thumbnail for image chips. */
  preview?: string;
  error?: string;
}

export const TEXT_ACCEPT = ".md,.txt,.rs,.py,.json,.toml,.yaml,.yml,.js,.ts,.tsx,.kt,.java,.c,.cpp,.h,.go,.csv,.html,.css,.sh,.pdf,text/*,application/pdf,application/json";
const MAX_BYTES = 4 * 1024 * 1024;

export const estimateTokens = (s: string): number => Math.ceil(s.length / 3.8);

/** Paragraph-aware chunks of roughly `size` characters. */
export function chunkText(text: string, size = 1200): string[] {
  const out: string[] = [];
  let cur = "";
  for (const para of text.split(/\n{2,}/)) {
    if (cur && cur.length + para.length > size) {
      out.push(cur);
      cur = "";
    }
    if (para.length > size) {
      for (let i = 0; i < para.length; i += size) out.push(para.slice(i, i + size));
    } else cur += (cur ? "\n\n" : "") + para;
  }
  if (cur) out.push(cur);
  return out;
}

const id = () => Math.random().toString(36).slice(2, 9);

/** Best-effort text extraction for simple PDFs (Flate streams + Tj/TJ operators). Scanned/encrypted PDFs yield "". */
async function pdfText(buf: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(buf);
  const latin = new TextDecoder("latin1").decode(bytes);
  const parts: string[] = [];
  const re = /stream\r?\n/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(latin))) {
    const start = m.index + m[0].length;
    const end = latin.indexOf("endstream", start);
    if (end < 0) break;
    let content = latin.slice(start, end);
    try {
      if (typeof DecompressionStream !== "undefined") {
        const ds = new DecompressionStream("deflate");
        const w = ds.writable.getWriter();
        void w.write(bytes.slice(start, end)).catch(() => undefined);
        void w.close().catch(() => undefined);
        content = new TextDecoder("latin1").decode(await new Response(ds.readable).arrayBuffer());
      }
    } catch {
      continue;
    }
    if (!content.includes("BT")) continue;
    for (const bt of content.matchAll(/BT([\s\S]*?)ET/g)) {
      let line = "";
      for (const t of bt[1].matchAll(/\(((?:\\.|[^\\)])*)\)\s*Tj|\[((?:\\.|[^\]])*)\]\s*TJ/g)) {
        const src = t[1] ?? [...(t[2] ?? "").matchAll(/\(((?:\\.|[^\\)])*)\)/g)].map((x) => x[1]).join("");
        line += src.replace(/\\([()\\])/g, "$1").replace(/\\n/g, "\n");
      }
      if (line.trim()) parts.push(line);
    }
    end > start && (re.lastIndex = end);
  }
  return parts.join("\n");
}

async function thumb(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const s = Math.min(1, 320 / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(img.width * s));
    c.height = Math.max(1, Math.round(img.height * s));
    c.getContext("2d")?.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.8);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function readAttachment(file: File, kind: "text" | "image"): Promise<Attachment> {
  const base = { id: id(), name: file.name || (kind === "image" ? "photo.jpg" : "file"), size: file.size };
  if (file.size > MAX_BYTES) return { ...base, kind, tokens: 0, chunks: [], error: "File is larger than 4 MB." };
  try {
    if (kind === "image") {
      // ~256 tokens is a typical vision-encoder budget for one image.
      return { ...base, kind, tokens: 256, chunks: [], preview: await thumb(file) };
    }
    const isPdf = /\.pdf$/i.test(base.name) || file.type === "application/pdf";
    const text = isPdf ? await pdfText(await file.arrayBuffer()) : await file.text();
    if (!text.trim()) return { ...base, kind, tokens: 0, chunks: [], error: isPdf ? "No selectable text found in this PDF (scanned or encrypted)." : "File is empty." };
    if (/\u0000/.test(text.slice(0, 2000))) return { ...base, kind, tokens: 0, chunks: [], error: "This looks like a binary file." };
    const chunks = chunkText(text);
    return { ...base, kind, tokens: estimateTokens(text), chunks };
  } catch {
    return { ...base, kind, tokens: 0, chunks: [], error: "Could not read this file." };
  }
}

/** Fold text attachments into one context block, dropping trailing chunks past `budgetTokens`. */
export function buildContext(atts: Attachment[], budgetTokens: number): { text: string; tokens: number; truncated: boolean } {
  let left = budgetTokens;
  let truncated = false;
  const blocks: string[] = [];
  for (const a of atts) {
    if (a.kind !== "text" || a.error) continue;
    const kept: string[] = [];
    for (const c of a.chunks) {
      const t = estimateTokens(c);
      if (t > left) {
        truncated = true;
        break;
      }
      kept.push(c);
      left -= t;
    }
    if (kept.length) blocks.push(`--- attached file: ${a.name}${kept.length < a.chunks.length ? " (truncated)" : ""} ---\n${kept.join("\n\n")}\n--- end of ${a.name} ---`);
  }
  return { text: blocks.join("\n\n"), tokens: budgetTokens - left, truncated };
}
