# STATE — last updated: end of Session 3

## [SESSION 3 — WHAT ACTUALLY HAPPENED]
PR #1 was already merged, so work is on `feat/session-3-polish-and-pr` (new PR).

### VERIFIED (run in this sandbox)
- `tsc --noEmit` + `next build` (web-showcase) pass; root Vite preview (`dist/index.html`) builds and typechecks.
- `cargo fmt --all --check`, `cargo clippy --workspace --all-targets -- -D warnings`, `cargo test --workspace`: pass (Linux x86_64). Removed unused `tower-http` dep from cortex-server.
- Headless Chromium (Playwright) renders at 390x844 and 1440x900 @2x, dark scheme: 20 screenshots in `docs/qa-session-3/`. Defects found by eye and fixed: clipped 4th fan card, wrapped telemetry labels, scrolled title in scan scene, orphaned key character, duplicate-looking tab icons, `sk-pocket` copy, overlapping sticky nav in lab capture, clipped fan values on the Models screen.

### DONE (UI)
- **Apex Tensor Prism** (`components/brand/ApexLogo.tsx`): isometric split cube, 6 facets. States: `idle` (specular sweep), `scanning`/`thinking` (facets separate along their axis, staggered, `cubic-bezier(0.22,1,0.36,1)`), `monochrome` (currentColor stencil). `ApexTile` for app-icon tiles. `bolt` and `sparkle` glyphs deleted from the icon set (sparkle usages -> `prism` glyph).
- Launcher assets regenerated from the same facet geometry: all PNGs under `app-ui/src-tauri/icons` and Android `mipmap-*`, adaptive background `#050507`, `icon.ico`, `web-showcase/src/app/icon.svg`, `docs/apex-mark.svg`. **`icon.icns` NOT regenerated (STUB)**; Android icons not verified on a device.
- **Onboarding rewrite** (4 scenes, spring 320/26): (1) hairline grid draws in via pathLength + `+` crosshairs, prism assembles, 100%->35% type with blur-to-sharp; (2) `SiliconScan`: beam sweeps schematic, 4 telemetry cards fan to -12/-5/+6/+14 deg, 80 ms stagger, quant badge computed by `recommend()`; (3) four looks (Obsidian Aurora, VisionOS Spatial Glass, Swiss Grid, Adaptive Daylight = Paper + System mode) morph the canvas live, four workflow cards with press compression + check badges; (4) tilt-on-pointer flip key card + starter queue. **Replay onboarding** button in the Appearance sheet.
- Landing: prism branding, new **Live Lab** (`#lab`): page-wide theme switch, silicon scan, scripted reasoning + KaTeX + clickable MCQ.
- Root Vite preview (`/home/user/sandbox`) is a copy of `web-showcase/src` (`#/app` = full-screen app).

### HONEST CAVEATS
- "16 MB Parakeet": the verified catalog entry is **Parakeet CTC small, ~25 MB** (`lib/models.ts`). The UI shows the catalog value, not 16 MB. UNVERIFIED which build is 16 MB.
- Optional cloud-provider key step was removed from onboarding (the 4-scene spec has no slot). `provider_key_set` is still STUB and unused there.
- Onboarding key: calls Tauri `key_create` (exists, returns `{key, record}`), falls back to WebCrypto in a browser. Rust vault prefix changed `sk-pocket-` -> `sk-apex-` (tests pass).
- App-wide animation audit was partial: tab switch, sheets and onboarding use springs; Hub/Server/Studio internals were only visually inspected, not refactored.
- Tauri build, Android build, real device: NOT run. `android-apk.yml` never executed (UNVERIFIED).

### NOT DONE (Phase 4 — STUB / carried to Session 4)
- **SQLite (`rusqlite` bundled) persistence: not started.** No `rusqlite` in any Cargo.toml.
- Tauri commands the UI needs that exist: `device_profile, settings_get/set, model_list/load, chat_stream, hf_search, hf_download, hf_pause, server_status/start/stop, key_create/list/revoke, voice_status`. They compile only as far as `cargo check` of crates; `app-ui/src-tauri` itself was not built here. Names differ from the prompt (`hardware_profile_get`, `server_control`, `api_key_*`): not renamed.
- `/api/pull`, `/v1/chat/completions` end-to-end, `ThinkParser` vs real model output: unit-tested only; not run against a real model here.

