"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { RippleButton, Toggle } from "@/components/ui/Glass";

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

const LAN_IP = "192.168.1.42";
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

type Tab = "cursor" | "continue" | "curl";

function snippet(tab: Tab, key: string): string {
  const base = `http://${LAN_IP}:11434`;
  if (tab === "cursor") return `Settings → Models → OpenAI API Key\nOverride OpenAI Base URL: ${base}/v1\nAPI Key: ${key}\nModel: qwen2.5-3b-instruct`;
  if (tab === "continue")
    return `# ~/.continue/config.yaml\nmodels:\n  - name: Apex · Qwen2.5 3B\n    provider: openai\n    model: qwen2.5-3b-instruct\n    apiBase: ${base}/v1\n    apiKey: ${key}`;
  return `curl ${base}/v1/chat/completions \\\n  -H "Authorization: Bearer ${key}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"model":"qwen2.5-3b-instruct","stream":true,\n       "messages":[{"role":"user","content":"hello from my PC"}]}'`;
}

/** Ollama Mobile Server & API Key Hub. */
export function ServerScreen({ keys, setKeys }: { keys: KeyRec[]; setKeys: (f: (k: KeyRec[]) => KeyRec[]) => void }) {
  const [on, setOn] = useState(false);
  const [name, setName] = useState("");
  const [fresh, setFresh] = useState<{ id: string; key: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("cursor");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [gh, setGh] = useState<{ pat: string; connected: boolean; picked: string[] }>({ pat: "", connected: false, picked: ["apex-llm-android/Cargo.toml"] });
  const logId = useRef(1);
  const keysRef = useRef(keys);
  keysRef.current = keys;

  // live request log (simulated traffic while the server toggle is on)
  useEffect(() => {
    if (!on) return;
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
  }, [on, setKeys]);

  const create = () => {
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
  const code = useMemo(() => snippet(tab, shownKey), [tab, shownKey]);

  return (
    <div className="scroll-hide h-full overflow-y-auto px-5 pb-6 pt-14">
      <h2 className="display mb-5 text-[30px]">Server</h2>

      <div className="bento p-4">
        <div className="flex items-center gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-[15px] font-medium">
              <span className={`h-2 w-2 rounded-full ${on ? "bg-ok shadow-[0_0_10px_#34d399]" : "bg-white/25"}`} />
              {on ? "Serving Ollama + OpenAI APIs" : "Server stopped"}
            </div>
            <div className="mono mt-1 text-[11.5px] text-ink-3">{on ? `${LAN_IP}:11434 · _ollama._tcp` : "0.0.0.0:11434 when started"}</div>
          </div>
          <Toggle on={on} onChange={setOn} label="Local API server" />
        </div>
      </div>

      {/* API keys */}
      <h3 className="mt-7 mb-3 text-[13px] font-semibold uppercase tracking-[0.14em] text-ink-3">API keys</h3>
      <div className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && create()}
          placeholder="Key name (e.g. Cursor on laptop)"
          aria-label="Key name"
          className="glass-dark min-w-0 flex-1 rounded-2xl px-4 text-[14px] outline-none placeholder:text-ink-3"
        />
        <RippleButton onClick={create} className="flex h-12 items-center gap-1.5 rounded-2xl bg-white px-4 text-[13px] font-semibold text-black">
          <Icon name="key" size={16} /> Generate
        </RippleButton>
      </div>

      <AnimatePresence>
        {fresh && (
          <motion.div initial={{ opacity: 0, y: -8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0 }} className="glass mt-3 !rounded-[22px] p-3.5">
            <div className="relative z-[1]">
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-2">Copy now — shown once</div>
              <div className="mono mt-2 break-all text-[12px] leading-relaxed">{fresh.key}</div>
              <div className="mt-3 flex gap-2">
                <RippleButton onClick={() => copy(fresh.key, "fresh")} className="flex h-11 items-center gap-1.5 rounded-full bg-white px-4 text-[12px] font-semibold text-black">
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
              <button onClick={() => setKeys((ks) => ks.map((x) => (x.id === k.id ? { ...x, revoked: true } : x)))} className="min-h-11 rounded-full border border-white/10 px-4 text-[11.5px] text-ink-2 active:scale-95">
                Revoke
              </button>
            )}
          </div>
        ))}
      </div>

      {/* config generator */}
      <h3 className="mt-7 mb-3 text-[13px] font-semibold uppercase tracking-[0.14em] text-ink-3">Connect your PC</h3>
      <div className="bento overflow-hidden">
        <div className="flex border-b border-white/[0.07]" role="tablist">
          {(["cursor", "continue", "curl"] as Tab[]).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`min-h-11 flex-1 py-3 text-[12.5px] font-medium capitalize ${tab === t ? "bg-white/[0.07] text-white" : "text-ink-3"}`}>
              {t === "continue" ? "VS Code Continue" : t}
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
      <h3 className="mt-7 mb-3 text-[13px] font-semibold uppercase tracking-[0.14em] text-ink-3">Live requests</h3>
      <div className="bento p-4">
        {logs.length === 0 ? (
          <p className="text-[13px] text-ink-3">{on ? "Waiting for traffic…" : "Start the server to see requests."}</p>
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
        <p className="mt-3 text-[10.5px] text-ink-3">Demo traffic is simulated in the browser.</p>
      </div>

      {/* GitHub */}
      <h3 className="mt-7 mb-3 text-[13px] font-semibold uppercase tracking-[0.14em] text-ink-3">GitHub</h3>
      <div className="bento p-4">
        {!gh.connected ? (
          <div className="flex gap-2">
            <input
              type="password"
              value={gh.pat}
              onChange={(e) => setGh({ ...gh, pat: e.target.value })}
              placeholder="Personal access token"
              aria-label="GitHub token"
              autoComplete="off"
              className="glass-dark min-w-0 flex-1 rounded-2xl px-4 py-3 text-[14px] outline-none placeholder:text-ink-3"
            />
            <RippleButton disabled={!gh.pat} onClick={() => setGh({ ...gh, pat: "", connected: true })} className="flex items-center gap-1.5 rounded-2xl bg-white px-4 text-[13px] font-semibold text-black disabled:opacity-40">
              <Icon name="github" size={16} /> Connect
            </RippleButton>
          </div>
        ) : (
          <div>
            <div className="mb-3 flex items-center gap-2 text-[13px] text-ok">
              <Icon name="check" size={15} /> Connected (demo — token is never stored or sent)
            </div>
            {["apex-llm-android/Cargo.toml", "apex-llm-android/crates/cortex-server/src/lib.rs", "apex-llm-android/README.md"].map((f) => {
              const sel = gh.picked.includes(f);
              return (
                <button key={f} onClick={() => setGh({ ...gh, picked: sel ? gh.picked.filter((x) => x !== f) : [...gh.picked, f] })} className="flex w-full items-center gap-3 py-2 text-left">
                  <span className={`grid h-5 w-5 place-items-center rounded-md border ${sel ? "border-accent bg-accent" : "border-white/20"}`}>{sel && <Icon name="check" size={13} strokeWidth={3} />}</span>
                  <span className="mono truncate text-[11.5px] text-ink-2">{f}</span>
                </button>
              );
            })}
            <p className="mt-2 text-[11px] text-ink-3">{gh.picked.length} file(s) will be injected into the 4k context budget.</p>
          </div>
        )}
      </div>
    </div>
  );
}
