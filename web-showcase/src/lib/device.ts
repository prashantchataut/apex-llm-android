import { DEVICES, type DeviceProfile } from "./compat";
import { invokeNative } from "./native";

/** Shape of `cortex_hardware::DeviceCapabilityProfile` as serialised by serde (only the fields we read). */
interface NativeProfile {
  total_ram_bytes: number;
  available_ram_bytes: number;
  free_storage_bytes: number;
  cpu: { logical_cores: number; dotprod: boolean };
  vulkan: { supported: boolean };
  npu_available: boolean;
  soc_model?: string | null;
}

export interface DetectedDevice {
  profile: DeviceProfile;
  /** "native" = Rust profiler, "browser" = navigator heuristics, "preset" = fallback. */
  source: "native" | "browser" | "preset";
}

const GIB = 1024 ** 3;

/** Real profile inside Tauri; navigator heuristics in a browser (deviceMemory is capped at 8 and rounded). */
export async function detectDevice(): Promise<DetectedDevice> {
  const native = await invokeNative<NativeProfile>("device_profile");
  if (native && native.total_ram_bytes > 0) {
    const total = native.total_ram_bytes / GIB;
    return {
      source: "native",
      profile: {
        label: native.soc_model ?? "This phone",
        totalGB: total,
        availGB: native.available_ram_bytes / GIB,
        freeStorageGB: native.free_storage_bytes ? native.free_storage_bytes / GIB : 32,
        vulkan: native.vulkan.supported,
        dotprod: native.cpu.dotprod,
        cores: native.cpu.logical_cores,
        npu: native.npu_available,
        speed: total >= 11 ? 1.9 : total >= 6 ? 1 : 0.4,
      },
    };
  }
  if (typeof navigator !== "undefined") {
    const nav = navigator as Navigator & { deviceMemory?: number };
    if (nav.deviceMemory) {
      const mem = nav.deviceMemory;
      const base = mem >= 8 ? DEVICES[1] : DEVICES[0];
      return {
        source: "browser",
        profile: { ...base, label: "This device", totalGB: mem, availGB: Math.max(1.5, mem * 0.58), cores: navigator.hardwareConcurrency || base.cores },
      };
    }
  }
  return { source: "preset", profile: { ...DEVICES[1], label: "Typical 8 GB phone" } };
}
