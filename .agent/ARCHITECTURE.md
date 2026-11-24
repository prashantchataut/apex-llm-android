# ARCHITECTURE — Apex

## 1. Shape of the system

```
┌────────────────────────── Android device ───────────────────────────┐
│  Tauri v2 Mobile (WebView UI: Next.js static export, /app route)     │
│        │ invoke()/events                                              │
│  app-ui/src-tauri  ── thin command layer (no business logic)          │
│        │                                                              │
│  ┌─────┴──────────────────────────────────────────────────────────┐  │
│  │ cortex-hardware ─► DeviceCapabilityProfile                       │  │
│  │ cortex-hf-hub   ─► search + score(profile) + resumable download  │  │
│  │ cortex-inference─► Engine trait (llama.cpp) + ThinkParser + GBNF │  │
│  │ cortex-voice    ─► Transcriber trait (sherpa-onnx / ort) + VAD   │  │
│  │ cortex-server   ─► axum :11434  Ollama + OpenAI + key vault      │  │
│  │ cortex-integrations ─► GitHub client + Provider router           │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└───────────────▲──────────────────────────────────────────────────────┘
                │ LAN (mDNS `_ollama._tcp`), Bearer sk-apex-…
        PC: Cursor / Continue / curl / any OpenAI SDK
```

### Why Tauri v2 Mobile + Rust (not Kotlin/Compose)
- One language for every hot path; the WebView only renders. Token streaming flows Rust → Tauri `Channel` → React, no JNI marshalling per token.
- The requested visuals (backdrop-filter glass, KaTeX, shader-ish aurora, spring physics) are 10× cheaper in CSS/Framer Motion than in Compose.
- Escape hatch: the crates are UI-agnostic. A Kotlin/Compose or `egui`-style shell can bind them through UniFFI without changing core logic.
- Risk register: Tauri Mobile is younger than Compose (WebView memory ≈ 80–150 MB — budget it against model RAM, see §4).

