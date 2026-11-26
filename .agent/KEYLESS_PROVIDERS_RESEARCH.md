# Keyless provider research — Session 13

Every row below was tested live with `curl` on 2026-11-26 from a cloud sandbox: model list, then a real
`POST /chat/completions` with **no API key** (or a placeholder bearer where the provider requires the header to exist), plus the
`access-control-allow-origin` response header because the app runs in a browser / Android WebView (CORS decides whether a
provider can be called from the app at all).

## Verdict table

| Provider | Endpoint | Keyless chat? | CORS | Models usable without a key | In the mesh? |
|---|---|---|---|---|---|
| **OVHcloud AI Endpoints** (anonymous tier) | `https://oai.endpoints.kepler.ai.cloud.ovh.net/v1` | ✅ HTTP 200 (gpt-oss-120b, Llama-3.3-70B, Qwen3.5-9B, DeepSeek-V4.1-Flash, Mistral-Small-3.2, gemma-4-26b-a4b all answered) | ✅ `*` | ~18 chat models of 33 listed (rest are TTS / STT / embeddings / SDXL, filtered out) | ✅ priority 1 |
| **LLM7.io** | `https://api.llm7.io/v1` | ✅ for `tier: turbo/free` only (`codestral-latest` ✅, `gpt-oss:20b` ✅ but 1 req/s limit) | ✅ `*` | **2–3 of 86** listed. 63 chat models are `tier: pro` and a model with no tier (`XiaomiMiMo/MiMo-V2.6-Pro`) returned 401 `invalid_api_key` | ✅ priority 2, tier-filtered |
| **Pollinations (legacy)** | `https://text.pollinations.ai/openai` | ✅ `openai-fast` (gpt-oss-20b, reasoning) | ✅ `*` | **1** text model (`/models` returns only `openai-fast`); image list is just `sana` | ✅ priority 3 |
| **Kilo Gateway** | `https://api.kilo.ai/api/gateway` | ✅ `kilo-auto/free`, `nvidia/nemotron-3.5-lightning:free`, `openrouter/free` answered (Bearer `anonymous`) | ❌ no `access-control-allow-origin` | 13 models flagged `isFree` | ⚠️ registered, **skipped in browsers/WebView**; usable from a native/server proxy |
| Pollinations (new gateway) `gen.pollinations.ai` | `https://gen.pollinations.ai/v1` | ❌ 401 "A valid API key is required" | ✅ `*` | 0. Lists **496** models, **including `google/gemini-4-hydrogen`**, `gpt-6.x`, `claude-*`, `kimi-k3.1-pro`… but all need a (free-to-register) key | ❌ not keyless |
| **api.airforce** | `https://api.airforce/v1` | ❌ 401 "Invalid API key"; `mistral-large-4` hit a global 1 req/s limit | – | 775 listed, most `major_outage`; none callable keyless | ❌ |
| **"Hydrogen"** | `kodelyx/free-gemini-api` (GitHub) | n/a — it is a **self-hosted proxy** that pools Google web accounts to expose Gemini 4 "Hydrogen/Neon", not a public endpoint | – | – | ❌ not integrated (no public URL; account-pooling proxies violate Google's terms and break without notice). Add your own instance as a custom provider in `/admin` if you run one |
| **Hugging Face ZeroGPU Spaces** | `https://<owner>-<space>.hf.space/gradio_api` | ⚠️ `black-forest-labs/FLUX.1-schnell` Space: Gradio API reachable (HTTP 200, `/infer`). `Qwen2.5-72B-Instruct` and `DeepSeek-R1-Distill-Qwen-32B` Spaces: **404** (not Gradio-API Spaces any more) | – | image only, anonymous ZeroGPU quota | ❌ Gradio SSE protocol, not OpenAI-compatible; candidate for a later Image Studio backend |
| **zukijourney** | `https://api.zukijourney.com/v1` | ❌ 403 Cloudflare challenge | – | – | ❌ |
| **g4f.dev** | `https://g4f.dev/v1/models` | ❌ 404 | – | – | ❌ (the `gpt4free` library scrapes web chat UIs; nothing stable to call from a phone) |

Other keyless candidates found by search (`freelm`, `llmf`, `FreeLLMAPI`): ChatJimmy, FreeAI, BlockRun, ChatAI — not probed; no
stability guarantees. Most "free LLM API" repos aggregate providers that need a **free key** (Gemini AI Studio, Groq, OpenRouter,
Cloudflare, Cerebras, NVIDIA NIM…). Those are free, not keyless.

## What this means for the "50+ models" target

* **Live keyless, browser-callable, verified**: OVH (~18) + LLM7 (2–3) + Pollinations (1) ≈ **21–22 models**, discovered live from
  each `/models` endpoint (they change daily; the mesh re-syncs on every unlock).
* Plus the vault catalog (27 models, routed through the vault upstream with failover to the mesh) → roughly **48–50 entries** in the
  switcher. The count is real; nothing is padded with models that return 401.
* Image: only `sana` is served anonymously. Requests for `flux`, `flux-pro`, … are silently answered by `sana` (the EXIF of the
  returned image says so), so Flux Pro / Realism / Anime / 3D are **not** genuinely available keyless today.
* Thousands of "free" models exist behind free *keys*. A key-based provider needs a place to keep the key that is not a public Git
  repo (the admin panel refuses keys on purpose); that is a design decision for the owner, not something to hard-code.

## Router behaviour (`web-showcase/src/services/apexCloudMesh.ts` + `lib/apex-cloud.ts`)

1. Plan = requested model on its own upstream → vault always-on model → a stand-in model on every other healthy browser-callable provider.
2. 429 / 5xx / no first token in 12 s / network error ⇒ provider cooled down for 25 s and the next step starts **immediately**
   (no sleep). Only the final step waits and retries a 429.
3. A user abort, or an answer that already streamed a token, is never retried.
4. `/admin` → **Keyless Provider Mesh**: live health (ms, model count), **Sync live models**, add / disable / remove providers.
   Owner config is committed to `web-showcase/public/config/mesh.json` and fetched from raw GitHub on launch (no rebuild).
   A custom endpoint is probed before it can be added and must be `https`, keyless and CORS-enabled.
