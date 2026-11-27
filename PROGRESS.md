# PROGRESS

## Session 3 — brand, onboarding, showcase, visual proof
**Done (verified):** Apex Tensor Prism logo + launcher assets; 4-scene animated onboarding with replay; Live Lab on the landing page; `sk-apex-` key prefix end-to-end; Rust fmt/clippy/test green; 20 headless screenshots in `docs/qa-session-3/`.
**Not done:** SQLite persistence, Tauri/Android build, device testing, `icon.icns`. See `.agent/STATE.md`.

ession 2 — themes, onboarding, image/video models, QA, CI

**Done (verified)**
- 6 themes x light/dark + System mode, persisted; Appearance sheet; no-flash boot.
- First-run onboarding (use cases, look, device, model picks, optional key).
- Image + video model catalog (HF sizes verified), device scoring in TS and Rust, Models segments, Studio tab.
- Copy rewrite; visual QA in a real browser with fixes; screenshots in `docs/screens/`.
- Rust: fmt + clippy `-D warnings` + tests green locally; CI updated; web typecheck in CI.

**Caveats**
- No generation engine, no Android build, Tauri crate unbuilt; new Tauri commands UNVERIFIED.
- Companion sizes, RAM and ETAs for media models are estimates.
- Image/video output in the web build is placeholder art.

**Next** -> `.agent/STATE.md` § NEXT PRIORITIES FOR SESSION 3.

## Session 1 — Foundation
Monorepo: 6 Rust crates, Tauri v2 shell skeleton, Next.js showcase/app UI, design tokens, docs, CI. REA of PocketLLM and local-llms-on-android in `ARCHITECTURE.md` §3.

## Session 5 — real GGUF, voice, artifacts, arena
**Done (verified):** candle GGUF engine with real weights, wllama WASM engine with real download/inference, honest engine pill, CI fixes. **Built, not fully QA'd:** Whisper voice, artifacts, branching, bento, Arena. **Unverified:** APK release. See `.agent/STATE.md`.

## Session 6 — calm redesign, keyless AI, real downloader, memory, MCP, updater
**Done (verified in headless Chromium):** Calm Atmospheric Minimalism UI (no bottom nav, drawer, halo composer, tiles, context tree); keyless streaming chat; OPFS range-resumable model downloads with pause/resume/cancel/delete; Trending + Uncensored + live HF search + custom GGUF; Image Studio (+ in-chat `/imagine`); memory graph with auto-extraction and prompt injection; skills + MCP client; AutoUpdater + OTA registry. **Caveats:** only one keyless model is actually free right now; MCP unverified against a live server; Rust untouched (cargo not available here). See `.agent/STATE.md`.


## Session 8 — Session-5 evolution (v0.6.0)
Obsidian Carbon dark mode, BeautifulUI primitives, vector icons, choreographed onboarding, drawer gestures, Model Hub keyless card. QA in `docs/qa-session-5-evolved/`. See `.agent/STATE.md` for verified facts and gaps.
## Session 7 — anti-slop UI overhaul (v0.5.0)
- [x] Grid/boxes/emoji/badges teardown, borderless porcelain+carbon system
- [x] Home, composer, conversation, drawer, hub, studio, memory, MCP, settings rebuilt single-column
- [x] 3-slide onboarding, grid-free landing, QA renders in docs/qa-anti-slop/
- [ ] APK v0.5.0 build/publish (see PR)

## Session 8 (v0.7.0)
PR #6 conflicts resolved and merged; Android status-bar fix; /admin keyless access-key console + in-app gating; local-first onboarding; model selector restructure; dark-mode reply colour fix. See .agent/STATE.md for verified vs. unverified.

## Session 11 — Apex API vault, hardened /admin, working auto-updater, v1.0.0
**Done (verified):** PR #8 merged; zero-plaintext AES-256-GCM vault with 27-model sealed catalog; Keyless rebrand to Apex API; hardened /admin; rewritten auto-updater (+ banner, badge, modal, version.json); landing v1.0.0; Playwright proof in `docs/qa-session-11/`.
**Not done / honest:** upstream only serves 1 text + 1 image model anonymously (others route to it); APK signing key is per-run; Kotlin not device-tested. See `.agent/STATE.md`.

## Session 12 — editable admin keys, zero-secret audit, v1.1.0
- [x] PR #9 confirmed merged; full-history + build-output secret scan clean
- [x] Vault schema 3 dual envelope (Envelope A for users, Envelope B for /admin only), 200k PBKDF2
- [x] /admin inline key editor: reveal, copy, edit, rotate, revoke/activate, delete, model allow-lists, change passphrase
- [x] Any custom key string (strength meter is advice only); no hardcoded fallback keys
- [x] postbuild asserts out/admin/index.html + out/app/index.html
- [x] v1.1.0 version bump; Playwright E2E (mobile 390x844@2x, desktop 1440x900@2x) in docs/qa-session-12

## Session 13 — Android 15 install hardening, keyless mesh, v1.2.0
- [x] APK analysis, Gradle/manifest/packaging fixes, permanent signing key (secrets), verify gate, build-on-every-push workflow
- [x] Keyless Provider Mesh service + failover + `/admin` panel + `mesh.json`
- [x] Live research of 12 endpoints (`.agent/KEYLESS_PROVIDERS_RESEARCH.md`)
- [ ] On-device install test on Nothing Phone 4a (owner)
- [ ] beautifului.dev component pass, genuine Flux image models (not available keyless)

## Session 14 (v1.3.0, branch feat/session-14-download-fix-auto-router-oauth-v130)
Done: download fix (Rust + web), live keyless verifier + registry (14/39), Apex Auto router, 3.5 s self-healing failover, Ollama-style context + titles, AI memory distiller, style cards removed, GitHub device-flow UI + Rust relay, onboarding screen 1, QA screenshots in docs/qa-session-14.
Open: Rust unverified until CI; GitHub OAuth needs a Client ID; APK build/sign/release and merge are owner steps.

## Session 15 (partial)
- [x] In-app APK updater (Kotlin `ApexUpdater` bridge, progress UI, no Chrome hand-off) — needs CI compile + device test
- [x] Onboarding rebrand: Local AI Runner hero + capability cards
- [x] +8 local models (Qwen3 0.6B/1.7B/4B, Gemma 3 4B, LFM2 350M/1.2B, SmolLM2 360M, Dolphin 3B)
- [ ] /admin keyless model manager, keyless discovery script, Image Studio, pdfjs, KaTeX, slash commands, export, QA shots, v1.4.0 release
