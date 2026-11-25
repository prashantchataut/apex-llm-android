"use client";

import { useSyncExternalStore } from "react";
import { IMAGE_ENGINES, imageUrl, randomSeed, type ImageJob } from "./images";
import { addMemory, getMemories } from "./memory";
import { activeMcpTools, callMcpTool } from "./mcp";

/** Built-in agent skills. Two paths: (1) `preRun` injects context for URLs / repos / searches / math found in the prompt,
 * (2) models that follow the `<tool_call>` format can call tools themselves (see `toolsHint`). */
export type SkillId = "web" | "github" | "image" | "sandbox" | "memory";

export interface Skill {
  id: SkillId;
  emoji: string;
  name: string;
  desc: string;
}
export const SKILLS: Skill[] = [
  { id: "web", emoji: "globe", name: "Live web search & URL reader", desc: "Paste a link or say “search for …”. Reads pages via r.jina.ai and Wikipedia." },
  { id: "github", emoji: "branch", name: "GitHub repo architect", desc: "Paste github.com/owner/repo to read its tree, README and files. Add a token to create Gists." },
  { id: "image", emoji: "image", name: "Image generator tool", desc: "Lets the model draw inline images when you ask." },
  { id: "sandbox", emoji: "code", name: "JS / math sandbox", desc: "Runs calculations and short scripts in an isolated worker." },
  { id: "memory", emoji: "tree", name: "Memory manager", desc: "Reads and writes your long-term memory." },
];

const KEY = "apex.skills.v1";
const PAT_KEY = "apex.github.pat.v1";
const DEFAULT: SkillId[] = ["web", "github", "image", "sandbox", "memory"];
const EMPTY: SkillId[] = [];
let enabled: SkillId[] = DEFAULT;
const subs = new Set<() => void>();
if (typeof window !== "undefined") {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null") as SkillId[] | null;
    if (Array.isArray(raw)) enabled = raw;
  } catch {
    /* corrupt */
  }
}
export const getSkills = () => enabled;
export function toggleSkill(id: SkillId) {
  enabled = enabled.includes(id) ? enabled.filter((x) => x !== id) : [...enabled, id];
  try {
    localStorage.setItem(KEY, JSON.stringify(enabled));
  } catch {
    /* storage blocked */
  }
  subs.forEach((f) => f());
}
export function useSkills(): SkillId[] {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => enabled,
    () => EMPTY,
  );
}
export const getGithubToken = (): string => {
  try {
    return localStorage.getItem(PAT_KEY) ?? "";
  } catch {
    return "";
  }
};
export function setGithubToken(t: string) {
  try {
    if (t) localStorage.setItem(PAT_KEY, t.trim());
    else localStorage.removeItem(PAT_KEY);
  } catch {
    /* storage blocked */
  }
}

export interface ToolNote {
  icon: string;
  label: string;
  ok: boolean;
}
export interface ToolResult {
  text: string;
  note: ToolNote;
  images?: { url: string; prompt: string }[];
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}\n…[truncated]` : s);

async function jina(url: string): Promise<string> {
  const r = await fetch(`https://r.jina.ai/${url}`, { headers: { Accept: "text/plain" } });
  if (!r.ok) throw new Error(`Reader answered ${r.status}`);
  return clip(await r.text(), 6000);
}

async function wiki(q: string): Promise<string> {
  const base = "https://en.wikipedia.org/w/api.php?format=json&origin=*";
  const s = (await (await fetch(`${base}&action=query&list=search&srlimit=3&srsearch=${encodeURIComponent(q)}`)).json()) as { query?: { search?: { title: string; snippet: string }[] } };
  const hits = s.query?.search ?? [];
  if (!hits.length) return `No Wikipedia results for “${q}”.`;
  const ex = (await (await fetch(`${base}&action=query&prop=extracts&exintro=1&explaintext=1&titles=${encodeURIComponent(hits[0].title)}`)).json()) as { query?: { pages?: Record<string, { extract?: string }> } };
  const extract = Object.values(ex.query?.pages ?? {})[0]?.extract ?? "";
  return `Top result — ${hits[0].title}:\n${clip(extract, 2500)}\n\nOther results: ${hits.slice(1).map((h) => h.title).join("; ") || "none"}`;
}

function ghHeaders(raw = false): HeadersInit {
  const t = getGithubToken();
  return { Accept: raw ? "application/vnd.github.raw+json" : "application/vnd.github+json", ...(t ? { Authorization: `Bearer ${t}` } : {}) };
}

