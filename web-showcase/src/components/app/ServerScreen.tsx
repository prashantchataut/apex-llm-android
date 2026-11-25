"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { RippleButton, Toggle } from "@/components/ui/Glass";
import QRCode from "qrcode";
import { haptic } from "@/lib/haptics";
import { invokeNative, isNative } from "@/lib/native";

export interface KeyRec {
  id: string;
  name: string;
  hint: string;
  requests: number;
  tokens: number;
  revoked: boolean;
}
interface LogEntry {
  id: number;
  time: string;
  line: string;
  status: number;
  keyName: string;
}

const SAMPLE_IP = "192.168.1.42";

interface NativeKey {
  id: string;
  name: string;
  hint: string;
  requests: number;
  prompt_tokens: number;
  completion_tokens: number;
  revoked: boolean;
}
interface NativeStatus {
  running: boolean;
  port: number;
  lan_ip: string | null;
}
const toRec = (k: NativeKey): KeyRec => ({ id: k.id, name: k.name, hint: k.hint, requests: k.requests, tokens: k.prompt_tokens + k.completion_tokens, revoked: k.revoked });
const B62 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/** Unbiased base62 via rejection sampling (Rust uses rand's Alphanumeric). */
function genSecret(len = 43): string {
  let out = "";
  const buf = new Uint8Array(64);
  while (out.length < len) {
    crypto.getRandomValues(buf);
    for (const b of buf) {
      if (b < 248 && out.length < len) out += B62[b % 62]; // 248 = 62*4
    }
  }
  return out;
}

const ENDPOINTS = [
  ["POST", "/v1/chat/completions"],
  ["GET", "/v1/models"],
  ["POST", "/api/chat"],
  ["GET", "/api/tags"],
  ["POST", "/api/generate"],
] as const;

type Tab = "cursor" | "continue" | "openwebui" | "curl";
const TAB_LABEL: Record<Tab, string> = { cursor: "Cursor", continue: "VS Code Continue", openwebui: "OpenWebUI", curl: "curl" };

function snippet(tab: Tab, key: string, base: string, model: string): string {
  if (tab === "cursor") return `Settings → Models → OpenAI API Key\nOverride OpenAI Base URL: ${base}/v1\nAPI Key: ${key}\nModel: ${model}`;
  if (tab === "continue") return `# ~/.continue/config.yaml\nmodels:\n  - name: Apex · ${model}\n    provider: openai\n    model: ${model}\n    apiBase: ${base}/v1\n    apiKey: ${key}`;
  if (tab === "openwebui") return `docker run -d -p 3000:8080 \\\n  -e OLLAMA_BASE_URL=${base} \\\n  -e OPENAI_API_BASE_URL=${base}/v1 \\\n  -e OPENAI_API_KEY=${key} \\\n  ghcr.io/open-webui/open-webui:main`;
  return `curl ${base}/v1/chat/completions \\\n  -H "Authorization: Bearer ${key}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"model":"${model}","stream":true,\n       "messages":[{"role":"user","content":"Hello from my PC"}]}'`;
}

/** Scannable pairing code: opens the phone's web console on the PC, with the new key pre-filled via the URL fragment (never sent to a server). */
function PairingQR({ url }: { url: string }) {
  const [svg, setSvg] = useState("");
  useEffect(() => {
    let live = true;
    QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#0b0b10", light: "#ffffff" } }).then((x) => live && setSvg(x));
    return () => {
      live = false;
    };
  }, [url]);
  return <div className="h-[148px] w-[148px] shrink-0 overflow-hidden rounded-2xl bg-white p-1.5 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.6)] [&>svg]:h-full [&>svg]:w-full" role="img" aria-label={`QR code for ${url}`} dangerouslySetInnerHTML={{ __html: svg }} />;
}

