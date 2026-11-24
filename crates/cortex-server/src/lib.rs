//! cortex-server — Ollama-for-mobile. Ollama wire format (`/api/*`, NDJSON) and
//! OpenAI wire format (`/v1/*`, SSE) over one [`Backend`].
//!
//! Security model
//! * `/api/*` + `/v1/*`: `Authorization: Bearer sk-apex-…` required unless
//!   `require_key=false` or (loopback && `allow_loopback_keyless`).
//! * `/apex/*` (key management, logs): loopback only **and** must carry the
//!   `x-apex-admin` header (forces a CORS preflight, so web pages can't drive it).
#![forbid(unsafe_code)]

pub mod vault;

use axum::{
    body::Body,
    extract::{ConnectInfo, Path, Request, State},
    http::{header, StatusCode},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::{delete, get, post},
    Extension, Json, Router,
};
use bytes::Bytes;
use futures::{stream, stream::BoxStream, Stream, StreamExt};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    convert::Infallible,
    net::SocketAddr,
    sync::Arc,
    time::{SystemTime, UNIX_EPOCH},
};
use vault::KeyVault;

pub const DEFAULT_PORT: u16 = 11434;
pub const VERSION: &str = "0.1.0-apex";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ModelInfo {
    pub name: String,
    pub size_bytes: u64,
    pub family: String,
    pub parameter_size: String,
    pub quantization: String,
}

/// What the server needs from the inference layer (implemented in the app by
/// `cortex-inference::Engine` running on its own thread).
pub trait Backend: Send + Sync + 'static {
    fn models(&self) -> Vec<ModelInfo>;
    fn running(&self) -> Vec<String>;
    fn chat_stream(&self, model: &str, messages: Vec<ChatMessage>) -> BoxStream<'static, String>;
}

/// Demo backend: echoes the last user message word-by-word.
pub struct EchoBackend;

impl Backend for EchoBackend {
    fn models(&self) -> Vec<ModelInfo> {
        vec![ModelInfo {
            name: "echo:latest".into(),
            size_bytes: 0,
            family: "echo".into(),
            parameter_size: "0B".into(),
            quantization: "none".into(),
        }]
    }
    fn running(&self) -> Vec<String> {
        vec!["echo:latest".into()]
    }
    fn chat_stream(&self, _model: &str, messages: Vec<ChatMessage>) -> BoxStream<'static, String> {
        let last = messages
            .iter()
            .rev()
            .find(|m| m.role == "user")
            .map(|m| m.content.clone())
            .unwrap_or_default();
        let words: Vec<String> = last
            .split_whitespace()
            .enumerate()
            .map(|(i, w)| {
                if i == 0 {
                    w.to_string()
                } else {
                    format!(" {w}")
                }
            })
            .collect();
        stream::iter(words).boxed()
    }
}

#[derive(Debug, Clone)]
pub struct ServerConfig {
    pub require_key: bool,
    pub allow_loopback_keyless: bool,
}

impl Default for ServerConfig {
    fn default() -> Self {
        Self {
            require_key: true,
            allow_loopback_keyless: false,
        }
    }
}

#[derive(Clone)]
pub struct AppState {
    pub backend: Arc<dyn Backend>,
    pub vault: Arc<KeyVault>,
    pub config: Arc<ServerConfig>,
}

impl AppState {
    pub fn new(backend: Arc<dyn Backend>, config: ServerConfig) -> Self {
        Self {
            backend,
            vault: Arc::new(KeyVault::new()),
            config: Arc::new(config),
        }
    }
}

#[derive(Clone)]
pub struct KeyId(pub Option<String>);

// ───────────────────────── helpers ─────────────────────────

fn unix() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// RFC 3339 UTC from unix seconds (no chrono dependency).
pub fn iso(ts: u64) -> String {
    let days = (ts / 86_400) as i64;
    let secs = ts % 86_400;
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    format!(
        "{y:04}-{m:02}-{d:02}T{:02}:{:02}:{:02}Z",
        secs / 3600,
        secs % 3600 / 60,
        secs % 60
    )
}

fn ndjson(v: Value) -> String {
    format!("{v}\n")
}

