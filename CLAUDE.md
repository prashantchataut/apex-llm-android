# CLAUDE.md — Apex (apex-llm-android)

> You are a stateless agent. **This repo is your memory.** Read in this order before touching anything:
> 1. `.agent/STATE.md` — what is done / what is next / how to resume
> 2. `PROGRESS.md` — one-screen changelog per session
> 3. `ARCHITECTURE.md` (== `.agent/ARCHITECTURE.md`) — system design + REA findings + screen specs
> 4. `RULES.md` + `.agent/SKILLS_PROTOCOL.md` — non-negotiable design/code laws

## What Apex is
"Ollama for Android": a native **Rust** core that runs GGUF LLMs on-device, exposes Ollama + OpenAI compatible APIs on the LAN (`0.0.0.0:11434`), does on-device voice transcription, and ships behind a Tauri v2 Mobile UI with a deliberately premium visual language. A static showcase site deploys to GitHub Pages.

## Monorepo map
```
Cargo.toml                workspace (6 crates + app-ui/src-tauri)
crates/cortex-hardware    /proc + NDK + Vulkan profiler -> DeviceCapabilityProfile
crates/cortex-hf-hub      Hugging Face GGUF search, hardware scoring, resumable downloads
crates/cortex-inference   llama.cpp wrapper trait, <think> parser, GBNF for MCQ, templates
crates/cortex-voice       ASR engine trait, model catalog, VAD + waveform bins
crates/cortex-server      axum: Ollama + OpenAI endpoints, API key vault, request log
crates/cortex-integrations GitHub REST client + unified provider router
app-ui/                   Tauri v2 Mobile shell (src-tauri) — frontend = web-showcase `/app` route
web-showcase/             Next.js static export: landing site + the 4 interactive app screens
packages/design-system/   canonical design tokens (tokens.css) — mirrored into web-showcase globals.css
.agent/                   memory brain (STATE, ARCHITECTURE, SKILLS_PROTOCOL, SKILL_LOGS)
.github/workflows/        deploy-pages.yml, rust-ci.yml
```

## Laws (short form — full text in RULES.md)
1. Update `.agent/STATE.md` and `PROGRESS.md` and push before ending **every** session.
2. Never commit secrets. PATs are used via `Authorization` headers / `GIT_ASKPASS` only, never stored in remotes or files.
3. No fake claims: if a thing is a stub, STATE.md must say `STUB`. Rust crates were not compiled in Session 1 (no toolchain in the sandbox) — first job of Session 2 is `cargo check --workspace`.
4. UI work must follow the four archetypes (A–D) in `.agent/SKILLS_PROTOCOL.md`. No generic "AI slop" gradients, no default Tailwind palettes.
5. Hot paths (token streaming, download, ASR) are Rust; the WebView only renders.
