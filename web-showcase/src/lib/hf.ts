import { registerModel, type CatalogModel } from "./models";

/** Live Hugging Face search + GGUF file inspector + custom installer. */
export interface HfRepo {
  id: string;
  downloads: number;
  likes: number;
}
export interface HfFile {
  path: string;
  size: number;
}

export async function searchHf(q: string, signal?: AbortSignal): Promise<HfRepo[]> {
  const url = `https://huggingface.co/api/models?filter=gguf&sort=downloads&direction=-1&limit=20&search=${encodeURIComponent(q)}`;
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error(`Hugging Face answered ${r.status}`);
  const j = (await r.json()) as { id: string; downloads?: number; likes?: number }[];
  return j.map((m) => ({ id: m.id, downloads: m.downloads ?? 0, likes: m.likes ?? 0 }));
}

export async function repoGgufs(repo: string, signal?: AbortSignal): Promise<HfFile[]> {
  const r = await fetch(`https://huggingface.co/api/models/${repo}/tree/main`, { signal });
  if (!r.ok) throw new Error(`Hugging Face answered ${r.status}`);
  const j = (await r.json()) as { path: string; size: number; type: string; lfs?: { size: number } }[];
  return j
    .filter((f) => f.type === "file" && f.path.toLowerCase().endsWith(".gguf"))
    .map((f) => ({ path: f.path, size: f.lfs?.size ?? f.size }))
    .sort((a, b) => a.size - b.size);
}

/** `https://huggingface.co/<owner>/<repo>/resolve/main/<file>.gguf` (or /blob/) → parts. Any other direct URL is kept as-is. */
export function parseGgufUrl(u: string): { repo: string; file: string; url: string } | null {
  try {
    const x = new URL(u.trim());
    if (!x.pathname.toLowerCase().endsWith(".gguf")) return null;
    const m = x.pathname.match(/^\/([^/]+\/[^/]+)\/(?:resolve|blob)\/[^/]+\/(.+)$/);
    if (x.host === "huggingface.co" && m) return { repo: m[1], file: decodeURIComponent(m[2]), url: `https://huggingface.co/${m[1]}/resolve/main/${m[2]}` };
    return { repo: x.host, file: decodeURIComponent(x.pathname.split("/").pop() ?? "model.gguf"), url: x.href };
  } catch {
    return null;
  }
}

/** Register any GGUF as a downloadable model. Architecture numbers are rough (used only for RAM estimates). */
export function registerCustom(repo: string, file: string, size: number, url?: string): CatalogModel {
  const params = Number(file.match(/(\d+(?:\.\d+)?)\s*[bB](?![a-z])/)?.[1] ?? "1");
  const quant = file.match(/(I?Q\d(?:_[A-Z0-9]+)*|F16|BF16|f16)/)?.[1]?.toUpperCase() ?? "GGUF";
  const m: CatalogModel = {
    id: `hf:${repo}/${file}`,
    name: file.replace(/\.gguf$/i, "").replace(/[-_.](I?Q\d.*|F16|BF16)$/i, ""),
    family: repo.split("/")[0],
    paramsB: params,
    quant,
    sizeGB: size / 1e9,
    layers: Math.max(16, Math.round(params * 9 + 12)),
    kvHeads: 4,
    headDim: 64,
    repo,
    file,
    url,
    custom: true,
    group: "custom",
    uncensored: /uncensor|abliterat|dolphin|heretic/i.test(`${repo}${file}`),
  };
  registerModel(m);
  return m;
}

/** HEAD a direct URL to learn its size (needed for the progress bar). Falls back to 0 (unknown). */
export async function headSize(url: string): Promise<number> {
  try {
    const r = await fetch(url, { method: "HEAD" });
    return Number(r.headers.get("Content-Length") ?? r.headers.get("X-Linked-Size") ?? 0);
  } catch {
    return 0;
  }
}