## [SESSION 4 ROADMAP]
1. Build `app-ui/src-tauri` on CI (`cargo check`), run `android-apk.yml`, publish APK.
2. SQLite (rusqlite bundled): chats, think blocks, theme, onboarding, model registry, key hashes.
3. Real `hf_download`/`chat_stream` replacing simulated paths; benchmark llama.cpp on arm64.
4. Regenerate `icon.icns`; device-test adaptive icon and onboarding perf (blur filters on low-end GPUs).
5. Confirm Parakeet 16 MB artifact URL/size; contrast audit for all palettes; `/api/pull` + mDNS.
6. Rotate the PAT (see below).

## [SECURITY NOTE]
The PAT was pasted into chat again (3rd session). **Revoke it** and use a fine-grained token. This session passed it only via `http.extraheader`; it is not in any remote URL or file.

---- Previous state (end of Session 2) ----

## [COMPLETED IN SESSION 2]

### Verified (actually run in the Session 2 sandbox)
- **Rust**: `cargo fmt --all`, `cargo clippy --workspace --all-targets -- -D warnings`, `cargo test --workspace` all pass locally (fresh rustup, Linux x86_64). Two clippy findings fixed in `cortex-hardware`. `Cargo.lock` is now committed. (Cargo prints 2 *manifest* warnings for unused deps `tower-http` / `serde_json`; not clippy errors — remove them in Session 3.)
- **Web**: `tsc --noEmit` and `next build` (static export) pass. Visual QA done in headless Chromium at 360/390/430/1440 px; screenshots in `docs/screens/`. Fixed: clipped fan cards, 40 px touch targets, hero chip overlap, hub header overlap. Remaining automated audit hits are only the prompt `<input>` inside its 44 px bar.
- Not verified: anything on a real Android device, Tauri build, contrast ratios with a tool (judged by eye).

### Theme system (new)
- `packages/design-system/tokens.css` (canonical; `web-showcase/src/app/tokens.css` is a byte copy, `scripts/sync-tokens.sh`, checked in Web CI).
- 6 themes x light/dark: **Obsidian (A), Vision (B), Swiss (C), Reasoning (D), Graphite, Paper**. Mode = System / Light / Dark; "system" follows `prefers-color-scheme` live.
- `data-theme` + `data-mode` on `<html>`; inline no-flash script (`lib/themes.ts`), `ThemeProvider`, persisted in `localStorage` (`apex.theme.v1`) and mirrored to native via `settings_set` (Tauri command written, **UNVERIFIED**).
- Tailwind `white`/`black` are re-pointed at theme ink/inverse; `text-ink-2` (body) / `text-ink-3` (secondary), `bg-canvas`, `bg-surface`, `accent`, `ok/warn/bad`.
- UI: Appearance sheet (`components/theme/ThemePicker.tsx`) reachable from Home (sliders button) and the landing nav (palette button).
- tauri-plugin-theme / custom-themes-api were **not adopted**: pure CSS variables + localStorage cover the requirement, and the plugins are only needed to set the native window/status-bar chrome. Revisit when the Android shell builds (`theme-color` meta is already kept in sync).

### Onboarding (new) — `components/app/Onboarding.tsx`
5 skippable steps: use cases -> look -> device profile -> recommended models (text/image/video/voice, scored) -> optional cloud API key. Shown only on `/app` until completed (`apex.onboarding.v1`, no secrets). Device step uses `device_profile` in Tauri, `navigator.deviceMemory` heuristics in a browser. The API key is held **in memory only** in the web build; `provider_key_set` Tauri command **does not exist yet** (STUB call, returns null).

### Image + video models (new)
- Catalog (`lib/media.ts`, mirrored in `cortex-hf-hub::media`): SD-Turbo, SD 1.5 Q4, AbsoluteReality MNN, AbsoluteReality QNN (NPU), SDXL-Turbo, FLUX.1 schnell Q3_K, Wan 2.1 1.3B, LTX-Video 2B distilled.
- **Verified 2026-11-24 via HF tree API:** repo ids and primary file sizes. **UNVERIFIED estimates:** encoder/VAE companion sizes (except LTX VAE 2.49 GB), peak RAM, ETAs.
- Device scoring (`scoreMedia` / `score_media`): NPU requirement, storage, RAM budget (70 % of free, 60 % of total, minus 1.2 GiB OS), Optimal / Heavy / Incompatible. `bestMedia` picks the best fit; onboarding uses it.
- Hub has Text / Image / Video / Voice segments; new **Studio** tab (prompt, model, denoising timeline). **STUB:** no generation engine exists. In the browser the canvas shows deterministic placeholder art labelled "Demo render"; in Tauri it calls `media_generate`, which is not registered, so it shows "engine isn't available in this build yet".

