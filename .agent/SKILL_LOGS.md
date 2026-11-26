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

## Session 6
- [SKILL: design-taste-frontend] [SKILL: hallmark-ui] [SKILL: open-design-skill] — Calm Atmospheric Minimalism: Porcelain Dawn / Soft Carbon tokens scoped under `.calm`, pastel mesh glow limited to the top ~38%, weight 400-500 display type, one header / one drawer / one halo composer, removed the bottom nav and all example prompts. Hallmark component: the Unified Halo Composer (home card -> compact pill). Micro-interactions: tile lift, spring composer swap, switch thumb, shimmer skeletons. Touch targets >= 38-44 px, focus rings, reduced-motion honored.
- [SKILL: rea-reverse-engineering] — Patterns taken from Ollama (drawer + model pill), Bionic/ChatGPT (grouped history, compact dock), Claude (collapsible thinking, memory). Findings recorded in STATE (Pollinations tier change, localhost-origin block, 402 rate-limit image).
- [SKILL: native-rust-systems] — Rust left untouched; reviewed `hf_download` event shapes and matched the TS bridge; download engine implemented as a browser-side trait-like module (OPFS + Range) with native delegation. Not compiled here (no cargo).


## Session 8 (honest log)
| Skill | Loaded? | What was actually done |
|---|---|---|
| design-taste-frontend | NO — not installed, no loader in this runtime | Applied manually: surface layering, hairline-as-light, spring motion (stiffness 300-480), 40-44px targets, no emoji, self-critique pass on contact sheets (fixed muddy onboarding preview, wrapped token header, stale "update available"). |
| hallmark-ui | NO — not installed | Manual: choreographed 2-step onboarding with live theme preview as the signature component. |
| open-design-skill | NO — not installed | Manual: components re-implemented from patterns observed on beautifului.dev (ui.tsx). 21st.dev AI chat was not scraped this session. |
| rea | NO — not installed | Manual: Playwright scrape of beautifului.dev (CSS vars, keyframes, screenshots) and a UX audit via headless captures. |
## Session 7 — anti-slop overhaul (PR branch feat/anti-slop-ui-overhaul)
No skill loader in this runtime; protocols applied manually.
- [SKILL: rea-reverse-engineering] Fetched the 4 reference sites. 21st.dev and beautifului.dev returned server-rendered component catalogues (names + descriptions, no CSS); cuedesign.space and UiHall returned only a shell/title (JS-rendered). Findings and limits recorded in `.agent/COMPONENT_EXTRACTION.md`.
- [SKILL: open-design-skill] Rebuilt Composer send/stop morph, shimmer thinking text + vertical trace, soft follow-up pills, sliding segmented pills, spring switches, circular progress Get -> Use.
- [SKILL: design-taste-frontend] Borderless tint-shift depth (#fff over #F8F7F4 / #161618 over #0D0D0F), 400-500 weights with -0.03em tracking, blur-to-sharp entrances, spring press states.
- [SKILL: hallmark-ui] Signature moments: halo composer with floating speech-bubble pills; onboarding breathing orb + circular theme reveal + button-to-prompt-box morph.
- [SKILL: native-rust-systems] Rust untouched (cargo not available in this sandbox); CI runs fmt/clippy/test.

## Session 8
No skill loader exists in this runtime; the five protocols were applied manually (stated honestly, not "executed").
- [design-taste-frontend] Safe-area floor classes, dark surface hierarchy kept (tint-shift, no borders), 40px+ touch targets, tidy message action row.
- [hallmark-ui] Onboarding: hardware profile -> starter cards -> circular theme reveal -> morphing CTA; /admin Keyless Control Center with kill-switch, key cards, publish dock.
- [open-design-skill] beautifului.dev is a JS/catalogue site (see COMPONENT_EXTRACTION.md); patterns re-implemented on the existing calm tokens: segmented control, status badges, sheet modal, spring switch.
- [rea] Diagnosed the status-bar overlap from code (native vars never consumed; one-shot injection), resolved PR #6 conflicts by diffing both sides against the merge base, verified local download -> load -> offline reply in Chromium. Found the dark-mode reply colour bug during that check.
- [native-rust-systems] No Rust changed. Android Kotlin insets bridge rewritten; compiled by CI only.

## Session 11
No skill loader exists in this runtime (`rea`, `native-rust-systems`, `design-taste-frontend`, `hallmark-ui`, `open-design-skill` are not installed); the protocols were applied manually and are NOT claimed as executed.
- [rea-style audit] PR #8 diffed; live endpoints probed (Pollinations /models: 1 text + 1 image model anonymous); updater failure diagnosed from code + release list (5 causes); NEB read-only (reverse-engineered scrapers, not used).
- [native-rust-systems-style] No Rust changed. WebCrypto SHA-256 + PBKDF2 + AES-256-GCM implemented in TS, matching Node generator `scripts/gen-vault.mjs` (round-trip verified). Kotlin `Opener` bridge added.
- [design-taste / hallmark / open-design] Calm tokens reused: locked card, grouped model popover, update pill with pulse, release modal, admin gate/key cards, one-time secret modal. beautifului.dev patterns were reused from the Session 8 extraction, not re-scraped.