/** Ollama Mobile Server & API Key Hub. */
export function ServerScreen({ keys, setKeys, model }: { keys: KeyRec[]; setKeys: (f: (k: KeyRec[]) => KeyRec[]) => void; model?: string | null }) {
  const [on, setOn] = useState(false);
  const [name, setName] = useState("");
  const [fresh, setFresh] = useState<{ id: string; key: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("cursor");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [gh, setGh] = useState<{ pat: string; login: string | null; repos: string[]; busy: boolean; error: string | null }>({ pat: "", login: null, repos: [], busy: false, error: null });
  const [lan, setLan] = useState<string | null>(isNative() ? null : SAMPLE_IP);
  const [srvErr, setSrvErr] = useState<string | null>(null);
  const logId = useRef(1);
  const native = isNative();
  const keysRef = useRef(keys);
  keysRef.current = keys;

  // app: real server state + key vault
  useEffect(() => {
    if (!native) return;
    void invokeNative<NativeStatus>("server_status").then((st) => {
      if (!st) return;
      setOn(st.running);
      setLan(st.lan_ip);
    });
    void invokeNative<NativeKey[]>("key_list").then((l) => l && setKeys(() => l.map(toRec)));
  }, [native, setKeys]);
  useEffect(() => {
    if (!native || !on) return;
    const id = window.setInterval(() => void invokeNative<NativeKey[]>("key_list").then((l) => l && setKeys(() => l.map(toRec))), 3000);
    return () => window.clearInterval(id);
  }, [native, on, setKeys]);

  const toggleServer = async (next: boolean) => {
    setSrvErr(null);
    if (!native) {
      setOn(next);
      if (next) haptic("heavyLock");
      return;
    }
    const st = await invokeNative<NativeStatus>(next ? "server_start" : "server_stop");
    if (!st) {
      setSrvErr(next ? "The server could not start (is port 11434 already in use?)." : "The server could not be stopped.");
      return;
    }
    setOn(st.running);
    setLan(st.lan_ip);
    if (st.running) haptic("heavyLock");
  };

  // browser preview only: sample traffic so the log layout can be reviewed (the app shows real requests)
  useEffect(() => {
    if (!on || native) return;
    const id = window.setInterval(() => {
      const active = keysRef.current.filter((k) => !k.revoked);
      const [m, p] = ENDPOINTS[Math.floor(Math.random() * ENDPOINTS.length)];
      const unauth = active.length === 0 || Math.random() < 0.12;
      const k = active[Math.floor(Math.random() * active.length)];
      const t = new Date();
      const entry: LogEntry = {
        id: logId.current++,
        time: t.toLocaleTimeString([], { hour12: false }),
        line: `${m} ${p}`,
        status: unauth ? 401 : 200,
        keyName: unauth ? "no key" : k.name,
      };
      setLogs((l) => [entry, ...l].slice(0, 7));
      if (!unauth && k) {
        const add = p.includes("chat") || p.includes("generate") ? 40 + Math.floor(Math.random() * 300) : 0;
        setKeys((ks) => ks.map((x) => (x.id === k.id ? { ...x, requests: x.requests + 1, tokens: x.tokens + add } : x)));
      }
    }, 1900);
    return () => window.clearInterval(id);
  }, [on, native, setKeys]);

  const create = async () => {
    if (native) {
      const r = await invokeNative<{ key: string; record: NativeKey }>("key_create", { name: name.trim() || "My PC" });
      if (r) {
        setKeys((ks) => [toRec(r.record), ...ks]);
        setFresh({ id: r.record.id, key: r.key });
        setName("");
      }
      return;
    }
    const secret = genSecret();
    const id = secret.slice(0, 8);
    setKeys((ks) => [{ id, name: name.trim() || "My PC", hint: secret.slice(-4), requests: 0, tokens: 0, revoked: false }, ...ks]);
    setFresh({ id, key: `sk-apex-${secret}` });
    setName("");
  };
  const copy = async (text: string, tag: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(tag);
      window.setTimeout(() => setCopied(null), 1400);
    } catch {
      /* clipboard unavailable (insecure context) */
    }
  };

  const shownKey = fresh?.key ?? "sk-apex-YOUR_KEY";
  const base = `http://${lan ?? SAMPLE_IP}:11434`;
  const code = useMemo(() => snippet(tab, shownKey, base, model ? model.replace(/\.gguf$/i, "") : "qwen2.5-3b-instruct"), [tab, shownKey, base, model]);
  const pairUrl = fresh ? `${base}/#key=${fresh.key}` : `${base}/`;

  return (
    <div className="scroll-hide h-full overflow-y-auto px-5 pb-6 pt-14">
      <h2 className="display mb-5 text-[30px]">Server</h2>

      {srvErr && <p className="mb-2 text-[12.5px] text-bad">{srvErr}</p>}
      <div className="bento p-4">
        <div className="flex items-center gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-[15px] font-medium">
              <span className={`h-2 w-2 rounded-full ${on ? "bg-ok shadow-[0_0_10px_#34d399]" : "bg-white/25"}`} />
              {on ? "Serving Ollama + OpenAI APIs" : "Server stopped"}
            </div>
            <div className="mono mt-1 text-[11.5px] text-ink-3">{on ? `${lan ?? "no Wi-Fi address"}:11434` : "0.0.0.0:11434 when started"}</div>
          </div>
          <Toggle on={on} onChange={(v) => void toggleServer(v)} label="Local API server" />
        </div>
      </div>

      {/* API keys */}
      <h3 className="mt-8 mb-3 text-[14px] font-medium text-ink-3">API keys</h3>
      <div className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void create()}
          placeholder="Key name (e.g. Cursor on laptop)"
          aria-label="Key name"
          className="glass-dark min-w-0 flex-1 rounded-2xl px-4 text-[14px] outline-none placeholder:text-ink-3"
        />
        <RippleButton onClick={() => void create()} className="flex h-12 items-center gap-1.5 rounded-2xl bg-white px-4 text-[13px] font-medium text-black">
          <Icon name="key" size={16} /> Generate
        </RippleButton>
      </div>

      <AnimatePresence>
        {fresh && (
          <motion.div initial={{ opacity: 0, y: -8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0 }} className="glass mt-3 !rounded-[22px] p-3.5">
            <div className="relative z-[1]">
              <div className="text-[11px] font-medium text-ink-2">Copy now — shown once</div>
              <div className="mono mt-2 break-all text-[12px] leading-relaxed">{fresh.key}</div>
              <div className="mt-3 flex gap-2">
                <RippleButton onClick={() => copy(fresh.key, "fresh")} className="flex h-11 items-center gap-1.5 rounded-full bg-white px-4 text-[12px] font-medium text-black">
                  <Icon name={copied === "fresh" ? "check" : "copy"} size={14} /> {copied === "fresh" ? "Copied" : "Copy"}
                </RippleButton>
                <button onClick={() => setFresh(null)} className="h-11 rounded-full px-3 text-[12px] text-ink-2">
                  I saved it
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mt-3 space-y-2">
        {keys.length === 0 && <p className="py-3 text-center text-[13px] text-ink-3">No keys yet. Generate one to let your PC connect.</p>}
        {keys.map((k) => (
          <div key={k.id} className={`bento flex items-center gap-3 p-3.5 ${k.revoked ? "opacity-45" : ""}`}>
            <span className="icon-pill shrink-0">
              <Icon name="key" size={16} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[14px] font-medium">{k.name}</div>
              <div className="mono tnum text-[11px] text-ink-3">
                sk-apex-••••{k.hint} · {k.requests} req · {k.tokens.toLocaleString()} tok
              </div>
            </div>
            {k.revoked ? (
              <span className="text-[11px] text-bad">revoked</span>
            ) : (
              <button onClick={() => { if (native) void invokeNative("key_revoke", { id: k.id }); setKeys((ks) => ks.map((x) => (x.id === k.id ? { ...x, revoked: true } : x))); }} className="min-h-11 rounded-full border border-white/10 px-4 text-[11.5px] text-ink-2 active:scale-95">
                Revoke
              </button>
            )}
          </div>
        ))}
      </div>

      {/* QR pairing */}
      <h3 className="mt-8 mb-3 text-[14px] font-medium text-ink-3">Pair your PC</h3>
      <div className="bento flex items-center gap-4 p-4">
        <PairingQR url={pairUrl} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[14px] font-medium">
            <Icon name="qr" size={16} /> Scan to open the console
          </div>
          <p className="mt-1.5 text-[12px] leading-snug text-ink-3">{fresh ? "Includes your new key — it stays in the URL fragment and is never sent over the network." : "Generate a key to pre-fill it, or open the console and paste one."}</p>
          <p className="mono mt-2 break-all text-[10.5px] text-ink-2">{base}/</p>
          <RippleButton onClick={() => copy(`${base}/`, "url")} className="mt-2.5 flex h-11 items-center gap-1.5 rounded-full bg-white/[0.08] px-3.5 text-[12px] font-medium">
            <Icon name={copied === "url" ? "check" : "copy"} size={14} /> {copied === "url" ? "Copied" : "Copy URL"}
          </RippleButton>
        </div>
      </div>
      {!on && <p className="mt-2 text-[11.5px] text-ink-3">Start the server above — the console only answers while it is on and your PC is on the same Wi-Fi.</p>}

      {/* config generator */}
      <h3 className="mt-8 mb-3 text-[14px] font-medium text-ink-3">Connect your PC</h3>
      <div className="bento overflow-hidden">
        <div className="flex border-b border-white/[0.07]" role="tablist">
          {(Object.keys(TAB_LABEL) as Tab[]).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`min-h-11 flex-1 px-1 py-3 text-[11.5px] font-medium ${tab === t ? "bg-white/[0.07] text-white" : "text-ink-3"}`}>
              {TAB_LABEL[t]}
            </button>
          ))}
        </div>
        <pre className="mono scroll-hide overflow-x-auto p-3.5 text-[11px] leading-relaxed text-ink-2">{code}</pre>
        <div className="border-t border-white/[0.07] p-2.5">
          <RippleButton onClick={() => copy(code, "code")} className="flex h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-white/[0.07] text-[12.5px] font-medium">
            <Icon name={copied === "code" ? "check" : "copy"} size={14} /> {copied === "code" ? "Copied" : "Copy config"}
          </RippleButton>
        </div>
      </div>

      {/* live request timeline */}
      <h3 className="mt-8 mb-3 text-[14px] font-medium text-ink-3">Live requests</h3>
      <div className="bento p-4">
        {logs.length === 0 ? (
          <p className="text-[13px] text-ink-3">{on ? "Waiting for requests…" : "Start the server to see requests."}</p>
        ) : (
          <ol className="relative space-y-3 pl-6">
            <span className="absolute bottom-1 left-[6px] top-1 w-px bg-white/15" aria-hidden="true" />
            <AnimatePresence initial={false}>
              {logs.map((l) => (
                <motion.li key={l.id} layout initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="relative">
                  <span className={`absolute -left-6 top-[3px] h-[13px] w-[13px] rounded-full border ${l.status === 200 ? "border-ok/60 bg-ok/25" : "border-bad/60 bg-bad/25"}`} />
                  <div className="mono text-[11.5px] text-ink-2">
                    {l.line} <span className={l.status === 200 ? "text-ok" : "text-bad"}>{l.status}</span>
                  </div>
                  <div className="mono tnum text-[10.5px] text-ink-3">
                    {l.time} · {l.keyName}
                  </div>
                </motion.li>
              ))}
            </AnimatePresence>
          </ol>
        )}
      </div>

      {/* GitHub */}
      <h3 className="mt-8 mb-3 text-[14px] font-medium text-ink-3">GitHub</h3>
      <div className="bento p-4">
        {!gh.login ? (
          <>
            <div className="flex gap-2">
              <input
                type="password"
                value={gh.pat}
                onChange={(e) => setGh({ ...gh, pat: e.target.value, error: null })}
                placeholder="Personal access token"
                aria-label="GitHub token"
                autoComplete="off"
                className="glass-dark min-w-0 flex-1 rounded-2xl px-4 py-3 text-[14px] outline-none placeholder:text-ink-3"
              />
              <RippleButton
                disabled={!gh.pat || gh.busy}
                onClick={async () => {
                  setGh((g) => ({ ...g, busy: true, error: null }));
                  try {
                    const h = { Authorization: `Bearer ${gh.pat.trim()}`, Accept: "application/vnd.github+json" };
                    const u = await fetch("https://api.github.com/user", { headers: h });
                    if (!u.ok) throw new Error(u.status === 401 ? "GitHub rejected this token." : `GitHub returned ${u.status}.`);
                    const me = (await u.json()) as { login: string };
                    const r = await fetch("https://api.github.com/user/repos?per_page=5&sort=pushed", { headers: h });
                    const repos = r.ok ? ((await r.json()) as { full_name: string }[]).map((x) => x.full_name) : [];
                    setGh({ pat: "", login: me.login, repos, busy: false, error: null });
                    haptic("heavyLock");
                  } catch (e) {
                    setGh((g) => ({ ...g, busy: false, error: e instanceof Error && e.message.startsWith("GitHub") ? e.message : "Could not reach GitHub." }));
                  }
                }}
                className="flex items-center gap-1.5 rounded-2xl bg-white px-4 text-[13px] font-medium text-black disabled:opacity-40"
              >
                <Icon name="github" size={16} /> {gh.busy ? "Checking…" : "Connect"}
              </RippleButton>
            </div>
            {gh.error && <p className="mt-2 text-[12px] text-bad">{gh.error}</p>}
            <p className="mt-2 text-[11px] text-ink-3">The token is checked directly with api.github.com and kept in memory only.</p>
          </>
        ) : (
          <div>
            <div className="mb-3 flex items-center gap-2 text-[13px] text-ok">
              <Icon name="check" size={15} /> Connected as @{gh.login}
            </div>
            <div className="mono mb-1 text-[10.5px] text-ink-3">Recently pushed</div>
            {gh.repos.map((f) => (
              <div key={f} className="mono truncate py-1.5 text-[11.5px] text-ink-2">
                {f}
              </div>
            ))}
            <button onClick={() => setGh({ pat: "", login: null, repos: [], busy: false, error: null })} className="mt-2 min-h-11 text-[12px] text-ink-3">
              Disconnect
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
