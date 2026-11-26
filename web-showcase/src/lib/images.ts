"use client";

import { useSyncExternalStore } from "react";
import { getAccess } from "./access";

/** Apex API image generation (endpoint + engines come from the decrypted catalog). The URL itself is the result — deterministic per seed. */
export interface ImageEngine {
  id: string;
  label: string;
  sub: string;
  api: string;
  /** Registry slot for a future on-device diffusion engine (not runnable yet). */
  local?: boolean;
}
/** Always visible, never runnable yet. */
export const LOCAL_ENGINE_SLOT: ImageEngine = { id: "local-sdxs", label: "SDXS-512M · on-device", sub: "Local ONNX · registry slot, not shipped yet", api: "", local: true };

/** Image engines of the decrypted Apex API catalog. Empty while the vault is locked. */
export function apexImageEngines(): ImageEngine[] {
  const cat = getAccess().catalog;
  return (cat?.models ?? []).filter((m) => m.kind === "image").map((m) => ({ id: m.id, label: m.label, sub: m.tag, api: m.api }));
}

export const ASPECTS = [
  { id: "1:1", label: "1:1", w: 768, h: 768 },
  { id: "9:16", label: "9:16 Portrait", w: 576, h: 1024 },
  { id: "16:9", label: "16:9 Landscape", w: 1024, h: 576 },
] as const;

export const STYLES = [
  { id: "none", label: "None", suffix: "" },
  { id: "soft", label: "Soft pastel", suffix: ", soft pastel palette, airy, minimal composition, gentle light" },
  { id: "cinematic", label: "Cinematic", suffix: ", cinematic lighting, shallow depth of field, film grain" },
  { id: "watercolor", label: "Watercolor", suffix: ", delicate watercolor painting, paper texture" },
  { id: "ui", label: "UI mock", suffix: ", clean modern app UI mockup, generous whitespace, high fidelity" },
  { id: "neon", label: "Neon noir", suffix: ", neon noir, wet streets, moody reflections" },
] as const;

export interface ImageJob {
  prompt: string;
  engine: string;
  aspect: string;
  style: string;
  negative: string;
  seed: number;
}

export const randomSeed = () => Math.floor(Math.random() * 1_000_000);

export function imageSize(aspect: string): { w: number; h: number } {
  const a = ASPECTS.find((x) => x.id === aspect) ?? ASPECTS[0];
  return { w: a.w, h: a.h };
}

/** Returns "" while Apex API is locked: the endpoint only exists after the vault is decrypted in memory. */
export function imageUrl(j: ImageJob): string {
  const cat = getAccess().catalog;
  const engines = apexImageEngines();
  const eng = engines.find((e) => e.id === j.engine || e.api === j.engine) ?? engines[0];
  if (!cat || !eng) return "";
  const { w, h } = imageSize(j.aspect);
  const style = STYLES.find((s) => s.id === j.style)?.suffix ?? "";
  const p = new URLSearchParams({ width: String(w), height: String(h), seed: String(j.seed), model: eng.api, nologo: "true", enhance: "false" });
  if (j.negative.trim()) p.set("negative_prompt", j.negative.trim());
  return `${cat.endpoints.image}${encodeURIComponent(j.prompt.trim() + style)}?${p.toString()}`;
}

export interface GalleryItem {
  id: string;
  url: string;
  /** Small data-URL preview (the free generator rate-limits re-requests). */
  thumb?: string;
  prompt: string;
  engine: string;
  aspect: string;
  seed: number;
  ts: number;
}

const KEY = "apex.gallery.v1";
const EMPTY: GalleryItem[] = [];
let gallery: GalleryItem[] = EMPTY;
const subs = new Set<() => void>();
if (typeof window !== "undefined") {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]") as GalleryItem[];
    if (Array.isArray(raw)) gallery = raw;
  } catch {
    /* corrupt */
  }
}
function commit(next: GalleryItem[]) {
  gallery = next.slice(0, 60);
  try {
    localStorage.setItem(KEY, JSON.stringify(gallery));
  } catch {
    /* storage blocked */
  }
  subs.forEach((f) => f());
}
export function addToGallery(j: ImageJob, url: string, thumb?: string) {
  if (gallery.some((g) => g.url === url)) return;
  commit([{ id: Math.random().toString(36).slice(2, 9), url, thumb, prompt: j.prompt, engine: j.engine, aspect: j.aspect, seed: j.seed, ts: Date.now() }, ...gallery]);
}
export const removeFromGallery = (id: string) => commit(gallery.filter((g) => g.id !== id));
export function useGallery(): GalleryItem[] {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => gallery,
    () => EMPTY,
  );
}

/**
 * Fetch the image as a blob. The free tier allows ~1 image / 45 s and answers HTTP 402 with a "limit reached" picture,
 * which an <img> tag would happily display — so we check the status and retry with a visible countdown.
 */
export async function fetchImage(url: string, onWait?: (secondsLeft: number) => void): Promise<string> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch(url);
    if (r.status === 402 || r.status === 429) {
      if (attempt === 2) throw new Error("The free image service allows about one image every 45 seconds. Try again in a moment.");
      for (let s = 46; s > 0; s--) {
        onWait?.(s);
        await new Promise((res) => setTimeout(res, 1000));
      }
      continue;
    }
    if (!r.ok) throw new Error(`Image service answered ${r.status}`);
    const b = await r.blob();
    if (!b.type.startsWith("image/")) throw new Error("The image service returned no image");
    onWait?.(0);
    return URL.createObjectURL(b);
  }
  throw new Error("Image generation failed");
}

export function makeThumb(src: string, w = 320): Promise<string | undefined> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = w;
      c.height = Math.round((img.naturalHeight / img.naturalWidth) * w);
      c.getContext("2d")?.drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL("image/jpeg", 0.7));
    };
    img.onerror = () => resolve(undefined);
    img.src = src;
  });
}

/** Resolves when the image has loaded (the generator renders on first request, which can take several seconds). */
export function preload(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Image generation failed"));
    img.src = url;
  });
}

export async function downloadImage(url: string, name = "apex-image.jpg"): Promise<void> {
  try {
    const blob = await (await fetch(url)).blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  } catch {
    window.open(url, "_blank", "noopener");
  }
}
