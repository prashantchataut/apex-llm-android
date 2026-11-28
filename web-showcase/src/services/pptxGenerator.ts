/**
 * Real .pptx generation (pptxgenjs, loaded on demand). A deck is parsed from the model's HTML slides or Markdown into a plain
 * model, then laid out with a dark modern theme: Title, bullet/card slides, a metrics slide and a Key Takeaways slide.
 */
export interface Stat {
  value: string;
  label: string;
}
export interface SlideModel {
  title: string;
  subtitle?: string;
  bullets: string[];
  stats: Stat[];
}
export interface DeckModel {
  title: string;
  slides: SlideModel[];
}

const clean = (s: string) => s.replace(/\s+/g, " ").replace(/[*_`#]/g, "").trim();

/** Parse `<section class="slide">` documents (what the Studio asks the model for). Works on partial / truncated HTML too. */
export function deckFromHtml(html: string): DeckModel | null {
  if (typeof DOMParser === "undefined") return null;
  const doc = new DOMParser().parseFromString(html, "text/html");
  const nodes = [...doc.querySelectorAll("section.slide, .slide, section[data-slide]")].filter((n, _, all) => !all.some((o) => o !== n && o.contains(n)));
  if (nodes.length < 2) return null;
  const slides: SlideModel[] = nodes.map((n) => {
    const title = clean(n.querySelector("h1, h2, h3")?.textContent ?? "");
    const stats: Stat[] = [...n.querySelectorAll(".stat, .metric, .kpi")].map((s) => {
      const v = clean(s.querySelector("b, strong, .num, .value, .number")?.textContent ?? "");
      const label = clean((s.textContent ?? "").replace(s.querySelector("b, strong, .num, .value, .number")?.textContent ?? "", ""));
      return { value: v, label };
    }).filter((s) => s.value);
    const inStat = (e: Element) => !!e.closest(".stat, .metric, .kpi");
    let bullets = [...n.querySelectorAll("li")].filter((e) => !inStat(e)).map((e) => clean(e.textContent ?? "")).filter(Boolean);
    const paras = [...n.querySelectorAll("p, .card")].filter((e) => !inStat(e) && !e.querySelector("p")).map((e) => clean(e.textContent ?? "")).filter(Boolean);
    if (!bullets.length) bullets = paras;
    return { title, subtitle: paras[0], bullets: bullets.slice(0, 6), stats: stats.slice(0, 4) };
  });
  const title = slides[0].title || clean(doc.title) || "Presentation";
  return { title, slides };
}

/** Markdown fallback: `#`/`##` headings or `---` rules start slides, `-`/`*`/`1.` lines are bullets. */
export function deckFromMarkdown(md: string): DeckModel | null {
  const chunks = md.split(/\n(?=#{1,3}\s)|\n-{3,}\n/).map((c) => c.trim()).filter(Boolean);
  const slides: SlideModel[] = chunks.map((c) => {
    const lines = c.split("\n").map((l) => l.trim()).filter(Boolean);
    const h = lines.find((l) => /^#{1,3}\s/.test(l));
    const bullets = lines.filter((l) => /^([-*•]|\d+[.)])\s+/.test(l)).map((l) => clean(l.replace(/^([-*•]|\d+[.)])\s+/, "")));
    const rest = lines.filter((l) => l !== h && !/^([-*•]|\d+[.)])\s+/.test(l)).map(clean);
    return { title: clean(h ?? rest.shift() ?? ""), subtitle: rest[0], bullets: bullets.length ? bullets.slice(0, 6) : rest.slice(0, 5), stats: [] };
  }).filter((s) => s.title || s.bullets.length);
  return slides.length >= 3 ? { title: slides[0].title || "Presentation", slides } : null;
}

export const looksLikeDeck = (html: string): boolean => (html.match(/<(section|div)[^>]*(class=["'][^"']*\bslide\b|data-slide)/gi) ?? []).length >= 2;

const C = { bg: "0B0B10", panel: "16161F", line: "2A2A38", ink: "F4F4F7", dim: "9B9BB0", accent: "8C78FF", accent2: "34D399" };
const FONT = "Calibri";

/** Pull numbers out of bullets when the model gave no stat cards, so the metrics slide is never empty. */
function deriveStats(slides: SlideModel[]): Stat[] {
  const out: Stat[] = [];
  for (const s of slides) for (const b of s.bullets) {
    const m = /(\$?\d[\d,.]*\s?(?:%|x|k|m|bn|b|million|billion|billion|users|hours|years)?)/i.exec(b);
    if (m && /\d/.test(m[1]) && m[1].trim().length > 1) out.push({ value: m[1].trim(), label: clean(b.replace(m[1], "")).slice(0, 48) });
    if (out.length >= 3) return out;
  }
  return out;
}

export async function buildPptx(deck: DeckModel): Promise<Blob> {
  const PptxGenJS = (await import("pptxgenjs")).default;
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_16x9"; // 10 x 5.625 in
  pptx.title = deck.title;
  pptx.author = "Apex LLM";
  pptx.company = "Apex LLM";
  const W = 10;
  const n = deck.slides.length;
  const statSlide = deck.slides.findIndex((s, i) => i > 0 && i < n - 1 && s.stats.length >= 2);
  const derived = statSlide === -1 ? deriveStats(deck.slides.slice(1, n - 1)) : [];

  const base = (num: number) => {
    const s = pptx.addSlide();
    s.background = { color: C.bg };
    s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.12, h: 5.625, fill: { color: C.accent }, line: { color: C.accent, width: 0 } });
    s.addText(`${num} / ${n}`, { x: W - 1.3, y: 5.2, w: 1, h: 0.3, fontSize: 10, color: C.dim, align: "right", fontFace: FONT });
    s.addText("Apex LLM", { x: 0.5, y: 5.2, w: 3, h: 0.3, fontSize: 10, color: C.dim, fontFace: FONT });
    return s;
  };
  const heading = (s: ReturnType<typeof base>, t: string) => s.addText(t, { x: 0.5, y: 0.35, w: W - 1, h: 0.9, fontSize: 30, bold: true, color: C.ink, fontFace: FONT, fit: "shrink", valign: "middle" });
  const statCards = (s: ReturnType<typeof base>, stats: Stat[], y = 1.7) => {
    const cw = (W - 1 - (stats.length - 1) * 0.3) / stats.length;
    stats.forEach((st, i) => {
      const x = 0.5 + i * (cw + 0.3);
      s.addShape(pptx.ShapeType.roundRect, { x, y, w: cw, h: 2.3, fill: { color: C.panel }, line: { color: C.line, width: 1 }, rectRadius: 0.12 });
      s.addText(st.value, { x, y: y + 0.35, w: cw, h: 1.0, fontSize: 40, bold: true, color: C.accent, align: "center", fontFace: FONT, fit: "shrink" });
      s.addText(st.label, { x: x + 0.15, y: y + 1.4, w: cw - 0.3, h: 0.7, fontSize: 14, color: C.dim, align: "center", fontFace: FONT, fit: "shrink" });
    });
  };

  deck.slides.forEach((m, i) => {
    const s = base(i + 1);
    if (i === 0) {
      s.addText(m.title || deck.title, { x: 0.8, y: 1.5, w: W - 1.6, h: 1.6, fontSize: 44, bold: true, color: C.ink, fontFace: FONT, fit: "shrink", valign: "bottom" });
      s.addShape(pptx.ShapeType.rect, { x: 0.8, y: 3.25, w: 1.4, h: 0.06, fill: { color: C.accent }, line: { color: C.accent, width: 0 } });
      s.addText(m.subtitle || m.bullets[0] || "Created with Apex LLM", { x: 0.8, y: 3.45, w: W - 1.6, h: 0.9, fontSize: 18, color: C.dim, fontFace: FONT, fit: "shrink", valign: "top" });
    } else if (i === n - 1) {
      heading(s, m.title || "Key Takeaways");
      (m.bullets.length ? m.bullets : ["Thank you"]).slice(0, 5).forEach((b, k) => {
        const y = 1.45 + k * 0.72;
        s.addShape(pptx.ShapeType.ellipse, { x: 0.6, y: y + 0.05, w: 0.42, h: 0.42, fill: { color: C.accent }, line: { color: C.accent, width: 0 } });
        s.addText(String(k + 1), { x: 0.6, y: y + 0.05, w: 0.42, h: 0.42, fontSize: 14, bold: true, color: C.bg, align: "center", valign: "middle", fontFace: FONT });
        s.addText(b, { x: 1.2, y, w: W - 1.8, h: 0.55, fontSize: 18, color: C.ink, fontFace: FONT, fit: "shrink", valign: "middle" });
      });
    } else if (m.stats.length >= 2) {
      heading(s, m.title);
      statCards(s, m.stats);
      if (m.bullets.length) s.addText(m.bullets.slice(0, 2).join("  ·  "), { x: 0.5, y: 4.2, w: W - 1, h: 0.7, fontSize: 14, color: C.dim, fontFace: FONT, fit: "shrink" });
    } else {
      heading(s, m.title);
      const b = m.bullets.slice(0, 6);
      if (b.length >= 3 && b.length <= 4) {
        const cols = 2;
        const cw = (W - 1 - 0.3) / cols;
        b.forEach((t, k) => {
          const x = 0.5 + (k % cols) * (cw + 0.3);
          const y = 1.5 + Math.floor(k / cols) * 1.7;
          s.addShape(pptx.ShapeType.roundRect, { x, y, w: cw, h: 1.5, fill: { color: C.panel }, line: { color: C.line, width: 1 }, rectRadius: 0.1 });
          s.addText(String(k + 1).padStart(2, "0"), { x: x + 0.2, y: y + 0.12, w: 0.8, h: 0.35, fontSize: 12, bold: true, color: C.accent, fontFace: FONT });
          s.addText(t, { x: x + 0.2, y: y + 0.45, w: cw - 0.4, h: 0.95, fontSize: 15, color: C.ink, fontFace: FONT, fit: "shrink", valign: "top" });
        });
      } else {
        s.addText(b.map((t) => ({ text: t, options: { bullet: { code: "25CF" }, breakLine: true, paraSpaceAfter: 10 } })), { x: 0.6, y: 1.45, w: W - 1.2, h: 3.5, fontSize: 18, color: C.ink, fontFace: FONT, fit: "shrink", valign: "top" });
      }
    }
  });

  if (derived.length >= 2) {
    const s = pptx.addSlide();
    s.background = { color: C.bg };
    s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.12, h: 5.625, fill: { color: C.accent2 }, line: { color: C.accent2, width: 0 } });
    s.addText("By the numbers", { x: 0.5, y: 0.35, w: W - 1, h: 0.9, fontSize: 30, bold: true, color: C.ink, fontFace: FONT });
    statCards(s, derived);
  }
  const out = await pptx.write({ outputType: "blob" });
  return out as Blob;
}

export const pptxName = (deck: DeckModel) => `${(deck.title || "presentation").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "presentation"}.pptx`;

/** One call for the UI: HTML slides (preferred) or Markdown -> deck model. */
export function parseDeck(source: string, kind: "html" | "md" = "html"): DeckModel | null {
  return kind === "html" ? deckFromHtml(source) : deckFromMarkdown(source);
}
