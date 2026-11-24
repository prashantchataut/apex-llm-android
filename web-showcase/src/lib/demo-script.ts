/** Scripted "model" for the browser demo — there is no LLM in the web build. The app uses cortex-inference. */
export interface DemoReply {
  steps: string[];
  thinkMs: number;
  answer: string;
}

const MATH: DemoReply = {
  steps: ["Parse the request", "Recall the binomial identity", "Sanity-check with a=2, b=3 → 25", "Compose answer + one follow-up question"],
  thinkMs: 3400,
  answer: `Expanding a square of a sum gives $(a+b)^2 = a^2 + 2ab + b^2$. The cross-term $2ab$ is the one people forget.

$$\\int_0^1 x^2\\,dx = \\frac{1}{3} \\qquad \\sum_{k=1}^{n} k = \\frac{n(n+1)}{2}$$

Quick check — what is $(x+4)^2$?

[[mcq]]{"question":"Pick the correct expansion of (x+4)²","options":["$x^2 + 16$","$x^2 + 8x + 16$","$x^2 + 4x + 16$","$x^2 + 8x + 4$"],"answer":1}[[/mcq]]`,
};

const HARDWARE: DemoReply = {
  steps: ["Read device profile (RAM, SoC tier)", "Estimate KV cache for 4k context", "Compare Q4_K_M vs Q5_K_M budgets", "Rank by headroom and speed"],
  thinkMs: 4100,
  answer: `On a phone, RAM is the hard limit, so Apex budgets it before you download. The KV cache grows linearly with context:

$$\\text{KV} = 2 \\cdot L \\cdot n_{ctx} \\cdot n_{kv} \\cdot d_h \\cdot b$$

For a 3B model at $n_{ctx}=4096$ that is roughly $0.15$–$0.5\\,\\text{GB}$ on top of the weights. With ~4.6 GB free, **Q4_K_M** is the sweet spot; **Q5_K_M** only pays off on 12 GB flagships.

[[mcq]]{"question":"Which quantization should I download for an 8 GB phone?","options":["Q4_K_M — balanced","Q5_K_M — higher quality, tighter RAM","IQ4_XS — smallest that still behaves"],"answer":0}[[/mcq]]`,
};

const REPO: DemoReply = {
  steps: ["Connect GitHub (PAT in Keystore)", "Select files within the context budget", "Summarise structure and entry points"],
  thinkMs: 2600,
  answer: `Connected repos are read through the GitHub REST API and trimmed to your context budget, so a 4k window never overflows. I would start with the workspace manifest, then the crate that owns the hot path.

Want me to draft a patch and push it to a branch?

[[mcq]]{"question":"What should I do next?","options":["Push to a new branch","Create a secret Gist","Show the diff only"],"answer":0}[[/mcq]]`,
};

export function pickReply(prompt: string): DemoReply {
  const p = prompt.toLowerCase();
  if (/(quant|q4|q5|ram|phone|model|download)/.test(p)) return HARDWARE;
  if (/(repo|github|rust|code|debug)/.test(p)) return REPO;
  return MATH;
}

export const SUGGESTIONS = [
  { id: "quant", title: "Explain Q4_K_M vs Q5_K_M for my phone", tag: "Hardware", tall: true },
  { id: "math", title: "Expand (a+b)² and quiz me", tag: "Math · LaTeX" },
  { id: "rust", title: "Debug my Rust lifetimes", tag: "Code" },
  { id: "repo", title: "Summarise my GitHub repo into context", tag: "GitHub", wide: true },
] as const;
