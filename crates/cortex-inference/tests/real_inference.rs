//! Runs a REAL llama.cpp model. Skipped unless `APEX_TEST_GGUF` points at a .gguf file.
//! `APEX_TEST_GGUF=/path/model.gguf cargo test -p cortex-inference --features llama -- --nocapture`
#![cfg(feature = "llama")]
use cortex_inference::llama_engine::LlamaEngine;
use cortex_inference::{Engine, LoadParams, SamplingParams};
use std::path::PathBuf;

#[test]
fn real_model_generates_tokens() {
    let Ok(p) = std::env::var("APEX_TEST_GGUF") else {
        eprintln!("APEX_TEST_GGUF not set; skipping");
        return;
    };
    let mut e = LlamaEngine::new();
    e.load(&PathBuf::from(p), &LoadParams { n_ctx: 512, n_threads: 4, n_gpu_layers: 0, use_mmap: true }).unwrap();
    assert!(e.is_loaded());
    let mut out = String::new();
    let sp = SamplingParams { temperature: 0.0, max_tokens: 24, ..Default::default() };
    let stats = e
        .generate("The capital of France is", &sp, &mut |t| {
            out.push_str(t);
            true
        })
        .unwrap();
    eprintln!("OUTPUT: {out:?}\nSTATS: {stats:?}");
    assert!(stats.completion_tokens > 0);
    assert!(!out.trim().is_empty());
    e.unload();
    assert!(!e.is_loaded());
}
