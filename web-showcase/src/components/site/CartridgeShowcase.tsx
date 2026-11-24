"use client";

import { useState } from "react";
import { Cartridge3D } from "@/components/app/Cartridges";
import { BUILTIN_CARTRIDGES } from "@/lib/cartridges";

/** The four built-in Modelfile cartridges, tilting under the pointer. Tap one to “load” it. */
export function CartridgeShowcase() {
  const [id, setId] = useState(BUILTIN_CARTRIDGES[0].id);
  const sel = BUILTIN_CARTRIDGES.find((c) => c.id === id) ?? BUILTIN_CARTRIDGES[0];
  return (
    <div>
      <div className="scroll-hide -mx-5 flex snap-x gap-4 overflow-x-auto px-5 pb-5 pt-4 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
        {BUILTIN_CARTRIDGES.map((c) => (
          <Cartridge3D key={c.id} c={c} active={c.id === id} onPick={() => setId(c.id)} />
        ))}
      </div>
      <div className="bento mt-4 max-w-[640px] p-5">
        <div className="mono text-[10.5px] uppercase tracking-[0.16em] text-ink-3">Loaded · {sel.name}</div>
        <p className="mt-2 text-[14px] leading-relaxed text-ink-2">{sel.system}</p>
        <div className="mono mt-3 flex gap-4 text-[11.5px] text-ink-3">
          <span>temperature {sel.temperature.toFixed(1)}</span>
          <span>top-p {sel.topP.toFixed(2)}</span>
          <span>ctx {sel.ctx}</span>
        </div>
      </div>
    </div>
  );
}
