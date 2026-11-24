"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { pickReply } from "@/lib/demo-script";

export interface ChatMsg {
  id: number;
  role: "user" | "assistant";
  text: string;
  steps?: string[];
  stepsShown?: number;
  thinkStart?: number;
  thinkEnd?: number | null;
  streaming?: boolean;
}

/** Drives the scripted demo conversation (think → stream). The app replaces this with Tauri `Channel` events from cortex-inference. */
export function useDemoChat() {
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const timers = useRef<number[]>([]);
  const ids = useRef(1);

  const clear = useCallback(() => {
    timers.current.forEach((t) => {
      window.clearTimeout(t);
      window.clearInterval(t);
    });
    timers.current = [];
  }, []);
  useEffect(() => clear, [clear]);

  const send = useCallback(
    (prompt: string) => {
      clear();
      const reply = pickReply(prompt);
      const uid = ids.current++;
      const aid = ids.current++;
      setMsgs((m) => [
        ...m.map((x) => (x.streaming ? { ...x, streaming: false, thinkEnd: x.thinkEnd ?? performance.now() } : x)),
        { id: uid, role: "user", text: prompt },
        { id: aid, role: "assistant", text: "", steps: reply.steps, stepsShown: 0, thinkStart: performance.now(), thinkEnd: null, streaming: true },
      ]);
      const patch = (p: Partial<ChatMsg>) => setMsgs((ms) => ms.map((m) => (m.id === aid ? { ...m, ...p } : m)));

      const gap = (reply.thinkMs - 700) / reply.steps.length;
      reply.steps.forEach((_, i) => timers.current.push(window.setTimeout(() => patch({ stepsShown: i + 1 }), 350 + i * gap)));
      timers.current.push(
        window.setTimeout(() => {
          patch({ thinkEnd: performance.now() });
          let pos = 0;
          const iv = window.setInterval(() => {
            pos += 5;
            if (pos >= reply.answer.length) {
              window.clearInterval(iv);
              patch({ text: reply.answer, streaming: false });
            } else patch({ text: reply.answer.slice(0, pos) });
          }, 24);
          timers.current.push(iv);
        }, reply.thinkMs),
      );
    },
    [clear],
  );

  const busy = msgs.some((m) => m.streaming);
  return { msgs, send, busy };
}
