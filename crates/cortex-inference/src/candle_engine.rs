//! 100 % pure-Rust quantized GGUF engine built on Hugging Face `candle`.
//! Compiled only with `--features candle`. No CMake, no C++ and no NDK C toolchain beyond the Rust linker,
//! so it cross-compiles to `aarch64-linux-android` exactly like the rest of the workspace.
//!
//! Supported architectures (GGUF `general.architecture`): `llama` (Llama 3.x, SmolLM2, TinyLlama …) and `qwen2`
//! (Qwen2 / Qwen2.5). Tensors stay quantized in memory (Q4_0, Q4_K, Q5_K, Q6_K, Q8_0 …).
//!
//! STATUS: verified on x86_64 Linux with real weights (see `tests/candle_real.rs`). Never run on a physical phone.
//! KNOWN LIMITS: CPU only; GBNF grammars are ignored (use the llama.cpp backend for constrained MCQ output).

use crate::gguf_tokenizer::{BpeTokenizer, PreTokenizer, Utf8Stream};
use crate::{Engine, EngineError, GenerationStats, LoadParams, SamplingParams};
use candle_core::quantized::gguf_file::{self, Value};
use candle_core::{Device, Tensor};
use candle_transformers::generation::{LogitsProcessor, Sampling};
use candle_transformers::models::{quantized_llama, quantized_qwen2};
use serde::Serialize;
use std::fs::File;
use std::io::BufReader;
use std::path::Path;
use std::time::Instant;

/// What the GGUF header says about a model — read without touching the weights.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct GgufInfo {
    pub architecture: String,
    pub name: Option<String>,
    pub tensor_count: usize,
    pub context_length: Option<u64>,
    pub vocab_size: usize,
    /// GGUF `general.file_type` (7 = Q8_0, 15 = Q4_K_M …).
    pub file_type: Option<u32>,
    pub chat_template: Option<String>,
    /// Sum of tensor element counts.
    pub parameters: u64,
}

fn md_string(c: &gguf_file::Content, k: &str) -> Option<String> {
    c.metadata.get(k)?.to_string().ok().cloned()
}

fn md_u64(c: &gguf_file::Content, k: &str) -> Option<u64> {
    let v = c.metadata.get(k)?;
    v.to_u64()
        .ok()
        .or_else(|| v.to_u32().ok().map(u64::from))
        .or_else(|| v.to_i32().ok().and_then(|n| u64::try_from(n).ok()))
}

fn md_bool(c: &gguf_file::Content, k: &str) -> Option<bool> {
    c.metadata.get(k)?.to_bool().ok()
}

fn md_strings(c: &gguf_file::Content, k: &str) -> Vec<String> {
    c.metadata
        .get(k)
        .and_then(|v| v.to_vec().ok())
        .map(|v| {
            v.iter()
                .filter_map(|x| x.to_string().ok().cloned())
                .collect()
        })
        .unwrap_or_default()
}

fn md_i32s(c: &gguf_file::Content, k: &str) -> Vec<i32> {
    c.metadata
        .get(k)
        .and_then(|v| v.to_vec().ok())
        .map(|v| v.iter().filter_map(|x: &Value| x.to_i32().ok()).collect())
        .unwrap_or_default()
}

fn load_err(e: impl std::fmt::Display) -> EngineError {
    EngineError::Load(e.to_string())
}

fn gen_err(e: impl std::fmt::Display) -> EngineError {
    EngineError::Generate(e.to_string())
}

fn summarize(c: &gguf_file::Content) -> GgufInfo {
    let arch = md_string(c, "general.architecture").unwrap_or_else(|| "unknown".into());
    GgufInfo {
        context_length: md_u64(c, &format!("{arch}.context_length")),
        name: md_string(c, "general.name"),
        tensor_count: c.tensor_infos.len(),
        vocab_size: md_strings(c, "tokenizer.ggml.tokens").len(),
        file_type: md_u64(c, "general.file_type").map(|n| n as u32),
        chat_template: md_string(c, "tokenizer.chat_template"),
        parameters: c
            .tensor_infos
            .values()
            .map(|t| t.shape.elem_count() as u64)
            .sum(),
        architecture: arch,
    }
}

