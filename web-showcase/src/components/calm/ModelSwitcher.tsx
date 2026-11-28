"use client";

import { useEffect, useMemo, useState } from "react";
import { FAMILY_LABEL, resolveFlagships, tailOf, type Family } from "@/data/frontier";
import { syncMesh, useMesh, type MeshModel } from "@/services/apexCloudMesh";
import type { Choice } from "@/lib/store";
import { CIcon } from "./icons";

export interface LocalOption {
  id: string;
  label: string;
  sub: string;
}

type Pill = { id: string; label: string; test: (m: MeshModel) => boolean };
const fam = (f: Family) => (m: MeshModel) => m.family === f;
const PILLS: Pill[] = [
  { id: "all", label: "All", test: () => true },
  { id: "local", label: "On-Device Local", test: () => false },
  { id: "anthropic", label: "Anthropic", test: fam("anthropic") },
  { id: "openai", label: "OpenAI", test: fam("openai") },
  { id: "google", label: "Google", test: fam("google") },
  { id: "xai", label: "xAI Grok", test: fam("xai") },
  { id: "deepseek", label: "DeepSeek", test: (m) => /deepseek/.test(tailOf(m.api)) },
  { id: "qwen", label: "Qwen", test: (m) => /qwen|qwq/.test(tailOf(m.api)) },
  { id: "llama4", label: "Llama 4", test: (m) => /llama-4/.test(tailOf(m.api)) },
  { id: "uncensored", label: "Uncensored", test: (m) => m.uncensored },
];
const CAPS = ["Reasoning", "Vision", "Code", "Search", "Offline"] as const;
type Cap = (typeof CAPS)[number];
const capOf = (m: MeshModel, c: Cap): boolean => (c === "Reasoning" ? m.reasoning : c === "Vision" ? m.vision : c === "Code" ? m.group === "Coding" || /code|coder/.test(m.api.toLowerCase()) : c === "Search" ? m.group === "Live Web Search" || /search|sonar/.test(m.api.toLowerCase()) : false);
const tagsOf = (m: MeshModel): Cap[] => (["Reasoning", "Vision", "Code", "Search"] as Cap[]).filter((c) => capOf(m, c));

const FAV_KEY = "apex.favs.v1";
const latency = (m: MeshModel): string => (m.verified && m.ms ? (m.ms >= 10000 ? `${(m.ms / 1000).toFixed(0)} s` : m.ms >= 1000 ? `${(m.ms / 1000).toFixed(1)} s` : `${m.ms} ms`) : m.verified === false ? "offline" : "untested");
const dim = "text-[rgb(var(--ink-rgb)/var(--ink-3-a))]";
const chip = "inline-flex h-5 shrink-0 items-center rounded-full bg-[var(--surface-1)] px-2 text-[10.5px] font-medium";

export function useFavorites(): [string[], (id: string) => void] {
  const [favs, setFavs] = useState<string[]>([]);
  useEffect(() => {
    try {
      setFavs(JSON.parse(localStorage.getItem(FAV_KEY) ?? "[]"));
    } catch {
      /* none yet */
    }
  }, []);
  const toggle = (id: string) =>
    setFavs((f) => {
      const next = f.includes(id) ? f.filter((x) => x !== id) : [id, ...f].slice(0, 12);
      try {
        localStorage.setItem(FAV_KEY, JSON.stringify(next));
      } catch {
        /* storage full */
      }
      return next;
    });
  return [favs, toggle];
}

