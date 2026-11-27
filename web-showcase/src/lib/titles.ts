import { fastComplete } from "./fast-ai";

/** Ollama-style auto title: after the first exchange, a fast background call names the chat in 3–4 words. */
export async function generateTitle(user: string, assistant: string): Promise<string | null> {
  try {
    const r = await fastComplete(
      [
        { role: "system", content: "You name chats. Reply with ONLY a 3 to 4 word title in Title Case. No quotes, no punctuation, no emoji." },
        { role: "user", content: `User: ${user.slice(0, 400)}\nAssistant: ${assistant.slice(0, 400)}\n\nTitle:` },
      ],
      { maxTokens: 16, temperature: 0.3, timeoutMs: 5000 },
    );
    const t = r.text.split("\n")[0].replace(/["'`*#.:!?]/g, "").replace(/^title\s*/i, "").trim().split(/\s+/).slice(0, 5).join(" ");
    return t.length >= 3 ? t.slice(0, 40) : null;
  } catch {
    return null;
  }
}