fn stream_response(
    content_type: &'static str,
    s: impl Stream<Item = String> + Send + 'static,
) -> Response {
    let body = Body::from_stream(s.map(|l| Ok::<_, Infallible>(Bytes::from(l))));
    Response::builder()
        .header(header::CONTENT_TYPE, content_type)
        .header(header::CACHE_CONTROL, "no-cache")
        .body(body)
        .expect("static response parts are valid")
}

fn error(status: StatusCode, msg: &str) -> Response {
    (
        status,
        Json(json!({ "error": { "message": msg, "type": "apex_error" } })),
    )
        .into_response()
}

fn tokens(
    st: &AppState,
    kid: &KeyId,
    model: &str,
    msgs: Vec<ChatMessage>,
) -> BoxStream<'static, String> {
    let prompt_tokens: u64 = msgs
        .iter()
        .map(|m| m.content.split_whitespace().count() as u64)
        .sum();
    if let Some(id) = &kid.0 {
        st.vault.record_usage(id, prompt_tokens, 0);
    }
    let (vault, id) = (st.vault.clone(), kid.0.clone());
    st.backend
        .chat_stream(model, msgs)
        .inspect(move |_| {
            if let Some(id) = &id {
                vault.record_usage(id, 0, 1);
            }
        })
        .boxed()
}

// ───────────────────────── auth ─────────────────────────

async fn auth(State(st): State<AppState>, mut req: Request, next: Next) -> Response {
    let path = req.uri().path().to_string();
    let method = req.method().to_string();
    if matches!(path.as_str(), "/health" | "/api/health" | "/api/version") {
        return next.run(req).await;
    }
    let loopback = req
        .extensions()
        .get::<ConnectInfo<SocketAddr>>()
        .map(|c| c.0.ip().is_loopback())
        .unwrap_or(false);

    if path.starts_with("/apex/") {
        if !loopback || !req.headers().contains_key("x-apex-admin") {
            return error(StatusCode::FORBIDDEN, "admin endpoints are loopback-only");
        }
        return next.run(req).await;
    }

    let bearer = req
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .map(str::to_string);
    let key_id = bearer.as_deref().and_then(|k| st.vault.verify(k));
    let exempt = !st.config.require_key || (loopback && st.config.allow_loopback_keyless);
    if key_id.is_none() && !exempt {
        st.vault.log_now(None, &method, &path, 401);
        return error(
            StatusCode::UNAUTHORIZED,
            "missing or invalid API key (expected `Authorization: Bearer sk-apex-…`)",
        );
    }
    req.extensions_mut().insert(KeyId(key_id.clone()));
    let resp = next.run(req).await;
    st.vault
        .log_now(key_id, &method, &path, resp.status().as_u16());
    resp
}

// ───────────────────────── Ollama ─────────────────────────

fn ollama_details(m: &ModelInfo) -> Value {
    json!({ "format": "gguf", "family": m.family, "parameter_size": m.parameter_size, "quantization_level": m.quantization })
}

async fn api_tags(State(st): State<AppState>) -> Json<Value> {
    let models: Vec<Value> = st
        .backend
        .models()
        .iter()
        .map(|m| json!({ "name": m.name, "model": m.name, "modified_at": iso(unix()), "size": m.size_bytes, "digest": "", "details": ollama_details(m) }))
        .collect();
    Json(json!({ "models": models }))
}

async fn api_ps(State(st): State<AppState>) -> Json<Value> {
    let running = st.backend.running();
    let models: Vec<Value> = st
        .backend
        .models()
        .iter()
        .filter(|m| running.contains(&m.name))
        .map(|m| json!({ "name": m.name, "model": m.name, "size": m.size_bytes, "size_vram": 0, "details": ollama_details(m), "expires_at": iso(unix() + 300) }))
        .collect();
    Json(json!({ "models": models }))
}

async fn api_version() -> Json<Value> {
    Json(json!({ "version": VERSION }))
}

fn default_true() -> bool {
    true
}

#[derive(Deserialize)]
struct OChatReq {
    model: String,
    messages: Vec<ChatMessage>,
    #[serde(default = "default_true")]
    stream: bool,
}

