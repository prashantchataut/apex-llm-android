# Apex: an on-device AI runner for Android

Apex runs GGUF language models on your phone. A Rust core (llama.cpp via the inference crate) does the work, a Tauri v2 shell
hosts the interface, and nothing leaves the device unless you choose a cloud model. This README describes what the code does
today; items that are blocked or unfinished are listed under Status.

- Live site: https://prashantchataut.github.io/apex-llm-android/
- Latest published APK (arm64-v8a): https://github.com/prashantchataut/apex-llm-android/releases/tag/v1.4.1
  (a newer build from this branch exists only as a CI artifact; see Status)

## Privacy
- Local models: prompts and replies stay on the device.
- Cloud models are opt-in. Local-Only mode keeps everything on device.
- GitHub: every user signs in with their own account (OAuth device flow). Identity is requested by default; private
  repositories and Gist creation are separate, unticked-by-default permissions. The token is stored in the Android Keystore
  (app) or the tab's session storage (web) and removed on Disconnect. No shared or owner account exists anywhere.
- The site, the APK and this repository contain no personal access token and no client secret.

## Local-model harness
Settings > Local models. Off by default: your message goes straight to the on-device model. On: also runs the skills you
enabled, allows up to 2 permission-gated tool steps per reply and extracts memories in the background (more work, more latency).

## Managed Apex API (optional cloud tier)
Keys are checked by a server on every request, so a rotated or revoked key stops working immediately on every device. The server
lives in `server/apex-api` (passphrase-only admin, rate limiting, short-lived sessions, SSRF-guarded provider endpoints, model
health tests). It needs to be hosted by the owner: see [docs/SETUP-GITHUB-AND-ADMIN.md](docs/SETUP-GITHUB-AND-ADMIN.md).

## Repository
| Path | What |
|---|---|
| `crates/` | Rust crates: hardware profile, Hugging Face hub + downloads, inference, voice, local API server, integrations |
| `app-ui/src-tauri` | Tauri v2 Android shell, Kotlin bridges (insets, haptics, updater, Keystore SecureStore) |
| `web-showcase` | Next.js static export: landing page, the app (`/app`) and the admin panel (`/admin`) |
| `server/apex-api` | Managed Apex API and admin backend (Node, zero dependencies, tested) |
| `.agent/` | State notes for stateless AI sessions |

## Develop
```bash
cd web-showcase && npm ci && npm run dev      # http://localhost:3000/app
node --test server/apex-api/test/             # backend tests
node scripts/scan-emoji.mjs                   # user-facing text must contain no emoji
cargo test --workspace
```

## Status
See [.agent/STATE.md](.agent/STATE.md) for the honest, current list of what is verified, blocked and not done.
