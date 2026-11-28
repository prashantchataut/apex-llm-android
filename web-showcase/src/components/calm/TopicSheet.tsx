"use client";

import { useEffect, useRef, useState } from "react";
import { Sheet } from "./Chrome";
import { CIcon } from "./icons";
import type { Starter } from "@/lib/templates";

/** Asks for the topic, then runs the workflow immediately. The text the user types is the only thing that becomes their message. */
export function TopicSheet({ starter, onClose, onRun }: { starter: Starter | null; onClose: () => void; onRun: (s: Starter, topic: string) => void }) {
  const [topic, setTopic] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (starter) {
      setTopic("");
      window.setTimeout(() => input.current?.focus(), 350);
    }
  }, [starter]);
  const go = () => {
    const t = topic.trim() || starter?.placeholder || "";
    if (starter && t) onRun(starter, t);
  };
  return (
    <Sheet open={!!starter} onClose={onClose} title={starter?.title ?? ""}>
      <form className="px-1 pb-2 pt-1" onSubmit={(e) => { e.preventDefault(); go(); }} data-testid="topic-sheet">
        <label className="block">
          <span className="text-[13px] text-[rgb(var(--ink-rgb)/var(--ink-3-a))]">{starter?.ask}</span>
          <input ref={input} className="calm-field mt-1.5" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder={starter?.placeholder} aria-label={starter?.ask} data-testid="topic-input" autoComplete="off" />
        </label>
        <button type="submit" className="calm-btn !mt-3 !h-12 w-full active:scale-[0.97]" data-primary="true" data-testid="topic-go">
          Generate <CIcon name="arrow" size={15} />
        </button>
      </form>
    </Sheet>
  );
}