#[derive(Deserialize)]
struct OGenReq {
    model: String,
    prompt: String,
    system: Option<String>,
    #[serde(default = "default_true")]
    stream: bool,
}

async fn api_chat(
    State(st): State<AppState>,
    Extension(kid): Extension<KeyId>,
    Json(req): Json<OChatReq>,
) -> Response {
    let toks = tokens(&st, &kid, &req.model, req.messages);
    let model = req.model;
    if req.stream {
        let (m1, m2) = (model.clone(), model);
        let body = toks
            .map(move |t| ndjson(json!({ "model": m1, "created_at": iso(unix()), "message": { "role": "assistant", "content": t }, "done": false })))
            .chain(stream::once(async move {
                ndjson(json!({ "model": m2, "created_at": iso(unix()), "message": { "role": "assistant", "content": "" }, "done": true, "done_reason": "stop" }))
            }));
        stream_response("application/x-ndjson", body)
    } else {
        let content: String = toks.collect::<Vec<_>>().await.concat();
        Json(json!({ "model": model, "created_at": iso(unix()), "message": { "role": "assistant", "content": content }, "done": true, "done_reason": "stop" })).into_response()
    }
}

async fn api_generate(
    State(st): State<AppState>,
    Extension(kid): Extension<KeyId>,
    Json(req): Json<OGenReq>,
) -> Response {
    let mut msgs = vec![];
    if let Some(s) = req.system {
        msgs.push(ChatMessage {
            role: "system".into(),
            content: s,
        });
    }
    msgs.push(ChatMessage {
        role: "user".into(),
        content: req.prompt,
    });
    let toks = tokens(&st, &kid, &req.model, msgs);
    let model = req.model;
    if req.stream {
        let (m1, m2) = (model.clone(), model);
        let body = toks
            .map(move |t| ndjson(json!({ "model": m1, "created_at": iso(unix()), "response": t, "done": false })))
            .chain(stream::once(async move { ndjson(json!({ "model": m2, "created_at": iso(unix()), "response": "", "done": true, "done_reason": "stop" })) }));
        stream_response("application/x-ndjson", body)
    } else {
        let response: String = toks.collect::<Vec<_>>().await.concat();
        Json(json!({ "model": model, "created_at": iso(unix()), "response": response, "done": true, "done_reason": "stop" })).into_response()
    }
}

/// STUB: real wiring to `cortex-hf-hub::download` lands in Session 2.
async fn api_pull(Json(v): Json<Value>) -> Response {
    let name = v
        .get("model")
        .or_else(|| v.get("name"))
        .and_then(Value::as_str)
        .unwrap_or("unknown")
        .to_string();
    let lines = vec![
        ndjson(json!({ "status": "pulling manifest" })),
        ndjson(json!({ "status": format!("pull of {name} is not wired to cortex-hf-hub yet") })),
        ndjson(json!({ "status": "success" })),
    ];
    stream_response("application/x-ndjson", stream::iter(lines))
}

// ───────────────────────── OpenAI ─────────────────────────

async fn v1_models(State(st): State<AppState>) -> Json<Value> {
    let data: Vec<Value> = st
        .backend
        .models()
        .iter()
        .map(|m| json!({ "id": m.name, "object": "model", "created": unix(), "owned_by": "apex" }))
        .collect();
    Json(json!({ "object": "list", "data": data }))
}

#[derive(Deserialize)]
struct OaiChatReq {
    model: String,
    messages: Vec<ChatMessage>,
    #[serde(default)]
    stream: bool,
}

fn sse(v: Value) -> String {
    format!("data: {v}\n\n")
}

