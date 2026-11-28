"use client";

import { ensureMeshConfig, isModelDisabled, modelDisplayName, useMesh } from "@/services/apexCloudMesh";
import { VERIFIED_AT, VERIFIED_COUNT, VERIFIED_MODELS, VERIFIED_TESTED } from "@/lib/verified";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CATALOG } from "@/lib/models";
import { estimateRamMb, shortModelName, unloadWllama, useEngine } from "@/lib/engine";
import { useBackLayer } from "@/lib/backstack";
import { isServed, servedLabel, useApexModels } from "@/lib/apex-cloud";
import type { Access } from "@/lib/access";
import { downloadImage } from "@/lib/images";
import { ago, openUpdateModal, type UpdateState } from "@/lib/updater";
import { APP_VERSION } from "@/lib/version";
import type { Choice, Convo } from "@/lib/store";
import { ApexMark } from "./ApexMark";
import { CIcon, type CIconName } from "./icons";
import { ModelSwitcher } from "@/components/modals/ModelSwitcher";
import type { DlItem } from "@/lib/downloader";

export type View = "chat" | "hub" | "studio" | "memory" | "vault" | "mcp" | "lan" | "settings";

export function Header({ persistent, onMenu, label, onPill, onNew, onCompare, children, updateBadge }: { onCompare?: () => void; updateBadge?: boolean; persistent: boolean; onMenu: () => void; label: string; onPill: () => void; onNew: () => void; children?: ReactNode }) {
  return (
    <header className="relative z-20 grid grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-2 px-3 pb-2 pt-safe">
      <div className="flex min-w-0">
        <button type="button" onClick={onMenu} aria-label={updateBadge ? "Open sidebar (update available)" : "Open sidebar"} className={`ibtn relative !h-11 !w-11 ${persistent ? "lg:hidden" : ""}`}>
          <CIcon name="sidebar" size={21} />
          {updateBadge && <span className="upd-dot" data-testid="update-badge" aria-hidden="true" />}
        </button>
      </div>
      <motion.button
        type="button"
        onClick={onPill}
        aria-haspopup="dialog"
        aria-label={`Model: ${label}. Switch model`}
        whileTap={{ scale: 0.96 }}
        transition={{ type: "spring", stiffness: 500, damping: 28 }}
        className="mx-auto flex h-10 min-w-0 max-w-full items-center gap-2 rounded-full bg-[var(--surface)] px-4 text-[13.5px] font-medium shadow-[var(--specular),var(--shadow-card)] sm:max-w-[420px]"
      >
        <ApexMark size={20} className="shrink-0" />
        <span className="truncate">{label}</span>
        <CIcon name="chevron" size={13} className="shrink-0 opacity-50" />
      </motion.button>
      <div className="flex shrink-0 items-center justify-end gap-0.5">
        {onCompare && (
          <button type="button" onClick={onCompare} aria-label="Compare 2 models" data-testid="compare-toggle" className="ibtn !h-11 !w-11">
            <CIcon name="compare" size={20} />
          </button>
        )}
        <button type="button" onClick={onNew} aria-label="New chat" className="ibtn !h-11 !w-11">
          <CIcon name="pencil" size={20} />
        </button>
      </div>
      {children}
    </header>
  );
}

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const [vh, setVh] = useState<number | null>(null);
  useEffect(() => {
    if (!open) return;
    const f = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, [open, onClose]);
  /* Android soft keyboard: track the visual viewport so the dialog (input, message, Unlock button) always fits above the keyboard. */
  useEffect(() => {
    if (!open) return;
    const vv = window.visualViewport;
    const read = () => setVh(vv ? Math.round(vv.height) : null);
    read();
    vv?.addEventListener("resize", read);
    vv?.addEventListener("scroll", read);
    return () => {
      vv?.removeEventListener("resize", read);
      vv?.removeEventListener("scroll", read);
    };
  }, [open]);
  return (
    <AnimatePresence>
      {open && (
        <div className="absolute inset-0 z-[60] flex items-start justify-center px-3 pt-14 sm:items-center sm:pt-0" style={vh ? { height: vh } : undefined}>
          <motion.div className="absolute inset-0 bg-black/30 backdrop-blur-[3px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }} onClick={onClose} />
          <motion.div role="dialog" aria-modal="true" aria-label={title} initial={{ y: -18, opacity: 0, scale: 0.97 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: -12, opacity: 0, scale: 0.98 }} transition={{ duration: 0.42, ease: [0.23, 1, 0.32, 1] }} className="calm-card relative w-full max-w-[460px] overflow-y-auto rounded-[28px] p-3" style={{ borderRadius: undefined, maxHeight: vh ? Math.max(240, vh - 72) : "calc(100% - 72px)" }}>
            <div className="mb-1 flex items-center justify-between px-2 pt-1">
              <h2 className="text-[16px] font-medium tracking-[-0.02em]">{title}</h2>
              <button type="button" className="ibtn active:scale-[0.97]" aria-label="Close" onClick={onClose}>
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

type PopTab = "local" | "uncensored" | "cloud";

/** BeautifulUI-style floating popover under the header pill: 1-tap switching, inline Eject, live RAM meter. */
export function ModelSheet({ open, onClose, choice, onPick, dl, onHub, loading, access, onKey }: { open: boolean; onClose: () => void; choice: Choice; onPick: (c: Choice) => void; dl: Record<string, DlItem>; onHub: (tab: "trending" | "uncensored" | "search") => void; loading: string | null; access: Access; onKey: () => void }) {
  useMesh(); // re-render when the owner's mesh.json (disabled / renamed models) arrives
  useEffect(() => void ensureMeshConfig(), []);
  const apex = useApexModels();
  const eng = useEngine();
  const localChoice = choice.kind === "local" ? CATALOG.find((m) => m.id === choice.id) : undefined;
  const [tab, setTab] = useState<PopTab>("local");
  useBackLayer(open, onClose);
  useEffect(() => {
    if (open) setTab(choice.kind === "local" ? (localChoice?.uncensored ? "uncensored" : "local") : "cloud");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const f = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, [open, onClose]);

  const installed = CATALOG.filter((m) => dl[m.id]?.status === "done");
  const list = installed.filter((m) => (tab === "uncensored" ? !!m.uncensored : !m.uncensored));
  const loadedModel = CATALOG.find((m) => m.id === eng.loaded.a);
  const usedMb = loadedModel ? estimateRamMb(loadedModel) : 0;
  const devGb = typeof navigator !== "undefined" ? (navigator as Navigator & { deviceMemory?: number }).deviceMemory : undefined;
  const capMb = (devGb ?? 8) * 1000 * 0.6;
  const pct = Math.min(100, Math.round((usedMb / capMb) * 100));
  const sub = "block truncate text-[11.5px] text-[rgb(var(--ink-rgb)/var(--ink-3-a))]";
  const Row = ({ active, children, onClick, disabled }: { active: boolean; children: ReactNode; onClick: () => void; disabled?: boolean }) => (
    <button type="button" onClick={onClick} disabled={disabled} aria-pressed={active} className="flex min-h-[50px] w-full items-center gap-3 rounded-2xl px-3 text-left transition-colors hover:bg-[var(--surface-2)] disabled:opacity-50" style={active ? { background: "var(--halo-a)" } : undefined}>
      {children}
      {active && <CIcon name="check" size={16} className="ml-auto shrink-0 text-[var(--halo-ink)]" />}
    </button>
  );
  const go = (t: "trending" | "uncensored" | "search") => {
    onClose();
    onHub(t);
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="fixed inset-0 z-40 bg-zinc-950/70 backdrop-blur-xl" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} aria-hidden="true" />
          <motion.div role="dialog" aria-label="Choose a model" data-testid="model-popover" initial={{ opacity: 0, y: -8, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.97 }} transition={{ type: "spring", stiffness: 460, damping: 34 }} className="calm-card pop-in absolute left-1/2 top-pop z-40 max-h-[min(80dvh,720px)] w-[min(460px,calc(100vw-24px))] -translate-x-1/2 overflow-y-auto p-2">
            <ModelSwitcher choice={choice} onPick={(c) => { onPick(c); onClose(); }} installed={installed} loadedId={eng.loaded.a ?? undefined} loading={loading} unlocked={apex.unlocked} onKey={() => { onClose(); onKey(); }} onHub={(t) => { onClose(); onHub(t); }} />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

const NAV: { id: View; icon: CIconName; label: string }[] = [
  { id: "hub", icon: "cube", label: "Models" },
  { id: "studio", icon: "image", label: "Image Studio" },
  { id: "memory", icon: "tree", label: "Memory" },
  { id: "vault", icon: "db", label: "Knowledge Vault" },
  { id: "mcp", icon: "plug", label: "Skills & MCP" },
  { id: "lan", icon: "server", label: "Local server" },
  { id: "settings", icon: "gear", label: "Settings" },
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
      <button type="button" data-testid="drawer-update" onClick={() => { onClose(); openUpdateModal(); }} className="relative flex w-full items-center gap-2 rounded-2xl bg-[var(--halo-a)] px-3.5 py-2.5 text-left text-[12.5px] font-medium text-[var(--halo-ink)]">
        <span className="relative grid h-5 w-5 place-items-center"><span className="upd-ping absolute inset-0 rounded-full" aria-hidden="true" /><CIcon name="sparkle" size={15} /></span> <span className="min-w-0 flex-1">Update {update.latest} available · Tap to install</span>
      </button>
    ) : (
      <button type="button" onClick={() => { onClose(); openUpdateModal(); }} className="flex w-full items-center gap-2 rounded-2xl bg-[var(--surface-2)] px-3.5 py-2.5 text-left text-[12.5px] text-[rgb(var(--ink-rgb)/var(--ink-2-a))]">
        <CIcon name={update.s === "error" ? "alert" : "check"} size={15} />
        <span className="min-w-0 flex-1">
          v{APP_VERSION} · {update.s === "checking" ? "Checking…" : update.s === "uptodate" ? `Up to date, checked ${ago(update.at)}` : update.s === "error" ? "Couldn't check for updates" : "Up to date"}
        </span>
      </button>
    );

  return (
    <>
      <div onClick={onClose} aria-hidden="true" className={`absolute inset-0 z-50 bg-black/20 backdrop-blur-[3px] transition-opacity duration-300 ${persistent ? "lg:hidden" : ""} ${open ? "opacity-100" : "pointer-events-none opacity-0"}`} />
      <aside
        aria-label="Navigation"
        aria-hidden={!open && !persistent ? true : undefined}
        {...(!open ? { inert: persistent ? undefined : true } : {})}
        className={`absolute inset-y-0 left-0 z-50 flex w-[86%] max-w-[340px] flex-col bg-[var(--canvas)] pt-safe-lg ${open ? "shadow-[0_0_70px_-24px_rgb(0_0_0/0.3)]" : ""} transition-transform duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] ${open ? "translate-x-0" : "-translate-x-full"} ${persistent ? "lg:static lg:z-10 lg:w-[300px] lg:translate-x-0 lg:shadow-none" : ""}`}
      >
        <div className="px-3">
          <div className="mb-3 flex items-center justify-between px-1">
            <span className="flex items-center gap-2.5 text-[17px] font-medium tracking-[-0.025em]"><ApexMark size={26} />Apex</span>
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
              <h3 className="px-2 pb-1 pt-2 text-[12.5px] text-[rgb(var(--ink-rgb)/var(--ink-3-a))]">{g}</h3>
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

        <div className="px-3 pb-safe-lg pt-2">
          <nav aria-label="Workspace">
            {NAV.map((n) => (
              <button key={n.id} type="button" className="nav-row" data-active={view === n.id} aria-current={view === n.id ? "page" : undefined} onClick={() => onNav(n.id)}>
                <CIcon name={n.icon} size={19} className="opacity-75" />
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
        <motion.div role="dialog" aria-modal="true" aria-label="Image preview" className="absolute inset-0 z-[60] grid place-items-center bg-black/80 p-4 backdrop-blur-md" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={img.url} alt={img.prompt} className="max-h-[82%] max-w-full rounded-2xl object-contain shadow-2xl" onClick={(e) => e.stopPropagation()} />
          <div className="absolute right-3 top-safe flex gap-2">
            <button type="button" aria-label="Download" className="grid h-11 w-11 place-items-center rounded-full bg-[rgb(255_255_255/0.15)] text-[#fff]" onClick={(e) => { e.stopPropagation(); void downloadImage(img.url); }}>
              <CIcon name="download" size={19} />
            </button>
            <button type="button" aria-label="Close preview" className="grid h-11 w-11 place-items-center rounded-full bg-[rgb(255_255_255/0.15)] text-[#fff]" onClick={onClose}>
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
        <motion.div role="status" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="pointer-events-none absolute inset-x-0 top-16 z-[70] flex justify-center px-4">
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
        <h1 className="flex items-center gap-2 text-[30px] font-normal leading-[1.1] tracking-[-0.03em]">{icon && <CIcon name={icon} size={22} />}{title}</h1>
        {sub && <p className="mt-2 max-w-[46ch] text-[14.5px] leading-relaxed text-[rgb(var(--ink-rgb)/var(--ink-3-a))]">{sub}</p>}
      </div>
      {right}
    </div>
  );
}
