//! Thin Tauri command layer. Business logic lives in the cortex-* crates.
//! STATUS: compiles against Tauri 2 API as written but was NOT built in Session 1.

use cortex_hardware::{profile, DeviceCapabilityProfile, LinuxSource};
use cortex_server::{AppState, EchoBackend, ServerConfig, DEFAULT_PORT};
use std::{net::SocketAddr, sync::Arc};
use tauri::Manager;

#[tauri::command]
fn device_profile(app: tauri::AppHandle) -> DeviceCapabilityProfile {
    let data_dir = app.path().app_data_dir().map(|p| p.display().to_string()).unwrap_or_else(|_| "/data".into());
    profile(&LinuxSource { data_dir })
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
        .invoke_handler(tauri::generate_handler![device_profile, start_server])
        .run(tauri::generate_context!())
        .expect("error while running Apex");
}
