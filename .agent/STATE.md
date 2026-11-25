# STATE — last updated: end of Session 8 (branch feat/session-8-android-insets-admin-keyless-local-first, PR #7)

## [SESSION 8 — WHAT ACTUALLY HAPPENED]
- **PR #6 resolved + merged.** It was branched off before PR #5's calm/borderless redesign, so 14 UI files conflicted. Resolution: main's calm UI kept for every conflicting UI file (the design the owner likes); PR #6's non-conflicting additions (ui.tsx primitives, docs, QA renders) kept; docs merged by hand. tsc clean, merged via REST API.
- **Android status-bar collision (root cause):** MainActivity pushed `--apex-inset-top` once, before the document existed, and *nothing in the web layer read it*; the header used only `env(safe-area-inset-top)` which is 0 in an edge-to-edge Android WebView. Fix: native Insets store + repeated push + `ApexBars.insets()` pull; `lib/insets.ts`; `.pt-safe/.pb-safe` classes = `max(env, --safe-*, 38px/14px Android floor) + 10/8px`. `setDecorFitsSystemWindows(true)` is NOT used: ignored on API 35+ (targetSdk 37).
- **Keyless Cloud is now gated.** `lib/access.ts` (pure-JS SHA-256, registry fetch with `cache:no-store` + `?t=`, raw.githubusercontent first then bundled copy, 24 h offline grace, per-device daily quota, model allow-list, fallback to local on revoke). `/admin` (`AdminConsole.tsx`) signs in with the owner's GitHub token (sessionStorage only), edits keys, kill-switch, Publish = GitHub Contents API PUT to `web-showcase/public/config/keyless-registry.json` on `main`. `/#/admin` and `/?admin=1` redirect to `/admin/`.
- **Default key** `APEX-PRO-2025` (registry stores only its SHA-256). Rotate/revoke it in /admin.
- **Onboarding rebuilt** (3 steps, no mode choice): welcome, hardware profile + 1-tap starter download (real MB progress, loads into wllama, sets active model), theme + optional key. Model selector: installed local models first, download entry points, Keyless Cloud rows with lock badges.
- **Found while QA-ing:** AI reply paragraphs used legacy `text-ink-2` bound to `<html data-mode>`, so they rendered near-black on the dark canvas (existing bug in main). Fixed in calm.css.
- Version 0.7.0.

## Verified (headless Chromium, `docs/qa-session-8/`)
- Header buttons sit >= 48px (38px simulated bar + 10px) with native bridge AND with no bridge (CSS floor only).
- Real HF download of SmolLM2 135M (145 MB) -> loaded in ~6 s -> answered offline at ~30 tok/s with the cloud endpoint blocked.
- Key flow: invalid key shows "Invalid / Revoked by Admin", APEX-PRO-2025 verifies, keyless model unlocks; registry flipped to revoked -> next check locks and the pill falls back to the local model.
- Admin publish payload: branch main, sha passed, only hashes written (plaintext not in payload).

## Honest gaps
- **Admin <-> GitHub was tested against a mocked api.github.com** (the registry is not on main until this PR merges). The request shapes follow the documented Contents API.
- raw.githubusercontent.com is CDN cached; the `?t=` buster avoids it in practice but propagation is not guaranteed to be "the exact second".
- The gate is app-level: the upstream cloud endpoint (Pollinations) is anonymous, so a modified APK could bypass it. The public registry holds hashes; short keys are brute-forceable, use long random ones.
- Kotlin changes could only be compiled by CI (no JDK/Android SDK in the sandbox); not device-tested on a physical phone.
- The 491 MB Qwen starter was observed downloading (211/491 MB at 2 min in this sandbox, throttled); full completion was verified with the 145 MB model.
- Rotate the GitHub PAT that was pasted in chat.


