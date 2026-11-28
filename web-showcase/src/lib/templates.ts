/**
 * Studio workflows. The user's visible message is ONLY what they typed. The formatting contract for presentations and web apps
 * lives in the `system` role (see `studioSystem`), so instructions are never shown in the bubble and cannot be echoed back.
 */
export type StudioIntent = "presentation" | "page";

const NO_PLAN = "Do not output your planning thoughts before the code block; output only the final artifact, then one short closing sentence.";

export const STUDIO_SYSTEM: Record<StudioIntent, string> = {
  presentation: `When the user asks for a presentation or slide deck, reply with exactly ONE complete \`\`\`html code block: 6 slides, each a <section class="slide"> (1 title slide with <h1>, 4 content slides each with an <h2> and 3 to 5 <li> bullets, at least one of them with 3 stat cards written as <div class="stat"><b>VALUE</b><span>label</span></div>, and 1 closing slide titled Key Takeaways with <li> bullets). Dark modern styling, inline CSS and JS only, no external files, never truncate the document, always end with </html>. ${NO_PLAN}`,
  page: `When the user asks for an app, page, dashboard, game or diagram, reply with exactly ONE complete \`\`\`html code block: a single self-contained document with inline CSS and JavaScript, no external files, works offline and responsive on a phone. Diagrams use inline SVG. Never truncate the document, always end with </html>. ${NO_PLAN}`,
};

const DECK = /\b(presentation|slide ?deck|slides?|power ?point|pptx|keynote)\b/i;
const PAGE = /\b(build|make|create|generate|design|code)\b[^.\n]{0,60}\b(web ?app|app|dashboard|landing page|website|web page|single[- ]page|interactive|calculator|game|tool|diagram|tracker|quiz|todo|to-do)\b/i;

export function studioIntent(prompt: string): StudioIntent | null {
  if (DECK.test(prompt) && /\b(create|make|build|generate|write|design|prepare|draft)\b/i.test(prompt)) return "presentation";
  if (PAGE.test(prompt)) return "page";
  return null;
}

export const studioSystem = (prompt: string): string => {
  const k = studioIntent(prompt);
  return k ? STUDIO_SYSTEM[k] : "";
};

export interface Starter {
  id: "presentation" | "page" | "pdf" | "research";
  title: string;
  sub: string;
  pill: string;
  /** Question asked in the topic sheet (absent for the PDF picker). */
  ask?: string;
  placeholder?: string;
  build?: (topic: string) => string;
  /** Opens live web search + reasoning for this workflow. */
  search?: boolean;
}

export const STARTERS: Starter[] = [
  { id: "presentation", pill: "Presentation", title: "Create Presentation (.PPTX + Slides)", sub: "Downloadable PowerPoint and a 6-slide live deck", ask: "What is the presentation about?", placeholder: "Digital Education", build: (t) => `Create a 6-slide presentation on ${t}` },
  { id: "page", pill: "Web app", title: "Build Interactive Web App (Localhost Preview)", sub: "A full single-page app in the Virtual Localhost", ask: "What should the app do?", placeholder: "A habit tracker dashboard with streak charts", build: (t) => `Build an interactive web app: ${t}` },
  { id: "pdf", pill: "PDF", title: "Analyze & Summarize PDF", sub: "Open the PDF viewer and extract key insights" },
  { id: "research", pill: "Research", title: "Deep Research & Math", sub: "Live web search, reasoning trace and KaTeX", ask: "What should I research or solve?", placeholder: "Derive the quadratic formula and cite sources on its history", build: (t) => `Search the web for ${t}. Then reason step by step and show any math in LaTeX.`, search: true },
];
