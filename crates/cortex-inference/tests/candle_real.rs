//! Runs REAL quantized weights through the pure-Rust candle engine. Skipped unless `APEX_TEST_GGUF` is set.
//! `APEX_TEST_GGUF=/path/model.gguf cargo test -p cortex-inference --features candle --release -- --nocapture`
#![cfg(feature = "candle")]
use cortex_inference::candle_engine::{read_gguf_info, CandleEngine};
use cortex_inference::template::{ChatTemplate, Message};
use cortex_inference::{Engine, LoadParams, SamplingParams};
use std::path::PathBuf;

#[test]
fn real_weights_generate_real_tokens() {
    let Ok(p) = std::env::var("APEX_TEST_GGUF") else {
        eprintln!("APEX_TEST_GGUF not set; skipping");
        return;
    };
    let path = PathBuf::from(p);
    let info = read_gguf_info(&path).unwrap();
    eprintln!("header: {info:?}");
    assert!(info.tensor_count > 10 && info.vocab_size > 1000);

    let mut e = CandleEngine::new();
    e.load(
        &path,
        &LoadParams {
            n_ctx: 512,
            ..Default::default()
        },
    )
    .unwrap();
    assert!(e.is_loaded());

    let prompt = ChatTemplate::ChatMl.render(&[Message {
        role: "user".into(),
        content: "What is the capital of France? Answer in one short sentence.".into(),
    }]);
    let mut out = String::new();
    let sp = SamplingParams {
        temperature: 0.0,
        max_tokens: 24,
        ..Default::default()
    };
    let stats = e
        .generate(&prompt, &sp, &mut |t| {
            out.push_str(t);
            true
        })
        .unwrap();
    eprintln!("OUTPUT: {out:?}\nSTATS: {stats:?}");
    assert!(stats.completion_tokens > 3, "no tokens generated");
    assert!(
        out.to_lowercase().contains("paris"),
        "expected a coherent answer, got {out:?}"
    );
}