## [SESSION 8 — WHAT ACTUALLY HAPPENED]
- **Baseline**: "Session 5 UI" was resolved to the calm pastel UI in `docs/qa-session-5-redesign/` (commit dd0b524, 2x2 capability tiles, halo composer). Branch cut from there, NOT from the Session 7 anti-slop `main`. Session 7 work (borderless porcelain/carbon rewrite, 3-slide onboarding) is therefore not included; this is a judgment call about an ambiguous instruction.
- **Skills**: the named skills (`design-taste-frontend`, `hallmark-ui`, `open-design-skill`, `rea`) are NOT installed in this runtime; there is no skill loader. They were not invoked. I applied their stated principles manually and logged that in `.agent/SKILL_LOGS.md`.
- **beautifului.dev** was really scraped (headless Chromium, computed CSS + screenshots). Extracted: oklch tokens, Inter + JetBrains Mono, ease curves (.23,1,.32,1)/(.16,1,.3,1), segmented pill, prompt bar + popover rows, Thinking trace chip, pixel-grid loader. Re-implemented (not copied) as `calm/ui.tsx` + CSS in `calm.css`.
- **Dark mode** "Obsidian Carbon": 4 lit surface layers, light-based hairlines (6%), inner specular top edge via `--spec`, atmospheric glow, calibrated ink alphas. Instant switch (`no-tx` class for 2 frames), persisted (`apex.calm.mode`), pre-paint `data-cmode` on `<html>` + theme-color meta, theme toggle in the drawer header, landing page toggle.
- **Emoji removed** from the calm UI and replaced with vector icons (`Glyph` maps the few emoji that still come from data such as skill notes).
- **UX**: drawer swipe-to-close + left-edge swipe-to-open; popover rows with descriptions for attach/skills; border-beam on composer while focused/streaming; pixel-loader + spring-collapse reasoning trace; Model Hub gets an always-visible "Keyless AI is active" card, segmented tabs, mono byte progress; onboarding (2 steps, live Porcelain/Obsidian preview, Keyless / Local / Uncensored choice, lands in Hub tab) with Replay in Settings.
- **Version** bumped to 0.6.0 (the previous 0.4.0 made the app report v0.5.0 as an "update").

## Verified in this sandbox (Playwright, production static export, 127.0.0.1)
- Theme persists across reload; onboarding does not reappear; no React hydration errors.
- Real Hugging Face download of Gemma 3 1B: 10-15% at ~65 MB/s with Pause/Cancel shown (`06b`, `06c` renders).
- Chat renders use a MOCKED Pollinations SSE response (so they prove layout, not live provider output).

## Honest gaps
- Not device-tested in the Tauri WebView. Native (Tauri) download Pause/Cancel is still a stub (hidden).
- MCP client still only spec-tested; no live MCP server available.
- Image generation hits Pollinations' free limit; not exercised in QA captures.
- Old session-4 files (`app/ArenaView`, etc.) remain unrouted.
- **Rotate the GitHub PAT**: it was pasted in chat again.

# STATE — last updated: end of Session 6 (PR: feat/calm-ui-keyless-mcp-uncensored)
# STATE — last updated: end of Session 7 (branch feat/anti-slop-ui-overhaul; PR #4 was already merged)

## [SESSION 7 — WHAT ACTUALLY HAPPENED]
- PR #4 was merged, so the work is on a new branch off `main`. Shell had no `gh`/`cargo`: PR + release driven through the GitHub REST API.
- UI teardown: grid/Swiss/crosshair CSS+components, bento tiles, hairline boxes, emoji, badge rows, heavy weights removed; 33 unreachable dashboard files deleted. New calm.css v2 (Warm Porcelain / Soft Carbon).
- Rebuilt: Home (greeting + 3 floating pills + halo composer), Composer (send<->stop morph), Conversation (shimmer thinking, borderless AI text, 22/22/6/22 user pill), ChoiceCards (soft pills), Drawer (20px active pill), Model Hub (sliding tabs, single-column list, circular progress, info reveal), Image Studio / Memory / MCP / Settings (single column), 3-slide Onboarding, grid-free landing with live prompt bar + tabs.
- Version bumped to 0.5.0 (version.ts, tauri.conf.json, workflow default tag).
- QA: Playwright (headless Chromium) renders in `docs/qa-anti-slop/` (390x844@2x and 1440x900@2x). Chat renders used a mocked Pollinations SSE response (the shimmer frame holds the request open), so they do not prove live provider output.
- Fixed from self-critique: leaking drawer shadow strip, invisible onboarding CTA text (theme bridge maps `text-white` to ink), dark-mode CTA contrast.

## Honest gaps
- cuedesign.space and UiHall are JS-rendered; only their titles/shell were retrievable. See COMPONENT_EXTRACTION.md.
- Local server (LAN) view still uses the older ServerScreen component, only re-skinned via shared tokens (borderless); its internals were not redesigned.
- Dead code remains in `components/app/{MessageTools,Artifacts}.tsx` (telemetry/bento-share exports no longer routed).
- Not device-tested in the Tauri WebView. View Transitions circular reveal needs Chromium >= 111 (falls back to instant switch).
- APK: see PR description / Actions run; do not assume.
- **Rotate the GitHub PAT** (pasted in chat again).


