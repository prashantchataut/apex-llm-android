//! cortex-inference — everything *around* the llama.cpp call that must be
//! correct and testable without a phone: the [`Engine`] seam, the streaming
//! `<think>` parser, GBNF grammars for structured output (MCQ), chat templates.
#![forbid(unsafe_code)]

pub mod grammar;
pub mod template;
pub mod think;

use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, thiserror::Error)]
pub enum EngineError {
    #[error("no model loaded")]
    NotLoaded,
    #[error("load failed: {0}")]
    Load(String),
    #[error("generation failed: {0}")]
    Generate(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoadParams {
    pub n_ctx: u32,
    pub n_threads: u32,
    /// Layers offloaded to Vulkan (0 = CPU only).
    pub n_gpu_layers: u32,
    pub use_mmap: bool,
}

impl Default for LoadParams {
    fn default() -> Self {
        Self { n_ctx: 4096, n_threads: 4, n_gpu_layers: 0, use_mmap: true }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SamplingParams {
    pub temperature: f32,
    pub top_p: f32,
    pub top_k: u32,
    pub repeat_penalty: f32,
    pub max_tokens: u32,
    /// GBNF grammar constraining output (e.g. [`grammar::mcq_grammar`]).
    pub grammar: Option<String>,
    pub stop: Vec<String>,
}

impl Default for SamplingParams {
    fn default() -> Self {
        Self { temperature: 0.7, top_p: 0.9, top_k: 40, repeat_penalty: 1.1, max_tokens: 1024, grammar: None, stop: vec![] }
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
pub struct GenerationStats {
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    pub tokens_per_second: f32,
}

/// Blocking engine seam. The Tauri/server layers run it on a dedicated thread
/// and forward tokens through channels. `on_token` returns `false` to cancel.
pub trait Engine: Send {
    fn load(&mut self, model: &Path, params: &LoadParams) -> Result<(), EngineError>;
    fn generate(
        &mut self,
        prompt: &str,
        params: &SamplingParams,
        on_token: &mut dyn FnMut(&str) -> bool,
    ) -> Result<GenerationStats, EngineError>;
    fn unload(&mut self);
    fn is_loaded(&self) -> bool;
}

/// Deterministic engine for tests, CI and UI demos.
pub struct ScriptedEngine {
    pub script: Vec<String>,
    loaded: bool,
}

impl ScriptedEngine {
    pub fn new(script: impl IntoIterator<Item = impl Into<String>>) -> Self {
        Self { script: script.into_iter().map(Into::into).collect(), loaded: false }
    }
}

impl Engine for ScriptedEngine {
    fn load(&mut self, _m: &Path, _p: &LoadParams) -> Result<(), EngineError> {
        self.loaded = true;
        Ok(())
    }
    fn generate(&mut self, prompt: &str, p: &SamplingParams, on_token: &mut dyn FnMut(&str) -> bool) -> Result<GenerationStats, EngineError> {
        if !self.loaded {
            return Err(EngineError::NotLoaded);
        }
        let mut n = 0;
        for t in self.script.iter().take(p.max_tokens as usize) {
            n += 1;
            if !on_token(t) {
                break;
            }
        }
        Ok(GenerationStats { prompt_tokens: prompt.split_whitespace().count() as u32, completion_tokens: n, tokens_per_second: 0.0 })
    }
    fn unload(&mut self) {
        self.loaded = false;
    }
    fn is_loaded(&self) -> bool {
        self.loaded
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scripted_engine_streams_and_cancels() {
        let mut e = ScriptedEngine::new(["a", "b", "c"]);
        assert!(matches!(e.generate("x", &SamplingParams::default(), &mut |_| true), Err(EngineError::NotLoaded)));
        e.load(Path::new("m.gguf"), &LoadParams::default()).unwrap();
        let mut got = vec![];
        let s = e.generate("hi there", &SamplingParams::default(), &mut |t| {
            got.push(t.to_string());
            got.len() < 2
        })
        .unwrap();
        assert_eq!(got, ["a", "b"]);
        assert_eq!(s.completion_tokens, 2);
    }
}
