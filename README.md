# ⚡ Apex — Ollama for Android, written in Rust

Run GGUF LLMs on your phone. Serve **Ollama- and OpenAI-compatible APIs** to your PC over LAN. Transcribe voice on-device. Native Rust core, Tauri v2 Mobile shell, a deliberately premium UI.

**Live UI + landing page:** https://prashantchataut.github.io/apex-llm-android/ *(deployed by `.github/workflows/deploy-pages.yml`)*

> **Status: alpha foundation (Session 1).** All six Rust crates compile and their 37 unit tests pass on Linux in GitHub Actions (`Rust CI`). They have **not** been built for Android yet. The web UI is real but runs a *scripted* demo model. The Android/NDK build, the llama.cpp backend and the ASR backend are Session 2. See [`.agent/STATE.md`](.agent/STATE.md).

## What's here
| Path | What |
|---|---|
| `crates/cortex-hardware` | `/proc` + NDK profiler → `DeviceCapabilityProfile` (RAM, SoC tier, Vulkan, quant + ctx recommendation) |
| `crates/cortex-hf-hub` | Hugging Face GGUF search, ⚡/⚠️/❌ scoring, resumable segmented downloads + SHA-256 |
| `crates/cortex-inference` | `Engine` trait, streaming `<think>` parser, GBNF (MCQ/JSON), chat templates |
| `crates/cortex-voice` | `Transcriber` trait, INT8 model catalog, VAD, 60 fps spectrum bins |
| `crates/cortex-server` | axum: Ollama + OpenAI endpoints, `sk-apex-…` key vault (hashed), request log |
| `crates/cortex-integrations` | GitHub REST client + provider router (Local / OpenRouter / Anthropic / OpenAI / Groq) |
| `app-ui/src-tauri` | Tauri v2 Mobile shell (thin command layer) |
| `web-showcase` | Next.js static export: landing page **and** the 4 app screens (`/app`) |
| `packages/design-system` | Canonical design tokens (`tokens.css`) |
| `.agent/` | Memory brain for stateless AI sessions |

## Run it
```bash
# UI + landing
cd web-showcase && npm install && npm run dev        # http://localhost:3000  (app: /app)

# Rust
cargo test --workspace

```

## Design language
Four archetypes — Obsidian + aurora (A), VisionOS frosted fan-stack (B), Swiss grid + progressive-opacity type (C), reasoning chat (D). Spec in [`.agent/SKILLS_PROTOCOL.md`](.agent/SKILLS_PROTOCOL.md).

## Docs
[`ARCHITECTURE.md`](ARCHITECTURE.md) · [`RULES.md`](RULES.md) · [`PROGRESS.md`](PROGRESS.md) · [`CLAUDE.md`](CLAUDE.md)