### Copy
Landing + app copy rewritten (shorter, calmer). Status section on the landing page updated to match this file.

### CI/CD
- `rust-ci.yml`: fmt --check, clippy -D warnings, test.
- `web-ci.yml` (new): token-sync check, typecheck, build on PRs / non-main pushes. `deploy-pages.yml`: typecheck before build; also triggers on design-system changes.
- `android-apk.yml` (new, manual trigger, **UNVERIFIED / never run**): NDK r26.3, `aarch64-linux-android`, `cargo tauri android init` + build, uploads APK artifact (not yet a Release).

## [NOT DONE — carried over]
Needs a real device or toolchains that were unavailable: llama.cpp backend + benchmark (`llama-cpp-2` vs `llama-crab`), Android build/APK in Releases, two CPU variants, Vulkan feature, `AudioRecord` JNI + sherpa-onnx/ort choice + verified voice URLs, real `/api/pull`, mDNS, foreground service, remote provider execution, GitHub device flow + Keystore, RaTeX evaluation, SQLite persistence, replacing `useDemoChat` with `chat_stream`. `hf_download` / `hf_pause` are *called* by `useDownloads` when in Tauri but **not implemented in Rust**.

## [NEXT PRIORITIES FOR SESSION 3]
1. Get a Tauri Android build green: run `android-apk.yml`, fix, publish APK to Releases. Build `app-ui/src-tauri` on CI (`cargo check`) so the Tauri commands stop being UNVERIFIED.
2. Implement Rust commands used by the UI: `hf_search`, `hf_download` (Channel progress, resumable), `hf_pause`, `chat_stream`, `server_start/stop`, `provider_key_set`, key-vault admin. Delete the simulated path in `useDownloads` / `useDemoChat` once native works.
3. Inference: `Engine` behind `--features llama`; benchmark `llama-cpp-2` vs `llama-crab` on arm64 hardware; wire `ThinkParser` + `GenerationEvent`.
4. Media engine: integrate stable-diffusion.cpp (Vulkan/CPU) behind a `MediaEngine` trait in `cortex-inference`; `media_generate` command; verify companion file sizes and URLs; measure real ETAs and replace estimates.
5. Voice backend + verified model URLs; server `/api/pull`, mDNS, foreground service.
6. SQLite persistence (chat, models, installed media); move theme/onboarding mirror to it.
7. Numeric contrast check for all 12 palettes (axe / script) and fix any < 4.5:1.
8. Remove unused deps (`tower-http`, `serde_json` in cortex-inference); integrations (remote providers, GitHub device flow); RaTeX evaluation.

## [HOW TO RESUME]
1. `git clone https://github.com/prashantchataut/apex-llm-android && cd apex-llm-android`
2. Read in order: this file -> `PROGRESS.md` -> `ARCHITECTURE.md` -> `RULES.md` -> `.agent/SKILLS_PROTOCOL.md`.
3. Summarise state, list tasks, log skills in `.agent/SKILL_LOGS.md`.
4. UI: `cd web-showcase && npm ci && npm run dev`. Rust: `rustup component add rustfmt clippy`, then `cargo fmt --all --check && cargo clippy --workspace --all-targets -- -D warnings && cargo test --workspace`.
5. Browser QA works in the sandbox: `npm i playwright && npx playwright install --with-deps chromium`, serve `web-showcase/out`.
6. Use the user's PAT only via `-c http.extraheader` / `GIT_ASKPASS`; never in a remote URL or file. In Session 2 the clone briefly used a token URL; the remote was reset immediately and nothing was written to the repo.

## [SECURITY NOTE]
The PAT has now been pasted into chat in two sessions. **Revoke it** at https://github.com/settings/tokens and use a fine-grained token scoped to this repo (contents: write, pages: write, workflows).
