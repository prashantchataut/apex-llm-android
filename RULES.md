# RULES.md — Apex development & design rules

## Process
1. Start of session: read `.agent/STATE.md`, `PROGRESS.md`, `ARCHITECTURE.md`, this file. Summarize state, list planned tasks.
2. End of session: update `.agent/STATE.md` + `PROGRESS.md`, commit (conventional commits), push.
3. Skills (`.agent/SKILLS_PROTOCOL.md`) are mandatory for matching work: UI → design-taste-frontend + hallmark-ui + open-design-skill; analysis → rea-reverse-engineering; Rust → native-rust-systems. Log in `.agent/SKILL_LOGS.md`.
4. Be honest: mark stubs as `STUB`, unverified claims as `UNVERIFIED`. Never say something compiled/ran if it didn't.
5. Secrets: never in git, never in remotes (`https://x:TOKEN@…`). Use `GIT_ASKPASS`/headers. Tell the user to revoke any token pasted into chat.

## Rust
- `edition = "2021"`, `#![forbid(unsafe_code)]` except isolated FFI modules.
- Every engine/IO boundary is a trait so desktop CI runs without Android.
- `thiserror` for library errors, `anyhow` only in binaries/app glue. No `unwrap()` outside tests.
- `cargo fmt`, `cargo clippy -- -D warnings`, `cargo test --workspace` must pass in CI.
- Streaming APIs yield `GenerationEvent` (Token / ThinkStart / ThinkEnd / Done); never buffer a whole completion.
- Public wire formats (Ollama/OpenAI) have golden-JSON tests.

## Frontend
- TypeScript strict. No `any`. Functional components, no global state libs unless justified.
- Animate only `transform`/`opacity`. Springs for physical motion. Honor `prefers-reduced-motion`.
- Reserve space for async content (KaTeX, timers use `tabular-nums`) → zero layout shift.
- Tokens come from `packages/design-system/tokens.css`. No ad-hoc hexes in components.
- Touch targets ≥ 44 px. Contrast of body text ≥ 4.5:1 (ghost 35% type is **display-only**, never body).
- Use `next/link` (basePath-safe), never raw `<a href="/…">` for internal routes.

## Design mandates
- Never ship generic gradients, stock-purple-on-white, or default component-library looks.
- Every screen: one signature hallmark component + one micro-interaction per control.
- Glass = `blur(28px) saturate(180%)`, `rgba(255,255,255,.18)`, 1.5px refractive border, noise overlay.
