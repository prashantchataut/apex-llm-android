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
import { useChat } from "./useChat";
import { useDownloads } from "./useDownloads";
import type { Attachment } from "@/lib/attachments";
import { useCartridges } from "@/lib/cartridges";
import { haptic } from "@/lib/haptics";
import { invokeNative, isNative } from "@/lib/native";
import { useKeyboardInset } from "@/lib/useKeyboard";

type Tab = "home" | "chat" | "studio" | "hub" | "server";
const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: "home", label: "Home", icon: "home" },
  { id: "chat", label: "Chat", icon: "chat" },
  { id: "studio", label: "Studio", icon: "prism" },
  { id: "hub", label: "Models", icon: "cube" },
  { id: "server", label: "Server", icon: "server" },
];
/** Idle screens use the first aurora set, chat-like screens the second (palette decides the colours). */
const TONE: Record<Tab, "violet" | "cobalt"> = { home: "violet", hub: "violet", studio: "violet", chat: "cobalt", server: "cobalt" };

/** `firstRun`: show onboarding when it has not been completed (the /app route). The landing-page demo passes false. */
export function AppShell({ firstRun = false }: { firstRun?: boolean }) {
  const [tab, setTab] = useState<Tab>("home");
  const [keys, setKeys] = useState<KeyRec[]>(() => (isNative() ? [] : [{ id: "sample01", name: "Cursor · laptop", hint: "Qx7a", requests: 12, tokens: 3480, revoked: false }]));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [hubSection, setHubSection] = useState<"text" | "image" | "video" | "voice">("text");
  const [dev, setDev] = useState<DeviceProfile>(DEVICES[1]);
  const [source, setSource] = useState<"native" | "browser" | "preset">("preset");
  const [onboarding, setOnboarding] = useState<OnboardingState | null>(null);
  const [replay, setReplay] = useState(false);
  const chat = useChat();
  const cart = useCartridges();
  const kb = useKeyboardInset();
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
    setReplay(false);
    if (s.picks.length > 0) {
      setHubSection("text");
      setTab("hub");
    }
  }, []);

  const send = (p: string, atts?: Attachment[]) => {
    if (!p) return;
    chat.send(p, { attachments: atts, cartridge: cart.selected, ctx: cart.selected.ctx });
    setTab("chat");
  };
  const opts = { cartridge: cart.selected, ctx: cart.selected.ctx };
  const go = (t: Tab) => {
    if (t !== tab) haptic("detentClick");
    setTab(t);
  };
  const browse = (k: MediaKind) => {
    setHubSection(k);
    setTab("hub");
  };
  const showOnboarding = replay || (firstRun && onboarding !== null && !onboarding.done);

  return (
    <div className="relative h-full w-full overflow-hidden bg-canvas text-white">
      <div className="aurora" data-tone={TONE[tab]} />
      <div className="grain pointer-events-none absolute inset-0" />
      <motion.div className="absolute inset-0 flex flex-col" initial={false} animate={{ paddingBottom: kb }} transition={{ type: "spring", stiffness: 520, damping: 46, mass: 0.6 }}>
        <main className="relative min-h-0 flex-1">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={tab} className="absolute inset-0" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ type: "spring", stiffness: 340, damping: 32, mass: 0.8 }}>
              {tab === "home" && <HomeScreen onSend={send} onOpenSettings={() => setSettingsOpen(true)} model={chat.activeModel} cartridges={cart} downloads={downloads} kvUsed={chat.usedTokens} />}
              {tab === "chat" && <ChatScreen msgs={chat.msgs} busy={chat.busy} model={chat.activeModel} cartridge={cart.selected} kvUsed={chat.usedTokens} handlers={{ onSend: send, onEdit: (id, t) => chat.edit(id, t, opts), onRegenerate: (id) => chat.regenerate(id, opts), onStop: chat.stop, branchInfo: chat.branchInfo, onSwitch: chat.switchBranch, onAdopt: (p, r) => chat.adopt(p, r) }} />}
              {tab === "studio" && <StudioScreen dev={dev} downloads={downloads} onBrowse={browse} />}
              {tab === "hub" && <HubScreen activeKeys={keys.filter((k) => !k.revoked).length} dev={dev} setDev={setDev} source={source} downloads={downloads} initialSection={hubSection} kvUsed={chat.usedTokens} kvMax={cart.selected.ctx} />}
              {tab === "server" && <ServerScreen keys={keys} setKeys={setKeys} model={chat.activeModel} />}
            </motion.div>
          </AnimatePresence>
        </main>

        <motion.nav aria-label="Primary" className="overflow-hidden px-3 pt-1" initial={false} animate={{ height: kb > 0 ? 0 : "auto", opacity: kb > 0 ? 0 : 1 }} transition={{ type: "spring", stiffness: 520, damping: 46 }} style={{ paddingBottom: kb > 0 ? 0 : "max(20px, env(safe-area-inset-bottom), var(--apex-inset-bottom, 0px))" }}>
          <LayoutGroup>
            <div className="glass-dark mx-auto flex max-w-[360px] items-center justify-between rounded-full p-1.5">
              {TABS.map((t) => {
                const active = t.id === tab;
                return (
                  <button
                    key={t.id}
                    onClick={() => go(t.id)}
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
        </motion.nav>
      </motion.div>

      <ThemeSheet
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        inline
        onReplayOnboarding={() => {
          setSettingsOpen(false);
          setReplay(true);
        }}
      />
      <AnimatePresence>{showOnboarding && <Onboarding dev={dev} setDev={setDev} source={source} downloads={downloads} onFinish={finishOnboarding} onKeyIssued={(k) => setKeys((c) => [k, ...c])} />}</AnimatePresence>
    </div>
  );
}
