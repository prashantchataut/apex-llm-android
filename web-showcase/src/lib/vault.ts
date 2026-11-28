/** Shared types and display helpers for the managed Apex API tier. Key checking lives on the server (see managed-api.ts). */
export const KEY_PREFIX = "sk-apex-";

export interface ApexModel {
  id: string;
  label: string;
  tag: string;
  group: string;
  kind: "text" | "image";
  /** Model id on the wire (for managed models: the managed model id the server resolves). */
  api: string;
  desc?: string;
  reasoning?: boolean;
  vision?: boolean;
  uncensored?: boolean;
  /** Mesh provider id (set only for models discovered at runtime from public endpoints). */
  provider?: string;
}
export interface ApexCatalog {
  v: 1;
  endpoints: { text: string; models: string; image: string; imageModels: string };
  fallbackApi: string;
  models: ApexModel[];
}
export type AccessState = "none" | "checking" | "active" | "invalid" | "revoked" | "expired" | "disabled" | "offline";
export interface Verdict {
  state: AccessState;
  message: string;
  record?: { id?: string; label: string; prefix: string };
  catalog?: ApexCatalog;
}
export function maskKey(key: string): string {
  const n = key.length >= 20 ? 4 : 2;
  return `${key.startsWith(KEY_PREFIX) ? KEY_PREFIX : ""}\u2022\u2022\u2022\u2022${key.slice(-n)}`;
}