async fn v1_chat(
    State(st): State<AppState>,
    Extension(kid): Extension<KeyId>,
    Json(req): Json<OaiChatReq>,
) -> Response {
    let id = format!("chatcmpl-apex-{}", unix());
    let created = unix();
    let prompt_tokens: u64 = req
        .messages
        .iter()
        .map(|m| m.content.split_whitespace().count() as u64)
        .sum();
    let toks = tokens(&st, &kid, &req.model, req.messages);
    let model = req.model;
    if req.stream {
        let chunk = move |model: String, id: String, delta: Value, finish: Value| {
            sse(
                json!({ "id": id, "object": "chat.completion.chunk", "created": created, "model": model,
                        "choices": [{ "index": 0, "delta": delta, "finish_reason": finish }] }),
            )
        };
        let (m0, i0) = (model.clone(), id.clone());
        let (m1, i1) = (model.clone(), id.clone());
        let (m2, i2) = (model, id);
        let first = stream::once(async move {
            chunk(
                m0,
                i0,
                json!({ "role": "assistant", "content": "" }),
                Value::Null,
            )
        });
        let mid = toks.map(move |t| {
            sse(json!({ "id": i1, "object": "chat.completion.chunk", "created": created, "model": m1,
                        "choices": [{ "index": 0, "delta": { "content": t }, "finish_reason": null }] }))
        });
        let last = stream::iter(vec![
            sse(
                json!({ "id": i2, "object": "chat.completion.chunk", "created": created, "model": m2,
                        "choices": [{ "index": 0, "delta": {}, "finish_reason": "stop" }] }),
            ),
            "data: [DONE]\n\n".to_string(),
        ]);
        stream_response("text/event-stream", first.chain(mid).chain(last))
    } else {
        let content: String = toks.collect::<Vec<_>>().await.concat();
        let completion_tokens = content.split_whitespace().count() as u64;
        Json(json!({
            "id": id, "object": "chat.completion", "created": created, "model": model,
            "choices": [{ "index": 0, "message": { "role": "assistant", "content": content }, "finish_reason": "stop" }],
            "usage": { "prompt_tokens": prompt_tokens, "completion_tokens": completion_tokens, "total_tokens": prompt_tokens + completion_tokens }
        }))
        .into_response()
    }
}

// ───────────────────────── admin (loopback) ─────────────────────────

#[derive(Deserialize)]
struct NewKey {
    name: String,
}

async fn admin_keys(State(st): State<AppState>) -> Json<Value> {
    Json(json!({ "keys": st.vault.list() }))
}

async fn admin_new_key(State(st): State<AppState>, Json(b): Json<NewKey>) -> Json<Value> {
    let (key, rec) = st.vault.generate(&b.name);
    Json(
        json!({ "key": key, "record": rec, "note": "store this key now — it cannot be shown again" }),
    )
}

async fn admin_revoke(State(st): State<AppState>, Path(id): Path<String>) -> Response {
    if st.vault.revoke(&id) {
        StatusCode::NO_CONTENT.into_response()
    } else {
        error(StatusCode::NOT_FOUND, "no such key")
    }
}

async fn admin_logs(State(st): State<AppState>) -> Json<Value> {
    Json(json!({ "logs": st.vault.logs() }))
}

async fn health() -> Json<Value> {
    Json(json!({ "status": "ok" }))
}

// ───────────────────────── wiring ─────────────────────────

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/api/health", get(health))
        .route("/api/version", get(api_version))
        .route("/api/tags", get(api_tags))
        .route("/api/ps", get(api_ps))
        .route("/api/generate", post(api_generate))
        .route("/api/chat", post(api_chat))
        .route("/api/pull", post(api_pull))
        .route("/v1/models", get(v1_models))
        .route("/v1/chat/completions", post(v1_chat))
        .route("/apex/keys", get(admin_keys).post(admin_new_key))
        .route("/apex/keys/:id", delete(admin_revoke))
        .route("/apex/logs", get(admin_logs))
        .layer(middleware::from_fn_with_state(state.clone(), auth))
        .with_state(state)
}

