# STATE — last updated: end of Session 1

## [COMPLETED IN SESSION 1]

### Memory brain / docs
`CLAUDE.md`, `RULES.md`, `ARCHITECTURE.md` (copy of `.agent/ARCHITECTURE.md`), `PROGRESS.md`, `README.md`, `.agent/{STATE,ARCHITECTURE,SKILLS_PROTOCOL,SKILL_LOGS}.md`

### Rust workspace (`Cargo.toml`, 6 crates) — **WRITTEN, NOT COMPILED** (no cargo in the sandbox)
- `cortex-hardware`: meminfo/cpuinfo parsers, `SystemSource` trait, `recommend()`, `profile()`, tests.
- `cortex-hf-hub`: `HfClient` (search/tree), `scoring::score` (3-tier badge), `download` (Range segments, sidecar resume, sha256), tests.
- `cortex-inference`: `Engine` trait + `ScriptedEngine`, `ThinkParser` (split-tag safe), `mcq_grammar`/`json_object_grammar`, `ChatTemplate` (ChatML/Llama3/Gemma). **No llama.cpp backend yet** (`llama` feature is empty).
- `cortex-voice`: `Transcriber` trait, `CATALOG` (sizes UNVERIFIED), `Vad`, `spectrum_bins` (Goertzel). **No ASR backend yet.**
- `cortex-server`: all Ollama + OpenAI routes, auth middleware, loopback-only admin (`/apex/*`), `KeyVault`, `EchoBackend`, 8 tests. `/api/pull` is a **STUB**. No mDNS yet.
- `cortex-integrations`: `GitHubClient` (me, repos, read_file, put_file, create_gist), `build_context`, `ProviderRouter` (routing only — **no remote request execution yet**).
- `app-ui/src-tauri`: Tauri v2 skeleton (`device_profile`, `start_server` STUB w/ EchoBackend). Own workspace, **not built**.

### Frontend (`web-showcase/`, Next.js 16 static export, Tailwind 4, framer-motion, KaTeX)
- Design tokens (`src/app/tokens.css` == `packages/design-system/tokens.css`).
- Primitives: `FanStack`, `Swiss` (GridFrame/GridRow/Crosshair/Ph/Cutout/ScriptNote), `Glass` (RippleButton, Chip3D, ShimmerBadge, Toggle), `Waveform`, `Icon`.
- Screens: `HomeScreen` (A), `ChatScreen` (D: `ThinkingAccordion`, KaTeX `Rich`, `OptionCards`), `HubScreen` (B: device simulator, scoring mirror `lib/compat.ts`, simulated resumable downloads, voice installer), `ServerScreen` (toggle, WebCrypto `sk-pocket-` keys, simulated live log, config generator, GitHub card).
- Landing page with Swiss grid hero, progressive-opacity headlines, inline cutouts, tilted glass chips, fan-stack insight card, live phone demo.
- All "model" behaviour in the browser is **scripted** (`lib/demo-script.ts`); downloads/traffic/dictation are **simulated**.
- UI was type-checked and production-built but **never viewed in a browser** (no browser in sandbox) — do a visual QA pass.

### CI/CD
`.github/workflows/deploy-pages.yml` (Next static export → Pages), `.github/workflows/rust-ci.yml` (cargo check + test).

## [NEXT PRIORITIES FOR SESSION 2]
1. **Visual QA** the live site/app at 360–430 px and desktop; fix spacing/overflow; screenshot into `docs/`.
2. `cargo check --workspace && cargo test --workspace` → fix every compile error / failing test (expect some; code was never compiled). Add `cargo clippy -D warnings`.
3. Verify `web-showcase` CI deploy is green; confirm Pages URL.
4. **Inference backend**: benchmark `llama-cpp-2` vs `llama-crab` on a real arm64 phone; implement `Engine` behind `--features llama`; KV-cache shift; wire `ThinkParser` + `GenerationEvent` stream.
5. **Android pipeline**: `cargo tauri android init`; NDK r26+; arm64 builds; two CPU variants selected from `CpuFeatures::cpu_variant()`; Vulkan feature; APK in Releases via workflow.
6. **Tauri commands**: `device_profile` ✓, add `hf_search`, `hf_download` (Channel progress), `chat_stream` (Channel tokens), `server_start/stop`, key vault admin calls (`x-apex-admin` header); replace demo hooks (`useDemoChat`, simulated downloads) with `invoke`.
7. **Voice**: choose sherpa-onnx vs ort; **verify** model URLs/sizes (flip `verified`), Android `AudioRecord` JNI → 16 kHz PCM → `Transcriber`.
8. **Server**: real `/api/pull` → hf-hub; mDNS `_ollama._tcp`; Android foreground service so the server survives backgrounding; TLS option.
9. **Integrations**: execute remote provider calls (OpenAI-format + Anthropic `/messages`) in the router; GitHub OAuth device flow; store tokens in Android Keystore.
10. **LaTeX**: evaluate RaTeX (pure Rust) as a WebView-free renderer.
11. Re-attempt UiHall / 21st.dev scraping with a headless browser (SKILL_LOGS explains the Session 1 blocker).
12. Persistence: SQLite (chat history, models, keys metadata).

## [HOW TO RESUME]
1. `git clone https://github.com/prashantchataut/apex-llm-android && cd apex-llm-android`
2. Read in order: this file → `PROGRESS.md` → `ARCHITECTURE.md` → `RULES.md` → `.agent/SKILLS_PROTOCOL.md`.
3. Summarise state to the user, list this session's tasks, log skills in `.agent/SKILL_LOGS.md`.
4. UI: `cd web-showcase && npm ci && npm run dev`. Rust: `cargo test --workspace`.
5. Use the user's PAT only via `Authorization` header / `GIT_ASKPASS`; never write it into a remote URL or file.
6. Before ending: update this file + `PROGRESS.md`, conventional commit, push.

## [SECURITY NOTE]
The PAT used in Session 1 was pasted into a chat. It should be **revoked** at https://github.com/settings/tokens and replaced with a fine-grained token scoped to this repo (contents: write, pages: write, workflows).
