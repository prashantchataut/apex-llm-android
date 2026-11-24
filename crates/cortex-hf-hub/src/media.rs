//! Image and video model catalog + device scoring.
//!
//! The TypeScript mirror lives in `web-showcase/src/lib/media.ts` — keep both in sync.
//! `size_gb` is the primary file size read from the Hugging Face tree API on 2026-11-24.
//! `companion_gb`, `peak_ram_gb` and `eta_sec` are ESTIMATES (UNVERIFIED).

use crate::scoring::Compatibility;
use cortex_hardware::{DeviceCapabilityProfile, GIB};
use serde::{Deserialize, Serialize};

const OS_RESERVE: f64 = 1.2 * GIB as f64;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MediaKind {
    Image,
    Video,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum MediaEngine {
    /// stable-diffusion.cpp (CPU / Vulkan), GGUF weights.
    SdCpp,
    /// Alibaba MNN CPU runtime.
    Mnn,
    /// Qualcomm QNN (Hexagon NPU).
    Qnn,
}

#[derive(Debug, Clone, Copy, Serialize)]
pub struct MediaModelSpec {
    pub id: &'static str,
    pub kind: MediaKind,
    pub name: &'static str,
    pub repo: &'static str,
    pub file: &'static str,
    pub size_gb: f64,
    pub companion_gb: f64,
    pub engine: MediaEngine,
    pub needs_npu: bool,
    pub peak_ram_gb: f64,
    pub eta_sec: u32,
    pub quality: u8,
}

pub const MEDIA_CATALOG: &[MediaModelSpec] = &[
    MediaModelSpec {
        id: "sd-turbo-q8",
        kind: MediaKind::Image,
        name: "SD-Turbo",
        repo: "Green-Sky/SD-Turbo-GGUF",
        file: "sd_turbo-f16-q8_0.gguf",
        size_gb: 2.02,
        companion_gb: 0.0,
        engine: MediaEngine::SdCpp,
        needs_npu: false,
        peak_ram_gb: 3.1,
        eta_sec: 22,
        quality: 2,
    },
    MediaModelSpec {
        id: "sd15-q4",
        kind: MediaKind::Image,
        name: "Stable Diffusion 1.5",
        repo: "second-state/stable-diffusion-v1-5-GGUF",
        file: "stable-diffusion-v1-5-pruned-emaonly-Q4_0.gguf",
        size_gb: 1.57,
        companion_gb: 0.0,
        engine: MediaEngine::SdCpp,
        needs_npu: false,
        peak_ram_gb: 2.6,
        eta_sec: 150,
        quality: 2,
    },
    MediaModelSpec {
        id: "sd15-mnn",
        kind: MediaKind::Image,
        name: "AbsoluteReality (MNN)",
        repo: "xororz/sd-mnn",
        file: "AbsoluteReality.zip",
        size_gb: 1.19,
        companion_gb: 0.0,
        engine: MediaEngine::Mnn,
        needs_npu: false,
        peak_ram_gb: 2.0,
        eta_sec: 70,
        quality: 3,
    },
    MediaModelSpec {
        id: "sd15-qnn",
        kind: MediaKind::Image,
        name: "AbsoluteReality (NPU)",
        repo: "xororz/sd-qnn",
        file: "AbsoluteReality_qnn2.28_8gen2.zip",
        size_gb: 1.05,
        companion_gb: 0.0,
        engine: MediaEngine::Qnn,
        needs_npu: true,
        peak_ram_gb: 2.2,
        eta_sec: 6,
        quality: 3,
    },
    MediaModelSpec {
        id: "sdxl-turbo-q8",
        kind: MediaKind::Image,
        name: "SDXL-Turbo",
        repo: "OlegSkutte/sdxl-turbo-GGUF",
        file: "sd_xl_turbo_1.0.q8_0.gguf",
        size_gb: 4.1,
        companion_gb: 0.0,
        engine: MediaEngine::SdCpp,
        needs_npu: false,
        peak_ram_gb: 6.0,
        eta_sec: 95,
        quality: 4,
    },
    MediaModelSpec {
        id: "flux-schnell-q3k",
        kind: MediaKind::Image,
        name: "FLUX.1 schnell",
        repo: "leejet/FLUX.1-schnell-gguf",
        file: "flux1-schnell-q3_k.gguf",
        size_gb: 5.31,
        companion_gb: 3.5,
        engine: MediaEngine::SdCpp,
        needs_npu: false,
        peak_ram_gb: 10.0,
        eta_sec: 620,
        quality: 5,
    },
    MediaModelSpec {
        id: "wan21-13b-q4km",
        kind: MediaKind::Video,
        name: "Wan 2.1 1.3B",
        repo: "samuelchristlie/Wan2.1-T2V-1.3B-GGUF",
        file: "Wan2.1-T2V-1.3B-Q4_K_M.gguf",
        size_gb: 0.98,
        companion_gb: 3.65,
        engine: MediaEngine::SdCpp,
        needs_npu: false,
        peak_ram_gb: 6.0,
        eta_sec: 1500,
        quality: 3,
    },
    MediaModelSpec {
        id: "ltxv-2b-q4km",
        kind: MediaKind::Video,
        name: "LTX-Video 2B distilled",
        repo: "city96/LTX-Video-0.9.6-distilled-gguf",
        file: "ltxv-2b-0.9.6-distilled-04-25-Q4_K_M.gguf",
        size_gb: 1.33,
        companion_gb: 5.39,
        engine: MediaEngine::SdCpp,
        needs_npu: false,
        peak_ram_gb: 6.8,
        eta_sec: 720,
        quality: 4,
    },
];

impl MediaModelSpec {
    pub fn total_gb(&self) -> f64 {
        self.size_gb + self.companion_gb
    }
}

/// Diffusion does not share RAM with a loaded LLM, so it may use more of free memory than text models.
pub fn media_budget_bytes(p: &DeviceCapabilityProfile) -> f64 {
    let total = p.total_ram_bytes as f64;
    let avail = p.available_ram_bytes as f64;
    (0.7 * avail)
        .min(0.6 * total)
        .min(avail - OS_RESERVE)
        .max(0.0)
}

pub fn score_media(p: &DeviceCapabilityProfile, m: &MediaModelSpec) -> Compatibility {
    if m.needs_npu && !p.npu_available {
        return Compatibility::Incompatible;
    }
    let gib = GIB as f64;
    if p.free_storage_bytes != 0 && m.total_gb() * gib + gib > p.free_storage_bytes as f64 {
        return Compatibility::Incompatible;
    }
    let need = m.peak_ram_gb * gib;
    if need <= media_budget_bytes(p) {
        Compatibility::Optimal
    } else if need <= p.available_ram_bytes as f64 * 0.9 {
        Compatibility::Heavy
    } else {
        Compatibility::Incompatible
    }
}

/// Highest-quality model of `kind` that fits: prefers Optimal, falls back to Heavy.
pub fn best_media(p: &DeviceCapabilityProfile, kind: MediaKind) -> Option<&'static MediaModelSpec> {
    let pick = |c: Compatibility| {
        MEDIA_CATALOG
            .iter()
            .filter(|m| m.kind == kind && score_media(p, m) == c)
            .max_by(|a, b| a.quality.cmp(&b.quality).then(b.eta_sec.cmp(&a.eta_sec)))
    };
    pick(Compatibility::Optimal).or_else(|| pick(Compatibility::Heavy))
}

