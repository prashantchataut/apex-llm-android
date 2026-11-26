"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { loadJsonFile, publishJsonFile } from "@/lib/admin";
import { allProviders, customProvider, EMPTY_CONFIG, MESH_CONFIG_PATH, MESH_GROUP_ORDER, probeAll, probeOne, syncMesh, useMesh, type Health, type MeshConfig, type MeshProvider } from "@/services/apexCloudMesh";

const dim = "text-[rgb(var(--ink-rgb)/var(--ink-3-a))]";
const btn = "rounded-full bg-[var(--surface-2)] px-4 py-2 text-[13px] font-medium transition-transform active:scale-[0.97] disabled:opacity-40";

function Dot({ h }: { h?: Health }) {
  const tone = !h ? "#9ca3af" : h.ok ? "#22c55e" : "#ef4444";
  return <span aria-hidden="true" className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: tone }} />;
}

/** Owner tool: live health of every keyless upstream, one-tap model sync, and keyless custom endpoints published OTA (no rebuild). */
export function AdminMesh({ token }: { token: string }) {
  const mesh = useMesh();
  const [cfg, setCfg] = useState<MeshConfig>(EMPTY_CONFIG);
  const [sha, setSha] = useState("");
  const [saved, setSaved] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [name, setName] = useState("");
  const [base, setBase] = useState("");
  const [test, setTest] = useState<string>("");

  const providers = useMemo(() => allProviders(cfg), [cfg]);

  const load = useCallback(async () => {
    let c = EMPTY_CONFIG;
    try {
      const r = await loadJsonFile<MeshConfig>(token, MESH_CONFIG_PATH);
      c = { ...EMPTY_CONFIG, ...r.data };
      setSha(r.sha);
    } catch {
      setSha("");
    }
    setCfg(c);
    setSaved(JSON.stringify(c));
    await probeAll(allProviders(c));
  }, [token]);
  useEffect(() => void load(), [load]);

  const dirty = JSON.stringify(cfg) !== saved;
  const say = (ok: boolean, text: string) => setMsg({ ok, text });

  const recheck = async () => {
    setBusy(true);
    await probeAll(providers);
    setBusy(false);
  };
  const sync = async () => {
    setBusy(true);
    const s = await syncMesh(cfg);
    say(true, `Synced ${s.models.length} live keyless models from ${s.providers.filter((p) => s.health[p.id]?.ok).length} providers.`);
    setBusy(false);
  };
  const toggle = (p: MeshProvider) => setCfg((c) => ({ ...c, disabled: c.disabled.includes(p.id) ? c.disabled.filter((x) => x !== p.id) : [...c.disabled, p.id] }));
  const remove = (p: MeshProvider) => setCfg((c) => ({ ...c, custom: c.custom.filter((x) => x.id !== p.id), disabled: c.disabled.filter((x) => x !== p.id) }));

  const add = async () => {
    setTest("");
    try {
      const p = customProvider(name, base);
      if (providers.some((x) => x.id === p.id)) return say(false, "That host is already in the mesh.");
      setBusy(true);
      const r = await probeOne({ ...p, builtin: false });
      setBusy(false);
      if (!r.health.ok) return say(false, `Not added: ${r.health.error ?? "no answer"}. The endpoint must be keyless and send CORS headers.`);
      setCfg((c) => ({ ...c, custom: [...c.custom, { ...p, fallbackModel: r.models[0]?.api }] }));
      setTest(`${p.name}: ${r.models.length} models answered in ${r.health.ms}ms`);
      setName("");
      setBase("");
      say(true, `Found ${r.models.length} models. Press "Publish to live app" to save.`);
    } catch (e) {
      setBusy(false);
      say(false, e instanceof Error ? e.message : "Invalid URL.");
    }
  };

  const publish = async () => {
    setBusy(true);
    try {
      const data = { ...cfg, schema: 1, updatedAt: new Date().toISOString() };
      const r = await publishJsonFile(token, MESH_CONFIG_PATH, data, sha, `chore(mesh): ${cfg.custom.length} custom provider(s), ${cfg.disabled.length} disabled`);
      setSha(r.sha);
      setSaved(JSON.stringify(cfg));
      await syncMesh(cfg);
      say(true, "Published. Apps pick it up on the next launch, no rebuild.");
    } catch (e) {
      say(false, e instanceof Error ? e.message : "Publish failed.");
    }
    setBusy(false);
  };

  const byGroup = MESH_GROUP_ORDER.map((g) => [g, mesh.models.filter((m) => m.group === g).length] as const).filter(([, n]) => n > 0);

  return (
    <section data-testid="admin-mesh" className="rounded-[26px] bg-[var(--surface-1)] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[17px] font-medium tracking-[-0.01em]">Keyless Provider Mesh</h2>
          <p className={`mt-1 text-[12.5px] leading-snug ${dim}`}>Free, key-less OpenAI-compatible upstreams with automatic failover. Chat tries the next provider the moment one answers 429, 5xx or times out.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" className={btn} onClick={recheck} disabled={busy}>Re-check health</button>
          <button type="button" className={btn} style={{ background: "var(--halo-a)", color: "var(--halo-ink)" }} onClick={sync} disabled={busy} data-testid="mesh-sync">Sync live models from all providers</button>
        </div>
      </div>

      <ul className="mt-4 space-y-2" data-testid="mesh-providers">
        {providers.map((p) => {
          const h = mesh.health[p.id];
          const off = cfg.disabled.includes(p.id);
          return (
            <li key={p.id} className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl bg-[var(--surface-2)] px-4 py-3 ${off ? "opacity-50" : ""}`}>
              <Dot h={off ? undefined : h} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-medium">{p.name}</p>
                <p className={`truncate text-[12px] ${dim}`}>{new URL(p.chat).host}{h?.ok ? ` · ${h.ms}ms · ${h.count} models` : h?.error ? ` · ${h.error}` : " · checking"}</p>
              </div>
              <button type="button" className="calm-chip" onClick={() => toggle(p)}>{off ? "Enable" : "Disable"}</button>
              {!p.builtin && <button type="button" className="calm-chip" onClick={() => remove(p)}>Remove</button>}
            </li>
          );
        })}
      </ul>

      {byGroup.length > 0 && (
        <p className="mt-3 flex flex-wrap gap-1.5" data-testid="mesh-groups">
          {byGroup.map(([g, n]) => (
            <span key={g} className="calm-chip">{g} · {n}</span>
          ))}
          <span className="calm-chip">Total · {mesh.models.length}</span>
        </p>
      )}

      <div className="mt-5 rounded-2xl bg-[var(--surface-2)] p-4">
        <p className="text-[13px] font-medium">Add a keyless endpoint</p>
        <p className={`mt-0.5 text-[12px] ${dim}`}>OpenAI-compatible base URL (https, no API key, CORS enabled). It is tested before it is added.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" aria-label="Provider name" className="min-w-0 rounded-xl bg-[var(--surface-1)] px-3 py-2 text-[14px] outline-none" />
          <input value={base} onChange={(e) => setBase(e.target.value)} placeholder="https://host.example/v1" aria-label="Base URL" inputMode="url" autoCapitalize="off" className="min-w-0 rounded-xl bg-[var(--surface-1)] px-3 py-2 text-[14px] outline-none" />
          <button type="button" className={btn} onClick={add} disabled={busy || !base.trim()} data-testid="mesh-add">Test &amp; add</button>
        </div>
        {test && <p className="mt-2 text-[12px]" style={{ color: "#16a34a" }}>{test}</p>}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" className={btn} style={dirty ? { background: "var(--halo-a)", color: "var(--halo-ink)" } : undefined} onClick={publish} disabled={busy || !dirty} data-testid="mesh-publish">Publish to live app</button>
        {msg && <p role="status" className="text-[12.5px]" style={{ color: msg.ok ? "#16a34a" : "#dc2626" }}>{msg.text}</p>}
      </div>
    </section>
  );
}
