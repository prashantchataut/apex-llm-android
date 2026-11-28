# Setup that needs the owner (GitHub sign-in and the managed Apex API)

Two features are **blocked until you do the steps below**. Nothing here can be done from source code, and no secret ever
goes into the repository, the site or the APK.

## 0. Do this first: revoke exposed tokens
Any GitHub personal access token that was ever pasted into chat or bundled in an earlier build must be treated as leaked.
Revoke it at https://github.com/settings/tokens (and any other copies). Removing a token from the latest code does not
invalidate copies made earlier. Git history and old releases were not rewritten.
Also change the admin passphrase and Apex API keys that were published in earlier docs (`apex-admin-2025`, `APEX-PRO-2025`):
the new server has no default passphrase and the old static vault is gone.

## 1. GitHub sign-in (each user authorizes their own account)
1. github.com > Settings > Developer settings > **OAuth Apps** > New OAuth App (a GitHub App also works; tick device flow).
   Homepage: the site URL. Callback URL: any placeholder (device flow does not use it).
2. Tick **Enable Device Flow**. Do **not** generate or store a client secret: the app never uses one.
3. Put the public **Client ID** into `web-showcase/public/config/github-oauth.json` (`clientId`) and rebuild, or set the
   build variable `NEXT_PUBLIC_GITHUB_CLIENT_ID`.
4. Android works as-is (the Rust core relays the two device-flow calls). For the web build, deploy a stateless relay that
   forwards only `POST /device_code` and `POST /access_token` to github.com and set its URL as `relay`.
Until the Client ID exists the app shows "GitHub sign-in is not switched on in this build yet". That is the correct state.
First authorization always needs the user to approve on github.com; there is no one-tap sign-in.

## 2. Managed Apex API + admin (server/apex-api)
GitHub Pages is static; it cannot verify a passphrase or revoke a key. The server in `server/apex-api` does both.
1. Pick any Node 20+ host (Fly.io, Render, Railway, a VPS; `server/apex-api/Dockerfile` is provided) with a persistent volume.
2. Create the passphrase hash locally: `APEX_ADMIN_PASSPHRASE='a long passphrase' node server/apex-api/hash-passphrase.mjs`
3. Set environment variables on the host:
   - `ADMIN_PASSPHRASE_HASH` = the printed value (never the passphrase)
   - `DATA_KEY` = 32+ random characters (encrypts stored keys and provider credentials)
   - `ALLOWED_ORIGINS` = `https://prashantchataut.github.io` (the origin of the admin page)
   - `DATA_DIR` = the persistent volume path
4. Put the server's public URL in `web-showcase/public/config/backend.json` (`url`) and redeploy the site.
5. Open `/admin/`, sign in with the passphrase, add a provider (HTTPS only), add models, test them, enable the ones you want,
   create keys. **Passphrase reset** = repeat steps 2-3 with a new passphrase and restart the server.

## Honest limits
* Clients installed before this change that call public third-party endpoints directly cannot be controlled by any server or
  static-file edit. Only requests through the managed server are revocable.
* The `mesh` models (public, no-key endpoints reached straight from the device) are outside managed control by design.
