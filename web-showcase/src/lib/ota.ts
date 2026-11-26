"use client";

import { REPO } from "./site";
import { assetUrl } from "./paths";
import { CATALOG, registerModel, unregisterModel, type CatalogModel } from "./models";
import { dlSnapshot } from "./downloader";

export const OTA_PATH = "web-showcase/public/registry.json";
export interface OtaCatalog {
  version: number;
  note?: string;
  updatedAt?: string;
  models: CatalogModel[];
}

/** A catalog entry from just a Hugging Face repo + file + size (architecture numbers are rough, used only for RAM estimates). */
export function buildOtaModel(repo: string, file: string, sizeBytes: number, group: "trending" | "uncensored", name?: string): CatalogModel {
  const params = Number(file.match(/(\d+(?:\.\d+)?)\s*[bB](?![a-z])/)?.[1] ?? "3");
  return {
    id: `ota:${repo}/${file}`,
    name: name?.trim() || file.replace(/\.gguf$/i, "").replace(/[-_.](I?Q\d.*|F16|BF16)$/i, ""),
    family: repo.split("/")[0],
    paramsB: params,
    quant: file.match(/(I?Q\d(?:_[A-Z0-9]+)*|F16|BF16)/i)?.[1]?.toUpperCase() ?? "GGUF",
    sizeGB: +(sizeBytes / 1e9).toFixed(4),
    layers: Math.max(16, Math.round(params * 9 + 12)),
    kvHeads: 4,
    headDim: 128,
    repo,
    file,
    group,
    uncensored: group === "uncensored",
    ota: true,
  };
}

/** Live owner-managed catalog: raw GitHub first (no-store + cache buster), bundled copy as the offline fallback. */
export async function fetchOta(): Promise<OtaCatalog | null> {
  const urls = [`https://raw.githubusercontent.com/${REPO}/main/${OTA_PATH}?t=${Date.now()}`, assetUrl("registry.json")];
  for (const u of urls) {
    try {
      const r = await fetch(u, { cache: "no-store" });
      if (r.ok) return (await r.json()) as OtaCatalog;
    } catch {
      /* next */
    }
  }
  return null;
}

/** Merge the OTA catalog into the Model Hub. Returns how many models are new. Entries the owner removed vanish unless already installed. */
export async function syncOta(): Promise<number> {
  const cat = await fetchOta();
  if (!cat) return 0;
  const ids = new Set(cat.models.map((m) => m.id));
  const have = dlSnapshot();
  for (const m of CATALOG.filter((c) => c.ota && !ids.has(c.id))) if (have[m.id]?.status !== "done") unregisterModel(m.id);
  const before = CATALOG.length;
  for (const m of cat.models) registerModel({ ...m, ota: true });
  return CATALOG.length - before;
}
