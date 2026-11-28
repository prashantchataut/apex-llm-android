/** SIMULATED sample conversations for the sandbox engine (no neural network runs; the UI labels these as such). The Android app streams from cortex-inference instead. */
export interface DemoReply {
  steps: string[];
  thinkMs: number;
  answer: string;
}

const MATH: DemoReply = {
  steps: ["Parse the request", "Recall the binomial identity", "Sanity-check with a=2, b=3 -> 25", "Compose answer + one follow-up question"],
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


const F = "```";

const SVG: DemoReply = {
  steps: ["Pick a mark: three facets of a prism", "Choose the Apex palette", "Write a self-contained SVG"],
  thinkMs: 2200,
  answer: `Here is a self-contained SVG mark — tap the pill to open it as a live artifact.

${F}svg
<svg viewBox="0 0 240 240" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#a78bfa"/><stop offset="1" stop-color="#6d28d9"/></linearGradient>
    <linearGradient id="b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#60a5fa"/><stop offset="1" stop-color="#1d4ed8"/></linearGradient>
  </defs>
  <polygon points="120,24 208,72 120,120 32,72" fill="#e9e5ff"/>
  <polygon points="32,72 120,120 120,216 32,168" fill="url(#a)"/>
  <polygon points="208,72 120,120 120,216 208,168" fill="url(#b)"/>
  <animateTransform attributeName="transform" type="rotate" from="0 120 120" to="360 120 120" dur="14s" repeatCount="indefinite"/>
</svg>
${F}

It uses three polygons only, so it stays crisp at any size.`,
};

const MERMAID: DemoReply = {
  steps: ["List the actors", "Order the steps", "Mark the failure branch"],
  thinkMs: 2000,
  answer: `A login flow as a Mermaid diagram:

${F}mermaid
flowchart TD
  A[Open app] --> B{Biometric ok?}
  B -- yes --> C[Unlock vault]
  B -- no --> D[PIN fallback]
  D --> E{PIN ok?}
  E -- yes --> C
  E -- no --> F[Lock for 30 s]
  C --> G[Chat]
${F}

Open it as a live artifact to pan the rendered graph.`,
};

const HTML: DemoReply = {
  steps: ["Sketch a tiny game loop", "Keep it to one file", "Add a haptic-style press animation"],
  thinkMs: 2400,
  answer: `A one-file clicker you can play right here:

${F}html
<button id="b" style="font:700 28px system-ui;padding:22px 34px;border-radius:999px;border:0;background:linear-gradient(135deg,#a78bfa,#60a5fa);color:#06060a;cursor:pointer;transition:transform .12s">Tap · 0</button>
<p style="font:13px ui-monospace;opacity:.6">Each tap compresses the button like a physical key.</p>
<script>
  let n = 0; const b = document.getElementById('b');
  b.onpointerdown = () => b.style.transform = 'scale(.94)';
  b.onpointerup = () => { b.style.transform = ''; b.textContent = 'Tap · ' + (++n); };
</script>
${F}

Tap the pill to run it in the sandbox.`,
};

export function pickReply(prompt: string): DemoReply {
  const p = prompt.toLowerCase();
  if (/(svg|logo|draw|icon)/.test(p)) return SVG;
  if (/(mermaid|flow|diagram|chart)/.test(p)) return MERMAID;
  if (/(html|game|clicker|button|web ?page)/.test(p)) return HTML;
  if (/(quant|q4|q5|ram|phone|model|download)/.test(p)) return HARDWARE;
  if (/(repo|github|rust|code|debug)/.test(p)) return REPO;
  return MATH;
}

export const SUGGESTIONS = [
  { id: "quant", title: "Explain Q4_K_M vs Q5_K_M for my phone", tag: "Hardware", tall: true },
  { id: "math", title: "Expand (a+b)² step by step", tag: "Math · LaTeX" },
  { id: "pdf", title: "Summarise a PDF into key points", tag: "PDF" },
  { id: "slides", title: "Create a 6-slide presentation on offline AI", tag: "Presentation", wide: true },
] as const;
