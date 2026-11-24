"use client";

import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import { useState } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";
import { ChatScreen } from "./ChatScreen";
import { HomeScreen } from "./HomeScreen";
import { HubScreen } from "./HubScreen";
import { ServerScreen, type KeyRec } from "./ServerScreen";
import { useDemoChat } from "./useDemoChat";

type Tab = "home" | "chat" | "hub" | "server";
const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: "home", label: "Home", icon: "home" },
  { id: "chat", label: "Chat", icon: "chat" },
  { id: "hub", label: "Models", icon: "cube" },
  { id: "server", label: "Server", icon: "server" },
];
/** Idle = violet (#6D28D9) · active chat = cobalt (#1D4ED8). */
const TONE: Record<Tab, "violet" | "cobalt"> = { home: "violet", hub: "violet", chat: "cobalt", server: "cobalt" };

export function AppShell() {
  const [tab, setTab] = useState<Tab>("home");
  const [keys, setKeys] = useState<KeyRec[]>([{ id: "demo0001", name: "Cursor · laptop", hint: "Qx7a", requests: 12, tokens: 3480, revoked: false }]);
  const chat = useDemoChat();

  const send = (p: string) => {
    if (!p) return;
    chat.send(p);
    setTab("chat");
  };

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#050507] text-white">
      <div className="aurora" data-tone={TONE[tab]} />
      <div className="grain pointer-events-none absolute inset-0" />
      <div className="absolute inset-0 flex flex-col">
        <main className="relative min-h-0 flex-1">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={tab}
              className="absolute inset-0"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ type: "spring", stiffness: 340, damping: 32, mass: 0.8 }}
            >
              {tab === "home" && <HomeScreen onSend={send} />}
              {tab === "chat" && <ChatScreen msgs={chat.msgs} busy={chat.busy} onSend={send} />}
              {tab === "hub" && <HubScreen activeKeys={keys.filter((k) => !k.revoked).length} />}
              {tab === "server" && <ServerScreen keys={keys} setKeys={setKeys} />}
            </motion.div>
          </AnimatePresence>
        </main>

        <nav aria-label="Primary" className="px-4 pb-5 pt-1">
          <LayoutGroup>
            <div className="glass-dark mx-auto flex max-w-[340px] items-center justify-between rounded-full p-1.5">
              {TABS.map((t) => {
                const active = t.id === tab;
                return (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    aria-current={active ? "page" : undefined}
                    aria-label={t.label}
                    className="relative flex h-12 flex-1 items-center justify-center gap-1.5 rounded-full text-[12px] font-medium"
                  >
                    {active && <motion.span layoutId="tab-pill" className="absolute inset-0 rounded-full bg-white/[0.14]" transition={{ type: "spring", stiffness: 420, damping: 32 }} />}
                    <span className={`relative flex items-center gap-1.5 ${active ? "text-white" : "text-white/45"}`}>
                      <Icon name={t.icon} size={19} />
                      {active && <span>{t.label}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          </LayoutGroup>
        </nav>
      </div>
    </div>
  );
}