/// Bind and serve (default `0.0.0.0:11434`). mDNS announce (`_ollama._tcp`) is a Session 2 task.
pub async fn serve(state: AppState, addr: SocketAddr) -> std::io::Result<()> {
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(
        listener,
        router(state).into_make_service_with_connect_info::<SocketAddr>(),
    )
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::Request as HttpRequest;
    use http_body_util::BodyExt;
    use tower::ServiceExt;

    fn app() -> (Router, String) {
        let st = AppState::new(Arc::new(EchoBackend), ServerConfig::default());
        let (key, _) = st.vault.generate("test");
        (router(st), key)
    }

    async fn body(resp: Response) -> String {
        String::from_utf8(
            resp.into_body()
                .collect()
                .await
                .unwrap()
                .to_bytes()
                .to_vec(),
        )
        .unwrap()
    }

    fn req(method: &str, uri: &str, key: Option<&str>, json: Option<Value>) -> HttpRequest<Body> {
        let mut b = HttpRequest::builder()
            .method(method)
            .uri(uri)
            .header("content-type", "application/json");
        if let Some(k) = key {
            b = b.header("authorization", format!("Bearer {k}"));
        }
        b.body(
            json.map(|j| Body::from(j.to_string()))
                .unwrap_or_else(Body::empty),
        )
        .unwrap()
    }

    #[test]
    fn iso_is_correct() {
        assert_eq!(iso(0), "1970-01-01T00:00:00Z");
        assert_eq!(iso(1_700_000_000), "2023-11-14T22:13:20Z");
    }

    #[tokio::test]
    async fn health_is_open() {
        let (app, _) = app();
        let r = app
            .oneshot(req("GET", "/health", None, None))
            .await
            .unwrap();
        assert_eq!(r.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn keys_are_enforced() {
        let (app, key) = app();
        let r = app
            .clone()
            .oneshot(req("GET", "/v1/models", None, None))
            .await
            .unwrap();
        assert_eq!(r.status(), StatusCode::UNAUTHORIZED);
        let r = app
            .oneshot(req("GET", "/v1/models", Some(&key), None))
            .await
            .unwrap();
        assert_eq!(r.status(), StatusCode::OK);
        let v: Value = serde_json::from_str(&body(r).await).unwrap();
        assert_eq!(v["object"], "list");
        assert_eq!(v["data"][0]["id"], "echo:latest");
    }

    #[tokio::test]
    async fn admin_is_not_reachable_without_loopback_connect_info() {
        let (app, key) = app();
        let r = app
            .oneshot(req("GET", "/apex/keys", Some(&key), None))
            .await
            .unwrap();
        assert_eq!(r.status(), StatusCode::FORBIDDEN);
    }

    #[tokio::test]
    async fn ollama_chat_streams_ndjson_and_ends_with_done() {
        let (app, key) = app();
        let payload = json!({ "model": "echo:latest", "messages": [{ "role": "user", "content": "hello brave world" }] });
        let r = app
            .oneshot(req("POST", "/api/chat", Some(&key), Some(payload)))
            .await
            .unwrap();
        let text = body(r).await;
        let lines: Vec<Value> = text
            .lines()
            .map(|l| serde_json::from_str(l).unwrap())
            .collect();
        assert_eq!(lines.len(), 4);
        let joined: String = lines
            .iter()
            .map(|l| l["message"]["content"].as_str().unwrap())
            .collect();
        assert_eq!(joined, "hello brave world");
        assert_eq!(lines.last().unwrap()["done"], true);
    }

    #[tokio::test]
    async fn openai_stream_is_sse_with_done_sentinel() {
        let (app, key) = app();
        let payload = json!({ "model": "echo:latest", "stream": true, "messages": [{ "role": "user", "content": "hi" }] });
        let r = app
            .oneshot(req(
                "POST",
                "/v1/chat/completions",
                Some(&key),
                Some(payload),
            ))
            .await
            .unwrap();
        let text = body(r).await;
        assert!(text.contains("\"delta\":{\"content\":\"hi\"}"));
        assert!(text.trim_end().ends_with("data: [DONE]"));
    }

    #[tokio::test]
    async fn openai_non_stream_reports_usage() {
        let (app, key) = app();
        let payload =
            json!({ "model": "echo:latest", "messages": [{ "role": "user", "content": "a b c" }] });
        let r = app
            .oneshot(req(
                "POST",
                "/v1/chat/completions",
                Some(&key),
                Some(payload),
            ))
            .await
            .unwrap();
        let v: Value = serde_json::from_str(&body(r).await).unwrap();
        assert_eq!(v["choices"][0]["message"]["content"], "a b c");
        assert_eq!(v["usage"]["total_tokens"], 6);
    }
}
