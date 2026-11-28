"use client";

import { useEffect, useState } from "react";
import { createGist, fileText, listContents, readme, type Entry } from "@/lib/github-browse";
import { queueAttachment } from "@/lib/pending-attach";
import { CIcon } from "./icons";

const dim = "text-[rgb(var(--ink-rgb)/var(--ink-3-a))]";
const TEXTY = /\.(md|txt|rs|py|json|toml|ya?ml|js|jsx|ts|tsx|kt|java|c|cpp|h|go|csv|html|css|sh|gradle|kts|xml|swift|rb|php|lock|cfg|ini)$|^(readme|license|makefile|dockerfile)/i;

/** Browse a repository's file tree and README, then attach any file straight into the chat. */
export function RepoBrowser({ repo, token }: { repo: string; token: string }) {
  const [path, setPath] = useState("");
  const [items, setItems] = useState<Entry[]>([]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    setPath("");
    setNote("");
  }, [repo]);
  useEffect(() => {
    let live = true;
    setBusy(true);
    setErr("");
    listContents(repo, path, token || undefined)
      .then((l) => live && setItems(l))
      .catch((e: Error) => live && (setErr(e.message), setItems([])))
      .finally(() => live && setBusy(false));
    return () => {
      live = false;
    };
  }, [repo, path, token]);

  const attach = async (name: string, get: () => Promise<string>) => {
    setNote("");
    try {
      queueAttachment({ name, text: await get() });
      setNote(`Attached ${name} to the chat.`);
      window.dispatchEvent(new CustomEvent("apex:attached", { detail: name }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not read that file.");
    }
  };
  const gist = async (e: Entry) => {
    try {
      const url = await createGist(token, e.name, await fileText(repo, e.path, token));
      setNote(`Gist created: ${url}`);
    } catch (x) {
      setErr(x instanceof Error ? x.message : "Gist failed.");
    }
  };
  const up = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";

  return (
    <div className="mt-3 rounded-2xl bg-[var(--surface-2)] p-2.5" data-testid="repo-browser">
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-[12.5px] font-medium">{repo}{path ? ` / ${path}` : ""}</p>
        <button type="button" className="calm-btn !min-h-8 !px-3 text-[12px] active:scale-[0.97]" data-testid="gh-attach-readme" onClick={() => void attach(`${repo.split("/")[1]}-README.md`, async () => (await readme(repo, token || undefined)).text)}>
          <CIcon name="file" size={13} />README
        </button>
      </div>
      <div className="mt-1.5 max-h-52 overflow-y-auto scroll-quiet" role="list" aria-label="Files">
        {path && (
          <button type="button" onClick={() => setPath(up)} className="flex h-10 w-full items-center gap-2 rounded-xl px-2 text-left text-[13px] hover:bg-[var(--surface)]"><CIcon name="back" size={14} />..</button>
        )}
        {busy && <p className={`px-2 py-2 text-[12.5px] ${dim}`}>Loading</p>}
        {!busy && items.map((e) => (
          <div key={e.path} role="listitem" className="flex h-10 items-center gap-1" data-testid="gh-entry">
            <button type="button" onClick={() => e.type === "dir" && setPath(e.path)} disabled={e.type !== "dir"} className="flex min-w-0 flex-1 items-center gap-2 rounded-xl px-2 text-left text-[13px] hover:bg-[var(--surface)] disabled:cursor-default disabled:hover:bg-transparent">
              <CIcon name={e.type === "dir" ? "folder" : "file"} size={14} className="shrink-0 opacity-60" />
              <span className="truncate">{e.name}</span>
            </button>
            {e.type === "file" && TEXTY.test(e.name) && e.size < 400_000 && (
              <>
                {token && <button type="button" className="calm-btn !min-h-8 !px-2.5 text-[12px]" aria-label={`Create Gist from ${e.name}`} onClick={() => void gist(e)}>Gist</button>}
                <button type="button" className="calm-btn !min-h-8 !px-2.5 text-[12px] active:scale-[0.97]" data-testid="gh-attach" aria-label={`Attach ${e.name}`} onClick={() => void attach(e.name, () => fileText(repo, e.path, token || undefined))}>Attach</button>
              </>
            )}
          </div>
        ))}
      </div>
      {note && <p className="mt-1.5 break-all text-[12px] text-[var(--ok)]" role="status" data-testid="gh-note">{note}</p>}
      {err && <p className="mt-1.5 text-[12px] text-[var(--bad)]" role="alert">{err}</p>}
    </div>
  );
}
