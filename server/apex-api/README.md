# apex-api

Zero-dependency Node server: passphrase-only admin, Apex API key CRUD/rotation/revocation, per-request key checks, provider and
model admin with real health tests, SSRF-guarded upstream calls. Setup: `docs/SETUP-GITHUB-AND-ADMIN.md`.

    node --test server/apex-api/test/        # 11 tests, run against a local mock upstream

Endpoints: `GET /v1/models`, `POST /v1/chat/completions` (Bearer Apex key, checked on every call), `POST /admin/login`
(passphrase), `/admin/*` (Bearer session, Origin allow-list). `ALLOW_PRIVATE_UPSTREAMS=1` exists for tests only.
