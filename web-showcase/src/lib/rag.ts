"use client";

import { useSyncExternalStore } from "react";
import { pdfText } from "./attachments";

/**
 * On-device RAG Knowledge Vault.
 *  - Persistence: IndexedDB (`apex-vault`: `docs` + `chunks`). Nothing leaves the device except the optional GitHub import.
 *  - Chunking: line-aware windows (~900 chars) with a 3-line overlap, every chunk keeps its 1-based start/end line,
 *    which is what makes `[Source: file.md#L12]` citations resolvable.
 *  - Ranking: BM25 (k1 1.4, b 0.75) fused with cosine over a hashed word + char-3-gram vector (256 dims). The vector is
 *    a lightweight lexical-semantic signal (typo/morphology tolerant) — it is NOT a neural embedding.
 */
export type VaultSource = "upload" | "github" | "paste";
export interface VaultDoc {
  id: string;
  collection: string;
  name: string;
  size: number;
  chunks: number;
  lines: number;
  added: number;
  source: VaultSource;
  repo?: string;
}
export interface VaultChunk {
  id: string;
  docId: string;
  docName: string;
  collection: string;
  startLine: number;
  endLine: number;
  text: string;
  tf: Record<string, number>;
  len: number;
  vec: number[];
}
export interface Hit {
  chunk: VaultChunk;
  score: number;
  bm25: number;
  cos: number;
}

export const VAULT_ACCEPT = ".pdf,.txt,.md,.markdown,.json,.csv,.rs,.py,.ts,.tsx,.js,.jsx,.toml,.yaml,.yml,.kt,.java,.go,.c,.cpp,.h,.html,.css,.sh,text/*,application/pdf,application/json";
const TEXT_EXT = /\.(pdf|txt|md|markdown|json|csv|rs|py|ts|tsx|js|jsx|mjs|toml|ya?ml|kt|java|go|c|cpp|h|hpp|html|css|sh|sql|xml|ini|cfg|lock)$/i;
const DIM = 256;
const STOP = new Set("a an and are as at be but by for from has have i if in into is it its of on or that the their then there these this to was were what when where which who will with you your not can do does how about".split(" "));

/* ───────────────────────── text analysis ───────────────────────── */
export function tokenize(s: string): string[] {
  const out: string[] = [];
  for (const raw of s.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase().split(/[^a-z0-9_]+/)) {
    if (raw.length < 2 || STOP.has(raw)) continue;
    out.push(raw.length > 4 ? raw.replace(/(ing|ed|es|s)$/, "") : raw);
  }
  return out;
}
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
export function embed(tokens: string[]): number[] {
  const v = new Array<number>(DIM).fill(0);
  for (const t of tokens) {
    v[hash(t) % DIM] += 1.5;
    const p = `#${t}#`;
    for (let i = 0; i + 3 <= p.length; i++) v[hash(p.slice(i, i + 3)) % DIM] += 0.5;
  }
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n) || 1;
  return v.map((x) => +(x / n).toFixed(4));
}
const cosine = (a: number[], b: number[]) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
};

/** Line-aware overlapping chunker. Lines are 1-based. */
export function chunkLines(text: string, target = 900, overlapLines = 3): { text: string; startLine: number; endLine: number }[] {
  const src = text.replace(/\r\n?/g, "\n").split("\n");
  // very long physical lines (minified code, PDF paragraphs) are hard-split but keep their line number
  const lines: { n: number; t: string }[] = [];
  src.forEach((t, i) => {
    if (t.length <= target) return lines.push({ n: i + 1, t });
    for (let o = 0; o < t.length; o += target - 120) lines.push({ n: i + 1, t: t.slice(o, o + target) });
  });
  const out: { text: string; startLine: number; endLine: number }[] = [];
  let i = 0;
  while (i < lines.length) {
    let size = 0;
    let j = i;
    while (j < lines.length && (size + lines[j].t.length + 1 <= target || j === i)) size += lines[j++].t.length + 1;
    const body = lines.slice(i, j).map((l) => l.t).join("\n");
    if (body.trim()) out.push({ text: body, startLine: lines[i].n, endLine: lines[j - 1].n });
    if (j >= lines.length) break;
    i = Math.max(i + 1, j - overlapLines);
  }
  return out;
}