## [SESSION 6 — WHAT ACTUALLY HAPPENED]
No PR was open at session start (PR #3 already merged). Branch `feat/calm-ui-keyless-mcp-uncensored`, 3 checkpoint commits.
The shell was `gh`-less / `cargo`-less: PR + release were driven through the GitHub REST API; **no Rust code was touched, so `cargo check/test` were NOT re-run** (CI runs them).

### VERIFIED (run in this sandbox, headless Chromium, `docs/qa-session-5-redesign/`)
- **Calm UI**: Porcelain Dawn (light, default) / Soft Carbon (dark); pastel top glow; **no bottom nav**; slide-over drawer (persistent sidebar on >=1024px); header = menu + model pill + memory-tree/new-chat; halo composer (actions inside the card) compacting to a pill after the first message; 2x2 capability tiles; context node tree for multi-turn chats.
- **Keyless chat**: real streamed replies from Pollinations `openai-fast` (GPT-OSS 20B) incl. `<think>` pill, with live `/models` discovery and fallback.
- **Download manager**: real fetch-stream into OPFS with Range resume; observed 111/144 MB at ~70 MB/s, Pause/Resume/Cancel/Delete; finished model loaded into wllama from the on-disk Blob and answered (22 tok/s, SmolLM2 135M).
- **Model Hub**: Trending / Uncensored / live Hugging Face search + raw `.gguf` URL install. Sizes of all new models read from the HF tree API on 2026-11-25.
- Memory extraction + injection, skills pre-run (calc verified), image generation in chat and Studio, tsc + `next build` green.

### Deviations from the prompt (facts)
- **Keyless models**: Pollinations' free/anonymous text tier now serves ONE model (`openai-fast` = GPT-OSS 20B). `deepseek-reasoning`, `qwen-coder`, `llama`, `mistral` return 404 there. The picker lists them, marks them "not on free tier right now" and routes to GPT-OSS 20B; the message footer names the model that really answered. LLM7 and other free providers need keys, so they were not used.
- Pollinations rejects browser origins of the form `http://localhost:<port>` ("Missing Turnstile token"); `127.0.0.1`, GitHub Pages and Tauri origins work (tested with curl). QA was run on 127.0.0.1.
- **Image API** returns a "Free limit reached — 1 image / 45 s" picture with HTTP 402. The app fetches images, detects 402/429 and retries with a visible countdown. `SDXS-512M` on-device diffusion is only a registry slot (STUB, not runnable).
- Sizes: Qwen2.5 0.5B (official) is 491 MB, not 398 MB (the 398 MB file is the abliterated Q4_K_M). Uncensored picks: Dolphin3.0 1B (bartowski), Qwen2.5 0.5B/1.5B abliterated (mradermacher), Llama 3.2 1B (mradermacher) / 3B (QuantFactory) abliterated, Hermes 3 3B (bartowski).
- **Native** (Tauri) downloads still use the Rust `hf_download`; Pause/Cancel there are NOT wired (STUB, buttons hidden in native mode). Update installer: browsers cannot fetch GitHub release assets (no CORS) so the updater hands the APK URL to the system downloader; a native in-app installer is STUB.
- MCP client is protocol-tested only against the spec (no live server was available in the sandbox) — UNVERIFIED end-to-end. GitHub Gists tool needs a user token; "create commits" is NOT implemented.
- Voice-note bubble plays the *transcript* via speechSynthesis (raw audio is not stored).
- Old dark screens (Hub/Studio/Arena/Onboarding/old Chat) are no longer routed; Arena, artifacts drawer, telemetry popover and bento share were removed from the UI (code still in repo).
- APK: see the PR description / Actions for the run result — do not assume.

## [SESSION 7 ROADMAP]
1. Confirm APK run + release asset; device-test download/keyless in the WebView (`tauri.localhost` origin).
2. Wire native pause/cancel + a native APK installer command; native SpeechRecognizer.
3. Verify MCP against a real server; add GitHub commit tool.
4. Persist conversations in SQLite; on-device diffusion engine for the SDXS slot.
5. **Rotate the GitHub PAT** (pasted in chat again).
