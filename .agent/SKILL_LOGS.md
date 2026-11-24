# SKILL LOGS

> Honesty note: Session 1 ran in an environment with file/shell/web tools but **no dedicated skill-loader**. The five skills were applied manually as protocols (see SKILLS_PROTOCOL.md). Entries below describe what was actually done.

## Session 1

### [SKILL: rea-reverse-engineering]
- Fetched `Kimi-syl/PocketLLM` README + repo tree and `dineshsoudagar/local-llms-on-android` README via raw.githubusercontent.
- UiHall (`nikithamal.github.io/UiHall`) is a client-rendered SPA and 21st.dev is JS-gated: **not scrapeable with plain HTTP**. Primitives were re-derived from their public descriptions/visual conventions, not copied. Session 2: try a headless browser if one is available.
- Findings are in ARCHITECTURE.md §REA.

### [SKILL: design-taste-frontend]
- Implemented tokens, aurora (CSS radial mesh + animated drift), spring motion (framer-motion), tactile press states.

### [SKILL: hallmark-ui]
- Signature components: `FanStack` (Archetype B), `SwissGrid` + `Crosshair` + `GhostHeadline` (C), `ThinkingAccordion` (D).

### [SKILL: open-design-skill]
- Primitives: `GlassPill`, `BentoCard`, `PromptBar`, `ShimmerBadge`, `OptionCard`, `Waveform`.

### [SKILL: native-rust-systems]
- Wrote 6 crates with trait seams + unit tests. Not compilable in the sandbox (no cargo); verified afterwards by the Rust CI workflow on GitHub (check + 37 tests green).

## Session 2 (2026-11-24)

> Same honesty note: no skill-loader in this runtime; the protocols were applied manually.

### [SKILL: design-taste-frontend / hallmark-ui / open-design-skill]
- Theme system: `packages/design-system/tokens.css` now holds 6 themes x light/dark as flat custom properties
  (`data-theme` + `data-mode`). Tailwind `white`/`black` are re-pointed at theme ink/inverse in `globals.css`,
  plus `ink-2`/`ink-3` text tokens so body copy stays >= 4.5:1 in every palette (checked by eye in screenshots, not with a contrast tool: UNVERIFIED numerically).
- Appearance sheet (spring bottom sheet, drag to dismiss, live FanStack preview, swatches rendered with each theme's own tokens).
- Onboarding: Swiss progress rail with `+` markers (hallmark), 5 steps, FanStack device read-out, skippable at every step.
- Studio screen: denoising timeline (hallmark). Hub: Text / Image / Video / Voice segments.
- Browser QA with Playwright: found and fixed clipped fan cards, 40 px touch targets, hero chip overlap, hub header overlap.

### [SKILL: native-rust-systems]
- `cortex-hf-hub::media` (catalog + `score_media`/`best_media`, 5 tests). `cargo fmt`, `cargo clippy --workspace --all-targets -D warnings`
  and `cargo test --workspace` were run locally with a fresh rustup toolchain and pass.
- Tauri commands `settings_get/settings_set/media_catalog` written but the Tauri crate was NOT built (UNVERIFIED).

### [SKILL: rea-reverse-engineering]
- Not used this session. HF model repos for the media catalog were found via the public HF API; sizes read from the tree endpoint.

## Session 3 — Phase 1 (UI / brand / onboarding)
- No skill-loader in this runtime; protocols applied manually (stated honestly).
- `design-taste-frontend`, `hallmark-ui`, `open-design-skill`: new `ApexLogo` (Tensor Prism, 3 states), 4-scene onboarding (spring 320/26, blur-to-sharp reveals, SVG hairline draw-in, silicon scan + fan cards, live theme morph, flip key card), Replay onboarding in the Appearance sheet, bolt/sparkle glyphs removed from the icon set, launcher/favicon assets regenerated from the same facet geometry.

## Session 3 — Phase 2 (showcase)
- `design-taste-frontend`, `hallmark-ui` (applied manually): new nav tile + hero cutout using the prism, `#lab` Live Lab section (live 4-theme switch that morphs the whole page, SiliconScan + fan cards, reasoning timeline + KaTeX + clickable MCQ), `sk-apex` → `sk-apex` copy fix.

## Session 3 — Phase 3/4
- Phase 3: Playwright/Chromium QA loop (see STATE.md for defects fixed). Phase 4 `native-rust-systems` (manual): fmt/clippy/test verified, vault prefix renamed, unused dep removed; SQLite NOT done.

## Session 5
- No skill-loader in this runtime; protocols applied manually.
- native-rust-systems: candle engine + tokenizer + tests, clippy clean, real-weights test passed.
- design-taste-frontend / hallmark-ui / open-design-skill: engine pill, artifacts drawer, frosted telemetry popover, bento share card, Arena dual lanes (Crown + haptics). Visual QA partial (see STATE).
- rea-reverse-engineering: wllama 4.0 and transformers.js 4.3 APIs read from their shipped type definitions.
