//! Thin Tauri command layer. Business logic lives in the cortex-* crates.
//! STATUS: compiles for aarch64-linux-android (see .agent/STATE.md). Chat/engine paths are exercised on x86_64
//! with a real GGUF; nothing here has run on a physical phone.

mod runtime;

use cortex_hardware::{profile, DeviceCapabilityProfile, LinuxSource};
use cortex_hf_hub::media::{score_media, MediaModelSpec, MEDIA_CATALOG};
use cortex_hf_hub::Compatibility;
use runtime::{LocalModel, Runtime};
use serde::{Deserialize, Serialize};
use tauri::{ipc::Channel, AppHandle, Manager, State};

fn valid_key(key: &str) -> bool {
    !key.is_empty() && key.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
}

#[tauri::command]
fn device_profile(app: AppHandle) -> DeviceCapabilityProfile {
    let data_dir = app.path().app_data_dir().map(|p| p.display().to_string()).unwrap_or_else(|_| "/data".into());
    profile(&LinuxSource { data_dir })
}

/// Persist a small JSON setting (theme, onboarding) under `<app_data>/settings/<key>.json`.
#[tauri::command]
fn settings_set(app: AppHandle, key: String, value: String) -> Result<(), String> {
    if !valid_key(&key) {
        return Err("invalid settings key".into());
    }
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join("settings");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    std::fs::write(dir.join(format!("{key}.json")), value).map_err(|e| e.to_string())
}

#[tauri::command]
fn settings_get(app: AppHandle, key: String) -> Option<String> {
    if !valid_key(&key) {
        return None;
    }
    let dir = app.path().app_data_dir().ok()?.join("settings");
    std::fs::read_to_string(dir.join(format!("{key}.json"))).ok()
}

#[derive(Serialize)]
struct MediaEntry {
    #[serde(flatten)]
    spec: MediaModelSpec,
    compat: &'static str,
}

#[tauri::command]
fn media_catalog(app: AppHandle) -> Vec<MediaEntry> {
    let p = device_profile(app);
    MEDIA_CATALOG
        .iter()
        .map(|m| MediaEntry {
            spec: *m,
            compat: match score_media(&p, m) {
                Compatibility::Optimal => "optimal",
                Compatibility::Heavy => "heavy",
                Compatibility::Incompatible => "incompatible",
            },
        })
        .collect()
}

// ───────────── engine ─────────────

#[tauri::command]
fn model_list(rt: State<'_, Runtime>) -> Vec<LocalModel> {
    rt.local_models()
}

#[tauri::command]
async fn model_load(rt: State<'_, Runtime>, name: String) -> Result<String, String> {
    rt.load_model(&name).await
}

#[derive(Deserialize)]
struct Msg {
    role: String,
    content: String,
}

#[derive(Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
enum ChatEvent {
    Text { text: String },
    Thought { text: String },
    ThinkStart,
    ThinkEnd,
    Done { prompt_tokens: u32, completion_tokens: u32, tps: f32 },
    Error { message: String },
}

#[tauri::command]
async fn chat_stream(rt: State<'_, Runtime>, messages: Vec<Msg>, on_event: Channel<ChatEvent>) -> Result<(), String> {
    let msgs: Vec<(String, String)> = messages.into_iter().map(|m| (m.role, m.content)).collect();
    let tx = on_event.clone();
    let res = rt
        .chat(msgs, move |ev| {
            let _ = tx.send(match ev {
                runtime::Ev::Text(t) => ChatEvent::Text { text: t },
                runtime::Ev::Thought(t) => ChatEvent::Thought { text: t },
                runtime::Ev::ThinkStart => ChatEvent::ThinkStart,
                runtime::Ev::ThinkEnd => ChatEvent::ThinkEnd,
            });
        })
        .await;
    match res {
        Ok(s) => {
            let _ = on_event.send(ChatEvent::Done {
                prompt_tokens: s.prompt_tokens,
                completion_tokens: s.completion_tokens,
                tps: s.tokens_per_second,
            });
            Ok(())
        }
        Err(e) => {
            let _ = on_event.send(ChatEvent::Error { message: e.clone() });
            Err(e)
        }
    }
}

