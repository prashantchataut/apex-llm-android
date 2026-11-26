"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { AssistantBody } from "@/components/app/Rich";
import { BranchPager } from "@/components/app/MessageTools";
import type { BranchInfo, ChatMsg } from "@/components/app/useChat";
import { downloadImage, fetchImage } from "@/lib/images";
import { CIcon, KeyIcon } from "./icons";

function useNow(active: boolean) {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(performance.now()), 200);
    return () => window.clearInterval(id);
  }, [active]);
  return now;
}

const mmss = (ms: number) => {
  const s = Math.max(1, Math.round(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

function speak(text: string, on: boolean) {
  if (typeof speechSynthesis === "undefined") return;
  speechSynthesis.cancel();
  if (on) speechSynthesis.speak(new SpeechSynthesisUtterance(text.replace(/[`*_#>$]/g, "")));
}

/** `[▶ ||||I||I||| 00:42]` — a transcribed voice note. Audio is not stored, so play reads the transcript aloud. */
export function VoiceBubble({ ms, text }: { ms: number; text: string }) {
  const [playing, setPlaying] = useState(false);
  const bars = useMemo(() => Array.from({ length: 30 }, (_, i) => 5 + ((text.charCodeAt(i % Math.max(1, text.length)) * (i + 3)) % 17)), [text]);
  useEffect(() => () => speak("", false), []);
  return (
    <button
      type="button"
      aria-label={playing ? "Stop voice note" : "Play voice note (reads the transcript aloud)"}
      onClick={() => {
        const next = !playing;
        setPlaying(next);
        speak(text, next);
        if (next) {
          const u = typeof speechSynthesis !== "undefined" ? speechSynthesis : null;
          window.setTimeout(() => setPlaying(false), Math.max(1500, text.length * 62));
          void u;
        }
      }}
      className="flex min-h-11 items-center gap-3 rounded-full border border-[var(--hairline)] bg-[var(--halo-a)] py-1.5 pl-1.5 pr-4 text-[var(--halo-ink)]"
    >
      <span className="grid h-8 w-8 place-items-center rounded-full bg-[var(--surface)]">
        <CIcon name={playing ? "pause" : "play"} size={13} />
      </span>
      <span className="vbars" aria-hidden="true">
        {bars.map((h, i) => (
          <i key={i} style={{ height: h }} />
        ))}
      </span>
      <span className="tnum text-[12px]">{mmss(ms)}</span>
    </button>
  );
}

function ThinkPill({ m }: { m: ChatMsg }) {
  const thinking = m.thinkEnd === null || (m.thinkEnd === undefined && !!m.streaming);
  const now = useNow(thinking);
  const [open, setOpen] = useState<boolean | null>(null);
  const secs = Math.max(0, ((m.thinkEnd ?? now) - (m.thinkStart ?? now)) / 1000);
  const isOpen = open ?? false;
  return (
    <div>
      <button type="button" onClick={() => setOpen(!isOpen)} aria-expanded={isOpen} className="group inline-flex min-h-9 items-center gap-1.5 text-[14px]">
        <span className={thinking ? "shimmer-text" : "text-[rgb(var(--ink-rgb)/var(--ink-3-a))]"}>{thinking ? "Thinking through this…" : `Thought for ${secs.toFixed(1)}s`}</span>
        <CIcon name="chevron" size={14} className="text-[rgb(var(--ink-rgb)/var(--ink-3-a))]" style={{ transform: isOpen ? "rotate(180deg)" : undefined, transition: "transform .35s cubic-bezier(.22,1.2,.36,1)" }} />
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div initial={{ height: 0, opacity: 0, filter: "blur(4px)" }} animate={{ height: "auto", opacity: 1, filter: "blur(0px)" }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }} className="overflow-hidden">
            <div className="think-trace mt-1 max-h-56 overflow-y-auto py-1">
              {(m.steps ?? []).map((st, i) => (
                <p key={i} className="mb-1.5 last:mb-0">
                  {st}
                </p>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ImageCard({ url, prompt, preSrc, onOpen }: { url: string; prompt: string; preSrc?: string; onOpen: (src: string) => void }) {
  const [src, setSrc] = useState<string | null>(preSrc ?? null);
  const [state, setState] = useState<"load" | "ok" | "err">(preSrc ? "load" : "load");
  const [wait, setWait] = useState(0);
  const [msg, setMsg] = useState("");
  const [nonce, setNonce] = useState(0);
  const q = useMemo(() => {
    try {
      const p = new URL(url).searchParams;
      return { w: Number(p.get("width") ?? 768), h: Number(p.get("height") ?? 768) };
    } catch {
      return { w: 768, h: 768 };
    }
  }, [url]);
  useEffect(() => {
    if (src && nonce === 0) return;
    let live = true;
    setState("load");
    fetchImage(url, (s) => live && setWait(s))
      .then((b) => {
        if (!live) return;
        setSrc(b);
      })
      .catch((e: unknown) => {
        if (!live) return;
        setMsg(e instanceof Error ? e.message : "Generation failed");
        setState("err");
      });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, nonce]);
  return (
    <figure className="relative max-w-[420px] overflow-hidden rounded-[22px] shadow-[var(--shadow-card)]" style={{ aspectRatio: `${q.w} / ${q.h}` }}>
      {state !== "ok" && (
        <div className={`absolute inset-0 grid place-items-center px-5 text-center text-[12.5px] text-[rgb(var(--ink-rgb)/var(--ink-3-a))] ${state === "load" ? "shimmer" : "bg-[var(--surface-2)]"}`}>
          {state === "load" ? (
            <span className="relative z-[1]">{wait > 0 ? `Free tier: 1 image / 45 s — retrying in ${wait}s` : "Generating…"}</span>
          ) : (
            <span className="flex flex-col items-center gap-3">
              <span>{msg}</span>
              <button type="button" className="calm-btn" onClick={() => { setSrc(null); setNonce((n) => n + 1); }}>
                <CIcon name="refresh" size={15} /> Retry
              </button>
            </span>
          )}
        </div>
      )}
      {src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={prompt} onLoad={() => setState("ok")} onError={() => { setSrc(null); setNonce((n) => n + 1); }} onClick={() => onOpen(src)} className={`h-full w-full cursor-zoom-in object-cover transition-opacity duration-500 ${state === "ok" ? "opacity-100" : "opacity-0"}`} />
      )}
      {state === "ok" && src && (
        <button type="button" aria-label="Download image" onClick={() => void downloadImage(src, "apex-image.jpg")} className="absolute bottom-2.5 right-2.5 grid h-10 w-10 place-items-center rounded-full bg-[var(--surface)]/90 shadow-md backdrop-blur">
          <CIcon name="download" size={17} />
        </button>
      )}
    </figure>
  );
}

function ContextTree({ msgs, title, modelLabel, memCount, branches }: { msgs: ChatMsg[]; title: string; modelLabel: string; memCount: number; branches: number }) {
  const users = msgs.filter((m) => m.role === "user");
  const sub = users.length > 1 ? users[users.length - 1].text : "";
  const short = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);
  return (
    <nav aria-label="Conversation context" className="mb-6">
      <span className="node" data-tone="topic">
        <CIcon name="tree" size={14} /> {short(title, 38)}
      </span>
      <div className="tree-link">
        <div className="tree-item flex flex-wrap items-center gap-2">
          {sub && (
            <span className="node">
              <CIcon name="corner" size={13} /> {short(sub, 32)}
            </span>
          )}
          <span className="node text-[rgb(var(--ink-rgb)/var(--ink-2-a))]">{modelLabel}</span>
          {memCount > 0 && <span className="node text-[rgb(var(--ink-rgb)/var(--ink-2-a))]"><CIcon name="tree" size={13} /> {memCount} memories</span>}
          {branches > 0 && <span className="node text-[rgb(var(--ink-rgb)/var(--ink-2-a))]"><CIcon name="branch" size={13} /> {branches} branch{branches > 1 ? "es" : ""}</span>}
        </div>
      </div>
    </nav>
  );
}

export interface ConversationProps {
  msgs: ChatMsg[];
  busy: boolean;
  title: string;
  modelLabel: string;
  memCount: number;
  branchInfo: (id: number) => BranchInfo | null;
  onSwitch: (id: number) => void;
  onEdit: (id: number, text: string) => void;
  onRegenerate: (id: number) => void;
  onSend: (text: string) => void;
  onLightbox: (url: string, prompt: string) => void;
}

export function Conversation({ msgs, busy, title, modelLabel, memCount, branchInfo, onSwitch, onEdit, onRegenerate, onSend, onLightbox }: ConversationProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState<{ id: number; draft: string } | null>(null);
  const [copied, setCopied] = useState<number | null>(null);
  const last = msgs[msgs.length - 1];
  const branches = msgs.filter((m) => branchInfo(m.id)).length;

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [msgs.length, last?.text.length, last?.images?.length]);

  return (
    <div ref={scroller} className="scroll-quiet h-full overflow-y-auto sm:px-4">
      <div className="calm-sheet mx-auto mt-2 min-h-[calc(100%-8px)] max-w-[740px] px-5 pb-10 pt-7 sm:px-8">
        {(msgs.filter((m) => m.role === "user").length > 1 || branches > 0) && <ContextTree msgs={msgs} title={title} modelLabel={modelLabel} memCount={memCount} branches={branches} />}
        <div className="space-y-8">
          {msgs.map((m) => {
            const b = branchInfo(m.id);
            if (m.role === "user") {
              return (
                <div key={m.id} className="flex flex-col items-end gap-1.5">
                  {m.attach && (
                    <div className="flex max-w-[85%] flex-wrap justify-end gap-1.5">
                      {m.attach.map((a, i) => (
                        <span key={i} className="calm-chip">
                          <CIcon name={a.kind === "image" ? "image" : "file"} size={13} /> <span className="max-w-[120px] truncate">{a.name}</span>
                        </span>
                      ))}
                    </div>
                  )}
                  {editing?.id === m.id ? (
                    <div className="calm-card w-full max-w-[92%] p-2.5">
                      <textarea autoFocus aria-label="Edit prompt" rows={3} value={editing.draft} onChange={(e) => setEditing({ id: m.id, draft: e.target.value })} className="calm-field resize-none" />
                      <div className="mt-2 flex justify-end gap-2">
                        <button type="button" className="calm-btn" onClick={() => setEditing(null)}>
                          Cancel
                        </button>
                        <button type="button" className="calm-btn" data-primary="true" onClick={() => { onEdit(m.id, editing.draft); setEditing(null); }}>
                          Save as new branch
                        </button>
                      </div>
                    </div>
                  ) : m.voiceMs ? (
                    <VoiceBubble ms={m.voiceMs} text={m.text} />
                  ) : (
                    <div className="max-w-[85%] whitespace-pre-wrap rounded-[22px_22px_6px_22px] bg-[var(--surface-2)] px-4 py-3 text-[15.5px] leading-[1.55]">{m.text}</div>
                  )}
                  {m.voiceMs ? <p className="max-w-[85%] text-right text-[12px] text-[rgb(var(--ink-rgb)/var(--ink-3-a))]">“{m.text}”</p> : null}
                  <div className="msg-actions">
                    {b && <BranchPager info={b} onSwitch={onSwitch} align="end" />}
                    {editing?.id !== m.id && !busy && !m.voiceMs && (
                      <button type="button" aria-label="Edit prompt" onClick={() => setEditing({ id: m.id, draft: m.text })} className="ibtn !h-10 !w-10 opacity-55 hover:opacity-100">
                        <CIcon name="pencil" size={15} />
                      </button>
                    )}
                  </div>
                </div>
              );
            }
            const wait = m.streaming && !m.text && !(m.steps && m.steps.length) && !m.images?.length;
            return (
              <div key={m.id} className="space-y-3">
                {m.memory && m.memory.length > 0 && (
                  <div className="calm-chip" style={{ background: "var(--halo-a)", color: "var(--halo-ink)", height: "auto", padding: "6px 12px", whiteSpace: "normal" }}>
                    <CIcon name="tree" size={13} /> Remembered “{m.memory[0]}”{m.memory.length > 1 ? ` +${m.memory.length - 1}` : ""}
                  </div>
                )}
                {m.tools && m.tools.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {m.tools.map((t, i) => (
                      <span key={i} className="calm-chip" style={t.ok ? undefined : { color: "var(--bad)" }}>
                        <KeyIcon k={t.icon} size={13} /> <span className="max-w-[240px] truncate">{t.label}</span>
                      </span>
                    ))}
                  </div>
                )}
                {m.steps && m.steps.length > 0 && m.thinkStart !== undefined && <ThinkPill m={m} />}
                {wait && (
                  <p className="py-1 text-[15px]" role="status" aria-label="Apex is thinking">
                    <span className="shimmer-text">Thinking through this…</span>
                  </p>
                )}
                {m.images && m.images.length > 0 && (
                  <div className="flex flex-wrap gap-3">
                    {m.images.map((im) => (
                      <ImageCard key={im.url} url={im.url} prompt={im.prompt} preSrc={im.src} onOpen={(src) => onLightbox(src, im.prompt)} />
                    ))}
                  </div>
                )}
                {m.text && (
                  <div className="text-[15.5px] leading-[1.65] text-[rgb(var(--ink-rgb)/0.9)]">
                    <AssistantBody text={m.text} streaming={!!m.streaming} onChoice={(a) => onSend(a)} />
                  </div>
                )}
                {!m.streaming && (m.text || m.images?.length) && (
                  <div className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-[12px] text-[rgb(var(--ink-rgb)/var(--ink-3-a))]">
                    <span className="mr-1.5 max-w-[220px] truncate">{m.engine?.label}{m.stats && m.stats.tps > 0 && m.engine?.backend !== "apex" ? ` · ${m.stats.tps.toFixed(0)} tok/s` : ""}</span>
                    {m.text && (
                      <>
                        <button type="button" aria-label="Copy reply" className="ibtn !h-9 !w-9" onClick={() => { void navigator.clipboard?.writeText(m.text); setCopied(m.id); window.setTimeout(() => setCopied(null), 1400); }}>
                          <CIcon name={copied === m.id ? "check" : "copy"} size={15} />
                        </button>
                        <button type="button" aria-label="Read aloud" className="ibtn !h-9 !w-9" onClick={() => speak(m.text, true)}>
                          <CIcon name="speaker" size={15} />
                        </button>
                      </>
                    )}
                    {!busy && !m.images?.length && (
                      <button type="button" aria-label="Regenerate reply" className="ibtn !h-9 !w-9" onClick={() => onRegenerate(m.id)}>
                        <CIcon name="refresh" size={15} />
                      </button>
                    )}
                    {b && <BranchPager info={b} onSwitch={onSwitch} />}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
