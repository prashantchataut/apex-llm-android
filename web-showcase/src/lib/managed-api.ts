"use client";

import { assetUrl } from "./paths";
import type { AccessState, ApexCatalog, ApexModel } from "./vault";

/**
 * Client for the managed Apex API server (server/apex-api). The server is the ONLY authority on whether an Apex API key
 * works: every verification and every chat request is checked there. There is no local/cached validation path, so a key
 * that was rotated or revoked is refused on the next request from any device.
 */
let cached: string | null = null;
export async function backendUrl(): Promise<string> {
  if (cached !== null) return cached;
  const env = (process.env.NEXT_PUBLIC_APEX_API_URL ?? "").trim();
  let url = env;
  if (!url) {
    try {
      const j = (await (await fetch(assetUrl("config/backend.json"), { cache: "no-store" })).json()) as { url?: string };
      url = (j.url ?? "").trim();
    } catch {
      url = "";
    }
  }
  cached = url.replace(/\/+$/, "");
  return cached;
}
export const backendUrlSync = (): string => cached ?? "";

export interface KeyCheck {
  state: AccessState;
  message: string;
  label?: string;
  masked?: string;
  models?: ApexModel[];
}
interface ServerModel {
  id: string;
  label: string;
  kind: "text" | "image";
  category: string;
  capabilities: string[];
}

export function catalogFrom(models: ApexModel[]): ApexCatalog {
  return { v: 1, endpoints: { text: "", models: "", image: "", imageModels: "" }, fallbackApi: "", models };
}

export async function checkKeyOnServer(key: string): Promise<KeyCheck> {
  const base = await backendUrl();
  if (!base) return { state: "offline", message: "The Apex API server is not configured in this build, so keys cannot be verified. Local models still work." };
  try {
    const r = await fetch(`${base}/v1/models`, { headers: { Authorization: `Bearer ${key.trim()}` }, cache: "no-store" });
    if (r.status === 200) {
      const j = (await r.json()) as { data: ServerModel[]; key?: { label: string; masked: string } };
      const models: ApexModel[] = j.data.map((m) => ({ id: m.id, label: m.label, tag: m.category, group: "Apex API", kind: m.kind, api: m.id, reasoning: m.capabilities.includes("reasoning"), vision: m.capabilities.includes("vision") }));
      return { state: "active", message: "Active", label: j.key?.label, masked: j.key?.masked, models };
    }
    const msg = ((await r.json().catch(() => ({}))) as { error?: { message?: string } }).error?.message ?? "";
    if (r.status === 503) return { state: "disabled", message: msg || "Apex API is switched off right now." };
    if (/revoked/i.test(msg)) return { state: "revoked", message: "This key was revoked." };
    if (/expired/i.test(msg)) return { state: "expired", message: "This key has expired." };
    return { state: "invalid", message: "That key is not valid." };
  } catch {
    return { state: "offline", message: "Could not reach the Apex API server. Check your connection." };
  }
}