/* ───────────────────────── IndexedDB ───────────────────────── */
function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open("apex-vault", 1);
    r.onupgradeneeded = () => {
      const db = r.result;
      db.createObjectStore("docs", { keyPath: "id" });
      db.createObjectStore("chunks", { keyPath: "id" }).createIndex("docId", "docId");
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
const done = (tx: IDBTransaction) => new Promise<void>((res, rej) => ((tx.oncomplete = () => res()), (tx.onerror = () => rej(tx.error)), (tx.onabort = () => rej(tx.error))));
const all = <T,>(db: IDBDatabase, store: string) =>
  new Promise<T[]>((res, rej) => {
    const q = db.transaction(store).objectStore(store).getAll();
    q.onsuccess = () => res(q.result as T[]);
    q.onerror = () => rej(q.error);
  });

/* ───────────────────────── in-memory index + store ───────────────────────── */
let docs: VaultDoc[] = [];
let chunks: VaultChunk[] = [];
let ready: Promise<void> | null = null;
let df = new Map<string, number>();
let avgLen = 1;
const subs = new Set<() => void>();
let version = 0;
const emit = () => {
  version++;
  subs.forEach((f) => f());
};

function reindex() {
  df = new Map();
  let tot = 0;
  for (const c of chunks) {
    tot += c.len;
    for (const t of Object.keys(c.tf)) df.set(t, (df.get(t) ?? 0) + 1);
  }
  avgLen = chunks.length ? tot / chunks.length : 1;
}
export function loadVault(): Promise<void> {
  if (typeof indexedDB === "undefined") return Promise.resolve();
  ready ??= (async () => {
    try {
      const db = await open();
      docs = await all<VaultDoc>(db, "docs");
      chunks = await all<VaultChunk>(db, "chunks");
      db.close();
      reindex();
      emit();
    } catch {
      ready = null;
    }
  })();
  return ready;
}
if (typeof window !== "undefined") void loadVault();

export function useVault(): { docs: VaultDoc[]; version: number } {
  useSyncExternalStore(
    (cb) => (subs.add(cb), () => subs.delete(cb)),
    () => version,
    () => 0,
  );
  return { docs, version };
}
export const vaultStats = () => ({ docs: docs.length, chunks: chunks.length });
export const hasVault = () => chunks.length > 0;

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export async function addDocument(name: string, text: string, opts: { collection?: string; source?: VaultSource; repo?: string } = {}): Promise<VaultDoc> {
  await loadVault();
  const collection = opts.collection ?? "My Vault";
  // re-adding the same file replaces the old copy
  const prev = docs.find((d) => d.name === name && d.collection === collection);
  if (prev) await removeDocument(prev.id, false);
  const id = uid();
  const pieces = chunkLines(text);
  const rows: VaultChunk[] = pieces.map((p, i) => {
    const toks = tokenize(`${name} ${p.text}`);
    const tf: Record<string, number> = {};
    for (const t of toks) tf[t] = (tf[t] ?? 0) + 1;
    return { id: `${id}:${i}`, docId: id, docName: name, collection, startLine: p.startLine, endLine: p.endLine, text: p.text, tf, len: toks.length, vec: embed(toks) };
  });
  const doc: VaultDoc = { id, collection, name, size: text.length, chunks: rows.length, lines: text.split("\n").length, added: Date.now(), source: opts.source ?? "upload", repo: opts.repo };
  const db = await open();
  const tx = db.transaction(["docs", "chunks"], "readwrite");
  tx.objectStore("docs").put(doc);
  for (const r of rows) tx.objectStore("chunks").put(r);
  await done(tx);
  db.close();
  docs = [...docs, doc];
  chunks = [...chunks, ...rows];
  reindex();
  emit();
  return doc;
}

export async function removeDocument(id: string, notify = true): Promise<void> {
  await loadVault();
  const db = await open();
  const tx = db.transaction(["docs", "chunks"], "readwrite");
  tx.objectStore("docs").delete(id);
  for (const c of chunks.filter((c) => c.docId === id)) tx.objectStore("chunks").delete(c.id);
  await done(tx);
  db.close();
  docs = docs.filter((d) => d.id !== id);
  chunks = chunks.filter((c) => c.docId !== id);
  reindex();
  if (notify) emit();
}
export async function clearCollection(collection: string) {
  for (const d of docs.filter((d) => d.collection === collection)) await removeDocument(d.id, false);
  emit();
}

/** Read an uploaded File (PDF text extraction included) and index it. */
export async function addFile(file: File, collection?: string): Promise<VaultDoc> {
  const isPdf = /\.pdf$/i.test(file.name) || file.type === "application/pdf";
  const text = isPdf ? await pdfText(await file.arrayBuffer()) : await file.text();
  if (!text.trim()) throw new Error(isPdf ? `${file.name}: no selectable text (scanned or encrypted PDF).` : `${file.name} is empty.`);
  return addDocument(file.name, text, { collection, source: "upload" });
}

/** Parse `owner/repo`, `github.com/owner/repo` or a full URL. */
export function parseRepo(input: string): { repo: string; ref?: string } | null {
  const m = input.trim().replace(/\.git$/, "").match(/^(?:https?:\/\/)?(?:www\.)?(?:github\.com\/)?([\w.-]+\/[\w.-]+)(?:\/tree\/([^/\s]+))?\/?$/);
  return m ? { repo: m[1], ref: m[2] } : null;
}

/** Pull indexable text files from a GitHub repository (public, or private with a token) into one collection. */
export async function importGithubRepo(input: string, token: string | null, onProgress: (done: number, total: number, file: string) => void, maxFiles = 60): Promise<{ added: number; skipped: number; collection: string }> {
  const p = parseRepo(input);
  if (!p) throw new Error("Use owner/repo or a github.com URL.");
  const h: Record<string, string> = { Accept: "application/vnd.github+json" };
  if (token) h.Authorization = `Bearer ${token}`;
  const meta = await fetch(`https://api.github.com/repos/${p.repo}`, { headers: h });
  if (!meta.ok) throw new Error(meta.status === 404 ? `${p.repo} not found (private repos need a GitHub token in Settings).` : `GitHub answered ${meta.status}.`);
  const branch = p.ref ?? ((await meta.json()) as { default_branch: string }).default_branch;
  const tree = await fetch(`https://api.github.com/repos/${p.repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`, { headers: h });
  if (!tree.ok) throw new Error(`Couldn't read the file tree (${tree.status}).`);
  const files = ((await tree.json()) as { tree: { path: string; type: string; size?: number }[] }).tree
    .filter((f) => f.type === "blob" && TEXT_EXT.test(f.path) && !/\.pdf$/i.test(f.path) && !/(^|\/)(node_modules|dist|build|target|\.git|vendor)\//.test(f.path) && !/package-lock|Cargo\.lock|\.min\./.test(f.path) && (f.size ?? 0) < 200_000)
    .sort((a, b) => (/readme|\.md$/i.test(a.path) ? 0 : 1) - (/readme|\.md$/i.test(b.path) ? 0 : 1) || (a.size ?? 0) - (b.size ?? 0))
    .slice(0, maxFiles);
  let added = 0;
  let skipped = 0;
  for (let i = 0; i < files.length; i++) {
    onProgress(i, files.length, files[i].path);
    try {
      const r = await fetch(`https://raw.githubusercontent.com/${p.repo}/${encodeURIComponent(branch)}/${files[i].path.split("/").map(encodeURIComponent).join("/")}`);
      if (!r.ok) throw new Error(String(r.status));
      const text = await r.text();
      if (!text.trim()) throw new Error("empty");
      await addDocument(files[i].path, text, { collection: p.repo, source: "github", repo: p.repo });
      added++;
    } catch {
      skipped++;
    }
  }
  onProgress(files.length, files.length, "");
  return { added, skipped, collection: p.repo };
}

/* ───────────────────────── retrieval ───────────────────────── */
export function search(query: string, k = 4, collection?: string): Hit[] {
  const qt = tokenize(query);
  if (!qt.length || !chunks.length) return [];
  const N = chunks.length;
  const qv = embed(qt);
  const pool = collection ? chunks.filter((c) => c.collection === collection) : chunks;
  const raw = pool.map((c) => {
    let s = 0;
    for (const t of new Set(qt)) {
      const f = c.tf[t];
      if (!f) continue;
      const n = df.get(t) ?? 0;
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
      s += (idf * (f * 2.4)) / (f + 1.4 * (0.25 + 0.75 * (c.len / avgLen)));
    }
    return { c, bm: s, cos: cosine(qv, c.vec) };
  });
  const maxBm = Math.max(...raw.map((r) => r.bm), 1e-9);
  return raw
    .map((r) => ({ chunk: r.c, bm25: r.bm / maxBm, cos: r.cos, score: 0.72 * (r.bm / maxBm) + 0.28 * r.cos }))
    .filter((h) => (h.bm25 > 0.12 && h.score > 0.18) || h.cos > 0.55)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

export const citeTag = (c: Pick<VaultChunk, "docName" | "startLine">) => `[Source: ${c.docName}#L${c.startLine}]`;

/** System-prompt block for the retrieved excerpts, plus the tags the UI can show as citations. */
export function buildRagContext(hits: Hit[], budgetChars = 3200): { block: string; tags: string[] } {
  if (!hits.length) return { block: "", tags: [] };
  let used = 0;
  const parts: string[] = [];
  const tags: string[] = [];
  for (const h of hits) {
    const body = h.chunk.text.slice(0, 1100);
    if (used + body.length > budgetChars && parts.length) break;
    used += body.length;
    const tag = citeTag(h.chunk);
    tags.push(tag);
    parts.push(`${tag}\n${body}`);
  }
  return {
    tags,
    block: `\n\nKNOWLEDGE VAULT EXCERPTS (the user's own documents, retrieved on-device). Prefer them over guessing. After every fact taken from an excerpt, cite it with its exact tag, e.g. ${tags[0]}. If the excerpts do not contain the answer, say so plainly.\n\n${parts.join("\n\n---\n\n")}`,
  };
}

/** Resolve a clicked `[Source: name#L12]` to the chunk holding that line. */
export function resolveCitation(name: string, line: number): VaultChunk | null {
  const mine = chunks.filter((c) => c.docName === name);
  return mine.find((c) => c.startLine <= line && line <= c.endLine) ?? mine.sort((a, b) => Math.abs(a.startLine - line) - Math.abs(b.startLine - line))[0] ?? null;
}
export const parseCitation = (s: string): { name: string; line: number } | null => {
  const m = s.match(/^\[Source:\s*(.+?)#L(\d+)(?:-L?\d+)?\]$/i);
  return m ? { name: m[1], line: +m[2] } : null;
};
export const docChunks = (docId: string) => chunks.filter((c) => c.docId === docId);
