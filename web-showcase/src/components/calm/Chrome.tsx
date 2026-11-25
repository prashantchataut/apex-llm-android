"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CATALOG } from "@/lib/models";
import { shortModelName } from "@/lib/engine";
import { KEYLESS_MODELS, isServed, useKeylessLive } from "@/lib/keyless";
import { downloadImage } from "@/lib/images";
import { ago, type UpdateState } from "@/lib/updater";
import { APP_VERSION } from "@/lib/version";
import type { Choice, Convo } from "@/lib/store";
import { CIcon, type CIconName } from "./icons";
import type { DlItem } from "@/lib/downloader";

export type View = "chat" | "hub" | "studio" | "memory" | "mcp" | "lan" | "settings";

export function Header({ persistent, onMenu, label, uncensored, onPill, memCount, onMemory, onNew }: { persistent: boolean; onMenu: () => void; label: string; uncensored: boolean; onPill: () => void; memCount: number; onMemory: () => void; onNew: () => void }) {
  return (
    <header className="relative z-10 grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-3 pb-2 pt-[max(12px,env(safe-area-inset-top))]">
      <div className="flex">
        <button type="button" onClick={onMenu} aria-label="Open menu" className={`ibtn !h-11 !w-11 ${persistent ? "lg:hidden" : ""}`}>
          <CIcon name="menu" size={22} />
        </button>
      </div>
      <button type="button" onClick={onPill} aria-haspopup="dialog" aria-label={`Model: ${label}. Switch model`} className="flex h-10 max-w-[54vw] items-center gap-2 rounded-full border border-[var(--hairline)] bg-[var(--glass-bg)] px-3.5 text-[13px] font-medium shadow-[var(--shadow-card)] backdrop-blur-xl transition-transform active:scale-[0.98] sm:max-w-[420px]">
        <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--ok)]" />
        <span className="truncate">{label}</span>
        {uncensored && <span aria-label="Uncensored">🔓</span>}
        <CIcon name="chevron" size={14} className="shrink-0 opacity-60" />
      </button>
      <div className="flex items-center justify-end gap-0.5">
        <button type="button" onClick={onMemory} aria-label={`Memory: ${memCount} saved facts`} className="ibtn relative !h-11 !w-11">
          <CIcon name="tree" size={19} />
          {memCount > 0 && <span className="absolute right-1.5 top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-[var(--accent)] px-1 text-[9.5px] font-medium text-[var(--canvas)]">{memCount}</span>}
        </button>
        <button type="button" onClick={onNew} aria-label="New chat" className="ibtn !h-11 !w-11">
          <CIcon name="plus" size={22} />
        </button>
      </div>
    </header>
  );
}

function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const f = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <div className="absolute inset-0 z-40 flex items-end justify-center sm:items-start sm:pt-16">
          <motion.div className="absolute inset-0 bg-black/25 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div role="dialog" aria-modal="true" aria-label={title} initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }} transition={{ type: "spring", stiffness: 380, damping: 36 }} className="calm-card relative max-h-[82%] w-full max-w-[460px] overflow-y-auto rounded-b-none p-3 sm:rounded-[28px]" style={{ borderRadius: undefined }}>
            <div className="mb-1 flex items-center justify-between px-2 pt-1">
              <h2 className="text-[15px] font-medium">{title}</h2>
              <button type="button" className="ibtn" aria-label="Close" onClick={onClose}>
                <CIcon name="x" size={18} />
              </button>
            </div>
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

