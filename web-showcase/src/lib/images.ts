"use client";

import { useSyncExternalStore } from "react";
import { getAccess } from "./access";
import { fastComplete } from "./fast-ai";

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
  { id: "9:16", label: "9:16", w: 576, h: 1024 },
  { id: "16:9", label: "16:9", w: 1024, h: 576 },
  { id: "4:5", label: "4:5", w: 640, h: 800 },
] as const;

export const STYLES = [
  { id: "none", label: "None", suffix: "" },
  { id: "soft", label: "Soft pastel", suffix: ", soft pastel palette, airy, minimal composition, gentle light" },
  { id: "cinematic", label: "Cinematic", suffix: ", cinematic lighting, shallow depth of field, film grain" },
  { id: "photo", label: "Photoreal", suffix: ", photorealistic, 85mm lens, natural light, sharp focus, high detail" },
  { id: "watercolor", label: "Watercolor", suffix: ", delicate watercolor painting, paper texture" },
  { id: "anime", label: "Anime", suffix: ", anime key visual, clean linework, vibrant colour" },
  { id: "3d", label: "3D render", suffix: ", 3D render, soft studio lighting, glossy materials, subsurface scattering" },
  { id: "ui", label: "UI mock", suffix: ", clean modern app UI mockup, generous whitespace, high fidelity" },
  { id: "neon", label: "Neon noir", suffix: ", neon noir, wet streets, moody reflections" },
] as const;

/**
 * Image models. Verified live against the generator: `flux`, `flux-pro`, `turbo` and `sana` answer; `flux-anime` / `flux-3d`
 * do NOT exist upstream (HTTP 402), so Anime and 3D are the real Flux model plus a style suffix. Every request walks `FALLBACK_APIS`
 * automatically if the chosen model is rate-limited or down.
 */
export interface ImageModel {
  id: string;
  label: string;
  sub: string;
  api: string;
  suffix: string;
}
export const IMAGE_MODELS: ImageModel[] = [
  { id: "flux-schnell", label: "Flux Schnell", sub: "Fastest, great default", api: "flux", suffix: "" },
  { id: "flux-pro", label: "Flux Pro", sub: "Highest detail, slower", api: "flux-pro", suffix: "" },
  { id: "flux-anime", label: "Flux Anime", sub: "Flux with an anime look", api: "flux", suffix: ", anime style, cel shading, detailed linework, vibrant colours" },
  { id: "flux-3d", label: "Flux 3D", sub: "Flux with a 3D-render look", api: "flux", suffix: ", 3D render, octane render, soft studio lighting, glossy materials" },
];
export const FALLBACK_APIS = ["flux", "turbo", "sana"];

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

const buildUrl = (j: ImageJob, api: string, suffix: string): string => {
  const cat = getAccess().catalog;
  if (!cat) return "";
  const { w, h } = imageSize(j.aspect);
  const style = STYLES.find((x) => x.id === j.style)?.suffix ?? "";
  const p = new URLSearchParams({ width: String(w), height: String(h), seed: String(j.seed), model: api, nologo: "true", enhance: "false" });
  if (j.negative.trim()) p.set("negative_prompt", j.negative.trim());
  return `${cat.endpoints.image}${encodeURIComponent(j.prompt.trim() + suffix + style)}?${p.toString()}`;
};

/** Returns "" while Apex API is locked: the endpoint only exists after the vault is decrypted in memory. */
export function imageUrl(j: ImageJob): string {
  const m = IMAGE_MODELS.find((x) => x.id === j.engine) ?? IMAGE_MODELS[0];
  return buildUrl(j, m.api, m.suffix);
}
/** The chosen model first, then the remaining fallbacks (same prompt and look). */
export function imageUrlChain(j: ImageJob): { api: string; url: string }[] {
  const m = IMAGE_MODELS.find((x) => x.id === j.engine) ?? IMAGE_MODELS[0];
  return [...new Set([m.api, ...FALLBACK_APIS])].map((api) => ({ api, url: buildUrl(j, api, m.suffix) })).filter((x) => x.url);
}

/** 1-tap prompt enhancer: a fast verified model rewrites it; offline it falls back to a deterministic rewrite. */
export async function enhancePrompt(raw: string): Promise<{ text: string; by: "ai" | "rules" }> {
  const base = raw.trim();
  try {
    const r = await fastComplete(
      [
        { role: "system", content: "You rewrite short image prompts into one vivid, concrete text-to-image prompt (subject, setting, lighting, lens or medium, mood). Max 55 words. Output only the prompt, no quotes, no preamble." },
        { role: "user", content: base },
      ],
      { maxTokens: 140, timeoutMs: 6000, temperature: 0.7 },
    );
    const t = r.text.replace(/^["'\s]+|["'\s]+$/g, "");
    if (t.length > 12) return { text: t, by: "ai" };
  } catch {
    /* offline or rate limited */
  }
  return { text: `${base}, highly detailed, dramatic natural lighting, rich textures, balanced composition, sharp focus`, by: "rules" };
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

/**
 * Walks the URL chain. A rate-limited / failing model hands over to the next one immediately; only when every model
 * is limited does it wait for the free tier window, then walks the chain once more.
 */
export async function fetchImageChain(chain: { api: string; url: string }[], hooks: { onWait?: (s: number) => void; onFallback?: (api: string) => void } = {}): Promise<{ src: string; api: string }> {
  let last = "Image generation failed";
  for (let round = 0; round < 2; round++) {
    for (let i = 0; i < chain.length; i++) {
      try {
        const r = await fetch(chain[i].url);
        if (r.status === 402 || r.status === 429) {
          last = "The free image service is busy. Try again in a moment.";
          if (i < chain.length - 1) hooks.onFallback?.(chain[i + 1].api);
          continue;
        }
        if (!r.ok) throw new Error(`Image service answered ${r.status}`);
        const b = await r.blob();
        if (!b.type.startsWith("image/")) throw new Error("The image service returned no image");
        hooks.onWait?.(0);
        return { src: URL.createObjectURL(b), api: chain[i].api };
      } catch (e) {
        last = e instanceof Error ? e.message : last;
        if (i < chain.length - 1) hooks.onFallback?.(chain[i + 1].api);
      }
    }
    if (round === 0) for (let s = 46; s > 0; s--) {
      hooks.onWait?.(s);
      await new Promise((res) => setTimeout(res, 1000));
    }
  }
  throw new Error(last);
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
