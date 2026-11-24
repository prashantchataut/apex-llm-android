//! Real llama.cpp engine (via `llama-cpp-2`). Compiled only with `--features llama`.
//! STATUS: compiled + run on x86_64 Linux with a real GGUF (see `tests/real_inference.rs`);
//! cross-compiled for aarch64-linux-android (see `.agent/STATE.md`). Never run on a physical phone.

use crate::{Engine, EngineError, GenerationStats, LoadParams, SamplingParams};
use llama_cpp_2::context::params::LlamaContextParams;
use llama_cpp_2::llama_backend::LlamaBackend;
use llama_cpp_2::llama_batch::LlamaBatch;
use llama_cpp_2::model::params::LlamaModelParams;
use llama_cpp_2::model::LlamaModel;
use llama_cpp_2::sampling::LlamaSampler;
use std::num::NonZeroU32;
use std::path::Path;
use std::sync::OnceLock;
use std::time::Instant;

/// llama.cpp's backend is a process-wide singleton.
fn backend() -> Result<&'static LlamaBackend, EngineError> {
    static BACKEND: OnceLock<Result<LlamaBackend, String>> = OnceLock::new();
    BACKEND
        .get_or_init(|| {
            let mut b = LlamaBackend::init().map_err(|e| e.to_string())?;
            b.void_logs();
            Ok(b)
        })
        .as_ref()
        .map_err(|e| EngineError::Load(e.clone()))
}

pub struct LlamaEngine {
    model: Option<LlamaModel>,
    params: LoadParams,
}

impl LlamaEngine {
    pub fn new() -> Self {
        Self {
            model: None,
            params: LoadParams::default(),
        }
    }
}

impl Default for LlamaEngine {
    fn default() -> Self {
        Self::new()
    }
}

fn gen_err(e: impl std::fmt::Display) -> EngineError {
    EngineError::Generate(e.to_string())
}

impl Engine for LlamaEngine {
    fn load(&mut self, model: &Path, params: &LoadParams) -> Result<(), EngineError> {
        let b = backend()?;
        if !model.exists() {
            return Err(EngineError::Load(format!("{} does not exist", model.display())));
        }
        let mp = LlamaModelParams::default()
            .with_n_gpu_layers(params.n_gpu_layers)
            .with_use_mmap(params.use_mmap);
        let m = LlamaModel::load_from_file(b, model, &mp).map_err(|e| EngineError::Load(e.to_string()))?;
        self.model = Some(m);
        self.params = params.clone();
        Ok(())
    }

    fn generate(
        &mut self,
        prompt: &str,
        sp: &SamplingParams,
        on_token: &mut dyn FnMut(&str) -> bool,
    ) -> Result<GenerationStats, EngineError> {
        let model = self.model.as_ref().ok_or(EngineError::NotLoaded)?;
        let b = backend()?;
        let vocab = model.vocab();
        let tokens = vocab.tokenize(prompt.as_bytes(), true, true);
        if tokens.is_empty() {
            return Err(gen_err("empty prompt"));
        }
        let n_prompt = tokens.len() as u32;
        let n_ctx = self.params.n_ctx.max(n_prompt + sp.max_tokens + 8);
        let threads = self.params.n_threads.max(1) as i32;
        let cp = LlamaContextParams::default()
            .with_n_ctx(NonZeroU32::new(n_ctx))
            .with_n_batch(512)
            .with_n_threads(threads)
            .with_n_threads_batch(threads);
        let mut ctx = model.new_context(b, cp).map_err(gen_err)?;

        // Prompt: decode in chunks of 512; logits only for the last token.
        let mut batch = LlamaBatch::new(512, 1);
        let last = tokens.len() - 1;
        for (chunk_start, chunk) in tokens.chunks(512).enumerate().map(|(i, c)| (i * 512, c)) {
            batch.clear();
            for (j, t) in chunk.iter().enumerate() {
                let pos = chunk_start + j;
                batch.add(*t, pos as i32, &[0], pos == last).map_err(gen_err)?;
            }
            ctx.decode(&mut batch).map_err(gen_err)?;
        }

        let mut chain = Vec::new();
        if sp.repeat_penalty > 1.0 {
            chain.push(LlamaSampler::penalties(model.n_vocab(), 64, sp.repeat_penalty, 0.0, 0.0));
        }
        if let Some(g) = sp.grammar.as_deref() {
            chain.push(LlamaSampler::grammar(model, g, "root").map_err(gen_err)?);
        }
        if sp.temperature <= 0.0 {
            chain.push(LlamaSampler::greedy());
        } else {
            chain.push(LlamaSampler::top_k(sp.top_k as i32));
            chain.push(LlamaSampler::top_p(sp.top_p, 1));
            chain.push(LlamaSampler::temp(sp.temperature));
            chain.push(LlamaSampler::dist(1234));
        }
        let mut sampler = LlamaSampler::chain_simple(chain);

        let mut decoder = encoding_rs::UTF_8.new_decoder();
        let mut n_cur = tokens.len() as i32;
        let mut produced = 0u32;
        let mut text = String::new();
        let started = Instant::now();
        while produced < sp.max_tokens {
            let tok = sampler.sample(&ctx, batch.n_tokens() - 1);
            sampler.accept(tok);
            if vocab.is_eog(tok) {
                break;
            }
            let bytes = vocab.token_to_piece(tok, true, None);
            let mut piece = String::with_capacity(bytes.len() + 4);
            let _ = decoder.decode_to_string(&bytes, &mut piece, false);
            produced += 1;
            if !piece.is_empty() {
                text.push_str(&piece);
                if !on_token(&piece) {
                    break;
                }
                if sp.stop.iter().any(|s| !s.is_empty() && text.ends_with(s.as_str())) {
                    break;
                }
            }
            batch.clear();
            batch.add(tok, n_cur, &[0], true).map_err(gen_err)?;
            n_cur += 1;
            ctx.decode(&mut batch).map_err(gen_err)?;
        }
        let secs = started.elapsed().as_secs_f32().max(1e-3);
        Ok(GenerationStats {
            prompt_tokens: n_prompt,
            completion_tokens: produced,
            tokens_per_second: produced as f32 / secs,
        })
    }

    fn unload(&mut self) {
        self.model = None;
    }

    fn is_loaded(&self) -> bool {
        self.model.is_some()
    }
}