// ───────────── Hugging Face ─────────────

#[derive(Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
enum DlEvent {
    Progress { done: u64, total: u64 },
    Done { path: String },
    Error { message: String },
}

#[tauri::command]
async fn hf_search(query: String) -> Result<Vec<cortex_hf_hub::ModelCard>, String> {
    cortex_hf_hub::HfClient::new(None).search(&query, 20).await.map_err(|e| e.to_string())
}

/// Resumable segmented download of `repo/file` into the models directory. Pausing = `hf_pause` (state sidecar kept).
#[tauri::command]
async fn hf_download(rt: State<'_, Runtime>, id: String, repo: String, file: String, on_event: Channel<DlEvent>) -> Result<(), String> {
    let tx = on_event.clone();
    let result = rt
        .download(&id, &repo, &file, move |done, total| {
            let _ = tx.send(DlEvent::Progress { done, total });
        })
        .await;
    match result {
        Ok(p) => {
            let _ = on_event.send(DlEvent::Done { path: p });
            Ok(())
        }
        Err(e) => {
            let _ = on_event.send(DlEvent::Error { message: e.clone() });
            Err(e)
        }
    }
}

#[tauri::command]
fn hf_pause(rt: State<'_, Runtime>, id: String) -> bool {
    rt.pause(&id)
}

// ───────────── Local API server + keys ─────────────

#[derive(Serialize)]
struct ServerStatus {
    running: bool,
    port: u16,
    lan_ip: Option<String>,
}

#[tauri::command]
fn server_status(rt: State<'_, Runtime>) -> ServerStatus {
    ServerStatus { running: rt.server_running(), port: cortex_server::DEFAULT_PORT, lan_ip: runtime::lan_ip() }
}

#[tauri::command]
async fn server_start(rt: State<'_, Runtime>) -> Result<ServerStatus, String> {
    rt.start_server().await?;
    Ok(server_status(rt))
}

#[tauri::command]
fn server_stop(rt: State<'_, Runtime>) -> ServerStatus {
    rt.stop_server();
    server_status(rt)
}

#[derive(Serialize)]
struct NewKey {
    /// Full secret, shown exactly once.
    key: String,
    record: cortex_server::vault::KeyRecord,
}

#[tauri::command]
fn key_create(rt: State<'_, Runtime>, name: String) -> NewKey {
    let (key, record) = rt.vault().generate(name.trim());
    NewKey { key, record }
}

#[tauri::command]
fn key_list(rt: State<'_, Runtime>) -> Vec<cortex_server::vault::KeyRecord> {
    rt.vault().list()
}

#[tauri::command]
fn key_revoke(rt: State<'_, Runtime>, id: String) -> bool {
    rt.vault().revoke(&id)
}

// ───────────── Voice (STUB until a recognizer is bundled) ─────────────

#[derive(Serialize)]
struct VoiceStatus {
    ready: bool,
    engine: &'static str,
    note: &'static str,
}

#[tauri::command]
fn voice_status() -> VoiceStatus {
    VoiceStatus {
        ready: false,
        engine: "none",
        note: "STUB: no speech recognizer is bundled yet (sherpa-onnx / Parakeet integration pending).",
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let dir = app.path().app_data_dir()?.join("models");
            std::fs::create_dir_all(&dir)?;
            app.manage(Runtime::new(dir));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            device_profile,
            settings_get,
            settings_set,
            media_catalog,
            model_list,
            model_load,
            chat_stream,
            hf_search,
            hf_download,
            hf_pause,
            server_status,
            server_start,
            server_stop,
            key_create,
            key_list,
            key_revoke,
            voice_status
        ])
        .run(tauri::generate_context!())
        .expect("error while running Apex");
}