export function ModelSheet({ open, onClose, choice, onPick, dl, onHub, loading }: { open: boolean; onClose: () => void; choice: Choice; onPick: (c: Choice) => void; dl: Record<string, DlItem>; onHub: () => void; loading: string | null }) {
  const live = useKeylessLive();
  const installed = CATALOG.filter((m) => dl[m.id]?.status === "done");
  const Row = ({ active, children, onClick, disabled }: { active: boolean; children: ReactNode; onClick: () => void; disabled?: boolean }) => (
    <button type="button" onClick={onClick} disabled={disabled} aria-pressed={active} className="flex min-h-[52px] w-full items-center gap-3 rounded-2xl px-3 text-left transition-colors hover:bg-[var(--surface-2)] disabled:opacity-50" style={active ? { background: "var(--halo-a)" } : undefined}>
      {children}
      {active && <CIcon name="check" size={17} className="ml-auto shrink-0 text-[var(--halo-ink)]" />}
    </button>
  );
  return (
    <Sheet open={open} onClose={onClose} title="Choose a model">
      <p className="px-3 pb-1 pt-3 text-[11.5px] font-medium uppercase tracking-[0.08em] text-[rgb(var(--ink-rgb)/var(--ink-3-a))]">Keyless · no setup</p>
      {KEYLESS_MODELS.map((m) => {
        const served = isServed(m, live);
        return (
          <Row key={m.id} active={choice.kind === "keyless" && choice.id === m.id} onClick={() => { onPick({ kind: "keyless", id: m.id }); onClose(); }}>
            <span className="min-w-0">
              <span className="block truncate text-[14px]">{m.label}</span>
              <span className="block truncate text-[11.5px] text-[rgb(var(--ink-rgb)/var(--ink-3-a))]">{m.tag}{served ? " · live" : " · not on free tier right now → routes to GPT-OSS 20B"}</span>
            </span>
          </Row>
        );
      })}
      <p className="px-3 pb-1 pt-4 text-[11.5px] font-medium uppercase tracking-[0.08em] text-[rgb(var(--ink-rgb)/var(--ink-3-a))]">On this device</p>
      {installed.length === 0 && <p className="px-3 pb-2 text-[13px] text-[rgb(var(--ink-rgb)/var(--ink-3-a))]">No local models yet. They run offline and stay private.</p>}
      {installed.map((m) => (
        <Row key={m.id} disabled={loading === m.id} active={choice.kind === "local" && choice.id === m.id} onClick={() => { onPick({ kind: "local", id: m.id }); onClose(); }}>
          <span className="min-w-0">
            <span className="block truncate text-[14px]">{shortModelName(m)} {m.uncensored && <span aria-label="Uncensored">🔓</span>}</span>
            <span className="block truncate text-[11.5px] text-[rgb(var(--ink-rgb)/var(--ink-3-a))]">{loading === m.id ? "Loading into memory…" : `Local · ${(m.sizeGB * 1000).toFixed(0)} MB`}</span>
          </span>
        </Row>
      ))}
      <button type="button" onClick={() => { onClose(); onHub(); }} className="calm-btn mt-3 w-full" data-tone="sage">
        <CIcon name="cube" size={16} /> Browse Model Hub
      </button>
    </Sheet>
  );
}

const NAV: { id: View; icon: string; label: string }[] = [
  { id: "hub", icon: "📦", label: "Model Hub" },
  { id: "studio", icon: "🎨", label: "Image Studio" },
  { id: "memory", icon: "🧠", label: "Memory & Context Graph" },
  { id: "mcp", icon: "🔌", label: "MCP Servers & Skills" },
  { id: "lan", icon: "🖥️", label: "Local Ollama LAN Server" },
  { id: "settings", icon: "⚙️", label: "Settings & Auto-Update" },
];

function bucket(c: Convo, now: number): string {
  if (c.pinned) return "Pinned";
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  if (c.updated >= d.getTime()) return "Today";
  if (c.updated >= d.getTime() - 7 * 864e5) return "Previous 7 days";
  return "Older";
}

export interface DrawerProps {
  open: boolean;
  persistent: boolean;
  onClose: () => void;
  convos: Convo[];
  activeId: string;
  onOpenConvo: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, t: string) => void;
  onDelete: (id: string) => void;
  onPin: (id: string) => void;
  view: View;
  onNav: (v: View) => void;
  hints: Partial<Record<View, string>>;
  update: UpdateState;
}

