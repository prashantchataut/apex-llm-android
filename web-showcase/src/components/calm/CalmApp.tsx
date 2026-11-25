"use client";

import "./calm.css";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { useChat } from "@/components/app/useChat";
import { ServerScreen, type KeyRec } from "@/components/app/ServerScreen";
import type { Attachment } from "@/lib/attachments";
import { systemPromptFor, useCartridges } from "@/lib/cartridges";
import { getEngineSnapshot, shortModelName } from "@/lib/engine";
import { activateModel, useDownloadStore } from "@/lib/downloader";
import { imageUrl, randomSeed, type ImageJob } from "@/lib/images";
import { keylessById, refreshLive } from "@/lib/keyless";
import { learnFrom, memoryBlock, useMemories } from "@/lib/memory";
import { useMcp } from "@/lib/mcp";
import { CATALOG, UNCENSORED_PROMPT, type CatalogModel } from "@/lib/models";
import { isNative } from "@/lib/native";
import { toolsHint, useSkills } from "@/lib/skills";
import { deleteConvo, getConvo, pinConvo, readMode, renameConvo, saveConvo, setChoice, useChoice, useConvos, writeMode, type Choice, type CalmMode } from "@/lib/store";
import { checkForUpdate, useUpdater } from "@/lib/updater";
import { APP_VERSION } from "@/lib/version";
import { useKeyboardInset } from "@/lib/useKeyboard";
import { Composer, type ComposerHandle } from "./Composer";
import { Conversation } from "./Conversation";
import { Drawer, Header, Lightbox, ModelSheet, Toast, ViewTitle, type View } from "./Chrome";
import { Home, type Suggestion } from "./Home";
import { ImageStudio } from "./ImageStudio";
import { McpView } from "./McpView";
import { MemoryView } from "./MemoryView";
import { ModelHub } from "./ModelHub";
import { Onboarding, type Route } from "./Onboarding";
import { SettingsView } from "./SettingsView";

const newId = () => Math.random().toString(36).slice(2, 10);

