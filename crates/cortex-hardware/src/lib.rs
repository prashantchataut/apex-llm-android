//! cortex-hardware — reads /proc + Android props, outputs a deterministic
//! [`DeviceCapabilityProfile`]. All IO goes through [`SystemSource`] so the
//! profile is reproducible in unit tests and desktop CI.
#![forbid(unsafe_code)]

use serde::{Deserialize, Serialize};

pub const GIB: u64 = 1024 * 1024 * 1024;
/// RAM we never hand to the model (OS + WebView + app heap).
pub const OS_RESERVE_BYTES: u64 = (1.2 * GIB as f64) as u64;

// ───────────────────────── parsing ─────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
pub struct MemInfo {
    pub total_bytes: u64,
    pub available_bytes: u64,
}

/// Parse `/proc/meminfo` (values are in kB).
pub fn parse_meminfo(s: &str) -> MemInfo {
    let mut m = MemInfo::default();
    let mut free = 0u64;
    let mut cached = 0u64;
    let mut have_avail = false;
    for line in s.lines() {
        let mut it = line.split_whitespace();
        let (Some(key), Some(val)) = (it.next(), it.next()) else {
            continue;
        };
        let Ok(kb) = val.parse::<u64>() else { continue };
        match key {
            "MemTotal:" => m.total_bytes = kb * 1024,
            "MemAvailable:" => {
                m.available_bytes = kb * 1024;
                have_avail = true;
            }
            "MemFree:" => free = kb * 1024,
            "Cached:" => cached = kb * 1024,
            _ => {}
        }
    }
    if !have_avail {
        m.available_bytes = free + cached; // old kernels
    }
    m
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
pub struct CpuFeatures {
    pub logical_cores: usize,
    pub dotprod: bool,
    pub fp16: bool,
    pub i8mm: bool,
    pub sve: bool,
}

impl CpuFeatures {
    /// Mirrors PocketLLM's rule: only load the optimised build if DotProd *and* FP16.
    pub fn cpu_variant(&self) -> &'static str {
        if self.dotprod && self.fp16 {
            "armv8.2-a+dotprod+fp16"
        } else {
            "armv8-a"
        }
    }
}

/// Parse `/proc/cpuinfo` (arm64 `Features` line + `processor` count).
pub fn parse_cpuinfo(s: &str) -> CpuFeatures {
    let mut f = CpuFeatures::default();
    for line in s.lines() {
        if line.starts_with("processor") {
            f.logical_cores += 1;
        } else if line.starts_with("Features") {
            let feats: Vec<&str> = line
                .split(':')
                .nth(1)
                .unwrap_or("")
                .split_whitespace()
                .collect();
            let has = |n: &str| feats.contains(&n);
            f.dotprod |= has("asimddp");
            f.fp16 |= has("fphp") || has("asimdhp");
            f.i8mm |= has("i8mm");
            f.sve |= has("sve") || has("sve2");
        }
    }
    f
}

// ───────────────────────── tiers & quants ─────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum SocTier {
    Flagship,
    High,
    Mid,
    Entry,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Quant {
    Q3KM,
    IQ4XS,
    Q4KM,
    Q5KM,
    Q6K,
}

impl Quant {
    pub fn as_str(&self) -> &'static str {
        match self {
            Quant::Q3KM => "Q3_K_M",
            Quant::IQ4XS => "IQ4_XS",
            Quant::Q4KM => "Q4_K_M",
            Quant::Q5KM => "Q5_K_M",
            Quant::Q6K => "Q6_K",
        }
    }
    /// Approx. bits per weight — used for size/RAM estimates.
    pub fn bits_per_weight(&self) -> f32 {
        match self {
            Quant::Q3KM => 3.9,
            Quant::IQ4XS => 4.3,
            Quant::Q4KM => 4.85,
            Quant::Q5KM => 5.7,
            Quant::Q6K => 6.6,
        }
    }
    pub fn parse(name: &str) -> Option<Quant> {
        let n = name.to_ascii_uppercase().replace('-', "_");
        if n.contains("Q4_K_M") {
            Some(Quant::Q4KM)
        } else if n.contains("Q5_K_M") {
            Some(Quant::Q5KM)
        } else if n.contains("IQ4_XS") {
            Some(Quant::IQ4XS)
        } else if n.contains("Q3_K_M") {
            Some(Quant::Q3KM)
        } else if n.contains("Q6_K") {
            Some(Quant::Q6K)
        } else {
            None
        }
    }
}

