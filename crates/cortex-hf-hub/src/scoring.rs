//! Badge a GGUF file against a [`DeviceCapabilityProfile`].
//! The TypeScript mirror lives in `web-showcase/src/lib/compat.ts` — keep both in sync.

use cortex_hardware::DeviceCapabilityProfile;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Compatibility {
    /// ⚡ Optimal for Your Phone
    Optimal,
    /// ⚠️ Heavy (High RAM)
    Heavy,
    /// ❌ Incompatible
    Incompatible,
}

impl Compatibility {
    pub fn badge(&self) -> &'static str {
        match self {
            Compatibility::Optimal => "⚡ Optimal for Your Phone",
            Compatibility::Heavy => "⚠️ Heavy (High RAM)",
            Compatibility::Incompatible => "❌ Incompatible",
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub struct ScoreInput {
    pub file_bytes: u64,
    /// KV-cache estimate for the context we'd run (bytes). Use [`kv_cache_bytes`].
    pub kv_bytes: u64,
}

/// `2 · layers · ctx · kv_heads · head_dim · bytes_per_elem` (f16 = 2 bytes).
pub fn kv_cache_bytes(layers: u64, ctx: u64, kv_heads: u64, head_dim: u64, bytes_per_elem: u64) -> u64 {
    2 * layers * ctx * kv_heads * head_dim * bytes_per_elem
}

pub fn score(p: &DeviceCapabilityProfile, i: ScoreInput) -> Compatibility {
    let need = (i.file_bytes as f64 * 1.05) as u64 + i.kv_bytes; // 5% mmap/activation overhead
    // Not enough disk (keep 1 GiB headroom) → can't even install.
    if p.free_storage_bytes != 0 && i.file_bytes + (1u64 << 30) > p.free_storage_bytes {
        return Compatibility::Incompatible;
    }
    if need <= p.recommendation.model_budget_bytes {
        Compatibility::Optimal
    } else if need as f64 <= p.available_ram_bytes as f64 * 0.85 {
        Compatibility::Heavy
    } else {
        Compatibility::Incompatible
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use cortex_hardware::*;

    fn phone() -> DeviceCapabilityProfile {
        let mem = MemInfo { total_bytes: 8 * GIB, available_bytes: 5 * GIB };
        let cpu = CpuFeatures { logical_cores: 8, dotprod: true, fp16: true, i8mm: false, sve: false };
        let vk = VulkanInfo { supported: true, api_version: None };
        DeviceCapabilityProfile {
            total_ram_bytes: mem.total_bytes,
            available_ram_bytes: mem.available_bytes,
            free_storage_bytes: 40 * GIB,
            soc_model: None,
            soc_tier: soc_tier(mem.total_bytes, &cpu),
            recommendation: recommend(&mem, &cpu, &vk),
            cpu,
            vulkan: vk,
            npu_available: false,
        }
    }

    #[test]
    fn three_tier_badges() {
        let p = phone(); // budget = min(2.75, 3.6, 3.8) = 2.75 GiB
        let kv = 200 * 1024 * 1024;
        assert_eq!(score(&p, ScoreInput { file_bytes: 2 * GIB, kv_bytes: kv }), Compatibility::Optimal);
        assert_eq!(score(&p, ScoreInput { file_bytes: 3 * GIB, kv_bytes: kv }), Compatibility::Heavy);
        assert_eq!(score(&p, ScoreInput { file_bytes: 5 * GIB, kv_bytes: kv }), Compatibility::Incompatible);
    }

    #[test]
    fn disk_full_is_incompatible() {
        let mut p = phone();
        p.free_storage_bytes = GIB;
        assert_eq!(score(&p, ScoreInput { file_bytes: GIB / 2, kv_bytes: 0 }), Compatibility::Incompatible);
    }
}