/** Searchable command-style switcher: pinned row, Frontier Flagships, provider pills, capability tags, live latency. */
export function ModelSwitcher({ choice, onPick, locals, onPickLocal }: { choice: Choice; onPick: (c: Choice) => void; locals: LocalOption[]; onPickLocal: (id: string) => void }) {
  const mesh = useMesh();
  const [q, setQ] = useState("");
  const [pill, setPill] = useState("all");
  const [caps, setCaps] = useState<Cap[]>([]);
  const [limit, setLimit] = useState(40);
  const [favs, toggleFav] = useFavorites();
  useEffect(() => {
    // The mesh normally syncs after the vault unlocks; the switcher must also work for keyless users.
    if (!mesh.synced && !mesh.syncing) void syncMesh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const models = useMemo(() => mesh.models.filter((m) => !m.nativeOnly && !m.disabled), [mesh.models]);
  const byId = useMemo(() => new Map(models.map((m) => [m.id, m])), [models]);
  const needle = q.trim().toLowerCase();
  const pillDef = PILLS.find((p) => p.id === pill) ?? PILLS[0];
  const offline = caps.includes("Offline") || pill === "local";
  const capsOn = caps.filter((c) => c !== "Offline");
  const passes = (m: MeshModel) => pillDef.test(m) && capsOn.every((c) => capOf(m, c)) && (!needle || `${m.label} ${m.api} ${m.family}`.toLowerCase().includes(needle));

  const flagships = useMemo(() => resolveFlagships(models), [models]);
  const flagRows = flagships.filter((f) => f.best && (!needle || `${f.entry.label} ${f.best.api}`.toLowerCase().includes(needle)) && passes(f.best));
  flagRows.sort((a, b) => Number(!!b.entry.featured) - Number(!!a.entry.featured));
  const flagIds = new Set(flagRows.map((f) => f.best!.id));
  const pinned = favs.map((id) => byId.get(id)).filter((m): m is MeshModel => !!m);
  const rest = models.filter((m) => !flagIds.has(m.id) && passes(m)).sort((a, b) => Number(!!b.verified) - Number(!!a.verified) || (a.ms ?? 1e9) - (b.ms ?? 1e9));
  const shownLocals = locals.filter((l) => !needle || l.label.toLowerCase().includes(needle));
  const toggleCap = (c: Cap) => setCaps((s) => (s.includes(c) ? s.filter((x) => x !== c) : [...s, c]));

  const Row = ({ m, title, sub }: { m: MeshModel; title?: string; sub?: string }) => {
    const active = choice.kind === "apex" && choice.id === m.id;
    const fav = favs.includes(m.id);
    return (
      <div className="flex items-stretch gap-1" data-testid="switcher-row">
        <button type="button" onClick={() => onPick({ kind: "apex", id: m.id })} aria-pressed={active} className="flex min-h-[52px] min-w-0 flex-1 items-center gap-2.5 rounded-2xl px-3 py-1.5 text-left transition-colors hover:bg-[var(--surface-2)]" style={active ? { background: "var(--halo-a)" } : undefined}>
          <span className={`h-2 w-2 shrink-0 rounded-full ${m.verified ? "bg-[var(--ok)]" : "bg-[rgb(var(--ink-rgb)/0.25)]"}`} aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[14px]">{title ?? m.label}</span>
            <span className={`flex min-w-0 flex-wrap items-center gap-1 pt-0.5 text-[11.5px] ${dim}`}>
              <span className="min-w-0 max-w-full truncate">{sub ?? m.api}</span>
            </span>
            <span className="flex flex-wrap items-center gap-1 pt-1">
              <span className={chip}>{latency(m)}</span>
              {tagsOf(m).map((t) => (
                <span key={t} className={chip}>{t}</span>
              ))}
              <span className={chip}>{FAMILY_LABEL[m.family]}</span>
            </span>
          </span>
          {active && <CIcon name="check" size={16} className="shrink-0 text-[var(--halo-ink)]" />}
        </button>
        <button type="button" onClick={() => toggleFav(m.id)} aria-label={fav ? `Unpin ${m.label}` : `Pin ${m.label}`} aria-pressed={fav} className="ibtn !h-10 !w-10 self-center shrink-0">
          <CIcon name="star" size={16} style={fav ? { fill: "currentColor" } : undefined} />
        </button>
      </div>
    );
  };
  const H = ({ children, n }: { children: string; n?: number }) => (
    <p className={`flex items-center justify-between px-3 pb-1 pt-3 text-[11px] font-medium uppercase tracking-[0.06em] ${dim}`}>
      <span>{children}</span>
      {n !== undefined && <span className="tnum">{n}</span>}
    </p>
  );

  return (
    <div data-testid="model-switcher" className="min-w-0">
      <label className="relative block">
        <CIcon name="search" size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 opacity-50" />
        <input className="calm-field !pl-9" value={q} onChange={(e) => { setQ(e.target.value); setLimit(40); }} placeholder="Search Opus, GPT-4.5, o3, Gemini, Grok, Llama" aria-label="Search models" data-testid="switcher-search" autoCapitalize="none" spellCheck={false} />
      </label>
      <div className="mt-2 flex flex-wrap gap-1.5" role="tablist" aria-label="Provider">
        {PILLS.map((p) => (
          <button key={p.id} type="button" role="tab" aria-selected={pill === p.id} onClick={() => { setPill(p.id); setLimit(40); }} className="h-8 shrink-0 whitespace-nowrap rounded-full px-3 text-[12.5px] font-medium transition-colors" style={pill === p.id ? { background: "var(--halo-a)", color: "var(--halo-ink)" } : { background: "var(--surface-2)" }}>
            {p.label}
          </button>
        ))}
      </div>
      <div className="mt-1 flex flex-wrap gap-1.5" aria-label="Capabilities">
        {CAPS.map((c) => (
          <button key={c} type="button" aria-pressed={caps.includes(c)} onClick={() => toggleCap(c)} className="h-7 rounded-full px-2.5 text-[11.5px] font-medium" style={caps.includes(c) ? { background: "var(--halo-a)", color: "var(--halo-ink)" } : { background: "var(--surface-2)" }}>
            {c}
          </button>
        ))}
      </div>

      {(offline || pill === "local") && (
        <>
          <H n={shownLocals.length}>On-device models</H>
          {shownLocals.length === 0 && <p className={`px-3 py-2 text-[13px] ${dim}`}>No local models installed. Open the Model Hub to download one.</p>}
          {shownLocals.map((l) => (
            <button key={l.id} type="button" onClick={() => onPickLocal(l.id)} aria-pressed={choice.kind === "local" && choice.id === l.id} className="flex min-h-[50px] w-full items-center gap-2.5 rounded-2xl px-3 text-left hover:bg-[var(--surface-2)]" style={choice.kind === "local" && choice.id === l.id ? { background: "var(--halo-a)" } : undefined}>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px]">{l.label}</span>
                <span className={`block truncate text-[11.5px] ${dim}`}>{l.sub}</span>
              </span>
              <span className={chip}>Offline</span>
            </button>
          ))}
        </>
      )}

      {pill !== "local" && !caps.includes("Offline") && (
        <>
          {pinned.length > 0 && !needle && pill === "all" && capsOn.length === 0 && (
            <div data-testid="switcher-pinned">
              <H n={pinned.length}>Pinned</H>
              {pinned.map((m) => (
                <Row key={`p-${m.id}`} m={m} />
              ))}
            </div>
          )}
          {flagRows.length > 0 && (
            <div data-testid="switcher-frontier">
              <H n={flagRows.length}>Frontier Flagships</H>
              {flagRows.map((f) => (
                <Row key={f.entry.key} m={f.best!} title={f.entry.label} sub={`${f.best!.api.split("/").pop()} · ${f.routes.length} route${f.routes.length === 1 ? "" : "s"} with failover`} />
              ))}
            </div>
          )}
          <H n={rest.length}>{pill === "all" && !needle ? "More models" : "Models"}</H>
          {rest.slice(0, limit).map((m) => (
            <Row key={m.id} m={m} />
          ))}
          {rest.length === 0 && flagRows.length === 0 && <p className={`px-3 py-3 text-[13px] ${dim}`}>{mesh.synced ? "No models match these filters." : "Loading the live catalog"}</p>}
          {rest.length > limit && (
            <button type="button" className="calm-btn mt-2 w-full" onClick={() => setLimit((l) => l + 60)}>
              Show {Math.min(60, rest.length - limit)} more ({rest.length - limit} left)
            </button>
          )}
        </>
      )}
    </div>
  );
}