// ───────────────────────── system source ─────────────────────────

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
pub struct VulkanInfo {
    pub supported: bool,
    pub api_version: Option<String>,
}

pub trait SystemSource {
    fn read(&self, path: &str) -> Option<String>;
    /// Android system property (`getprop`).
    fn prop(&self, key: &str) -> Option<String>;
    fn vulkan(&self) -> VulkanInfo;
    fn free_storage_bytes(&self) -> u64;
}

/// Real implementation (Linux / Android). JNI-only data (thermal status) is
/// injected by the Tauri layer, not read here.
pub struct LinuxSource {
    pub data_dir: String,
}

impl SystemSource for LinuxSource {
    fn read(&self, path: &str) -> Option<String> {
        std::fs::read_to_string(path).ok()
    }
    fn prop(&self, key: &str) -> Option<String> {
        let out = std::process::Command::new("getprop")
            .arg(key)
            .output()
            .ok()?;
        let s = String::from_utf8(out.stdout).ok()?.trim().to_string();
        (!s.is_empty()).then_some(s)
    }
    fn vulkan(&self) -> VulkanInfo {
        let libs = [
            "/system/lib64/libvulkan.so",
            "/vendor/lib64/libvulkan.so",
            "/usr/lib/libvulkan.so.1",
        ];
        let supported = libs.iter().any(|p| std::path::Path::new(p).exists());
        VulkanInfo {
            supported,
            api_version: self.prop("ro.hwui.use_vulkan").filter(|_| supported),
        }
    }
    fn free_storage_bytes(&self) -> u64 {
        // `df -k <dir>` — avoids libc/unsafe. Column 4 = available (kB).
        let Ok(out) = std::process::Command::new("df")
            .args(["-k", &self.data_dir])
            .output()
        else {
            return 0;
        };
        let text = String::from_utf8_lossy(&out.stdout);
        text.lines()
            .nth(1)
            .and_then(|l| l.split_whitespace().nth(3))
            .and_then(|v| v.parse::<u64>().ok())
            .map(|kb| kb * 1024)
            .unwrap_or(0)
    }
}

