# STATE — last updated: end of Session 5 (direct-to-main; no PR per user request)

## [SESSION 5 — WHAT ACTUALLY HAPPENED]
PR #3 was already merged at session start. Session 4's `android-apk.yml` had **failed twice** and **no GitHub Release existed** (STATE of Session 4 overstated this).

### VERIFIED (run in this sandbox)
- **Pure-Rust candle GGUF engine** (`crates/cortex-inference`, feature `candle`): own GGUF-vocab byte-level BPE tokenizer (`gguf_tokenizer.rs`, 4 unit tests), header inspector `read_gguf_info`, `CandleEngine` (llama + qwen2 archs). **Real weights run**: SmolLM2-135M-Instruct Q8_0 answered "The capital of France is Paris…" at ~8 tok/s on a 2-core x86_64 sandbox (`tests/candle_real.rs`, needs `APEX_TEST_GGUF`). `cargo clippy -p cortex-inference --features candle --all-targets -D warnings` clean; Rust CI (with candle clippy + test steps) green on GitHub.
- **Browser/WebView engine**: `@wllama/wllama` 4.0 (llama.cpp WASM SIMD). In headless Chromium: real byte-accurate download (36.1/144.8 MB at 15.9 MB/s observed), OPFS cache, load, and real streamed tokens with measured tok/s (24.8 tok/s in the header on the sandbox CPU). Screens in `docs/qa-session-5/`.
- Honest engine pill (`EnginePill`): sandbox / wllama / native / external router; per-message `LIVE WEIGHTS` vs `SIMULATED` badges; bento cards and telemetry carry the same label.
- Frontend `tsc --noEmit` and `next build` pass; GitHub Pages deploy green.

### BUILT BUT NOT FULLY VISUALLY VERIFIED (UNVERIFIED)
- Real mic FFT waveform (`AnalyserNode.getByteFrequencyData`) + Whisper tiny.en ONNX ASR (`lib/voice.ts`): code typechecks and builds; the Playwright step did not complete (script bug: clicked a backdrop under an open dialog). Whisper was never observed transcribing. Android `SpeechRecognizer` fallback: **STUB** (no Tauri command). System `SpeechRecognition` fallback exists but may use the cloud.
- Artifacts drawer (html/svg/js sandboxed iframe, mermaid): SVG preview rendered (first render was oversized/clipped; fixed, re-render not re-captured). JSX is **not** supported (code only).
- Branching (edit/regenerate/pager), telemetry popover, Share Bento Card, Arena duel + Crown: implemented and typechecked; screenshots 03/05 **not captured** (same script bug). Arena lanes use real wllama slots A/B only for models cached on-device; otherwise lanes are labelled SIMULATED. RAM in the popover is an estimate (weights + KV), not measured.
- Android APK: root cause of Session 4 failure found (`no such command: tauri` – npm CLI lacks the cargo subcommand) and fixed (`cargo install tauri-cli`); second failure cause (`onnxruntime-node` postinstall) fixed with `ONNXRUNTIME_NODE_INSTALL=skip`. Tauri shell now links the candle engine (no C++/CMake). A new run was in progress at the end of the session; **APK existence on the v0.3.0-beta release is UNVERIFIED** — check Actions → "Android APK".

### Deviations from the prompt (facts)
- `HuggingFaceTB/SmolLM2-135M-Instruct-GGUF` is not publicly listed (HF API returns 401). Used `bartowski/SmolLM2-135M-Instruct-GGUF` `…Q8_0.gguf` = 144,811,360 B.
- `qwen2.5-0.5b-instruct-q4_k_m.gguf` is 491,400,032 B (not ~398 MB).
- Headless Chromium needs a persistent profile for OPFS (ephemeral profile quota → "No space available").
- candle on `aarch64-linux-android` is compiled only by the CI APK job; never run on a phone.

## [SESSION 6 ROADMAP]
1. Confirm APK run + release asset; device-test candle speed vs llama.cpp on arm64.
2. Fix QA script (use in-dialog Close buttons), capture 03/04/05 on mobile + desktop, add them to the docs.
3. Observe Whisper tiny.en transcribing real speech; add native Android SpeechRecognizer command.
4. SQLite persistence; GBNF-equivalent constrained decoding in candle; JSX artifacts.
5. Rotate the PAT (pasted in chat again).
