//! Thin Tauri command layer. Business logic lives in the cortex-* crates.
//! STATUS: UNVERIFIED — never built (no Tauri/Android toolchain in Sessions 1–2). Commands below are plain
//! std/serde code and are expected to compile, but nothing here has been run.

use cortex_hardware::{profile, DeviceCapabilityProfile, LinuxSource};
use cortex_hf_hub::media::{score_media, MediaModelSpec, MEDIA_CATALOG};
use cortex_hf_hub::Compatibility;
use serde::Serialize;
use cortex_server::{AppState, EchoBackend, ServerConfig, DEFAULT_PORT};
use std::{net::SocketAddr, sync::Arc};
use tauri::Manager;

#[tauri::command]
fn device_profile(app: tauri::AppHandle) -> DeviceCapabilityProfile {
    let data_dir = app.path().app_data_dir().map(|p| p.display().to_string()).unwrap_or_else(|_| "/data".into());
    profile(&LinuxSource { data_dir })
}

/// Persist a small JSON setting (theme, onboarding) under `<app_data>/settings/<key>.json`.
/// The WebView also keeps a localStorage copy; this one survives WebView storage clears.
#[tauri::command]
fn settings_set(app: tauri::AppHandle, key: String, value: String) -> Result<(), String> {
    if key.is_empty() || !key.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-') {
        return Err("invalid settings key".into());
    }
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join("settings");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    std::fs::write(dir.join(format!("{key}.json")), value).map_err(|e| e.to_string())
}

#[tauri::command]
fn settings_get(app: tauri::AppHandle, key: String) -> Option<String> {
    if key.is_empty() || !key.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-') {
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

/// Image/video catalog scored against this phone (mirror of `web-showcase/src/lib/media.ts`).
#[tauri::command]
fn media_catalog(app: tauri::AppHandle) -> Vec<MediaEntry> {
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

/// STUB: serves the EchoBackend. Session 2 swaps in the llama.cpp-backed engine.
#[tauri::command]
async fn start_server() -> Result<u16, String> {
    let state = AppState::new(Arc::new(EchoBackend), ServerConfig::default());
    let addr: SocketAddr = ([0, 0, 0, 0], DEFAULT_PORT).into();
    tauri::async_runtime::spawn(async move {
        if let Err(e) = cortex_server::serve(state, addr).await {
            eprintln!("apex server stopped: {e}");
        }
    });
    Ok(DEFAULT_PORT)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![device_profile, start_server, settings_get, settings_set, media_catalog])
        .run(tauri::generate_context!())
        .expect("error while running Apex");
}