// ───────────────────────── profile ─────────────────────────

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Recommendation {
    /// Bytes the model weights + KV cache may occupy.
    pub model_budget_bytes: u64,
    pub max_gguf_bytes: u64,
    pub quant: Quant,
    pub max_ctx: u32,
    /// Performance-core thread count (never all cores).
    pub threads: u32,
    pub cpu_variant: String,
    pub gpu_offload: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DeviceCapabilityProfile {
    pub total_ram_bytes: u64,
    pub available_ram_bytes: u64,
    pub free_storage_bytes: u64,
    pub soc_model: Option<String>,
    pub soc_tier: SocTier,
    pub cpu: CpuFeatures,
    pub vulkan: VulkanInfo,
    /// NPU delegates require a vendor SDK; reported `false` until a delegate is wired.
    pub npu_available: bool,
    pub recommendation: Recommendation,
}

pub fn soc_tier(total_bytes: u64, cpu: &CpuFeatures) -> SocTier {
    let gb = total_bytes as f64 / GIB as f64;
    if gb >= 11.0 && (cpu.i8mm || cpu.sve) {
        SocTier::Flagship
    } else if gb >= 7.5 && cpu.dotprod {
        SocTier::High
    } else if gb >= 5.5 {
        SocTier::Mid
    } else {
        SocTier::Entry
    }
}

/// Memory/thermal rules distilled in `.agent/ARCHITECTURE.md` §3.
pub fn recommend(mem: &MemInfo, cpu: &CpuFeatures, vk: &VulkanInfo) -> Recommendation {
    let avail = mem.available_bytes as f64;
    let total = mem.total_bytes as f64;
    let budget = (0.55 * avail)
        .min(0.45 * total)
        .min(mem.available_bytes.saturating_sub(OS_RESERVE_BYTES) as f64)
        .max(0.0) as u64;
    let total_gb = total / GIB as f64;
    let quant = if budget >= 6 * GIB && total_gb >= 11.0 {
        Quant::Q5KM
    } else if total_gb >= 5.5 {
        Quant::Q4KM
    } else if total_gb >= 3.5 {
        Quant::IQ4XS
    } else {
        Quant::Q3KM
    };
    let max_ctx = match budget {
        b if b >= 4 * GIB => 8192,
        b if b >= 5 * GIB / 2 => 4096,
        b if b >= 3 * GIB / 2 => 2048,
        _ => 1024,
    };
    let threads = (cpu.logical_cores.max(2).div_ceil(2) as u32).clamp(2, 6);
    Recommendation {
        model_budget_bytes: budget,
        // leave 12% for KV cache + activations
        max_gguf_bytes: (budget as f64 * 0.88) as u64,
        quant,
        max_ctx,
        threads,
        cpu_variant: cpu.cpu_variant().to_string(),
        gpu_offload: vk.supported,
    }
}

pub fn profile(src: &dyn SystemSource) -> DeviceCapabilityProfile {
    let mem = parse_meminfo(&src.read("/proc/meminfo").unwrap_or_default());
    let cpu = parse_cpuinfo(&src.read("/proc/cpuinfo").unwrap_or_default());
    let vulkan = src.vulkan();
    let soc_model = src
        .prop("ro.soc.model")
        .or_else(|| src.prop("ro.board.platform"));
    DeviceCapabilityProfile {
        total_ram_bytes: mem.total_bytes,
        available_ram_bytes: mem.available_bytes,
        free_storage_bytes: src.free_storage_bytes(),
        soc_model,
        soc_tier: soc_tier(mem.total_bytes, &cpu),
        recommendation: recommend(&mem, &cpu, &vulkan),
        cpu,
        vulkan,
        npu_available: false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const MEM: &str = "MemTotal:        8000000 kB\nMemFree:          300000 kB\nMemAvailable:    4800000 kB\nCached:          2000000 kB\n";
    const CPU: &str = "processor\t: 0\nFeatures\t: fp asimd evtstrm aes fphp asimdhp asimddp i8mm\nprocessor\t: 1\nprocessor\t: 2\nprocessor\t: 3\nprocessor\t: 4\nprocessor\t: 5\nprocessor\t: 6\nprocessor\t: 7\n";

    struct Fake;
    impl SystemSource for Fake {
        fn read(&self, p: &str) -> Option<String> {
            match p {
                "/proc/meminfo" => Some(MEM.into()),
                "/proc/cpuinfo" => Some(CPU.into()),
                _ => None,
            }
        }
        fn prop(&self, k: &str) -> Option<String> {
            (k == "ro.soc.model").then(|| "SM8550".into())
        }
        fn vulkan(&self) -> VulkanInfo {
            VulkanInfo {
                supported: true,
                api_version: Some("1.3".into()),
            }
        }
        fn free_storage_bytes(&self) -> u64 {
            50 * GIB
        }
    }

    #[test]
    fn meminfo_parses() {
        let m = parse_meminfo(MEM);
        assert_eq!(m.total_bytes, 8_000_000 * 1024);
        assert_eq!(m.available_bytes, 4_800_000 * 1024);
    }

    #[test]
    fn cpu_parses_features() {
        let c = parse_cpuinfo(CPU);
        assert_eq!(c.logical_cores, 8);
        assert!(c.dotprod && c.fp16 && c.i8mm);
        assert_eq!(c.cpu_variant(), "armv8.2-a+dotprod+fp16");
    }

    #[test]
    fn profile_is_deterministic_and_sane() {
        let p = profile(&Fake);
        assert_eq!(p, profile(&Fake));
        assert_eq!(p.soc_tier, SocTier::High);
        assert_eq!(p.recommendation.quant, Quant::Q4KM);
        assert_eq!(p.recommendation.threads, 4);
        assert!(p.recommendation.gpu_offload);
        assert!(p.recommendation.max_gguf_bytes < p.recommendation.model_budget_bytes);
    }

    #[test]
    fn low_ram_gets_small_quant() {
        let mem = MemInfo {
            total_bytes: 3 * GIB,
            available_bytes: GIB,
        };
        let r = recommend(&mem, &CpuFeatures::default(), &VulkanInfo::default());
        assert_eq!(r.quant, Quant::Q3KM);
        assert_eq!(r.model_budget_bytes, 0);
    }

    #[test]
    fn quant_parse_from_filenames() {
        assert_eq!(
            Quant::parse("qwen2.5-3b-instruct-q4_k_m.gguf"),
            Some(Quant::Q4KM)
        );
        assert_eq!(Quant::parse("Model-IQ4_XS.gguf"), Some(Quant::IQ4XS));
        assert_eq!(Quant::parse("model.safetensors"), None);
    }
}