export function Drawer({ open, persistent, onClose, convos, activeId, onOpenConvo, onNew, onRename, onDelete, onPin, view, onNav, hints, update }: DrawerProps) {
  const [q, setQ] = useState("");
  const [menuId, setMenuId] = useState<string | null>(null);
  const [rename, setRename] = useState<{ id: string; v: string } | null>(null);
  const now = useRef(0);
  const groups = useMemo(() => {
    now.current = Date.now();
    const f = convos.filter((c) => c.title.toLowerCase().includes(q.toLowerCase()));
    const order = ["Pinned", "Today", "Previous 7 days", "Older"];
    return order.map((g) => ({ g, items: f.filter((c) => bucket(c, now.current) === g) })).filter((x) => x.items.length);
  }, [convos, q]);

  useEffect(() => {
    if (!open) return;
    const f = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, [open, onClose]);

  const pill =
    update.s === "available" ? (
      <button type="button" onClick={() => onNav("settings")} className="flex w-full items-center gap-2 rounded-2xl bg-[var(--halo-a)] px-3.5 py-2.5 text-left text-[12.5px] text-[var(--halo-ink)]">
        ✨ <span className="min-w-0 flex-1">Update available ({update.latest}) · tap to download &amp; install</span>
      </button>
    ) : (
      <button type="button" onClick={() => onNav("settings")} className="flex w-full items-center gap-2 rounded-2xl bg-[var(--surface-2)] px-3.5 py-2.5 text-left text-[12.5px] text-[rgb(var(--ink-rgb)/var(--ink-2-a))]">
        {update.s === "error" ? "⚠️" : "✅"}{" "}
        <span className="min-w-0 flex-1">
          Apex v{APP_VERSION} · {update.s === "checking" ? "Checking…" : update.s === "uptodate" ? `Up to date (Checked ${ago(update.at)})` : update.s === "error" ? "Couldn't check for updates" : "Up to date"}
        </span>
      </button>
    );

  return (
    <>
      <div onClick={onClose} aria-hidden="true" className={`absolute inset-0 z-30 bg-black/30 backdrop-blur-[2px] transition-opacity duration-300 ${persistent ? "lg:hidden" : ""} ${open ? "opacity-100" : "pointer-events-none opacity-0"}`} />
      <aside
        aria-label="Navigation"
        aria-hidden={!open && !persistent ? true : undefined}
        {...(!open ? { inert: persistent ? undefined : true } : {})}
        className={`absolute inset-y-0 left-0 z-40 flex w-[86%] max-w-[340px] flex-col border-r border-[var(--hairline)] bg-[var(--canvas)] pt-[max(14px,env(safe-area-inset-top))] shadow-[0_0_60px_-20px_rgb(0_0_0/0.35)] transition-transform duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] ${open ? "translate-x-0" : "-translate-x-full"} ${persistent ? "lg:static lg:z-10 lg:w-[300px] lg:translate-x-0 lg:shadow-none" : ""}`}
      >
        <div className="px-3">
          <div className="mb-3 flex items-center justify-between px-1">
            <span className="text-[15px] font-medium tracking-tight">Apex</span>
            <button type="button" onClick={onClose} aria-label="Close menu" className={`ibtn ${persistent ? "lg:hidden" : ""}`}>
              <CIcon name="x" size={18} />
            </button>
          </div>
          <label className="relative block">
            <span className="sr-only">Search chats</span>
            <CIcon name="search" size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 opacity-50" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search chats" className="calm-field !rounded-full !py-2.5 !pl-10" />
          </label>
          <button type="button" onClick={onNew} className="calm-btn mt-2.5 w-full" data-primary="true">
            <CIcon name="plus" size={16} /> New chat
          </button>
        </div>

        <div className="scroll-quiet mt-3 min-h-0 flex-1 overflow-y-auto px-3 pb-2">
          {groups.length === 0 && <p className="px-2 py-3 text-[13px] text-[rgb(var(--ink-rgb)/var(--ink-3-a))]">{q ? "No chats match." : "Your chats will appear here."}</p>}
          {groups.map(({ g, items }) => (
            <section key={g} aria-label={g} className="mb-2">
              <h3 className="px-2 pb-1 pt-2 text-[11px] font-medium uppercase tracking-[0.08em] text-[rgb(var(--ink-rgb)/var(--ink-3-a))]">{g === "Pinned" ? "📌 Pinned" : g}</h3>
              {items.map((c) => (
                <div key={c.id} className="group relative">
                  {rename?.id === c.id ? (
                    <input autoFocus aria-label="Rename chat" value={rename.v} onChange={(e) => setRename({ id: c.id, v: e.target.value })} onBlur={() => { onRename(c.id, rename.v); setRename(null); }} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} className="calm-field !py-2.5" />
                  ) : (
                    <div className="nav-row" data-active={c.id === activeId && view === "chat"}>
                      <button type="button" onClick={() => onOpenConvo(c.id)} className="min-h-11 min-w-0 flex-1 truncate text-left">
                        {c.title}
                      </button>
                      <button type="button" aria-label={`Options for ${c.title}`} aria-expanded={menuId === c.id} onClick={() => setMenuId(menuId === c.id ? null : c.id)} className="ibtn !h-9 !w-9 -mr-2 opacity-60">
                        <CIcon name="more" size={18} />
                      </button>
                    </div>
                  )}
                  {menuId === c.id && (
                    <div className="mb-1 ml-2 flex gap-1.5">
                      <button type="button" className="calm-chip min-h-9" onClick={() => { onPin(c.id); setMenuId(null); }}>
                        <CIcon name="pin" size={13} /> {c.pinned ? "Unpin" : "Pin"}
                      </button>
                      <button type="button" className="calm-chip min-h-9" onClick={() => { setRename({ id: c.id, v: c.title }); setMenuId(null); }}>
                        <CIcon name="pencil" size={13} /> Rename
                      </button>
                      <button type="button" className="calm-chip min-h-9" style={{ color: "var(--bad)" }} onClick={() => { onDelete(c.id); setMenuId(null); }}>
                        <CIcon name="trash" size={13} /> Delete
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </section>
          ))}
        </div>

        <div className="border-t border-[var(--hairline)] px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-2">
          <nav aria-label="Workspace">
            {NAV.map((n) => (
              <button key={n.id} type="button" className="nav-row" data-active={view === n.id} aria-current={view === n.id ? "page" : undefined} onClick={() => onNav(n.id)}>
                <span className="w-5 text-center text-[16px]" aria-hidden="true">
                  {n.icon}
                </span>
                <span className="min-w-0 truncate">{n.label}</span>
                {hints[n.id] && <small>{hints[n.id]}</small>}
              </button>
            ))}
          </nav>
          <div className="mt-2">{pill}</div>
        </div>
      </aside>
    </>
  );
}

export function Lightbox({ img, onClose }: { img: { url: string; prompt: string } | null; onClose: () => void }) {
  useEffect(() => {
    if (!img) return;
    const f = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, [img, onClose]);
  return (
    <AnimatePresence>
      {img && (
        <motion.div role="dialog" aria-modal="true" aria-label="Image preview" className="absolute inset-0 z-50 grid place-items-center bg-black/80 p-4 backdrop-blur-md" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={img.url} alt={img.prompt} className="max-h-[82%] max-w-full rounded-2xl object-contain shadow-2xl" onClick={(e) => e.stopPropagation()} />
          <div className="absolute right-3 top-[max(12px,env(safe-area-inset-top))] flex gap-2">
            <button type="button" aria-label="Download" className="grid h-11 w-11 place-items-center rounded-full bg-white/15 text-white" onClick={(e) => { e.stopPropagation(); void downloadImage(img.url); }}>
              <CIcon name="download" size={19} />
            </button>
            <button type="button" aria-label="Close preview" className="grid h-11 w-11 place-items-center rounded-full bg-white/15 text-white" onClick={onClose}>
              <CIcon name="x" size={19} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function Toast({ text }: { text: string | null }) {
  return (
    <AnimatePresence>
      {text && (
        <motion.div role="status" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="pointer-events-none absolute inset-x-0 top-16 z-50 flex justify-center px-4">
          <div className="rounded-full bg-[var(--ink-solid)] px-4 py-2.5 text-[13px] text-[var(--canvas)] shadow-lg">{text}</div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function ViewTitle({ icon, title, sub, right }: { icon?: CIconName; title: string; sub?: string; right?: ReactNode }) {
  return (
    <div className="mb-5 flex items-start justify-between gap-3">
      <div>
        <h1 className="flex items-center gap-2 text-[26px] font-normal tracking-[-0.02em]">{icon && <CIcon name={icon} size={22} />}{title}</h1>
        {sub && <p className="mt-1 max-w-[52ch] text-[13.5px] leading-snug text-[rgb(var(--ink-rgb)/var(--ink-3-a))]">{sub}</p>}
      </div>
      {right}
    </div>
  );
}
