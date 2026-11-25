# STATE — last updated: end of Session 6 (PR: feat/calm-ui-keyless-mcp-uncensored)

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
