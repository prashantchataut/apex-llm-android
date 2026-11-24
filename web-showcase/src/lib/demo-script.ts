/** Sample conversations for the browser build, which has no inference engine. The Android app streams from cortex-inference instead. */
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

To point this at what you need:

[[choices]]{"question":"What would help most right now?","options":[{"label":"A worked example","hint":"Expand $(x+4)^2$ step by step"},{"label":"Practice problems","hint":"Three, easy to hard"},{"label":"The geometric picture","hint":"Why the $2ab$ term appears"}]}[[/choices]]`,
};

const HARDWARE: DemoReply = {
  steps: ["Read device profile (RAM, SoC tier)", "Estimate KV cache for 4k context", "Compare Q4_K_M vs Q5_K_M budgets", "Rank by headroom and speed"],
  thinkMs: 4100,
  answer: `On a phone, RAM is the hard limit, so Apex budgets it before you download. The KV cache grows linearly with context:

$$\\text{KV} = 2 \\cdot L \\cdot n_{ctx} \\cdot n_{kv} \\cdot d_h \\cdot b$$

For a 3B model at $n_{ctx}=4096$ that is roughly $0.15$–$0.5\\,\\text{GB}$ on top of the weights. With ~4.6 GB free, **Q4_K_M** is the sweet spot; **Q5_K_M** only pays off on 12 GB flagships.

[[choices]]{"question":"Which phone are we tuning for?","options":[{"label":"8 GB flagship","hint":"Room for Q4_K_M and a 4k context"},{"label":"6 GB mid-range","hint":"IQ4_XS or a smaller model"},{"label":"4 GB budget","hint":"Stick to 1B-class models"}]}[[/choices]]`,
};

const REPO: DemoReply = {
  steps: ["Connect GitHub (PAT in Keystore)", "Select files within the context budget", "Summarise structure and entry points"],
  thinkMs: 2600,
  answer: `Connected repos are read through the GitHub REST API and trimmed to your context budget, so a 4k window never overflows. I would start with the workspace manifest, then the crate that owns the hot path.

Want me to draft a patch and push it to a branch?

[[choices]]{"question":"What should I do with it?","options":[{"label":"Push to a new branch"},{"label":"Create a secret Gist"},{"label":"Show the diff only"}]}[[/choices]]`,
};

export function pickReply(prompt: string): DemoReply {
  const p = prompt.toLowerCase();
  if (/(quant|q4|q5|ram|phone|model|download)/.test(p)) return HARDWARE;
  if (/(repo|github|rust|code|debug)/.test(p)) return REPO;
  return MATH;
}

export const SUGGESTIONS = [
  { id: "quant", title: "Explain Q4_K_M vs Q5_K_M for my phone", tag: "Hardware", tall: true },
  { id: "math", title: "Expand (a+b)² step by step", tag: "Math · LaTeX" },
  { id: "rust", title: "Debug my Rust lifetimes", tag: "Code" },
  { id: "repo", title: "Summarise my GitHub repo into context", tag: "GitHub", wide: true },
] as const;
