//! Runs the server with the echo backend on 127.0.0.1:11434 and prints a fresh API key.
//! Used for the PC web-console render proof: `cargo run -p cortex-server --example echo`.
use cortex_server::{serve, AppState, EchoBackend, ServerConfig};
use std::sync::Arc;

#[tokio::main]
async fn main() {
    let state = AppState::new(Arc::new(EchoBackend), ServerConfig::default());
    let (key, _) = state.vault.generate("PC console proof");
    println!("KEY={key}");
    serve(state, "127.0.0.1:11434".parse().expect("addr"))
        .await
        .expect("serve");
}
