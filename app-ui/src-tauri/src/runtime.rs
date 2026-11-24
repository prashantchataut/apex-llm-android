//! Process-wide runtime: the llama.cpp engine, the OpenAI/Ollama server, downloads.

use cortex_hf_hub::download::{download, DownloadOptions};
use cortex_inference::llama_engine::LlamaEngine;
use cortex_inference::template::{ChatTemplate, Message, APEX_SYSTEM_PROMPT};
use cortex_inference::think::{ThinkEvent, ThinkParser};
use cortex_inference::{Engine, GenerationStats, LoadParams, SamplingParams};
use cortex_server::{vault::KeyVault, AppState, Backend, ChatMessage, ModelInfo, ServerConfig, DEFAULT_PORT};
use futures::{stream::BoxStream, StreamExt};
use serde::Serialize;
use std::{
    collections::HashMap,
    net::{SocketAddr, UdpSocket},
    path::PathBuf,
    sync::{Arc, Mutex},
};

pub enum Ev {
    Text(String),
    Thought(String),
    ThinkStart,
    ThinkEnd,
}

#[derive(Serialize, Clone)]
pub struct LocalModel {
    pub name: String,
    pub size_bytes: u64,
    pub loaded: bool,
}

struct Core {
    engine: Mutex<LlamaEngine>,
    loaded: Mutex<Option<String>>,
    dir: PathBuf,
}

impl Core {
    fn threads() -> u32 {
        std::thread::available_parallelism().map(|n| n.get() as u32).unwrap_or(4).clamp(2, 6)
    }

    fn ensure_loaded(&self, name: &str) -> Result<(), String> {
        if name.contains('/') || name.contains("..") {
            return Err("invalid model name".into());
        }
        let mut cur = self.loaded.lock().map_err(|_| "poisoned")?;
        if cur.as_deref() == Some(name) {
            return Ok(());
        }
        let mut eng = self.engine.lock().map_err(|_| "poisoned")?;
        eng.unload();
        let params = LoadParams { n_ctx: 4096, n_threads: Self::threads(), n_gpu_layers: 0, use_mmap: true };
        eng.load(&self.dir.join(name), &params).map_err(|e| e.to_string())?;
        *cur = Some(name.to_string());
        Ok(())
    }

    fn models(&self) -> Vec<LocalModel> {
        let loaded = self.loaded.lock().ok().and_then(|l| l.clone());
        let mut v: Vec<LocalModel> = std::fs::read_dir(&self.dir)
            .into_iter()
            .flatten()
            .flatten()
            .filter_map(|e| {
                let name = e.file_name().to_string_lossy().to_string();
                if !name.ends_with(".gguf") {
                    return None;
                }
                let size_bytes = e.metadata().ok()?.len();
                Some(LocalModel { loaded: loaded.as_deref() == Some(name.as_str()), name, size_bytes })
            })
            .collect();
        v.sort_by(|a, b| a.name.cmp(&b.name));
        v
    }

    /// Blocking: render the prompt, run the engine, hand raw pieces to `on_piece`.
    fn run(
        &self,
        model: Option<&str>,
        msgs: &[(String, String)],
        on_piece: &mut dyn FnMut(&str) -> bool,
    ) -> Result<GenerationStats, String> {
        let name = match model {
            Some(m) if !m.is_empty() => m.to_string(),
            _ => self
                .loaded
                .lock()
                .ok()
                .and_then(|l| l.clone())
                .or_else(|| self.models().first().map(|m| m.name.clone()))
                .ok_or("No model installed yet. Download one from Models first.")?,
        };
        self.ensure_loaded(&name)?;
        let tpl = ChatTemplate::guess(&name);
        let mut all = vec![Message { role: "system".into(), content: APEX_SYSTEM_PROMPT.into() }];
        all.extend(msgs.iter().map(|(r, c)| Message { role: r.clone(), content: c.clone() }));
        let prompt = tpl.render(&all);
        let sp = SamplingParams {
            max_tokens: 1024,
            stop: tpl.stop_tokens().iter().map(|s| s.to_string()).collect(),
            ..Default::default()
        };
        let mut eng = self.engine.lock().map_err(|_| "poisoned")?;
        eng.generate(&prompt, &sp, on_piece).map_err(|e| e.to_string())
    }
}

struct ServerBackend(Arc<Core>);

impl Backend for ServerBackend {
    fn models(&self) -> Vec<ModelInfo> {
        self.0
            .models()
            .into_iter()
            .map(|m| ModelInfo {
                family: ChatTemplate::guess(&m.name).family().into(),
                parameter_size: String::new(),
                quantization: m.name.rsplit('.').nth(1).unwrap_or("").to_string(),
                size_bytes: m.size_bytes,
                name: m.name,
            })
            .collect()
    }
    fn running(&self) -> Vec<String> {
        self.0.loaded.lock().ok().and_then(|l| l.clone()).into_iter().collect()
    }
    fn chat_stream(&self, model: &str, messages: Vec<ChatMessage>) -> BoxStream<'static, String> {
        let (tx, rx) = futures::channel::mpsc::unbounded::<String>();
        let core = self.0.clone();
        let model = model.to_string();
        let msgs: Vec<(String, String)> = messages.into_iter().map(|m| (m.role, m.content)).collect();
        std::thread::spawn(move || {
            let res = core.run(Some(&model), &msgs, &mut |p| tx.unbounded_send(p.to_string()).is_ok());
            if let Err(e) = res {
                let _ = tx.unbounded_send(format!("[apex error: {e}]"));
            }
        });
        rx.boxed()
    }
}

