"use client";

import { motion } from "framer-motion";
import { CIcon, type CIconName } from "./icons";

export type TileId = "files" | "images" | "voice" | "code";
const TILES: { id: TileId; icon: CIconName; title: string; sub: string }[] = [
  { id: "files", icon: "file", title: "Chat with Files", sub: "Drop PDF, code, markdown, docs" },
  { id: "images", icon: "palette", title: "Generate Images", sub: "Artwork, UI mocks, photos" },
  { id: "voice", icon: "mic", title: "Voice Conversation", sub: "Speech in, spoken notes out" },
  { id: "code", icon: "branch", title: "Code & GitHub", sub: "Inspect repos, debug, run skills" },
];

/** Empty-chat state: greeting + four capability tiles with vector icon wells. */
export function Home({ onTile }: { onTile: (t: TileId) => void }) {
  return (
    <div className="scroll-quiet mx-auto flex h-full w-full max-w-[640px] flex-col justify-center overflow-y-auto px-5 pb-4">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 200, damping: 26 }}>
        <p className="text-[15px] text-[rgb(var(--ink-rgb)/var(--ink-2-a))]">Hi there</p>
        <h1 className="mt-1 text-[clamp(28px,7vw,40px)] font-normal leading-[1.12] tracking-[-0.025em]">What do you want to do today?</h1>
      </motion.div>
      <div className="mt-7 grid grid-cols-2 gap-3">
        {TILES.map((t, i) => (
          <motion.button
            key={t.id}
            type="button"
            onClick={() => onTile(t.id)}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 220, damping: 26, delay: 0.06 + i * 0.05 }}
            className="calm-tile flex min-h-[124px] flex-col items-start justify-between p-4 text-left"
          >
            <span className="well" aria-hidden="true">
              <CIcon name={t.icon} size={19} />
            </span>
            <span>
              <span className="block text-[14.5px] font-medium leading-tight">{t.title}</span>
              <span className="mt-1 block text-[12px] leading-snug text-[rgb(var(--ink-rgb)/var(--ink-3-a))]">{t.sub}</span>
            </span>
          </motion.button>
        ))}
      </div>
    </div>
  );
}