#[cfg(test)]
mod tests {
    use super::*;
    use cortex_hardware::*;

    fn device(total_gib: f64, avail_gib: f64, npu: bool) -> DeviceCapabilityProfile {
        let mem = MemInfo {
            total_bytes: (total_gib * GIB as f64) as u64,
            available_bytes: (avail_gib * GIB as f64) as u64,
        };
        let cpu = CpuFeatures {
            logical_cores: 8,
            dotprod: true,
            fp16: true,
            i8mm: false,
            sve: false,
        };
        let vk = VulkanInfo {
            supported: true,
            api_version: None,
        };
        DeviceCapabilityProfile {
            total_ram_bytes: mem.total_bytes,
            available_ram_bytes: mem.available_bytes,
            free_storage_bytes: 100 * GIB,
            soc_model: None,
            soc_tier: soc_tier(mem.total_bytes, &cpu),
            recommendation: recommend(&mem, &cpu, &vk),
            cpu,
            vulkan: vk,
            npu_available: npu,
        }
    }

    fn spec(id: &str) -> &'static MediaModelSpec {
        MEDIA_CATALOG
            .iter()
            .find(|m| m.id == id)
            .expect("catalog entry")
    }

    #[test]
    fn mid_phone_runs_small_image_models_only() {
        let p = device(7.63, 4.6, false);
        assert_eq!(score_media(&p, spec("sd15-q4")), Compatibility::Optimal);
        assert_eq!(
            score_media(&p, spec("sdxl-turbo-q8")),
            Compatibility::Incompatible
        );
        assert_eq!(
            score_media(&p, spec("flux-schnell-q3k")),
            Compatibility::Incompatible
        );
    }

    #[test]
    fn npu_model_needs_an_npu() {
        assert_eq!(
            score_media(&device(7.63, 4.6, false), spec("sd15-qnn")),
            Compatibility::Incompatible
        );
        assert_eq!(
            score_media(&device(11.4, 7.8, true), spec("sd15-qnn")),
            Compatibility::Optimal
        );
    }

    #[test]
    fn flagship_can_run_video_but_heavy() {
        let p = device(11.4, 7.8, true);
        assert_eq!(
            score_media(&p, spec("wan21-13b-q4km")),
            Compatibility::Heavy
        );
        assert!(best_media(&p, MediaKind::Video).is_some());
    }

    #[test]
    fn four_gb_phone_gets_no_video() {
        assert!(best_media(&device(4.0, 1.9, false), MediaKind::Video).is_none());
    }

    #[test]
    fn catalog_ids_are_unique() {
        let mut ids: Vec<_> = MEDIA_CATALOG.iter().map(|m| m.id).collect();
        ids.sort_unstable();
        ids.dedup();
        assert_eq!(ids.len(), MEDIA_CATALOG.len());
    }
}
