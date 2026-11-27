import type { ChatTurn } from "./engine";

/** ~3.6 chars per token is a safe average across Llama / Qwen / Mistral tokenizers. */
export const estTokens = (s: string): number => Math.ceil(s.length / 3.6) + 4;

/**
 * Ollama-style sliding window. The whole structured history (user / assistant turns) is sent on every turn so follow-ups
 * ("make it shorter", "now in Rust") just work; when it will not fit the model's context window the OLDEST turns are
 * dropped first, always in whole turns, and the window always starts on a user turn.
 */
export function trimHistory(history: ChatTurn[], budgetTokens: number): ChatTurn[] {
  const turns = history.filter((t) => t.role !== "system");
  const out: ChatTurn[] = [];
  let used = 0;
  for (let i = turns.length - 1; i >= 0; i--) {
    const cost = estTokens(turns[i].content);
    if (used + cost > budgetTokens && out.length > 0) break;
    out.unshift(turns[i]);
    used += cost;
  }
  while (out.length > 1 && out[0].role !== "user") out.shift();
  return out;
}

/** Context window to budget for, by engine. Cloud models take far more than a 4k phone context. */
export const contextBudget = (backend: string, ctx: number): number => (backend === "apex" || backend === "external" ? 12000 : Math.floor(ctx * 0.75));
