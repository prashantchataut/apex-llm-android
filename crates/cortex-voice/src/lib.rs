//! cortex-voice — everything around on-device ASR that doesn't need ONNX:
//! the [`Transcriber`] seam, the installable model catalog, an energy VAD and a
//! Goertzel-based spectrum for the 60 fps waveform visualizer.
#![forbid(unsafe_code)]

use serde::{Deserialize, Serialize};
use std::f32::consts::PI;

pub const SAMPLE_RATE: u32 = 16_000;
/// 10 ms @ 16 kHz.
pub const FRAME: usize = 160;

#[derive(Debug, thiserror::Error)]
pub enum VoiceError {
    #[error("model not installed: {0}")]
    NotInstalled(String),
    #[error("backend: {0}")]
    Backend(String),
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Partial {
    pub text: String,
    pub is_final: bool,
}

/// Streaming recognizer. Feed 16 kHz mono f32 PCM in any chunk size.
pub trait Transcriber: Send {
    fn accept(&mut self, pcm: &[f32]) -> Result<Option<Partial>, VoiceError>;
    /// Flush and return the final transcript.
    fn finish(&mut self) -> Result<String, VoiceError>;
    fn reset(&mut self);
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct VoiceModel {
    pub id: &'static str,
    pub name: &'static str,
    pub family: &'static str,
    /// Approximate on-disk size of the INT8 bundle.
    pub approx_mb: u32,
    pub languages: &'static str,
    /// `false` until sizes + URLs are checked against the upstream release (Session 2 TODO).
    pub verified: bool,
}

/// Installable ASR models (UNVERIFIED sizes — see ARCHITECTURE.md §Voice).
pub const CATALOG: &[VoiceModel] = &[
    VoiceModel {
        id: "moonshine-tiny-int8",
        name: "Moonshine Tiny",
        family: "Moonshine",
        approx_mb: 27,
        languages: "en",
        verified: false,
    },
    VoiceModel {
        id: "whisper-tiny-int8",
        name: "Whisper Tiny",
        family: "Whisper",
        approx_mb: 40,
        languages: "multi",
        verified: false,
    },
    VoiceModel {
        id: "parakeet-ctc-int8",
        name: "Parakeet CTC (small)",
        family: "Parakeet",
        approx_mb: 25,
        languages: "en",
        verified: false,
    },
];

/// Energy VAD with hangover; operates on 10 ms frames.
#[derive(Debug, Clone)]
pub struct Vad {
    pub threshold: f32,
    pub hangover_frames: u32,
    left: u32,
}

impl Vad {
    pub fn new(threshold: f32, hangover_ms: u32) -> Self {
        Self {
            threshold,
            hangover_frames: hangover_ms / 10,
            left: 0,
        }
    }
    pub fn is_speech(&mut self, frame: &[f32]) -> bool {
        let rms = rms(frame);
        if rms >= self.threshold {
            self.left = self.hangover_frames;
            true
        } else if self.left > 0 {
            self.left -= 1;
            true
        } else {
            false
        }
    }
}

pub fn rms(x: &[f32]) -> f32 {
    if x.is_empty() {
        return 0.0;
    }
    (x.iter().map(|s| s * s).sum::<f32>() / x.len() as f32).sqrt()
}

pub fn pcm16_to_f32(pcm: &[i16]) -> Vec<f32> {
    pcm.iter().map(|&s| s as f32 / 32768.0).collect()
}

fn goertzel_power(x: &[f32], freq: f32) -> f32 {
    let w = 2.0 * PI * freq / SAMPLE_RATE as f32;
    let coeff = 2.0 * w.cos();
    let (mut s1, mut s2) = (0.0f32, 0.0f32);
    for (n, &v) in x.iter().enumerate() {
        // Hann window
        let win = 0.5 - 0.5 * (2.0 * PI * n as f32 / (x.len().max(2) - 1) as f32).cos();
        let s = v * win + coeff * s1 - s2;
        s2 = s1;
        s1 = s;
    }
    let n = x.len().max(1) as f32;
    (s1 * s1 + s2 * s2 - coeff * s1 * s2).max(0.0) / (n * n)
}

/// `bins` log-spaced bands 80 Hz … 7 kHz, each normalised to 0..=1 (dB-scaled).
/// Call at 60 Hz with the latest ≥ 256 samples.
pub fn spectrum_bins(x: &[f32], bins: usize) -> Vec<f32> {
    let (lo, hi) = (80.0f32, 7000.0f32);
    (0..bins)
        .map(|i| {
            let t = (i as f32 + 0.5) / bins as f32;
            let f = lo * (hi / lo).powf(t);
            let db = 10.0 * (goertzel_power(x, f) + 1e-10).log10(); // ≈ -100 … 0
            ((db + 70.0) / 70.0).clamp(0.0, 1.0)
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sine(freq: f32, n: usize) -> Vec<f32> {
        (0..n)
            .map(|i| 0.8 * (2.0 * PI * freq * i as f32 / SAMPLE_RATE as f32).sin())
            .collect()
    }

    #[test]
    fn catalog_is_in_target_size_class() {
        assert!(CATALOG.iter().all(|m| (16..=60).contains(&m.approx_mb)));
        assert!(
            CATALOG.iter().all(|m| !m.verified),
            "flip verified only after checking upstream"
        );
    }

    #[test]
    fn vad_has_hangover() {
        let mut v = Vad::new(0.05, 30);
        let loud = vec![0.5; FRAME];
        let quiet = vec![0.0; FRAME];
        assert!(v.is_speech(&loud));
        assert!(v.is_speech(&quiet) && v.is_speech(&quiet) && v.is_speech(&quiet));
        assert!(!v.is_speech(&quiet));
    }

    #[test]
    fn spectrum_peaks_near_tone() {
        let bins = spectrum_bins(&sine(1000.0, 512), 32);
        let (peak, _) = bins
            .iter()
            .enumerate()
            .max_by(|a, b| a.1.partial_cmp(b.1).unwrap())
            .unwrap();
        // 1 kHz sits at t = ln(1000/80)/ln(7000/80) ≈ 0.565 → bin ≈ 18
        assert!((16..=20).contains(&peak), "peak bin was {peak}");
        assert!(bins.iter().all(|b| (0.0..=1.0).contains(b)));
    }
}
