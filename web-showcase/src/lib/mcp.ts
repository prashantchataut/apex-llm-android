"use client";

import { useSyncExternalStore } from "react";

/**
 * Minimal MCP (Model Context Protocol) client: JSON-RPC 2.0 over Streamable HTTP, with a legacy HTTP+SSE fallback.
 * Supports `initialize`, `notifications/initialized`, `tools/list` and `tools/call`.
 * The server must send CORS headers for browser use (exposing `Mcp-Session-Id` if it is session based).
 */
export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: unknown;
  enabled: boolean;
}
export interface McpServer {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  status: "idle" | "connecting" | "ready" | "error";
  error?: string;
  tools: McpTool[];
  transport?: "streamable" | "sse";
}

const KEY = "apex.mcp.v1";
const EMPTY: McpServer[] = [];
let servers: McpServer[] = EMPTY;
const subs = new Set<() => void>();

if (typeof window !== "undefined") {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]") as McpServer[];
    servers = Array.isArray(raw) ? raw.map((s) => ({ ...s, status: s.status === "error" ? "error" : "idle" })) : EMPTY;
  } catch {
    /* corrupt */
  }
}

function commit(next: McpServer[]) {
  servers = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage blocked */
  }
  subs.forEach((f) => f());
}
const patch = (id: string, p: Partial<McpServer>) => commit(servers.map((s) => (s.id === id ? { ...s, ...p } : s)));

export function useMcp(): McpServer[] {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => servers,
    () => EMPTY,
  );
}
export const getMcp = () => servers;

interface Session {
  call: (method: string, params?: unknown) => Promise<unknown>;
  notify: (method: string, params?: unknown) => Promise<void>;
  transport: "streamable" | "sse";
}
const sessions = new Map<string, Session>();

interface RpcMsg {
  id?: number | string;
  result?: unknown;
  error?: { message?: string };
}

function sseEvents(text: string): { event: string; data: string }[] {
  return text
    .split(/\n\n+/)
    .map((blk) => {
      let event = "message";
      const data: string[] = [];
      for (const line of blk.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
      }
      return { event, data: data.join("\n") };
    })
    .filter((e) => e.data);
}

function unwrap(m: RpcMsg): unknown {
  if (m.error) throw new Error(m.error.message ?? "MCP error");
  return m.result;
}

async function streamable(url: string): Promise<Session> {
  let sid: string | undefined;
  let n = 0;
  const post = async (body: object, wantId?: number): Promise<unknown> => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", ...(sid ? { "Mcp-Session-Id": sid } : {}) },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    sid = res.headers.get("Mcp-Session-Id") ?? sid;
    if (wantId === undefined) return null;
    const ct = res.headers.get("content-type") ?? "";
    if (ct.includes("text/event-stream")) {
      const text = await res.text();
      for (const e of sseEvents(text)) {
        try {
          const m = JSON.parse(e.data) as RpcMsg;
          if (m.id === wantId) return unwrap(m);
        } catch {
          /* skip */
        }
      }
      throw new Error("No JSON-RPC response in event stream");
    }
    return unwrap((await res.json()) as RpcMsg);
  };
  const call = (method: string, params?: unknown) => {
    n += 1;
    return post({ jsonrpc: "2.0", id: n, method, params }, n);
  };
  const notify = async (method: string, params?: unknown) => {
    await post({ jsonrpc: "2.0", method, params });
  };
  await call("initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "apex", version: "0.5.0" } });
  await notify("notifications/initialized");
  return { call, notify, transport: "streamable" };
}

