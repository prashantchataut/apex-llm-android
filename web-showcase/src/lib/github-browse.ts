/** Read-only GitHub browsing (api.github.com/repos/{owner}/{repo}/contents) + Gist creation. The token, if any, is the user's own and never leaves api.github.com. */
export interface Entry {
  name: string;
  path: string;
  type: "file" | "dir" | "symlink" | "submodule";
  size: number;
  download_url: string | null;
}
const H = (token?: string): HeadersInit => ({ Accept: "application/vnd.github+json", ...(token ? { Authorization: `Bearer ${token}` } : {}) });
const fail = (r: Response): Error => new Error(r.status === 403 || r.status === 429 ? "GitHub rate limit reached for this network. Try again in a few minutes, or connect with a token." : r.status === 404 ? "Not found, or private (connect with a token)." : `GitHub answered ${r.status}`);

export async function listContents(repo: string, path = "", token?: string): Promise<Entry[]> {
  const r = await fetch(`https://api.github.com/repos/${repo}/contents/${path.split("/").map(encodeURIComponent).join("/")}`, { headers: H(token) });
  if (!r.ok) throw fail(r);
  const j = (await r.json()) as Entry[] | Entry;
  const list = Array.isArray(j) ? j : [j];
  return list.sort((a, b) => Number(b.type === "dir") - Number(a.type === "dir") || a.name.localeCompare(b.name));
}

/** Raw text of a file via the contents API (works for private repos with a token). */
export async function fileText(repo: string, path: string, token?: string): Promise<string> {
  const r = await fetch(`https://api.github.com/repos/${repo}/contents/${path.split("/").map(encodeURIComponent).join("/")}`, { headers: { ...H(token), Accept: "application/vnd.github.raw+json" } });
  if (!r.ok) throw fail(r);
  return (await r.text()).slice(0, 400_000);
}

export async function readme(repo: string, token?: string): Promise<{ name: string; text: string }> {
  const r = await fetch(`https://api.github.com/repos/${repo}/readme`, { headers: { ...H(token), Accept: "application/vnd.github.raw+json" } });
  if (!r.ok) throw fail(r);
  return { name: `${repo.split("/")[1]}-README.md`, text: (await r.text()).slice(0, 400_000) };
}

/** Secret Gist from text. Needs the user's token with the `gist` scope. */
export async function createGist(token: string, filename: string, content: string, description = "Created with Apex LLM"): Promise<string> {
  const r = await fetch("https://api.github.com/gists", { method: "POST", headers: { ...H(token), "Content-Type": "application/json" }, body: JSON.stringify({ description, public: false, files: { [filename]: { content } } }) });
  if (!r.ok) throw new Error(r.status === 401 || r.status === 403 ? "This token cannot create Gists. Generate one with the gist scope." : `GitHub answered ${r.status}`);
  return ((await r.json()) as { html_url: string }).html_url;
}

export const TOKEN_URL = "https://github.com/settings/tokens/new?description=Apex+LLM&scopes=repo,gist,read:user";
