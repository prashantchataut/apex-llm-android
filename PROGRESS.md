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