async function legacySse(url: string): Promise<Session> {
  const ctl = new AbortController();
  const res = await fetch(url, { headers: { Accept: "text/event-stream" }, signal: ctl.signal });
  if (!res.ok || !res.body) throw new Error(`SSE HTTP ${res.status}`);
  const pending = new Map<number, (m: RpcMsg) => void>();
  let endpoint = "";
  let onEndpoint: (() => void) | null = null;
  const ready = new Promise<void>((r) => {
    onEndpoint = r;
  });
  const reader = res.body.getReader();
  void (async () => {
    const dec = new TextDecoder();
    let buf = "";
    for (;;) {
      const { done, value } = await reader.read().catch(() => ({ done: true as const, value: undefined }));
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const idx = buf.lastIndexOf("\n\n");
      if (idx < 0) continue;
      const chunk = buf.slice(0, idx + 2);
      buf = buf.slice(idx + 2);
      for (const e of sseEvents(chunk)) {
        if (e.event === "endpoint") {
          endpoint = new URL(e.data, url).href;
          (onEndpoint as (() => void) | null)?.();
        } else {
          try {
            const m = JSON.parse(e.data) as RpcMsg;
            if (typeof m.id === "number") pending.get(m.id)?.(m);
          } catch {
            /* skip */
          }
        }
      }
    }
  })();
  await Promise.race([ready, new Promise((_, rej) => setTimeout(() => rej(new Error("SSE endpoint event timed out")), 8000))]);
  let n = 0;
  const send = (body: object) => fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const call = (method: string, params?: unknown) =>
    new Promise<unknown>((resolve, reject) => {
      n += 1;
      const id = n;
      const t = setTimeout(() => reject(new Error("MCP request timed out")), 30000);
      pending.set(id, (m) => {
        clearTimeout(t);
        try {
          resolve(unwrap(m));
        } catch (e) {
          reject(e);
        }
      });
      void send({ jsonrpc: "2.0", id, method, params }).catch(reject);
    });
  const notify = async (method: string, params?: unknown) => {
    await send({ jsonrpc: "2.0", method, params });
  };
  await call("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "apex", version: "0.5.0" } });
  await notify("notifications/initialized");
  return { call, notify, transport: "sse" };
}

export async function connectMcp(id: string): Promise<void> {
  const s = servers.find((x) => x.id === id);
  if (!s) return;
  patch(id, { status: "connecting", error: undefined });
  try {
    let sess: Session;
    try {
      sess = await streamable(s.url);
    } catch (e) {
      try {
        sess = await legacySse(s.url);
      } catch {
        throw e;
      }
    }
    sessions.set(id, sess);
    const r = (await sess.call("tools/list")) as { tools?: { name: string; description?: string; inputSchema?: unknown }[] };
    const prev = new Map(s.tools.map((t) => [t.name, t.enabled]));
    patch(id, { status: "ready", transport: sess.transport, tools: (r.tools ?? []).map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema, enabled: prev.get(t.name) ?? true })) });
  } catch (e) {
    sessions.delete(id);
    const msg = e instanceof Error ? e.message : "Connection failed";
    patch(id, { status: "error", error: /Failed to fetch|NetworkError/i.test(msg) ? "Could not reach the server (network or CORS blocked)." : msg });
  }
}

export function addMcpServer(name: string, url: string): string {
  const id = Math.random().toString(36).slice(2, 9);
  let host = url;
  try {
    host = new URL(url).host;
  } catch {
    /* validated by caller */
  }
  commit([...servers, { id, name: name.trim() || host, url: url.trim(), enabled: true, status: "idle", tools: [] }]);
  void connectMcp(id);
  return id;
}
export function removeMcpServer(id: string) {
  sessions.delete(id);
  commit(servers.filter((s) => s.id !== id));
}
export const toggleMcpServer = (id: string, enabled: boolean) => patch(id, { enabled });
export function toggleMcpTool(id: string, tool: string, enabled: boolean) {
  commit(servers.map((s) => (s.id === id ? { ...s, tools: s.tools.map((t) => (t.name === tool ? { ...t, enabled } : t)) } : s)));
}

/** Tools the model may currently call (server enabled + tool enabled + connected). */
export function activeMcpTools(): { server: McpServer; tool: McpTool }[] {
  return servers.filter((s) => s.enabled && s.status === "ready").flatMap((server) => server.tools.filter((t) => t.enabled).map((tool) => ({ server, tool })));
}

export async function callMcpTool(serverId: string, tool: string, args: unknown): Promise<string> {
  let sess = sessions.get(serverId);
  if (!sess) {
    await connectMcp(serverId);
    sess = sessions.get(serverId);
  }
  if (!sess) throw new Error("MCP server is not connected");
  const r = (await sess.call("tools/call", { name: tool, arguments: args ?? {} })) as { content?: { type: string; text?: string }[]; isError?: boolean };
  const text = (r.content ?? []).map((c) => (c.type === "text" ? (c.text ?? "") : `[${c.type}]`)).join("\n");
  return r.isError ? `Tool error: ${text}` : text;
}
