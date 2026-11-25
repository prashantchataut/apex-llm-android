# COMPONENT EXTRACTION — Session 7 (anti-slop overhaul)

`[SKILL: rea-reverse-engineering]` + `[SKILL: open-design-skill]` (applied manually; this runtime has no skill loader).

## What the fetches actually returned (facts, not claims)
| Site | Fetch result | Consequence |
|---|---|---|
| 21st.dev/community/components/s/ai-chat | Server-rendered catalogue: ~116 AI-chat components. Names seen: *AI Chat Card, Chat Bubble, Prompt with Model Picker, Ask Bar, Shimmer Text, Thinking Pill, Thinking Indicator, Reasoning Text, AI Suggestions, Suggestion, Send Button, Message Actions, Attachments, Memory Chip, Model Picker, Composer Loader*. No DOM/CSS source (component code is behind the page's "copy prompt" gate). | Patterns below are **rebuilt from the component names + category description**, not copied code. |
| beautifului.dev | Server-rendered index of 21 primitives: Loading State (pixel-grid loader with shimmer + elapsed time), **Thinking** (expandable traces), Streaming Text, Approval Card, Tool Chips, Task Rows, Chat, **Prompt Bar** (@ sources, / commands, model picker, dictation), Recommendation Card, Context Cards, Selection Actions… | Used for: expandable thinking trace, tool chips, prompt bar anatomy, shimmer. The `inset 0 1px 0 rgba(255,255,255,.8)` specular edge is applied from the brief. |
| cuedesign.space | Client-rendered; fetch returned only `<title>`: *"Cue — the Awwwards-tier UI component library"*. **No DOM was readable.** | Editorial spatial minimalism, blur-to-sharp entrance and 60 % open canvas are implemented from the brief's description, **not** from inspected CSS. |
| nikithamal.github.io/UiHall/#/library | Hash-routed SPA; fetch returned only the shell (nav: Library / Originals / Patterns / Colour / Demos / For agents). Library body is JS-rendered, **not readable**. | Action pills, toggles, drawers and feedback micro-components are implemented from the brief + existing Session 5 UiHall notes. |

No headless-browser scrape of the four SPAs was possible in this sandbox for the JS-rendered ones; this table is the honest limit of the evidence.

## Pattern → why it works → how Apex does it
| Pattern (source) | Implementation in this PR |
|---|---|
| Auto-growing borderless textarea (21st.dev Prompt Box) | `Composer.tsx` `field()` — `bare` textarea grows to 160 px, no outline, no border. |
| Inline pill model selector (21st.dev Model Picker / beautifului Prompt Bar) | `Header` centre pill: `Qwen 2.5 · Keyless` style label, spring tap, specular edge, no border. `ModelSheet` = "Switch engine". |
| Halo prompt card (Reference 1) | `.halo` (28 px, 4 px pad, sage tint, strip "Keyless AI Ready" / "Switch Engine") wrapping `.halo-inner` (24 px, `0 8px 24px rgb(0 0 0/.04)`). |
| Send → stop morph (21st.dev Send Button) | `Composer` `sendBtn`: arrow rotates/scales out, charcoal square in, pulsing ring while generating. |
| Shimmer thinking text (21st.dev Shimmer Text / Thinking Pill) | `.shimmer-text` (gradient sweep via `background-clip:text`), `ThinkPill` chevron expands a quiet 1.5 px vertical trace (`.think-trace`). |
| Borderless editorial assistant text (21st.dev Message / Streaming Text) | AI turns are full-width text, 1.65 line height; user turns are a `#EFECE6`/`#1E1E22` pill with `22 22 6 22` radii. |
| Follow-up suggestion pills (21st.dev AI Suggestions) | `ChoiceCards.tsx` rewritten: full-width 16 px soft pills, scale `.985` on press, no boxes/uppercase. Home: three floating speech-bubble pills (`.sug`) with −1.5° / +1° offsets and a 5–7 s float. |
| Sliding segmented pills (beautifului) | `.seg` + framer-motion `layoutId` thumb: Model Hub tabs, Settings theme, onboarding theme, landing "ways" tabs. |
| Layered glass popover + specular edge (beautifului) | `--specular: inset 0 1px 0 rgb(255 255 255/.8)` on every raised surface; `calm-card`, menus, sheets. |
| Spring toggles (UiHall) | `.switch` thumb with spring overshoot, widens on press. |
| Blur-to-sharp entrance (Cue brief) | `Reveal` (landing), `BlurWords` (onboarding), Home greeting: `filter: blur(8px)` → `0`. |
| Circular theme reveal | Onboarding slide 3 uses the View Transitions API with an expanding `clip-path: circle()` from the tap point; plain crossfade fallback. |
| Progress feedback micro-component (UiHall) | Model row `Get` → circular progress ring (tap = pause/resume) → `Use`. |

## Slop removed (Phase 1)
* Grid system: Swiss grid lines, `+` crosshairs, choreography CSS, `--grid-line`/`--cross-a` tokens, six legacy themes' palettes.
* Boxes: `1px` hairline borders dissolved (`--hairline: transparent`), tiles/cards/inputs/chips now borderless tint + ambient shadow.
* Bento: 2×2 home tiles, 3-column landing feature cards, 4-column image gallery, 3-up settings theme cards — all gone.
* Badges/emoji: every UI emoji replaced with 1.5 px stroke SVG; hub badge rows (`[Q4_K_M] [RAM] [CTX]`) replaced by one subtitle + an info reveal.
* Weight: no `font-semibold/bold` left in the UI; display type is 400 with `-0.03em`.
* Dead code: 33 unreachable files from the old dashboard UI deleted (AppShell, HubScreen, Landing, Swiss, Choreo, Archetypes, FanStack, SiliconScan, …).
