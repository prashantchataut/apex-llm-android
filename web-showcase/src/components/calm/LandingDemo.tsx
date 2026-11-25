"use client";

import { AnimatePresence, motion, useInView } from "framer-motion";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { CIcon, type CIconName } from "./icons";

/** Blur-to-sharp reveal on scroll (the CueDesign entrance). */
export function Reveal({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref, { once: true, margin: "0px 0px -12% 0px" });
  return (
    <motion.div ref={ref} className={className} initial={{ opacity: 0, y: 18, filter: "blur(8px)" }} animate={seen ? { opacity: 1, y: 0, filter: "blur(0px)" } : undefined} transition={{ duration: 0.9, delay, ease: [0.22, 1, 0.36, 1] }}>
      {children}
    </motion.div>
  );
}

const REPLIES = [
  "Here is a calm way to start: name the one outcome you care about, list what you already have, and let me draft the first version. We can refine it together.",
  "Short version: it runs on your phone, so nothing leaves the device unless you ask it to. Want the longer explanation?",
];

/** A working copy of the halo composer: type, send, and watch the shimmer give way to a borderless reply. */
export function PromptDemo() {
  const [text, setText] = useState("");
  const [state, setState] = useState<"idle" | "thinking" | "done">("idle");
  const [shown, setShown] = useState("");
  const [user, setUser] = useState("");
  const n = useRef(0);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const send = () => {
    const t = text.trim();
    if (!t || state === "thinking") return;
    setUser(t);
    setText("");
    setShown("");
    setState("thinking");
    const reply = REPLIES[n.current++ % REPLIES.length];
    window.setTimeout(() => setState("done"), 1400);
    let i = 0;
    const id = window.setInterval(() => {
      i += 3;
      setShown(reply.slice(0, i));
      if (i >= reply.length) window.clearInterval(id);
    }, 24);
    window.setTimeout(() => window.clearInterval(id), 6000);
  };
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [text]);

  return (
    <div className="mx-auto w-full max-w-[560px]">
      <div className="mb-6 min-h-[132px] space-y-4 text-left">
        <AnimatePresence>
          {user && (
            <motion.div key={user} initial={{ opacity: 0, y: 10, filter: "blur(6px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} className="flex justify-end">
              <div className="max-w-[85%] rounded-[22px_22px_6px_22px] bg-[var(--surface-2)] px-4 py-3 text-[15.5px] leading-[1.55]">{user}</div>
            </motion.div>
          )}
        </AnimatePresence>
        {state === "thinking" && !shown && <p className="text-[15px]"><span className="shimmer-text">Thinking through this…</span></p>}
        {shown && <p className="text-[15.5px] leading-[1.65] text-[rgb(var(--ink-rgb)/0.9)]">{shown}</p>}
        {!user && <p className="text-center text-[14px] text-[rgb(var(--ink-rgb)/var(--ink-3-a))]">Try it. This composer is live.</p>}
      </div>
      <div className="halo">
        <div className="halo-strip">
          <span><i aria-hidden="true" />Keyless AI Ready</span>
          <span>Switch Engine</span>
        </div>
        <div className="halo-inner">
          <textarea
            ref={taRef}
            rows={2}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            aria-label="Try the prompt bar"
            placeholder="Ask anything..."
            className="bare w-full resize-none bg-transparent text-[15.5px] leading-6 outline-none placeholder:text-[rgb(var(--ink-rgb)/0.42)]"
          />
          <div className="mt-2 flex items-center gap-0.5">
            {(["clip", "image", "plug", "mic"] as CIconName[]).map((i) => (
              <span key={i} className="ibtn" aria-hidden="true"><CIcon name={i} size={19} /></span>
            ))}
            <span className="flex-1" />
            <motion.button type="button" className="send" onClick={send} disabled={!text.trim() || state === "thinking"} aria-label="Send" data-stop={state === "thinking"} whileTap={{ scale: 0.88 }}>
              {state === "thinking" ? <span className="block h-[13px] w-[13px] rounded-[4px] bg-current" /> : <CIcon name="up" size={18} />}
            </motion.button>
          </div>
        </div>
      </div>
    </div>
  );
}

const WAYS: { id: string; label: string; icon: CIconName; title: string; body: string }[] = [
  { id: "cloud", label: "Keyless cloud", icon: "bolt", title: "Open the app and talk.", body: "No account, no API key and no first download. Replies stream in from free providers the moment you launch." },
  { id: "offline", label: "Private offline", icon: "phone", title: "Your phone does the thinking.", body: "Download a model once and it runs on the device silicon, with or without a signal. Pause and resume any download." },
  { id: "open", label: "Unfiltered", icon: "unlock", title: "No refusals. Your call.", body: "Dolphin, Hermes and abliterated builds run locally, so creative work is never second-guessed by a server." },
];

/** Sliding-pill tabs (spring thumb) that swap an editorial paragraph with a blur-to-sharp crossfade. */
export function WaysTabs() {
  const [id, setId] = useState("cloud");
  const cur = WAYS.find((w) => w.id === id) ?? WAYS[0];
  return (
    <div className="text-center">
      <div className="seg" role="tablist" aria-label="Ways to run Apex">
        {WAYS.map((w) => (
          <button key={w.id} role="tab" type="button" aria-selected={id === w.id} onClick={() => setId(w.id)} className="!inline-flex items-center gap-2">
            {id === w.id && <motion.span layoutId="ways-thumb" className="seg-thumb" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
            <CIcon name={w.icon} size={16} /> {w.label}
          </button>
        ))}
      </div>
      <div className="mx-auto mt-10 min-h-[170px] max-w-[560px]">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={cur.id} initial={{ opacity: 0, y: 12, filter: "blur(8px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} exit={{ opacity: 0, filter: "blur(6px)" }} transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}>
            <h3 className="text-[clamp(28px,4.4vw,40px)] font-normal leading-[1.12] tracking-[-0.03em]">{cur.title}</h3>
            <p className="mx-auto mt-4 max-w-[46ch] text-[17px] leading-relaxed text-[rgb(var(--ink-rgb)/var(--ink-2-a))]">{cur.body}</p>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
