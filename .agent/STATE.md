# STATE — last updated: Session 18 (branch feat/v140-local-runner-studio)

## [SESSION 18 — WHAT ACTUALLY HAPPENED]
- **Audit first, not a redo.** Session 17 had already shipped the brief (v1.4.0 release, live Pages, PR #13 body). Verified: 28/28 local-model download URLs HEAD 200 on Hugging Face; all requested families present; downloader tolerates missing Content-Length; `REQUEST_INSTALL_PACKAGES` + `FileProvider` + `ApexUpdater.kt` present; release APK assets were rebuilt by CI after the session-17 commit; live `/`, `/admin/`, `404.html`, `version.json`, `config/apex-vault.json` all 200.
- **Fixed**: (1) real emoji left in Rust (`scoring.rs` badge labels, a crab literal in a tokenizer test -> `\u{1F980}` escape); Installed rustfmt via rustup: `cargo fmt --all` fixed the long-red Rust CI fmt gate (4 hunks in download.rs, 1 from my own edit); `cargo test -p cortex-hf-hub -p cortex-inference` = 22 passed. Clippy/full-workspace not run here. (2) User-visible "keyless" strings (picker group label, provider names/notes, admin form) reworded. (3) Landing page still said "Intelligence that lives on your phone" / "25+ cloud models": rebranded to On-Device Local AI Runner / Private Pocket Intelligence Studio, metadata too, added PDF + LaTeX line. (4) `docs/release-notes/v1.4.0.md` rewritten with true numbers (55 gateways, 471 imported, 159 verified at import); v1.2.0 notes de-"keyless"ed. (5) Old PR bodies / release notes that mentioned keyless providers were rewritten on GitHub.
- **QA**: Playwright 412x915@2x against the production build: onboarding, landing, passphrase-only admin gate, unlock with `apex-admin-2025`, catalog explorer (412 models / 55 providers, tabs All/Working/Enabled/Failed). Screens 14-15 added to `docs/qa/v140-local-runner-studio/`. Chromium needed system libs that were unpacked from .debs into /tmp (no root).
- **DELIBERATELY NOT DONE (again, same reasons)**: (1) PAT inside the vault / app: `public/config/apex-vault.json` is world-readable and `apex-admin-2025` is a published passphrase, so a sealed `repo`+`workflow` token would be offline-brute-forceable. /admin asks only for the passphrase at login; the repo token is pasted once per device and sealed locally. (2) `versionCode 14`: Tauri derives 1004000 from 1.4.0; 14 would be a downgrade vs an installed 1002000 and Android would reject the update. (3) "600+": honest count is 471 imported (412 listed after de-duplication), nothing padded.
- **Security**: the PAT was pasted in chat again. It was used for git/API only, never written to the repo or `.git/config` (HTTP extraheader per command). **Revoke it.** The reference repo `NikitHamal/zeusdesigns` hard-codes third-party keys: they were not copied; tell the owner to rotate them.
- **Skills**: design-taste-frontend / hallmark-ui / open-design-skill / rea / native-rust-systems are not loadable tools here; applied manually from RULES.md + SKILLS_PROTOCOL.md (see SKILL_LOGS.md).

# STATE — last updated: Session 17 (branch feat/v140-local-runner-studio)

## [SESSION 17 — WHAT ACTUALLY HAPPENED]
- **PR #13 was already merged** (and #14 after it). Branch `feat/v140-local-runner-studio` was cut from `main`; no new PR was opened.
- **Catalog import** (`web-showcase/scripts/import-zeus-catalog.mjs`, output `src/data/zeus-catalog.json`): read-only checkout of `NikitHamal/zeusdesigns`, resolved every (provider, model) to its gateway, added live `/models` discovery, probed each with a real completion. Result: 55 gateways, 471 models, 159 verified (143 browser-callable). Paid routes (Kilo non-free, BlockRun non-free) were NOT imported. 39 models from 6 providers that need a key were skipped. **The reference repo hard-codes real third-party API keys (agnescloud, volcark, zhipudirect, longcat); none were copied. Tell the repo owner to rotate them.** The "600+" target was not reached honestly: 471 imported + the built-in live lists; nothing was padded.
- Imported models are OFF by default unless verified AND browser-callable (CORS); the owner can force one on (`enabledModels`). Failover adds the six fastest verified imported gateways.
- **/admin**: passphrase-only gate (one field). The repository token is NOT in the vault or repo: pasted once per device, sealed under the passphrase in localStorage, then publish is one click. Catalog explorer: search, All/Working/Enabled/Failed tabs, inline rename + category, per-model Test Live, batch verify, "turn off offline". `mesh.json` gained `enabledModels` and `categories`.
- **Vault regenerated**: the old vault's passphrase and key were never recorded, neither `apex-admin-2025` nor `APEX-PRO-2025` opened it. New vault: passphrase `apex-admin-2025`, key `APEX-PRO-2025`, catalog = Pollinations text + four image engines. The old `sk-apex-...4Rtm` key no longer works. The passphrase is public (it is in the brief): it protects the key list only, never repo write access.
- **DELIBERATELY NOT DONE**: (1) PAT inside the vault / embedded in the app: the vault is public, so a passphrase-sealed token is an offline-brute-forceable `repo`+`workflow` token. "Connect @prashantchataut" instead reads public repos with no token. (2) `versionCode 14`: Tauri derives 1004000 from 1.4.0; 14 would be a downgrade. (3) A `gh-pages` branch is not what Pages serves (build_type=workflow from main), see the deploy notes in the PR.
- Image Studio: `flux-anime` / `flux-3d` do not exist upstream (HTTP 402). Anime and 3D are `flux` + a style suffix; chain flux -> turbo -> sana.
- Emoji: the real ones (two lightning bolts, a lock) are SVG now; typographic arrows were replaced with ASCII.
- UI: obsidian #09090B, border-beam cards (opt-in `data-beam`), `.calm-seg` pills. Android top inset was already 40px + 10px.
- QA: Playwright at 412x915@2x, screenshots in `docs/qa/v140-local-runner-studio/`. The chat reply and the generated image in those shots are stubbed responses (to show the LaTeX renderer and gallery deterministically); admin Test Live hit real endpoints. Kotlin updater still unverified on a device. Security: a PAT was pasted in chat again, revoke it.

# STATE — last updated: Session 16 (branch feat/session-16-release-v140-and-live-site-sync)

## [SESSION 16 — WHAT ACTUALLY HAPPENED]
- **Audit of PR #13 (merged)**: the repo is Tauri v2, not Capacitor, so `ApexUpdaterPlugin.java` / `registerPlugin()` do not exist; the Kotlin `ApexUpdater.kt` bridge is the equivalent. `grep -ri "coding agent"` over src/, public/, web-showcase/, index.html: zero matches (the only hit was this file's own log text, reworded). `window.open` remains only in `github-auth.ts` (OAuth device-flow page) and `images.ts` (open image); neither is on the updater path. Updater verified in a browser against a throttled local APK server: `Downloading v1.5.0... 44% • 14.5 MB / 33.0 MB • 3.4 MB/s`, zero new windows. Native Kotlin path still UNVERIFIED on a device.
- **Why the live site said 1.3.0**: Pages is `build_type: workflow` and deploys `web-showcase/out` from `main` via `deploy-pages.yml` (not gh-pages). It WAS deploying; `version.json` simply still said 1.3.0, and **no v1.3.0 release was ever published** (latest release was v1.2.0). A `gh-pages` branch push would do nothing with this Pages config, so it was not created.
- **versionCode**: the brief asked for `14`. Tauri derives it from the version (1.4.0 -> 1004000). Setting 14 would be a downgrade vs the installed 1002000 and Android would refuse the update, so it was NOT set.
- **/admin**: per-model enable/disable, inline rename, per-model Ping, "Test all models live" (real completions; one worker per provider; 429 shown amber RATE-LIMITED, not FAILED). `mesh.json` gained `disabledModels` + `renames`. These now also apply to the bundled verified registry (picker rows, Apex Auto router, failover chain) via `ensureMeshConfig()`; before this session the picker list ignored mesh.json entirely. Verified in Playwright with a QA-only fixture vault and a mocked GitHub contents API.
- **PDF reader**: pdf.js 4 legacy build, worker vendored to `public/vendor/pdfjs`. Pages, zoom, jump, search, Summarize, Ask AI -> chat. KaTeX was already bundled; added "Copy LaTeX" on block math, fixed invisible bold + button colours. Settings: preset chips for the system instructions (textarea and prepending already existed).
- **Live keyless check (real POSTs)**: still 14 of 39 pass. GPT-4.1, Claude, Gemini 2.5, DeepSeek R1/V3 on LLM7 -> 400/401 without a key. Nothing was invented to reach "20+".
- **DELIBERATELY NOT DONE**: (1) **PAT inside apex-vault.json + passphrase-only /admin.** The vault is public; `apex-admin-2025` is a known, low-entropy passphrase; the PAT has `repo` + `workflow` + `write:packages`. Encrypting it would let anyone brute-force it offline and gain write access to every repo. RULES.md rule 5 forbids it. /admin keeps two factors (owner token + passphrase). (2) Image Studio redesign (the image API lists one model), 1-tap GitHub Connect with an embedded token, "Claude/Gemini/GPT-4.1" keyless models, SmolLM/Phi-4-mini/Llama-3.2 additions beyond S15 list. (3) Per-provider `gh-pages` deploy.
- **Security**: a GitHub PAT was pasted in chat again (full `repo`/`workflow` scope). It was used only for clone/push/release and is not stored in the repo (git auth via a global extraheader in the sandbox). **Revoke it.**

# STATE — last updated: Session 15 (branch feat/session-15-native-updater-admin-studio-pdf-latex)

## [SESSION 15 — WHAT ACTUALLY HAPPENED]
- **PR #12 was already merged** into `main` (d668b33). Nothing to merge.
- **The repo is Tauri v2, not Capacitor.** The brief's `ApexUpdaterPlugin.java` + `registerPlugin()` do not exist here. The equivalent is a Kotlin WebView bridge, same as `ApexBars` / `ApexHaptics`.
- **Updater bug root cause**: `MainActivity.Opener.url()` (`window.ApexOpen`) fired `ACTION_VIEW` on the GitHub release URL, i.e. it opened Chrome. **Fixed**: new `ApexUpdater.kt` (`window.ApexUpdater`: `start/cancel/install/status/canInstall/openInstallSettings`). It streams the APK with `HttpURLConnection` (redirects followed natively), writes `Download/Apex-LLM-update.apk` (via `.part`, ZIP-magic check), emits `apex-update` events every 100 ms (`status, percent, downloadedMB, totalMB, speedKBps`) and opens the system installer through `FileProvider` (`<applicationId>.fileprovider`). Manifest has `REQUEST_INSTALL_PACKAGES`; `file_paths.xml` has `external-files-path Download/` + `cache-path`. Web: `downloadApk()` no longer opens any URL; the browser path streams with fetch + ReadableStream and saves a blob. `UpdateUI.tsx` shows `Downloading v1.4.0... 68% • 22.4 MB / 33.1 MB • 4.2 MB/s`, a Cancel button and an install-permission button. The "Release notes" external link was removed from the modal.
- **NOT compiled or run**: no Java / Kotlin / Android SDK / cargo in the sandbox. The Kotlin file is unverified until CI builds the APK. The progress UI was typechecked and built, but not run on a device.
- **Onboarding**: hero now reads ON-DEVICE LOCAL AI RUNNER / "Run Open-Weight AI Directly on Your Phone." with three capability cards (inline SVG, no emoji). A repo-wide search found no "coding-assistant phrasing" string before or after.
- **Local model hub**: added SmolLM2 360M, LFM2 350M / 1.2B, Qwen3 0.6B / 1.7B / 4B, Gemma 3 4B, Dolphin 3.0 3B. Repo, file name and byte size were read from the Hugging Face tree API. Qwen3 0.6B / 1.7B only publish Q8_0 officially. Layer / KV-head numbers are from model cards.
- **Deliberately NOT done**:
  - **PAT inside `apex-vault.json`.** The brief's default passphrase `apex-admin-2025` is public (it is in the brief), so PBKDF2 + AES-GCM would only be a speed bump on a PAT sitting in a public repo. Treat that as publishing the token. Safer path for "Connect GitHub": register a GitHub OAuth App with Device Flow and set the Client ID in `public/config/github-oauth.json` (already supported), or paste a fine-grained PAT once and keep it in Android Keystore.
  - **Image Studio redesign**: `https://image.pollinations.ai/models` currently returns only `["sana"]`; the Flux / SDXL list in the brief cannot be verified.
  - **/admin keyless toggles + live ping, discover-keyless-models.mjs, pdfjs viewer, KaTeX, slash commands, export, Playwright QA screenshots, v1.4.0 build/sign/release, version bump.** Not started (scope). `public/version.json` stays 1.3.0 so installed apps are never offered an APK that does not exist.
- **Security**: a GitHub PAT was pasted in chat again. It was used only to push this branch / open the PR and is stored nowhere in the repo. **Revoke it and issue a new one.**

# STATE — last updated: Session 14 (branch feat/session-14-download-fix-auto-router-oauth-v130)

## [SESSION 14 — WHAT ACTUALLY HAPPENED]
- **Download bug root cause (not what the brief guessed)**: `crates/cortex-hf-hub/src/download.rs::content_length()` used `reqwest::Response::content_length()` on a **HEAD** response. That is the *body-size hint*, which is always 0 for HEAD, then `.filter(|l| *l > 0)` turned it into `HubError::NoLength` ("server did not report a content length") for EVERY file. Fix: read the real `Content-Length` / `X-Linked-Size` headers, else `Range: bytes=0-0` + `Content-Range`, else HF `?blobs=true`, else the catalog size hint, else stream with unknown length (indeterminate bar). `HubError::NoLength` is deleted. Web side: `resolveTotal()` in `downloader.ts` (also fixed an operator-precedence bug: `have + CL ?? 0 || expected`) and a catalog estimate can no longer fail a clean end-of-stream.
- **Rust is NOT compiled here** (no cargo in the sandbox). `rust-ci` / the APK workflow are the first compile. Unit tests added for `parse_content_range_total` and `split_hf_resolve_url`.
- **Live keyless verification** (`scripts/verify-keyless-models.mjs`, output `web-showcase/src/data/verified-models.json`): real "Reply with OK" POST to every candidate; kept only HTTP 200 + text in <4 s. **14 of 39 passed.** Gemini (`gemini-4-argon`, `gemini-3.x`, `gemini*`), Claude, GPT-6, Grok, DeepSeek-v4 pro/uncensored etc. on LLM7 are **401 without a key**; Airforce free tier is 401/429; Pollinations anonymous is one model (`openai-fast`) at 1 reply / 45 s / IP. So **no keyless Gemini/Argon and no keyless uncensored model exists to ship** and none is claimed.
- **Apex Auto** (`lib/router.ts`): deterministic regex router, no network, measured with `performance.now()` (0.1-0.5 ms in QA). Offline / Local-Only → mounted on-device model first. Targets come from the verified registry only. `apexChat` now works keylessly for `mesh:*` models, first-token timeout 12 s → **3.5 s**, and the verified chain is appended as last-resort backups.
- **Conversation**: 4 style cards deleted (`cartridges.ts` is one default + Modelfile settings: custom instructions, temperature, context). Sliding-window history trimming (`lib/context.ts`) in `useChat.generate`. AI chat titles after the first exchange (`lib/titles.ts`). Local-Only toggle in Settings.
- **Memory**: `distillMemory()` asks a fast verified model for strict JSON, maps whatever categories it invents onto Identity / Tech Stack / Projects / Preferences / Tone, stores keywords, retrieves by overlap. Falls back to on-device rules. **In QA every free tier returned 429/503 to the sandbox IP, so the shipped screenshot shows the rules path ("AI offline")**; the prompt itself was verified live against `codestral-latest` earlier (valid JSON array).
- **GitHub login**: OAuth **Device Flow** (`lib/github-auth.ts`, `GithubConnect.tsx`) with a fixed-URL Rust relay `github_oauth` (github.com sends no CORS). It needs a registered OAuth App with Device Flow enabled: **put its public Client ID in `web-showcase/public/config/github-oauth.json`**. Until then the button shows a setup notice. Raw token entry is collapsed under "Advanced". The flow was NOT run against github.com (no Client ID exists); only the UI/states were tested.
- **Onboarding screen 1**: `OnboardingHero.tsx` (isometric prism + live routing card that runs the real router).
- **Not done / not possible here**: APK build + signing + `gh release` (no Java/Android SDK/NDK; CI builds on push), merge to `main`, live-site check, beautifului.dev not consulted, the named skills (`rea`, `hallmark-ui`, ...) are not loadable tools in this environment.
- **v1.3.0 release order**: `public/version.json` already says 1.3.0. Merge only when the `v1.3.0` tag/release exists, otherwise installed apps will be offered a missing APK.
- **Security**: a GitHub PAT was pasted in chat again. It was used only for clone/push/PR and is not stored anywhere in the repo. Revoke it.

# STATE — last updated: Session 13 (branch feat/session-13-android15-fix-keyless-mesh-v120)

## [SESSION 13 — WHAT ACTUALLY HAPPENED]
- **Install bug**: the v1.1.0 APK is structurally valid (v2-signed, aligned, arm64). Real deviations found: 4 KB ELF alignment, `targetSdk 37`, throw-away signing key. The exact on-device message could not be reproduced here. Fixes: `compileSdk 36 (tauri-android requires >=36; compile-time only) / targetSdk 34 / minSdk 26`, `abiFilters arm64-v8a`, `useLegacyPackaging`, `-z max-page-size=16384` via `cargo:rustc-link-arg-cdylib` in `build.rs`, NDK r28, unused `FOREGROUND_SERVICE` removed.
- **Pipeline**: unsigned build -> `zipalign -p 4` -> `apksigner` v1+v2+v3 -> `scripts/verify-apk.sh`. Permanent PKCS12 key stored ONLY as repo secrets `APEX_KEYSTORE_B64` / `APEX_KS_PASS` (cert SHA-256 `05:9C:A8:97:...:FA:2F:A7`). If those secrets are deleted, the next key will not update over installed builds. Workflow now runs on every push; release only for `v*` tags / manual `publish`.
- **Mesh**: `web-showcase/src/services/apexCloudMesh.ts`, wired into `lib/apex-cloud.ts` (failover, first-token timeout, 25 s cooldown). `/admin` has a Keyless Provider Mesh panel; owner config in `public/config/mesh.json`.
- **Research reality check** (`.agent/KEYLESS_PROVIDERS_RESEARCH.md`): verified keyless + CORS = OVH (~18 chat), LLM7 (2-3 non-pro), Pollinations (1). "Hydrogen" = `google/gemini-4-hydrogen` on `gen.pollinations.ai`, which returns 401 without a key; the GitHub "Hydrogen" repo is a self-hosted account-pooling proxy. The 50+ figure is reached only by counting the 27 vault models.
- `APEX-PRO-2025` is still NOT pre-configured (its hash has been public since Session 8); set it in `/admin` if you accept it being crackable.


## [SESSION 12 — WHAT ACTUALLY HAPPENED]
- **PR #9 was already merged** into `main` when the session started (merge commit ce63068). Nothing to merge.
- **Zero-secret audit**: `git grep` over every commit for `ghp_` / `github_pat_` / `gho_` and a tree scan: no token anywhere. After the build, `out/` was scanned for PAT-shaped strings, the master key, the admin passphrase and provider URLs: none. The `/admin` PAT lives in React state only (`type=password`, `autocomplete=off`), is wiped on `pagehide` AND `beforeunload`, idle 15 min and tab-hidden 5 min; localStorage holds only the brute-force back-off counter. Playwright asserts the PAT is absent from localStorage / sessionStorage / URL and from every commit body. The Zero-Trust badge is shown on the gate and inside the console.
- **Vault schema 3 (dual envelope)**. Per key: `keyHash = SHA-256(salt+key)`, Envelope A `encryptedCatalogEnvelope = AES-256-GCM(catalog filtered by allowedModels)` under PBKDF2(key), Envelope B `adminEncryptedKeyString = AES-256-GCM({key, allowed})` under PBKDF2(admin passphrase). `adminEnvelope` (whole catalog) is unchanged. PBKDF2 is now 200 000 iterations. The public file still contains no readable key.
- **Any key string**: the `sk-apex-` prefix is no longer required (min 8 chars). A strength meter warns about guessable keys but never blocks (`APEX-PRO-2025` or `PRASHANT-VIP-999` are accepted).
- **/admin key cards**: Reveal/Mask, Copy, inline Edit (key string, label, expiry, allowed model groups) with "Save & Publish to Live App", Rotate Random, Revoke / Activate (revoke blanks Envelope A but keeps Envelope B so the key can be re-activated), Delete, New key (custom or generated), Change Admin Passphrase (re-seals `adminEnvelope` and every Envelope B, commits). Commit messages carry only label + masked suffix, never the key.
- **Single source of truth**: no hardcoded fallback key in any `.ts/.tsx` (verified by grep); old key stops working the moment the commit lands, the new one works immediately (Playwright proves both through the app).
- **Physical routes**: Next's `trailingSlash` export already emitted `out/admin/index.html` and `out/app/index.html`; `scripts/postbuild.mjs` now copies the home document there if one is ever missing and FAILS the build if either is absent. The repo is Next.js, not Vite, so this lives in `postbuild.mjs`. `404.html` stays a SPA-redirect page (keeps the route) instead of a copy of index.html.
- **Bug found by QA and fixed**: a revealed 48-char key stretched the grid track and pushed the card off-screen on 390px phones (`grid-cols-[minmax(0,1fr)]` + wrapping key text).
- **Version 1.1.0** everywhere (`version.ts`, `tauri.conf.json`, workflow default + notes, `public/version.json`).

## Honest gaps / decisions
- **The old master key and admin passphrase could not be recovered** (only their hashes/ciphertext were ever committed), so the vault was regenerated: new strong master key + new admin passphrase (delivered in chat, not stored in the repo). Every previously issued key and the old passphrase stopped working. The 27-model catalog could not be decrypted either; it was **rebuilt by hand** from the Session 11 QA screenshots (16 names read from images, 11 reconstructed in the same groups). Upstream routing is unchanged (Pollinations anonymous tier).
- **`APEX-PRO-2025` is NOT pre-configured.** Its hash and plaintext have been public since Session 8 (STATE.md), so shipping it would leave the vault open to anyone. The primary key is a random `sk-apex-` key; editing it to `APEX-PRO-2025` or anything else takes one inline edit (the UI will flag it as Weak).
- Weak custom keys are crackable offline from the public vault file; the same goes for a weak admin passphrase.
- QA ran against a **mocked GitHub API** (`/user`, contents GET/PUT, raw vault) so QA never wrote to `main`; the real commit path is the same code but was not exercised against GitHub in QA. Updater QA mocked the remote `version.json` to advertise v1.1.1 (running build is 1.1.0).
- APK is signed with a per-run throwaway key (unchanged): uninstall v1.0.0 before installing v1.1.0. Kotlin/Tauri compile only happens in CI; not device-tested.
- The GitHub PAT pasted into chat should be revoked/rotated after this session.

# STATE — last updated: end of Session 11 (branch feat/session-11-apex-api-security-updater-v100, PR #9)

## [SESSION 11 — WHAT ACTUALLY HAPPENED]
- **PR #8 (Session 10, v0.9.0) audited and merged** into `main` via the REST API (no `gh` CLI here). Leftovers found: STATE/PROGRESS had no Session 10 entry; three documented STUBs remain (native download pause/cancel, Android SpeechRecognizer, native APK installer). The APK installer stub is now closed by `ApexOpen.url()` (Kotlin bridge that hands the APK URL to the system downloader/Package Installer). v0.9.0 was never released: newest release was v0.7.0.
- **Apex API vault (zero plaintext).** `public/config/keyless-registry.json` deleted. `public/config/apex-vault.json` holds only `salt`, per-key `keyHash = SHA-256(salt+key)`, per-key `encryptedCatalogEnvelope` (AES-256-GCM, key = PBKDF2-SHA256(key, salt, 100 000)) and an `adminEnvelope` (same catalog under the admin passphrase so the owner can mint keys). The catalog (27 models + provider endpoints) exists only inside envelopes; the JS bundle no longer contains any provider URL or model name (verified in Playwright: bundle + DOM leak scan before unlock = empty). `lib/vault.ts` (WebCrypto), `lib/access.ts` (state, revalidate, kill-switch, offline grace), `lib/apex-cloud.ts` (chat client + live discovery of newly served upstream models).
- **Rebrand**: "Keyless" removed from every user-facing string; tier is "Apex API" / "Apex Cloud Engine"; locked card "Connect Apex API Key — Unlock 25+ Cloud Flagship Models"; image engines are also vault-driven.
- **Hardened /admin**: starts empty. Unlock = GitHub token verified live at api.github.com/user (login must equal `prashantchataut` and have push) + passphrase (verified by successfully decrypting `adminEnvelope`). Exponential back-off persisted in localStorage, token in memory only, 15 min idle / 5 min hidden / pagehide auto-lock, Lock Console button. Keys shown masked only (`sk-apex-••••xxxx`); create/rotate shows the secret once in a modal after the commit succeeded; revoke blanks the envelope.
- **Auto-updater root causes** (see header of `lib/updater.ts`): `/releases/latest` ignores pre-releases; one unauthenticated API call hits 60/h per shared IP; fragile version compare; app was 0.9.0 while newest release was v0.7.0; result only surfaced in Settings. Fix: checks `version.json` (raw GitHub + site copy, cache-busted) AND `releases?per_page=5` with `no-store`, highest wins, numeric `compareSemver` stripping `v` + pre-release suffix; top pill banner, pulsing badges (header menu + drawer), release modal with progress and "Download Latest APK anyway (Reinstall)"; re-checks on startup, drawer open and Settings open; Settings has Check for Updates + Simulate Update Banner.
- Version 1.0.0 (version.ts, tauri.conf.json, workflow default, `public/version.json`). Landing page updated; `404.html` generated by postbuild.

## Verified (Playwright, production static export, `docs/qa-session-11/`, 390x844@2x and 1440x900@2x)
- Update banner + modal (remote version.json was route-intercepted to advertise v1.0.1 — the real remote equals the running version until a newer release exists).
- Locked state hides everything; wrong key rejected; valid key decrypts 27 models; admin gate shows nothing; wrong passphrase gives generic error + back-off; admin console shows masked keys only; one-time secret modal.
- Admin <-> GitHub: `/user` verification was real; the vault GET and the commit PUT were MOCKED in QA (so QA did not write to `main`).

## Honest gaps
- **The 25 named flagship models are not actually served keylessly.** Pollinations' anonymous tier currently serves exactly ONE text model (GPT-OSS 20B) and ONE image model (Sana), with a 1 reply / 45 s limit. The catalog carries all requested names; models not served upstream route to the always-on model and the picker says so ("Routes to … right now"; the message footer names who really answered). Live discovery adds new upstream models automatically.
- NEB (nikithamal/NEB) was only READ. Its "keyless" providers are reverse-engineered web-frontend scrapers behind its own backend proxies, and its Gemini 4 Argon etc. are key-required official-API catalog rows. Nothing from it was wired in, and nothing there was changed.
- The gate is app-level: after a legitimate unlock the endpoint is visible in that user's network traffic; a modified client could bypass it. Admin passphrase strength matters (public envelope, 100k PBKDF2): use the long generated one.
- APK signing: CI generates a fresh throwaway key per run, so v1.0.0 cannot install over earlier APKs (uninstall first) and the next release has the same problem until a persistent keystore secret exists.
- Kotlin (`Opener`) compiled only by CI; not device-tested. Old `keyless-registry.json` and the old default key hash remain in git history; APKs <= v0.9.0 keep their bundled copy.
- Rotate the GitHub PAT that was pasted in chat.

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

## Session 19 (v1.5.0)
- zeusdesigns (read-only clone): 1 branch, 1 commit, 59 providers / 338 declared models. Embedded third-party API keys (zhipu, longcat, agnes, volc, aihorde, clinebot: 24 models) are still NOT copied. No `claude-opus-4` exists there; its Opus is `claude-opus-5-5` on Anthropic-format relays. Those relays (dherain24-claude-proxy, calkotter-free-claude-code) list 600+ and 108 routes, incl. `claude-opus-4-20250514`, `claude-3-opus-20240229`, `claude-sonnet-4-20250514`; they are relay aliases, the real backend model is not verifiable.
- Importer now includes Anthropic-format relays (`format: "anthropic"`) and probes frontier names first: 1,198 models / 65 gateways / 234 verified at import time.
- `src/data/frontier.ts` maps the requested flagship names to live routes; missing ones show as no route.
- versionCode: NOT set to 16. Tauri derives 1005000 from 1.5.0; 16 would be a downgrade and Android would reject the update.
- Native updater is Kotlin (`ApexUpdater.kt`, `MainActivity.kt`), not Java; REQUEST_INSTALL_PACKAGES and FileProvider are in the manifest. Not exercised on a device.
- APK is built, aligned, signed (v1+v2+v3) and published by `.github/workflows/android-apk.yml` on the `v1.5.0` tag; the sandbox has no Android SDK / JDK.
