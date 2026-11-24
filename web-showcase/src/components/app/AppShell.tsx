"use client";

import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import { useCallback, useEffect, useState } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";
import { ThemeSheet } from "@/components/theme/ThemePicker";
import { DEVICES, type DeviceProfile } from "@/lib/compat";
import { detectDevice } from "@/lib/device";
import type { MediaKind } from "@/lib/media";
import { loadOnboarding, saveOnboarding, type OnboardingState } from "@/lib/prefs";
import { ChatScreen } from "./ChatScreen";
import { HomeScreen } from "./HomeScreen";
import { HubScreen } from "./HubScreen";
import { Onboarding } from "./Onboarding";
import { ServerScreen, type KeyRec } from "./ServerScreen";
import { StudioScreen } from "./StudioScreen";
import { useDemoChat } from "./useDemoChat";
import { useDownloads } from "./useDownloads";

type Tab = "home" | "chat" | "studio" | "hub" | "server";
const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: "home", label: "Home", icon: "home" },
  { id: "chat", label: "Chat", icon: "chat" },
  { id: "studio", label: "Studio", icon: "sparkle" },
  { id: "hub", label: "Models", icon: "cube" },
  { id: "server", label: "Server", icon: "server" },
];
/** Idle screens use the first aurora set, chat-like screens the second (palette decides the colours). */
const TONE: Record<Tab, "violet" | "cobalt"> = { home: "violet", hub: "violet", studio: "violet", chat: "cobalt", server: "cobalt" };

/** `firstRun`: show onboarding when it has not been completed (the /app route). The landing-page demo passes false. */
export function AppShell({ firstRun = false }: { firstRun?: boolean }) {
  const [tab, setTab] = useState<Tab>("home");
  const [keys, setKeys] = useState<KeyRec[]>([{ id: "demo0001", name: "Cursor · laptop", hint: "Qx7a", requests: 12, tokens: 3480, revoked: false }]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [hubSection, setHubSection] = useState<"text" | "image" | "video" | "voice">("text");
  const [dev, setDev] = useState<DeviceProfile>(DEVICES[1]);
  const [source, setSource] = useState<"native" | "browser" | "preset">("preset");
  const [onboarding, setOnboarding] = useState<OnboardingState | null>(null);
  const chat = useDemoChat();
  const downloads = useDownloads();

  useEffect(() => {
    let live = true;
    void detectDevice().then((d) => {
      if (!live) return;
      setDev(d.profile);
      setSource(d.source);
    });
    if (firstRun) setOnboarding(loadOnboarding());
    return () => {
      live = false;
    };
  }, [firstRun]);

  const finishOnboarding = useCallback((s: OnboardingState) => {
    saveOnboarding(s);
    setOnboarding(s);
    if (s.picks.length > 0) {
      setHubSection("text");
      setTab("hub");
    }
  }, []);

  const send = (p: string) => {
    if (!p) return;
    chat.send(p);
    setTab("chat");
  };
  const browse = (k: MediaKind) => {
    setHubSection(k);
    setTab("hub");
  };
  const showOnboarding = firstRun && onboarding !== null && !onboarding.done;

  return (
    <div className="relative h-full w-full overflow-hidden bg-canvas text-white">
      <div className="aurora" data-tone={TONE[tab]} />
      <div className="grain pointer-events-none absolute inset-0" />
      <div className="absolute inset-0 flex flex-col">
        <main className="relative min-h-0 flex-1">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={tab} className="absolute inset-0" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ type: "spring", stiffness: 340, damping: 32, mass: 0.8 }}>
              {tab === "home" && <HomeScreen onSend={send} onOpenSettings={() => setSettingsOpen(true)} />}
              {tab === "chat" && <ChatScreen msgs={chat.msgs} busy={chat.busy} onSend={send} />}
              {tab === "studio" && <StudioScreen dev={dev} downloads={downloads} onBrowse={browse} />}
              {tab === "hub" && <HubScreen activeKeys={keys.filter((k) => !k.revoked).length} dev={dev} setDev={setDev} source={source} downloads={downloads} initialSection={hubSection} />}
              {tab === "server" && <ServerScreen keys={keys} setKeys={setKeys} />}
            </motion.div>
          </AnimatePresence>
        </main>

        <nav aria-label="Primary" className="px-3 pb-5 pt-1">
          <LayoutGroup>
            <div className="glass-dark mx-auto flex max-w-[360px] items-center justify-between rounded-full p-1.5">
              {TABS.map((t) => {
                const active = t.id === tab;
                return (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    aria-current={active ? "page" : undefined}
                    aria-label={t.label}
                    className={`relative flex h-12 min-h-11 items-center justify-center rounded-full text-[12px] font-medium transition-[flex-grow,transform] duration-300 active:scale-[0.97] ${active ? "flex-[1.9]" : "flex-1"}`}
                  >
                    {active && <motion.span layoutId="tab-pill" className="absolute inset-0 rounded-full bg-white/[0.14]" transition={{ type: "spring", stiffness: 420, damping: 32 }} />}
                    <span className={`relative flex items-center gap-1.5 ${active ? "text-white" : "text-ink-3"}`}>
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

      <ThemeSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} inline />
      <AnimatePresence>{showOnboarding && <Onboarding dev={dev} setDev={setDev} source={source} downloads={downloads} onFinish={finishOnboarding} />}</AnimatePresence>
    </div>
  );
}