pub struct Runtime {
    core: Arc<Core>,
    vault: Arc<KeyVault>,
    server: Mutex<Option<tauri::async_runtime::JoinHandle<()>>>,
    downloads: Mutex<HashMap<String, tauri::async_runtime::JoinHandle<()>>>,
}

impl Runtime {
    pub fn new(dir: PathBuf) -> Self {
        Self {
            core: Arc::new(Core { engine: Mutex::new(LlamaEngine::new()), loaded: Mutex::new(None), dir }),
            vault: Arc::new(KeyVault::new()),
            server: Mutex::new(None),
            downloads: Mutex::new(HashMap::new()),
        }
    }

    pub fn vault(&self) -> Arc<KeyVault> {
        self.vault.clone()
    }

    pub fn local_models(&self) -> Vec<LocalModel> {
        self.core.models()
    }

    pub async fn load_model(&self, name: &str) -> Result<String, String> {
        let core = self.core.clone();
        let n = name.to_string();
        tauri::async_runtime::spawn_blocking(move || core.ensure_loaded(&n).map(|_| n))
            .await
            .map_err(|e| e.to_string())?
    }

    pub async fn chat(
        &self,
        msgs: Vec<(String, String)>,
        on_ev: impl Fn(Ev) + Send + 'static,
    ) -> Result<GenerationStats, String> {
        let core = self.core.clone();
        tauri::async_runtime::spawn_blocking(move || {
            let mut parser = ThinkParser::new();
            let emit = |evs: Vec<ThinkEvent>| {
                for e in evs {
                    on_ev(match e {
                        ThinkEvent::Text(t) => Ev::Text(t),
                        ThinkEvent::Thought(t) => Ev::Thought(t),
                        ThinkEvent::ThinkStart => Ev::ThinkStart,
                        ThinkEvent::ThinkEnd => Ev::ThinkEnd,
                    });
                }
            };
            let stats = core.run(None, &msgs, &mut |piece| {
                emit(parser.feed(piece));
                true
            })?;
            emit(parser.finish());
            Ok(stats)
        })
        .await
        .map_err(|e| e.to_string())?
    }

    pub async fn download(
        &self,
        id: &str,
        repo: &str,
        file: &str,
        progress: impl Fn(u64, u64) + Send + Sync + 'static,
    ) -> Result<String, String> {
        if file.contains('/') || file.contains("..") || !file.ends_with(".gguf") {
            return Err("only plain .gguf filenames are accepted".into());
        }
        let url = format!("https://huggingface.co/{repo}/resolve/main/{file}");
        let dest = self.core.dir.join(file);
        let client = reqwest::Client::new();
        let (tx, rx) = tokio::sync::oneshot::channel::<Result<(), String>>();
        let handle = tauri::async_runtime::spawn(async move {
            let r = download(&client, &url, &dest, DownloadOptions::default(), progress).await.map_err(|e| e.to_string());
            let _ = tx.send(r);
        });
        if let Ok(mut d) = self.downloads.lock() {
            d.insert(id.to_string(), handle);
        }
        let out = rx.await.map_err(|_| "download paused".to_string())?;
        if let Ok(mut d) = self.downloads.lock() {
            d.remove(id);
        }
        out.map(|_| self.core.dir.join(file).display().to_string())
    }

    pub fn pause(&self, id: &str) -> bool {
        match self.downloads.lock().ok().and_then(|mut d| d.remove(id)) {
            Some(h) => {
                h.abort();
                true
            }
            None => false,
        }
    }

    pub fn server_running(&self) -> bool {
        self.server.lock().map(|s| s.as_ref().is_some_and(|h| !h.inner().is_finished())).unwrap_or(false)
    }

    pub async fn start_server(&self) -> Result<(), String> {
        if self.server_running() {
            return Ok(());
        }
        let addr: SocketAddr = ([0, 0, 0, 0], DEFAULT_PORT).into();
        let listener = std::net::TcpListener::bind(addr).map_err(|e| format!("port {DEFAULT_PORT} unavailable: {e}"))?;
        drop(listener);
        let mut state = AppState::new(Arc::new(ServerBackend(self.core.clone())), ServerConfig::default());
        state.vault = self.vault.clone();
        let h = tauri::async_runtime::spawn(async move {
            if let Err(e) = cortex_server::serve(state, addr).await {
                eprintln!("apex server stopped: {e}");
            }
        });
        *self.server.lock().map_err(|_| "poisoned")? = Some(h);
        Ok(())
    }

    pub fn stop_server(&self) {
        if let Ok(mut s) = self.server.lock() {
            if let Some(h) = s.take() {
                h.abort();
            }
        }
    }
}

/// Best-effort LAN address: the source IP the OS would use to reach the internet (no packets are sent).
pub fn lan_ip() -> Option<String> {
    let s = UdpSocket::bind("0.0.0.0:0").ok()?;
    s.connect("8.8.8.8:80").ok()?;
    Some(s.local_addr().ok()?.ip().to_string())
}
