/** Prompt Templates Library: one tap fills the composer. `{…}` marks the part the user edits. */
export interface PromptTemplate {
  id: string;
  title: string;
  sub: string;
  prompt: string;
}

export const PRESENTATION_HINT =
  "Reply with ONE ```html code block containing a complete, self-contained slide deck: 6 slides, each a <section class=\"slide\"> (title slide, 4 content slides, closing slide), dark modern styling, inline CSS only, no external files. Add one short sentence after the code block.";
export const PAGE_HINT =
  "Reply with ONE ```html code block containing a complete, self-contained interactive page (HTML, CSS and JavaScript inline, no external files, works offline). For a diagram, draw it with inline SVG. Add one short sentence after the code block.";

export const TEMPLATES: PromptTemplate[] = [
  { id: "deck", title: "Presentation", sub: "A 6-slide deck in Live Preview", prompt: `Create a presentation about: {topic}\n\n${PRESENTATION_HINT}` },
  { id: "pdf", title: "PDF Analysis", sub: "Summary, key points, open questions", prompt: "Analyze the attached PDF. Give me: a 3 sentence summary, the 5 key points, any numbers or dates that matter, and 3 open questions I should ask." },
  { id: "flash", title: "Study Flashcards", sub: "Question and answer cards", prompt: "Turn the following material into 12 study flashcards. Format each as **Q:** question then **A:** answer, ordered from basic to advanced.\n\n{paste notes or a topic}" },
  { id: "research", title: "Research Report", sub: "Structured, sourced outline", prompt: "Write a research report on: {topic}\n\nUse these sections: Overview, Background, Key findings, Different viewpoints, Open questions, Further reading. Keep it factual and say when you are unsure." },
  { id: "creative", title: "Creative Writing", sub: "Scene, story or poem", prompt: "Write a short piece of creative writing. Genre: {genre}. Setting: {setting}. Tone: {tone}. About 300 words, a strong opening line, and an ending that lands." },
];
