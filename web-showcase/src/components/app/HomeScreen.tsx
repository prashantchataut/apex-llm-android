"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import { ApexTile } from "@/components/brand/ApexLogo";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Ph } from "@/components/ui/Swiss";
import { SUGGESTIONS } from "@/lib/demo-script";
import type { Attachment } from "@/lib/attachments";
import type { Cartridge } from "@/lib/cartridges";
import { Cartridges } from "./Cartridges";
import { Composer } from "./Composer";
import { GuardPill } from "./GuardPill";
import { NanoCard } from "./NanoCard";
import { modelLabel } from "./useChat";
import type { Downloads } from "./useDownloads";
import { useVoice } from "./useVoice";

const ICONS: Record<string, IconName> = { quant: "cpu", math: "prism", rust: "code", repo: "github" };

/** Archetype A — themed canvas with top-bleed aurora (rendered by the shell), asymmetric bento cards, docked quick-action pill. */
export function HomeScreen({
  onSend,
  onOpenSettings,
  model,
  cartridges,
  downloads,
  kvUsed,
}: {
  onSend: (prompt: string, atts?: Attachment[]) => void;
  onOpenSettings: () => void;
  model: string | null;
  cartridges: { all: Cartridge[]; selected: Cartridge; select: (id: string) => void; save: (c: Cartridge) => void; remove: (id: string) => void };
  downloads: Downloads;
  kvUsed: number;
}) {
  const [value, setValue] = useState("");
  const { voice, toggleVoice } = useVoice(setValue);

  return (
    <div className="flex h-full flex-col">
      <div className="scroll-hide flex-1 overflow-y-auto px-5 pb-3 pt-14">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
            <ApexTile size={30} />
            Apex
          </div>
          <div className="flex items-center gap-2">
            <span className="glass-dark mono rounded-full px-3 py-1.5 text-[11px] text-ink-2">
              <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-ok align-middle" />
              {model ? modelLabel(model).split(" · ")[0] : "Qwen2.5 3B"}
            </span>
            <button onClick={onOpenSettings} aria-label="Appearance and settings" className="glass-dark grid h-11 w-11 place-items-center rounded-full transition-transform active:scale-[0.97]">
              <Icon name="sliders" size={18} />
            </button>
          </div>
        </div>

        <GuardPill className="mt-3" kvUsed={kvUsed} kvMax={cartridges.selected.ctx} />

        <h1 className="display mt-10 text-[40px]">
          <Ph text="Ask anything." from={1} to={1} />
          <br />
          <Ph text="It stays on your phone." from={1} to={0.35} />
        </h1>

        <div className="mt-8 grid grid-cols-2 gap-3">
          {SUGGESTIONS.map((s, i) => {
            const tall = "tall" in s && s.tall;
            const wide = "wide" in s && s.wide;
            return (
              <motion.button
                key={s.id}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: "spring", stiffness: 260, damping: 26, delay: 0.08 + i * 0.06 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => onSend(s.title)}
                className={`bento flex flex-col justify-between p-4 text-left ${tall ? "row-span-2 min-h-[210px]" : "min-h-[104px]"} ${wide ? "col-span-2" : ""}`}
              >
                <div>
                  <div className="mono text-[10px] uppercase tracking-[0.14em] text-ink-3">{s.tag}</div>
                  <div className="mt-2 text-[15px] font-medium leading-[1.25] tracking-tight text-white">{s.title}</div>
                </div>
                <span className="icon-pill mt-4 self-start text-ink-2">
                  <Icon name={ICONS[s.id]} size={17} />
                </span>
              </motion.button>
            );
          })}
        </div>

        <NanoCard downloads={downloads} className="mt-5" />

        <div className="mt-7">
          <Cartridges all={cartridges.all} selected={cartridges.selected} onSelect={cartridges.select} onSave={cartridges.save} onRemove={cartridges.remove} />
        </div>
      </div>

      {/* docked composer */}
      <div className="px-4 pb-2">
        <Composer value={value} onChange={setValue} onSend={(t, a) => onSend(t, a)} voice={voice} onMic={toggleVoice} ctx={cartridges.selected.ctx} footer="Private by design · everything runs on this device" />
      </div>
    </div>
  );
}
