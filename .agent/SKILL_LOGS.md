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

## Session 12 (honest log)
No skill loader exists in this runtime; the four protocols were applied manually.
- rea: full-history `git grep` for PAT shapes, built-bundle scan (PAT, key, passphrase, provider URLs), Playwright assertion that the PAT is never in storage/URL/commit bodies; read the Session 11 QA screenshots to reconstruct the sealed catalog.
- native-rust-systems: AES-256-GCM / PBKDF2 dual-envelope vault in WebCrypto (browser) and node:crypto (generator), cross-checked end to end by Playwright. No Rust changed; the APK is built by CI (no Android SDK / Java here).
- design-taste-frontend / hallmark-ui / open-design-skill: key cards, strength meter, allow-list chips, zero-trust badge using the existing calm primitives. beautifului.dev was not re-scraped this session.

## Session 13

**Honest note:** no skills named `rea`, `native-rust-systems`, `design-taste-frontend`, `hallmark-ui` or `open-design-skill` are installed in the
environment that ran this session, so none could be "loaded". The work below was done by hand following the same intent; nothing
here claims a skill ran.

- **Reverse engineering / analysis (manual):** downloaded the published `v1.1.0` APK and inspected it with `zipfile`, `readelf`
  and a binary scan. Findings: v2 signature block present, `resources.arsc` and `.so` aligned, arm64-only, **but** ELF `LOAD` align
  `0x1000` (not 16 KB), `targetSdk/compileSdk = 37`, throw-away signing key per CI run. Could NOT reproduce the exact on-device
  install error without the device's message. Probed 12 keyless endpoints live (see `KEYLESS_PROVIDERS_RESEARCH.md`).
- **Android pipeline (manual):** Gradle SDK/ABI/packaging, manifest cleanup, `zipalign -> apksigner` order, permanent keystore
  in repo secrets, `scripts/verify-apk.sh` gate, workflow builds every push.
- **UI:** one new admin panel using the existing Calm design tokens; Android status-bar fallback raised 38 -> 40 px.
- **Not done:** `https://www.beautifului.dev/` components were not pulled in; no on-device test (no phone/emulator available).

## Session 14
- `rea`, `design-taste-frontend`, `hallmark-ui`, `open-design-skill`, `native-rust-systems`: these names are not callable tools in this environment, so they were NOT executed. The equivalent work was done by hand: reverse-engineering the download bug from source (found the reqwest HEAD `content_length()` cause), live `curl`/`fetch` probing of providers, and a manual design pass (blur-to-sharp type, spring motion, one glass card). beautifului.dev was not fetched.


## Session 16
- **Skills note**: design-taste-frontend / hallmark-ui / open-design-skill / rea / native-rust-systems are not loadable tools in this sandbox; their rules were applied from `RULES.md` + `SKILLS_PROTOCOL.md` by hand (tokens only, no ad-hoc hexes except status colours, >=44 px targets, tabular-nums, reserved space).
- **Evidence-first**: every UI claim above was checked with Playwright; the screenshots exposed two real bugs (invisible bold text and invisible Copy LaTeX button; a picker that ignored mesh.json) which were fixed before shipping.
- **Rust**: no Rust changed this session.
