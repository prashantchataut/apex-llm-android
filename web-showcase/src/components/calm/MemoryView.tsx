"use client";

import { useState } from "react";
import { MEM_GROUPS, addMemory, removeMemory, updateMemory, useMemories, wipeMemories, type MemGroup } from "@/lib/memory";
import { CIcon } from "./icons";
import { ViewTitle } from "./Chrome";

/** What Apex knows about you, as a connected tree: You ↳ Identity | Projects | Preferences | Tone. */
export function MemoryView() {
  const mems = useMemories();
  const [text, setText] = useState("");
  const [group, setGroup] = useState<MemGroup>("Preferences");
  const [edit, setEdit] = useState<{ id: string; v: string } | null>(null);
  const [confirm, setConfirm] = useState(false);

  return (
    <div className="mx-auto w-full max-w-[640px] px-5 pb-10 pt-3">
      <ViewTitle title="Memory" sub="Facts Apex remembers across chats and models. Say “remember that I…” in any chat, or add one here. Everything stays on this device." />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (addMemory(text, group, "manual")) setText("");
        }}
        className="calm-card mb-6 flex flex-col gap-2 p-3 sm:flex-row"
      >
        <input value={text} onChange={(e) => setText(e.target.value)} aria-label="New memory" placeholder="Prefers Rust and minimal UI" className="calm-field !rounded-full" />
        <div className="flex gap-2">
          <select value={group} onChange={(e) => setGroup(e.target.value as MemGroup)} aria-label="Group" className="calm-field !w-auto !rounded-full">
            {MEM_GROUPS.map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
          <button type="submit" className="calm-btn" data-primary="true" disabled={text.trim().length < 3}>
            <CIcon name="plus" size={15} /> Add
          </button>
        </div>
      </form>

      <span className="node" data-tone="topic">
        <CIcon name="tree" size={14} /> You · {mems.filter((m) => m.on).length} active
      </span>
      <div className="tree-link">
        {MEM_GROUPS.map((g) => {
          const items = mems.filter((m) => m.group === g);
          return (
            <div key={g} className="tree-item">
              <span className="node">{g} <span className="tnum opacity-60">{items.length}</span></span>
              {items.length > 0 && (
                <div className="tree-link mt-1">
                  {items.map((m) => (
                    <div key={m.id} className="tree-item">
                      <div className="flex min-h-11 items-center gap-2 rounded-[18px] bg-[var(--surface)] py-1 pl-4 pr-1.5 shadow-[var(--specular),var(--shadow-card)]" style={{ opacity: m.on ? 1 : 0.5 }}>
                        {edit?.id === m.id ? (
                          <input autoFocus aria-label="Edit memory" value={edit.v} onChange={(e) => setEdit({ id: m.id, v: e.target.value })} onBlur={() => { if (edit.v.trim().length > 2) updateMemory(m.id, { text: edit.v.trim() }); setEdit(null); }} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} className="min-w-0 flex-1 bg-transparent text-[14px] outline-none" />
                        ) : (
                          <span className="min-w-0 flex-1 text-[14px] leading-snug">{m.text}</span>
                        )}
                        <span className="hidden shrink-0 text-[12px] text-[rgb(var(--ink-rgb)/var(--ink-3-a))] sm:block">{m.source}</span>
                        <button type="button" className="ibtn !h-9 !w-9" aria-label={`Edit “${m.text}”`} onClick={() => setEdit({ id: m.id, v: m.text })}>
                          <CIcon name="pencil" size={14} />
                        </button>
                        <button type="button" className="ibtn !h-9 !w-9" aria-label={`Delete “${m.text}”`} onClick={() => removeMemory(m.id)}>
                          <CIcon name="trash" size={14} />
                        </button>
                        <button type="button" role="switch" aria-checked={m.on} aria-label={`Use “${m.text}”`} className="switch mr-1" onClick={() => updateMemory(m.id, { on: !m.on })} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {mems.length === 0 && <p className="mt-6 text-[13.5px] text-[rgb(var(--ink-rgb)/var(--ink-3-a))]">Nothing yet. Try telling a chat: “I’m building a Rust app and I prefer minimal UI.”</p>}
      {mems.length > 0 && (
        <div className="mt-8 flex items-center gap-3">
          {confirm ? (
            <>
              <span className="text-[13px]">Erase all {mems.length} memories?</span>
              <button type="button" className="calm-btn" style={{ color: "var(--bad)" }} onClick={() => { wipeMemories(); setConfirm(false); }}>Erase</button>
              <button type="button" className="calm-btn" onClick={() => setConfirm(false)}>Keep</button>
            </>
          ) : (
            <button type="button" className="calm-btn" onClick={() => setConfirm(true)}>
              <CIcon name="trash" size={15} /> Wipe all memory
            </button>
          )}
        </div>
      )}
    </div>
  );
}
