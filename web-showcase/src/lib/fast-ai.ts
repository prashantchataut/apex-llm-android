import type { ChatTurn } from "./engine";
import { markFailure, markSuccess } from "@/services/apexCloudMesh";
import { verifiedChain } from "./verified";

export interface FastResult {
  text: string;
  servedBy: string;
  ms: number;
}

/**
 * One short, non-streaming completion for background jobs (chat titles, memory distilling). It walks the live-verified
 * models fastest-first; a step that errors or does not answer within `timeoutMs` hands over to the next immediately.
 */
export async function fastComplete(messages: ChatTurn[], opts: { maxTokens?: number; timeoutMs?: number; temperature?: number; signal?: AbortSignal } = {}): Promise<FastResult> {
  const steps = verifiedChain({ fastOnly: true });
  let last: unknown = new Error("No verified model answered");
  for (const s of steps.slice(0, 4)) {
    const t0 = performance.now();
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), opts.timeoutMs ?? 6000);
    opts.signal?.addEventListener("abort", () => ctl.abort());
    try {
      const r = await fetch(s.provider.chat, {
        method: "POST",
        signal: ctl.signal,
        headers: { "Content-Type": "application/json", ...(s.provider.auth ? { Authorization: s.provider.auth } : {}) },
        body: JSON.stringify({ model: s.api, messages, stream: false, max_tokens: opts.maxTokens ?? 160, temperature: opts.temperature ?? 0.2 }),
      });
      if (!r.ok) throw new Error(`${s.api} answered ${r.status}`);
      const j = (await r.json()) as { choices?: { message?: { content?: string } }[] };
      const text = (j.choices?.[0]?.message?.content ?? "").replace(/<think>[\s\S]*?<\/think>/g, "").trim();
      if (!text) throw new Error(`${s.api} returned no text`);
      markSuccess(s.provider.id, s.api);
      return { text, servedBy: s.api, ms: Math.round(performance.now() - t0) };
    } catch (e) {
      last = e;
      if (opts.signal?.aborted) throw e;
      markFailure(s.provider.id, s.api);
    } finally {
      clearTimeout(timer);
    }
  }
  throw last;
}