export async function githubRead(repo: string, path?: string): Promise<string> {
  if (path) {
    const r = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, { headers: ghHeaders(true) });
    if (!r.ok) throw new Error(`GitHub answered ${r.status} for ${repo}/${path}`);
    return clip(await r.text(), 7000);
  }
  const [meta, tree, readme] = await Promise.all([
    fetch(`https://api.github.com/repos/${repo}`, { headers: ghHeaders() }),
    fetch(`https://api.github.com/repos/${repo}/git/trees/HEAD?recursive=1`, { headers: ghHeaders() }),
    fetch(`https://api.github.com/repos/${repo}/readme`, { headers: ghHeaders(true) }),
  ]);
  if (!meta.ok) throw new Error(`GitHub answered ${meta.status} for ${repo}`);
  const m = (await meta.json()) as { description?: string; language?: string; stargazers_count?: number; default_branch?: string };
  const t = tree.ok ? ((await tree.json()) as { tree?: { path: string; type: string }[] }).tree ?? [] : [];
  const files = t.filter((x) => x.type === "blob").slice(0, 120).map((x) => x.path);
  return `Repository ${repo} — ${m.description ?? "no description"} (${m.language ?? "n/a"}, ${m.stargazers_count ?? 0} stars, branch ${m.default_branch ?? "main"})\n\nFile tree (${files.length}${t.length > 120 ? "+" : ""} files):\n${files.join("\n")}\n\nREADME:\n${readme.ok ? clip(await readme.text(), 3500) : "(none)"}`;
}

async function gist(filename: string, content: string): Promise<string> {
  const t = getGithubToken();
  if (!t) throw new Error("Add a GitHub token in Skills to create Gists");
  const r = await fetch("https://api.github.com/gists", { method: "POST", headers: { ...ghHeaders(), "Content-Type": "application/json" }, body: JSON.stringify({ description: "Created with Apex", public: false, files: { [filename]: { content } } }) });
  if (!r.ok) throw new Error(`GitHub answered ${r.status}`);
  return ((await r.json()) as { html_url: string }).html_url;
}

/** Safe arithmetic: digits, operators, parentheses and Math.* only. */
export function calc(expr: string): string {
  const e = expr.replace(/\^/g, "**").replace(/\bpi\b/gi, "Math.PI");
  if (!/^[\d\s+\-*/().,%e*]*(?:Math\.\w+[\d\s+\-*/().,%e*]*)*$/.test(e)) throw new Error("Unsupported characters in expression");
  const v = new Function(`"use strict"; return (${e});`)() as unknown;
  return String(v);
}

export function runJs(code: string): Promise<string> {
  return new Promise((resolve) => {
    const src = `self.onmessage=()=>{const out=[];const log=(...a)=>out.push(a.map(x=>typeof x==="object"?JSON.stringify(x):String(x)).join(" "));let r;try{r=(new Function("console",${JSON.stringify(`"use strict";\n${code}`)}))({log});}catch(e){out.push("Error: "+e.message)}postMessage(out.join("\\n")+(r!==undefined?"\\n=> "+(typeof r==="object"?JSON.stringify(r):String(r)):""))}`;
    const url = URL.createObjectURL(new Blob([src], { type: "text/javascript" }));
    const w = new Worker(url);
    const done = (s: string) => {
      w.terminate();
      URL.revokeObjectURL(url);
      resolve(clip(s, 3000));
    };
    const t = setTimeout(() => done("Timed out after 4 s"), 4000);
    w.onmessage = (e: MessageEvent<string>) => {
      clearTimeout(t);
      done(e.data);
    };
    w.onerror = (e) => {
      clearTimeout(t);
      done(`Error: ${e.message}`);
    };
    w.postMessage(1);
  });
}

function makeImage(prompt: string, engine = "flux"): ToolResult {
  const job: ImageJob = { prompt, engine: IMAGE_ENGINES.some((e) => e.id === engine && !e.local) ? engine : "flux", aspect: "1:1", style: "none", negative: "", seed: randomSeed() };
  return { text: "The image was generated and is shown to the user.", note: { icon: "image", label: `Image · ${prompt.slice(0, 40)}`, ok: true }, images: [{ url: imageUrl(job), prompt }] };
}

/** Context injection from what the user typed. */
export async function preRun(prompt: string, on: SkillId[]): Promise<{ context: string; notes: ToolNote[] }> {
  const parts: string[] = [];
  const notes: ToolNote[] = [];
  const add = async (icon: string, label: string, f: () => Promise<string>) => {
    try {
      parts.push(`[${label}]\n${await f()}`);
      notes.push({ icon, label, ok: true });
    } catch (e) {
      notes.push({ icon, label: `${label} — ${e instanceof Error ? e.message : "failed"}`, ok: false });
    }
  };
  const gh = prompt.match(/github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:\/blob\/[^/\s]+\/([^\s)]+))?(?=[\s)]|$)/i);
  if (gh && on.includes("github")) await add("branch", `GitHub ${gh[1]}/${gh[2]}${gh[3] ? `/${gh[3]}` : ""}`, () => githubRead(`${gh[1]}/${gh[2]}`, gh[3]));
  else if (on.includes("web")) {
    const urls = [...prompt.matchAll(/https?:\/\/[^\s)]+/g)].map((m) => m[0]).slice(0, 2);
    for (const u of urls) await add("globe", `Read ${new URL(u).host}`, () => jina(u));
  }
  if (on.includes("web") && !parts.length) {
    const q = prompt.match(/^\/search\s+(.+)/i)?.[1] ?? prompt.match(/\b(?:search(?: the web| online)? for|look up|google|news about|latest on)\s+(.{3,80})/i)?.[1];
    if (q) await add("search", `Searched “${q.replace(/[?.!]+$/, "")}”`, () => wiki(q.replace(/[?.!]+$/, "")));
  }
  if (on.includes("sandbox")) {
    const e = prompt.match(/^\/calc\s+(.+)/i)?.[1] ?? (/^[\d\s+\-*/().^%]+$/.test(prompt.trim()) && /[+\-*/^%]/.test(prompt) ? prompt.trim() : null);
    if (e) await add("code", `Computed ${e.slice(0, 40)}`, async () => `${e} = ${calc(e)}`);
  }
  return { context: parts.length ? `Context gathered by tools (use it to answer):\n\n${parts.join("\n\n")}` : "", notes };
}

export interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export function parseToolCall(text: string): ToolCall | null {
  const m = text.match(/<tool_call>([\s\S]*?)<\/tool_call>/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[1].trim()) as { name?: string; arguments?: Record<string, unknown> };
    return j.name ? { name: j.name, arguments: j.arguments ?? {} } : null;
  } catch {
    return null;
  }
}
/** Hide tool-call markup (also while it is still streaming). */
export const stripToolCall = (t: string) => t.replace(/<tool_call>[\s\S]*?(<\/tool_call>|$)/g, "").trim();

export function toolsHint(on: SkillId[]): string {
  const t: string[] = [];
  if (on.includes("web")) t.push(`web_fetch {"url": string} — read a web page`, `web_search {"query": string} — Wikipedia lookup`);
  if (on.includes("github")) t.push(`github_read {"repo": "owner/name", "path"?: string} — repo tree + README, or a file`, `github_gist {"filename": string, "content": string} — create a private Gist`);
  if (on.includes("image")) t.push(`generate_image {"prompt": string} — draw an image for the user`);
  if (on.includes("sandbox")) t.push(`calc {"expression": string}`, `run_js {"code": string} — run JavaScript (use console.log or return)`);
  if (on.includes("memory")) t.push(`remember {"text": string} — save a long-term fact about the user`, `list_memories {}`);
  for (const { server, tool } of activeMcpTools()) t.push(`mcp__${server.id}__${tool.name} ${JSON.stringify((tool.inputSchema as { properties?: unknown } | undefined)?.properties ?? {}).slice(0, 220)} — ${(tool.description ?? "").slice(0, 100)}`);
  if (!t.length) return "";
  return `\n\nTOOLS. When a tool is needed, reply with ONLY one line: <tool_call>{"name":"<tool>","arguments":{...}}</tool_call> and wait for the result. Otherwise answer normally.\nAvailable tools:\n${t.map((x) => `- ${x}`).join("\n")}`;
}

export async function runTool(call: ToolCall, on: SkillId[]): Promise<ToolResult> {
  const a = call.arguments;
  const s = (k: string) => String(a[k] ?? "");
  try {
    switch (call.name) {
      case "web_fetch":
        return { text: await jina(s("url")), note: { icon: "globe", label: `Read ${s("url").slice(0, 40)}`, ok: true } };
      case "web_search":
        return { text: await wiki(s("query")), note: { icon: "search", label: `Searched “${s("query").slice(0, 40)}”`, ok: true } };
      case "github_read":
        return { text: await githubRead(s("repo"), a.path ? s("path") : undefined), note: { icon: "branch", label: `GitHub ${s("repo")}`, ok: true } };
      case "github_gist":
        return { text: `Gist created: ${await gist(s("filename") || "apex.md", s("content"))}`, note: { icon: "branch", label: "Created Gist", ok: true } };
      case "generate_image":
        if (!on.includes("image")) throw new Error("Image skill is off");
        return makeImage(s("prompt"));
      case "calc":
        return { text: `${s("expression")} = ${calc(s("expression"))}`, note: { icon: "code", label: `Computed ${s("expression").slice(0, 36)}`, ok: true } };
      case "run_js":
        return { text: await runJs(s("code")), note: { icon: "code", label: "Ran JavaScript", ok: true } };
      case "remember": {
        const m = addMemory(s("text"), "Preferences", "auto");
        return { text: m ? "Saved." : "Already known or invalid.", note: { icon: "tree", label: `Saved “${s("text").slice(0, 40)}”`, ok: !!m } };
      }
      case "list_memories":
        return { text: getMemories().map((m) => `- ${m.text}`).join("\n") || "(empty)", note: { icon: "tree", label: "Read memory", ok: true } };
      default: {
        const mm = call.name.match(/^mcp__([^_]+(?:_[^_]+)*?)__(.+)$/);
        if (mm) return { text: clip(await callMcpTool(mm[1], mm[2], a), 5000), note: { icon: "plug", label: `MCP · ${mm[2]}`, ok: true } };
        throw new Error(`Unknown tool ${call.name}`);
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "failed";
    return { text: `Tool error: ${msg}`, note: { icon: "alert", label: `${call.name} — ${msg}`, ok: false } };
  }
}

export { makeImage };