/// Read only the GGUF header + tensor directory (a few hundred KB) of `path`.
pub fn read_gguf_info(path: &Path) -> Result<GgufInfo, EngineError> {
    let mut r = BufReader::new(File::open(path).map_err(load_err)?);
    let c = gguf_file::Content::read(&mut r).map_err(load_err)?;
    Ok(summarize(&c))
}

fn build_tokenizer(c: &gguf_file::Content) -> Result<(BpeTokenizer, bool), EngineError> {
    let model = md_string(c, "tokenizer.ggml.model").unwrap_or_default();
    if model != "gpt2" {
        return Err(EngineError::Load(format!(
            "unsupported tokenizer `{model}` (the pure-Rust engine supports byte-level BPE `gpt2` vocabularies)"
        )));
    }
    let tokens = md_strings(c, "tokenizer.ggml.tokens");
    let merges = md_strings(c, "tokenizer.ggml.merges");
    let types = md_i32s(c, "tokenizer.ggml.token_type");
    let pre = PreTokenizer::from_gguf(md_string(c, "tokenizer.ggml.pre").as_deref());
    let bos = md_u64(c, "tokenizer.ggml.bos_token_id").map(|n| n as u32);
    let mut eos: Vec<u32> = md_u64(c, "tokenizer.ggml.eos_token_id")
        .map(|n| n as u32)
        .into_iter()
        .collect();
    let tok = BpeTokenizer::new(tokens, &merges, &types, pre, bos, vec![]).map_err(load_err)?;
    // Chat models end a turn with <|im_end|>/<|eot_id|>; base EOS is often <|endoftext|>.
    for name in ["<|im_end|>", "<|eot_id|>", "<|endoftext|>", "</s>"] {
        if let Some(id) = tok.token_id(name) {
            if !eos.contains(&id) {
                eos.push(id);
            }
        }
    }
    let mut tok = tok;
    tok.eos = eos;
    Ok((
        tok,
        md_bool(c, "tokenizer.ggml.add_bos_token").unwrap_or(false),
    ))
}

enum Weights {
    Llama(quantized_llama::ModelWeights),
    Qwen2(quantized_qwen2::ModelWeights),
}

impl Weights {
    fn forward(&mut self, x: &Tensor, pos: usize) -> candle_core::Result<Tensor> {
        match self {
            Self::Llama(m) => m.forward(x, pos),
            Self::Qwen2(m) => m.forward(x, pos),
        }
    }
}

struct Loaded {
    weights: Weights,
    tok: BpeTokenizer,
    add_bos: bool,
    device: Device,
    info: GgufInfo,
}

pub struct CandleEngine {
    loaded: Option<Loaded>,
    params: LoadParams,
}

impl CandleEngine {
    pub fn new() -> Self {
        Self {
            loaded: None,
            params: LoadParams::default(),
        }
    }

    /// Header facts of the currently loaded model.
    pub fn info(&self) -> Option<&GgufInfo> {
        self.loaded.as_ref().map(|l| &l.info)
    }

    /// Tokenize with the model's own vocabulary (exposed for token accounting and tests).
    pub fn tokenize(&self, text: &str) -> Result<Vec<u32>, EngineError> {
        let l = self.loaded.as_ref().ok_or(EngineError::NotLoaded)?;
        Ok(l.tok.encode(text, true))
    }
}

impl Default for CandleEngine {
    fn default() -> Self {
        Self::new()
    }
}

