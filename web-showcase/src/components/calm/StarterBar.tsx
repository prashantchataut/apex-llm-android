"use client";

import { CIcon, type CIconName } from "./icons";
import { STARTERS, type Starter } from "@/lib/templates";

const ICON: Record<Starter["id"], CIconName> = { presentation: "layers", page: "code", pdf: "file", research: "globe" };

/** Minimal horizontal pill bar above the composer. Each pill starts a real studio workflow. */
export function StarterBar({ onPick }: { onPick: (s: Starter) => void }) {
  return (
    <div className="mb-2 flex gap-1.5 overflow-x-auto scroll-quiet pb-0.5" role="group" aria-label="Quick start" data-testid="starter-bar">
      {STARTERS.map((s) => (
        <button key={s.id} type="button" onClick={() => onPick(s)} data-testid={`pill-${s.id}`} className="flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-[var(--surface)] px-3.5 text-[13px] font-medium shadow-[var(--specular),var(--shadow-card)] active:scale-[0.97]">
          <CIcon name={ICON[s.id]} size={14} />
          {s.pill}
        </button>
      ))}
    </div>
  );
}
