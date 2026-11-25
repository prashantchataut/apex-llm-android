"use client";

import { motion } from "framer-motion";

export type TileId = "files" | "images" | "voice" | "code";
const TILES: { id: TileId; icon: string; title: string; sub: string }[] = [
  { id: "files", icon: "📄", title: "Chat with Files", sub: "Drop PDF, code, markdown, docs" },
  { id: "images", icon: "🎨", title: "Generate Images", sub: "Artwork, UI mocks, photos" },
  { id: "voice", icon: "🎙️", title: "Voice Conversation", sub: "Real-time speech & audio notes" },
  { id: "code", icon: "💻", title: "Code & GitHub", sub: "Inspect repos, debug, run skills" },
];

/** Empty-chat state: a calm greeting and four capability tiles. No example prompts. */
export function Home({ onTile }: { onTile: (t: TileId) => void }) {
  return (
    <div className="mx-auto flex h-full w-full max-w-[640px] flex-col justify-center px-5 pb-4">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 200, damping: 26 }}>
        <p className="text-[15px] text-[rgb(var(--ink-rgb)/var(--ink-2-a))]">Hi there 👋</p>
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
            className="calm-tile flex min-h-[116px] flex-col items-start justify-between p-4 text-left"
          >
            <span className="grid h-10 w-10 place-items-center rounded-full bg-[var(--surface-2)] text-[19px]" aria-hidden="true">
              {t.icon}
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
