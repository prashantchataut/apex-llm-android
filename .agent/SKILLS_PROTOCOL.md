# SKILLS PROTOCOL (mandatory in every session)

Log each invocation in `.agent/SKILL_LOGS.md` (date, skill, inputs, outputs, what changed).
If the runtime has no skill-loader, apply the protocol manually and *say so* in the log — never claim a skill ran when it didn't.

## 1. `rea-reverse-engineering`
Deconstruct, don't copy. For every reference: record **pattern → why it works → how Apex does it better** in ARCHITECTURE.md §REA.
Targets: Kimi-syl/PocketLLM, dineshsoudagar/local-llms-on-android, pocketllm-ai.vercel.app, UiHall, 21st.dev AI chat.

## 2. `design-taste-frontend`
Awwwards-grade craft: optical alignment, spring physics (stiffness 260–420, damping 24–32), 60fps (transform/opacity only), tactile press states (scale .97), no layout shift (reserve KaTeX height, tabular-nums for timers).

## 3. `hallmark-ui`
Every screen gets one unmistakable signature component: frosted fan-stack cards, exposed Swiss grid with `+` markers, progressive-opacity display type, live reasoning timeline.

## 4. `open-design-skill`
Synthesize primitives from UiHall + 21st.dev AI chat into theme-aware components: PromptBar, ShimmerBadge, ThinkingAccordion, OptionCard, BentoCard, GlassPill.

## 5. `native-rust-systems`
Zero-cost, memory-safe, NDK-ready crates. `#![forbid(unsafe_code)]` everywhere except FFI shims (to be isolated in `*-sys`/JNI modules). Trait seams so every engine is mockable on desktop CI.

---

## Visual tokens (single source of truth: `packages/design-system/tokens.css`)

| Token | Value |
|---|---|
| `--obsidian` | `#050507` (OLED canvas) |
| `--violet` (Idle aurora) | `#6D28D9` |
| `--cobalt` (Chat aurora) | `#1D4ED8` |
| `--matte` (bento card) | `#121216` |
| `--hairline` | `rgba(255,255,255,0.07)` |
| `--grid-line` | `rgba(255,255,255,0.12)` |
| `--glass-bg` | `rgba(255,255,255,0.18)` |
| `--glass-blur` | `blur(28px) saturate(180%)` |
| `--ink-solid` | `#FFFFFF` |
| `--ink-ghost` | `rgba(255,255,255,0.35)` |

## Archetypes
- **A — Obsidian + Top-Bleed Aurora (mobile core):** `#050507` bottom 60%, radial mesh bleeding up (violet idle / cobalt chat). Asymmetric bento cards `#121216`, 1px `rgba(255,255,255,.07)` border, inner top highlight, bottom-left icon pill. Floating quick-action pill [Upload][Camera][Mic] docked above composer.
- **B — VisionOS frosted glass + fan stack:** `backdrop-filter: blur(28px) saturate(180%)`, bg `rgba(255,255,255,.18)`, 1.5px refractive gradient border, noise overlay. 3–5 mini white data cards fanned `-12°…+14°` behind primary cards (TPS, RAM, `Q4_K_M`, active keys, context).
- **C — Swiss grid + progressive opacity type:** 1px grid lines `rgba(255,255,255,.12)` with `+` crosshairs at intersections. Headline: hook 100% white → clause fades mid-word to 35%. Tilted 3D glass chips, inline rounded-square cutouts between words, handwritten script annotation + SVG curved arrow.
- **D — Interactive chat (21st.dev + UiHall):** `<think>` accordion (glowing pulse orb, ms timer "Thought for 3.4s", vertical timeline nodes); KaTeX inline/block with reserved height; clickable MCQ glass cards with ripple + keyboard (1–9, arrows, Enter).

## Motion
Springs for sheets/cards, `ease-out-expo` for fades, never animate `width/height/top/left` in hot lists. Respect `prefers-reduced-motion`.