/** Apex — Calm Atmospheric Minimalism. One header, one slide-over drawer, one halo composer. No bottom navigation. */
export function CalmApp({ embedded = false }: { embedded?: boolean }) {
  const persistent = !embedded;
  const [mode, setMode] = useState<CalmMode>("light");
  const [sysDark, setSysDark] = useState(false);
  const [view, setView] = useState<View>("chat");
  const [drawer, setDrawer] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [convoId, setConvoId] = useState(newId);
  const [draft, setDraft] = useState("");
  const [imageMode, setImageMode] = useState(false);
  const [zoom, setZoom] = useState<{ url: string; prompt: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [keys, setKeys] = useState<KeyRec[]>([]);
  const [onboard, setOnboard] = useState(false);
  const [hubTab, setHubTab] = useState<"trending" | "uncensored">("trending");

  const chat = useChat();
  const cart = useCartridges();
  const choice = useChoice();
  const skills = useSkills();
  const mems = useMemories();
  const dl = useDownloadStore();
  const convos = useConvos();
  const servers = useMcp();
  const update = useUpdater();
  const kb = useKeyboardInset();
  const composer = useRef<ComposerHandle>(null);
  const toastTimer = useRef<number | null>(null);

  useEffect(() => {
    setMode(readMode());
    if (!embedded && !new URLSearchParams(window.location.search).has("skip-intro")) {
      try {
        if (!localStorage.getItem("apex.onboarded")) setOnboard(true);
      } catch {
        /* private mode: skip */
      }
    }
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setSysDark(mq.matches);
    const f = () => setSysDark(mq.matches);
    mq.addEventListener("change", f);
    void refreshLive();
    void checkForUpdate();
    return () => mq.removeEventListener("change", f);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const resolved = mode === "system" ? (sysDark ? "dark" : "light") : mode;

  const say = useCallback((t: string) => {
    setToast(t);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3600);
  }, []);

  const localModel = choice.kind === "local" ? CATALOG.find((m) => m.id === choice.id) : undefined;
  const label = choice.kind === "keyless" ? `${keylessById(choice.id).label} · Keyless` : localModel ? `${shortModelName(localModel)} · Local` : "Choose a model";
  const memActive = mems.filter((m) => m.on).length;
  const started = chat.msgs.length > 0;

  /* persist the conversation whenever a turn settles */
  const { snapshot, msgs, busy } = chat;
  useEffect(() => {
    if (busy || msgs.length === 0) return;
    const first = msgs.find((m) => m.role === "user");
    saveConvo(convoId, snapshot(), (first?.text ?? "New chat").replace(/\s+/g, " ").slice(0, 48));
  }, [msgs, busy, convoId, snapshot]);

  const goView = (v: View) => {
    setView(v);
    setDrawer(false);
  };
  const newChat = () => {
    chat.stop();
    chat.restore(null);
    setConvoId(newId());
    setDraft("");
    setImageMode(false);
    goView("chat");
  };
  const openConvo = (id: string) => {
    const c = getConvo(id);
    if (!c) return;
    chat.stop();
    chat.restore(c.snap);
    setConvoId(id);
    goView("chat");
  };

  const activate = useCallback(
    async (m: CatalogModel): Promise<boolean> => {
      if (isNative() || getEngineSnapshot().loaded.a === m.id) return true;
      setLoadingId(m.id);
      try {
        await activateModel(m.id);
        return true;
      } catch {
        say("That model isn't on this device yet — opening Model Hub.");
        setView("hub");
        return false;
      } finally {
        setLoadingId(null);
      }
    },
    [say],
  );

  const pick = (c: Choice) => {
    setChoice(c);
    if (c.kind === "local") {
      const m = CATALOG.find((x) => x.id === c.id);
      if (m) void activate(m).then((ok) => ok && say(`${shortModelName(m)} is ready — running on this device.`));
    }
  };
  const useLocal = (m: CatalogModel) => {
    pick({ kind: "local", id: m.id });
    goView("chat");
  };

  const send = async (text: string, atts: Attachment[] = [], voiceMs?: number) => {
    const t = text.trim();
    if (!t && atts.length === 0) return;
    if (imageMode || /^\/imagine\s+/i.test(t)) {
      const prompt = t.replace(/^\/imagine\s+/i, "");
      const job: ImageJob = { prompt, engine: "flux", aspect: "1:1", style: "none", negative: "", seed: randomSeed() };
      const url = imageUrl(job);
      chat.sendImages(t, [{ url, prompt }]);
      setImageMode(false);
      return;
    }
    if (choice.kind === "local" && localModel && !(await activate(localModel))) return;
    const added = learnFrom(t);
    const tools = choice.kind === "keyless";
    const system = systemPromptFor(cart.selected) + memoryBlock() + (localModel?.uncensored ? `\n\n${UNCENSORED_PROMPT}` : "") + (tools ? toolsHint(skills) : "");
    chat.send(t || "Summarize the attached file.", { attachments: atts, cartridge: cart.selected, ctx: cart.selected.ctx, system, choice, skills, tools, memNote: added.map((m) => m.text), voiceMs });
  };
  const opts = () => ({ cartridge: cart.selected, ctx: cart.selected.ctx, system: systemPromptFor(cart.selected) + memoryBlock() + (localModel?.uncensored ? `\n\n${UNCENSORED_PROMPT}` : "") + (choice.kind === "keyless" ? toolsHint(skills) : ""), choice, skills, tools: choice.kind === "keyless" });

  const suggest = (t: Suggestion) => {
    if (t === "illustrate") {
      setImageMode(true);
      setDraft("");
    } else if (t === "summarize") {
      setDraft("Summarize this for me: ");
    } else {
      setDraft("Brainstorm with me, no filters. Start with ");
    }
    composer.current?.focus();
  };

  const useImageInChat = (url: string, prompt: string, src: string) => {
    chat.sendImages(`/imagine ${prompt}`, [{ url, prompt, src }]);
    goView("chat");
  };

  const installed = CATALOG.filter((m) => dl[m.id]?.status === "done").length;
  const toolCount = servers.filter((s) => s.enabled && s.status === "ready").reduce((n, s) => n + s.tools.filter((x) => x.enabled).length, 0);
  const setTheme = (m: CalmMode) => {
    setMode(m);
    writeMode(m);
  };
  const title = (msgs.find((m) => m.role === "user")?.text ?? "New chat").slice(0, 48);

  return (
    <div className="calm relative flex h-full w-full overflow-hidden" data-cmode={resolved}>
      <Drawer
        open={drawer}
        persistent={persistent}
        onClose={() => setDrawer(false)}
        convos={convos}
        activeId={convoId}
        onOpenConvo={openConvo}
        onNew={newChat}
        onRename={renameConvo}
        onDelete={(id) => {
          deleteConvo(id);
          if (id === convoId) newChat();
        }}
        onPin={pinConvo}
        view={view}
        onNav={goView}
        update={update}
        hints={{ hub: installed ? `${installed} on device` : undefined, memory: memActive ? String(memActive) : undefined, mcp: toolCount ? `${toolCount} tools` : undefined, lan: ":11434", settings: `v${APP_VERSION}` }}
      />

      <motion.div className="relative flex min-w-0 flex-1 flex-col" initial={false} animate={{ paddingBottom: kb }} transition={{ type: "spring", stiffness: 520, damping: 46, mass: 0.6 }}>
        <div className="calm-glow" aria-hidden="true" />
        <Header persistent={persistent} onMenu={() => setDrawer(true)} label={label} onPill={() => setSheet(true)} onNew={newChat} />

        <main className={`relative z-[1] min-h-0 flex-1 ${view === "chat" ? "overflow-hidden" : "scroll-quiet overflow-y-auto"}`}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={view} className={view === "chat" ? "h-full" : "min-h-full"} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
              {view === "chat" &&
                (started ? (
                  <Conversation
                    msgs={chat.msgs}
                    busy={chat.busy}
                    title={title}
                    modelLabel={label}
                    memCount={memActive}
                    branchInfo={chat.branchInfo}
                    onSwitch={chat.switchBranch}
                    onEdit={(id, t) => chat.edit(id, t, opts())}
                    onRegenerate={(id) => chat.regenerate(id, opts())}
                    onSend={(t) => void send(t)}
                    onLightbox={(url, prompt) => setZoom({ url, prompt })}
                  />
                ) : (
                  <Home onPick={suggest} />
                ))}
              {view === "hub" && <ModelHub key={hubTab} initialTab={hubTab} dl={dl} choice={choice} onUse={useLocal} loadingId={loadingId} />}
              {view === "studio" && <ImageStudio onUseInChat={useImageInChat} onZoom={(url, prompt) => setZoom({ url, prompt })} />}
              {view === "memory" && <MemoryView />}
              {view === "mcp" && <McpView />}
              {view === "lan" && (
                <div className="mx-auto w-full max-w-[720px] px-5 pb-10 pt-3">
                  <ViewTitle title="Local Ollama LAN Server" sub="Serve this phone's model to your PC on :11434 with an Ollama- and OpenAI-compatible API." />
                  <div className="-mx-5 h-[760px] overflow-hidden">
                    <ServerScreen keys={keys} setKeys={(f) => setKeys(f)} model={chat.activeModel} />
                  </div>
                </div>
              )}
              {view === "settings" && <SettingsView mode={mode} setMode={setTheme} cart={cart} update={update} />}
            </motion.div>
          </AnimatePresence>
        </main>

        {view === "chat" && (
          <div className="relative z-[2] mx-auto w-full max-w-[740px] px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-2">
            <Composer
              ref={composer}
              compact={started}
              value={draft}
              setValue={setDraft}
              busy={chat.busy}
              onStop={chat.stop}
              onSend={(t, a, ms) => void send(t, a, ms)}
              imageMode={imageMode}
              setImageMode={setImageMode}
              statusLeft={choice.kind === "keyless" ? "Keyless AI Ready" : `On-device · ${localModel ? shortModelName(localModel) : "model"}`}
              statusRight={update.s === "available" ? { label: "Update available", onClick: () => goView("settings") } : { label: "Switch Engine", onClick: () => setSheet(true) }}
              onOpenMcp={() => goView("mcp")}
            />
          </div>
        )}
      </motion.div>

      <ModelSheet open={sheet} onClose={() => setSheet(false)} choice={choice} onPick={pick} dl={dl} onHub={() => goView("hub")} loading={loadingId} />
      <Lightbox img={zoom} onClose={() => setZoom(null)} />
      <Toast text={toast} />
      {onboard && (
        <Onboarding
          theme={resolved}
          onTheme={setTheme}
          onDone={(r: Route) => {
            try {
              localStorage.setItem("apex.onboarded", "1");
            } catch {
              /* ignore */
            }
            setOnboard(false);
            if (r !== "keyless") {
              setHubTab(r === "uncensored" ? "uncensored" : "trending");
              setView("hub");
            }
          }}
        />
      )}
    </div>
  );
}