impl Engine for CandleEngine {
    fn load(&mut self, model: &Path, params: &LoadParams) -> Result<(), EngineError> {
        if !model.exists() {
            return Err(EngineError::Load(format!(
                "{} does not exist",
                model.display()
            )));
        }
        let device = Device::Cpu;
        let mut reader = BufReader::new(File::open(model).map_err(load_err)?);
        let content = gguf_file::Content::read(&mut reader).map_err(load_err)?;
        let info = summarize(&content);
        let (tok, add_bos) = build_tokenizer(&content)?;
        let weights = match info.architecture.as_str() {
            "llama" => Weights::Llama(
                quantized_llama::ModelWeights::from_gguf(content, &mut reader, &device)
                    .map_err(load_err)?,
            ),
            "qwen2" => Weights::Qwen2(
                quantized_qwen2::ModelWeights::from_gguf(content, &mut reader, &device)
                    .map_err(load_err)?,
            ),
            other => {
                return Err(EngineError::Load(format!(
                    "unsupported architecture `{other}` (supported: llama, qwen2)"
                )))
            }
        };
        self.loaded = Some(Loaded {
            weights,
            tok,
            add_bos,
            device,
            info,
        });
        self.params = params.clone();
        Ok(())
    }

    fn generate(
        &mut self,
        prompt: &str,
        sp: &SamplingParams,
        on_token: &mut dyn FnMut(&str) -> bool,
    ) -> Result<GenerationStats, EngineError> {
        let n_ctx = self.params.n_ctx.max(256) as usize;
        let l = self.loaded.as_mut().ok_or(EngineError::NotLoaded)?;

        let mut ids = Vec::new();
        if l.add_bos {
            ids.extend(l.tok.bos);
        }
        ids.extend(l.tok.encode(prompt, true));
        if ids.is_empty() {
            return Err(gen_err("empty prompt"));
        }
        // Keep the tail of an over-long prompt so there is always room to generate.
        let budget = n_ctx.saturating_sub(sp.max_tokens as usize).max(64);
        if ids.len() > budget {
            ids.drain(..ids.len() - budget);
        }
        let n_prompt = ids.len() as u32;

        let sampling = if sp.temperature <= 0.0 {
            Sampling::ArgMax
        } else {
            Sampling::TopKThenTopP {
                k: sp.top_k.max(1) as usize,
                p: f64::from(sp.top_p),
                temperature: f64::from(sp.temperature),
            }
        };
        let mut sampler = LogitsProcessor::from_sampling(299_792_458, sampling);

        let started = Instant::now();
        let input = Tensor::new(ids.as_slice(), &l.device)
            .and_then(|t| t.unsqueeze(0))
            .map_err(gen_err)?;
        let mut logits = l
            .weights
            .forward(&input, 0)
            .and_then(|t| t.squeeze(0))
            .map_err(gen_err)?;

        let mut history = ids;
        let mut pos = history.len();
        let mut produced = 0u32;
        let mut text = String::new();
        let mut utf8 = Utf8Stream::default();
        while produced < sp.max_tokens {
            let step_logits = if sp.repeat_penalty > 1.0 {
                let from = history.len().saturating_sub(64);
                candle_transformers::utils::apply_repeat_penalty(
                    &logits,
                    sp.repeat_penalty,
                    &history[from..],
                )
                .map_err(gen_err)?
            } else {
                logits.clone()
            };
            let next = sampler.sample(&step_logits).map_err(gen_err)?;
            if l.tok.is_eos(next) {
                break;
            }
            history.push(next);
            produced += 1;
            let piece = utf8.push(&l.tok.token_bytes(next));
            if !piece.is_empty() {
                text.push_str(&piece);
                if !on_token(&piece) {
                    break;
                }
                if sp
                    .stop
                    .iter()
                    .any(|s| !s.is_empty() && text.ends_with(s.as_str()))
                {
                    break;
                }
            }
            if pos >= n_ctx {
                break;
            }
            let input = Tensor::new(&[next], &l.device)
                .and_then(|t| t.unsqueeze(0))
                .map_err(gen_err)?;
            logits = l
                .weights
                .forward(&input, pos)
                .and_then(|t| t.squeeze(0))
                .map_err(gen_err)?;
            pos += 1;
        }
        let secs = started.elapsed().as_secs_f32().max(1e-3);
        Ok(GenerationStats {
            prompt_tokens: n_prompt,
            completion_tokens: produced,
            tokens_per_second: produced as f32 / secs,
        })
    }

    fn unload(&mut self) {
        self.loaded = None;
    }

    fn is_loaded(&self) -> bool {
        self.loaded.is_some()
    }
}