### Inference engine decision
- **Default:** llama.cpp via a Rust binding behind our own `Engine` trait (`cortex-inference/src/engine.rs`). Candidates: `llama-cpp-2` (utilityai) or `llama-crab`. **Session 2 must benchmark both** on a real arm64 device before pinning; the trait means the choice is a one-file change. The `llama.cpp` backend is feature-gated (`--features llama`) so desktop CI and unit tests need no C++ toolchain.
- **candle** stays a fallback for pure-Rust builds (no CMake/NDK C++), but its quantized-GGUF perf on ARM is behind llama.cpp's NEON/dotprod kernels.
- **LiteRT-LM** (local-llms-on-android's choice) is a *second* backend candidate for NPU/GPU delegates on supported SoCs — keep the `Engine` trait wide enough to add it (`ModelFormat::{Gguf, LiteRtLm}`).

### Voice
- `Transcriber` trait; default backend `sherpa-onnx` (streaming transducer / CTC models) or `ort`. Catalog (`cortex-voice::catalog`) lists INT8 models: Moonshine-tiny (~27 MB int8 class), Whisper-tiny int8 (~40 MB class), Parakeet-CTC small/int8 variants. **Exact sizes/URLs must be verified in Session 2** — the catalog marks `verified: false` until checked.
- Pipeline: AudioRecord (16 kHz mono PCM16) → ring buffer → energy VAD → 160 ms chunks → recognizer → partials stream into the prompt bar. 60 fps waveform = 32 log-spaced bins computed in Rust (`waveform_bins`).

### LaTeX
- Session 1: KaTeX in the WebView (`katex.renderToString`, reserved min-height ⇒ no layout shift).
- Roadmap: evaluate RaTeX (pure Rust renderer) → SVG for a WebView-free chat renderer.

## 2. Crates (all `edition = 2021`, workspace deps)

| Crate | Responsibility | Key types |
|---|---|---|
| `cortex-hardware` | Parse `/proc/meminfo`, `/proc/cpuinfo`, Android props, Vulkan probe (injected), storage | `DeviceCapabilityProfile`, `SocTier`, `Quant`, `recommend()` |
| `cortex-hf-hub` | HF API search, GGUF file listing, scoring/badging, Range-resumable multi-segment download + SHA256 | `ModelCard`, `Compatibility`, `score()`, `Downloader` |
| `cortex-inference` | `Engine` trait, `GenerationEvent` stream, `<think>` state machine, GBNF builder, chat templates | `ThinkParser`, `mcq_grammar()`, `ChatTemplate` |
| `cortex-voice` | `Transcriber` trait, catalog, VAD, waveform bins | `VoiceModel`, `Vad` |
| `cortex-server` | axum router: Ollama + OpenAI wire formats, SSE/NDJSON streaming, key vault, usage log | `AppState`, `KeyVault`, `router()` |
| `cortex-integrations` | GitHub REST (repos, contents, gists, branches) + `Provider` router (Local, OpenRouter, Anthropic, OpenAI, Groq) | `GitHubClient`, `ProviderRouter` |

### Server surface (`cortex-server`)
Ollama: `GET /api/tags`, `GET /api/ps`, `POST /api/generate`, `POST /api/chat` (NDJSON stream), `POST /api/pull`, `GET /api/version`.
OpenAI: `GET /v1/models`, `POST /v1/chat/completions` (JSON + SSE `data: …\n\n` + `[DONE]`).
Ops: `GET /health`, `GET /api/health`.
Auth: `Authorization: Bearer sk-apex-<43 base62>`; keys stored as **SHA-256 hashes** (plaintext shown once). Loopback requests may be allowed keyless via a setting (default: keys required for non-loopback). Per-key usage (prompt/completion tokens, last used) in `KeyVault`.

## 3. REA findings

### Kimi-syl/PocketLLM (Kotlin/Compose + JNI llama.cpp)
| Pattern | Why it works | Apex improvement |
|---|---|---|
| Two arm64 builds (ARMv8-A baseline + `armv8.2-a+dotprod+fp16`), chosen at runtime from `/proc/cpuinfo` | Avoids SIGILL on A53-class cores while giving modern SoCs the fast kernels | `cortex-hardware::CpuFeatures` parses `asimddp`/`fphp`/`i8mm`/`sve`; `recommend()` emits `cpu_variant`. |
| Vulkan offload | Large prompt-processing win on Adreno/Mali | Vulkan probe is injected (`VulkanProbe` trait) so the profile is deterministic in tests. |
| Grammar-constrained tool calls only when `ToolRouter` predicts tool use | Zero cost when unused | We reuse the idea for MCQ: `mcq_grammar()` only applied when the UI requests a structured question. |
| Resumable segmented downloader w/ persisted metadata | Phones lose network & get killed | `cortex-hf-hub::download` plans N Range segments, persists a sidecar `.apexdl` JSON, verifies SHA256 (HF `x-linked-etag` is the LFS sha256). |
| In-app API keys w/ last-used tracking, usage log | Needed for LAN safety | Hash-at-rest keys, per-key token analytics, revoke. |
| HF discovery limited to `.gguf` | Never offer unloadable files | Same + hardware badge per file. |
| Marketing site (pocketllm-ai.vercel.app) | Clear value prop + demo | Swiss-grid + frosted fan-stack hero + live interactive phone demo. |

### dineshsoudagar/local-llms-on-android (LiteRT-LM / ONNX)
| Finding | Implication |
|---|---|
| Models packaged as `.litertlm` (Gemma 4, Qwen3, DeepSeek R1) via LiteRT-LM; GGUF is Play-only/"Pro" in their split | LiteRT gives vendor delegates (GPU/NPU) but narrower model reach. GGUF = widest catalog. Apex: GGUF first, `Engine` trait leaves a LiteRT slot. |
| "Context fitted to your phone, auto-compact" | KV cache dominates RAM: `kv_bytes = 2·n_layers·n_ctx·n_kv_heads·head_dim·bytes_per_elem`. `recommend()` caps `max_ctx` from available RAM. |
| Offline dictation + audio files; LAN server + Web UI | Matches our `cortex-voice` + `cortex-server`. |

**Memory / thermal rules distilled** (used by `cortex-hardware::recommend`):
1. Model budget = `min(0.55 × available_RAM, 0.45 × total_RAM)`; reserve ≥1.2 GB for OS + WebView.
2. Prefer Q4_K_M ≥ 8 GB, IQ4_XS / Q4_0 for 4–6 GB, Q3_K_M / smaller models below 4 GB. Q5_K_M only when budget ≥ 1.35× model Q4 size.
3. Threads = performance cores only (big + prime), never all cores — little cores cause stragglers. Thermal: drop to `threads-1` and halve batch size when `thermal_status ≥ MODERATE` (Android `PowerManager.getCurrentThermalStatus` via JNI).
4. Sustained decode throttles after ~2–5 min on most SoCs → expose TPS in UI and auto-degrade gracefully.

### UiHall / 21st.dev (see SKILL_LOGS for scrape limits)
Primitives adopted: shimmer badge, prompt bar with attach/camera/mic, collapsible thinking tool card with elapsed timer, option cards, vertical glass timeline (Merlin-style).

## 4. Memory budget example (8 GB phone, ~4.6 GB available)
OS+WebView reserve 1.2 GB → model budget `min(0.55·4.6, 0.45·8)=2.5 GB` → Qwen2.5-3B Q4_K_M (≈1.9 GB) + 4k ctx KV (~0.25 GB) fits ⚡; Llama-3.1-8B Q4_K_M (≈4.9 GB) → ❌.

## 5. Screen specifications (implemented as `web-showcase/src/components/app/*`)

1. **Aurora Home** — Archetype A. Violet top-bleed aurora (`#6D28D9`), greeting in progressive-opacity type, 4 asymmetric bento suggestion cards, quick-action pill [Upload][Camera][Mic], PromptBar. Mic toggles a 60 fps waveform + live partial transcript demo.
2. **Reasoning Chat** — Archetype D, cobalt aurora (`#1D4ED8`). ThinkingAccordion with live ms timer + vertical timeline; KaTeX inline/block; MCQ OptionCards parsed from a `[[mcq]]` block; ShimmerBadge "Proxima" while streaming.
3. **Model Hub** — Archetype B. Hero frosted telemetry card with fanned mini cards (TPS, RAM, Q4_K_M, API keys, ctx). Model list scored by the *same algorithm as Rust* (`lib/compat.ts` mirrors `cortex-hf-hub::score`). 1-tap download simulation w/ progress. Voice model installer (16–25 MB class).
4. **Server & Keys** — Toggle server (`:11434`), `sk-apex-…` generator (WebCrypto), revoke, live request-log timeline, one-tap config snippets (Cursor, Continue, curl), GitHub connection card.

## 6. Delivery pipeline
- `web-showcase` → `next build` (`output: 'export'`, `basePath=/<repo>`) → `deploy-pages.yml`.
- Android: `cargo tauri android init` → `cargo tauri android build --target aarch64` (NDK r26+, `ANDROID_NDK_HOME`). Session 2.


## 7. Session 2 additions

### Theming
`tokens.css` defines each palette as flat custom properties on `[data-theme][data-mode]`; any element can carry those attributes to preview a palette in place (the Appearance swatches do this). `<html>` gets the resolved mode (System resolves in JS and follows OS changes). Components never hard-code colours: Tailwind `white`/`black` map to theme ink/inverse, `ink-2`/`ink-3` carry body/secondary alpha, `--r-card` varies per theme (Swiss 6 px, Graphite 16 px).

### Image / video generation (planned)
`cortex-hf-hub::media` holds the catalog and scoring. Planned engines: stable-diffusion.cpp (GGUF; SD-Turbo, SD 1.5, SDXL-Turbo, FLUX, Wan 2.1, LTX-Video; CPU/Vulkan), MNN (SD 1.5 CPU zips) and QNN (Snapdragon NPU zips, `needs_npu`). Diffusion runs with the LLM unloaded, hence the larger RAM share in `media_budget_bytes`. Engine trait and `media_generate` command are not written yet.
