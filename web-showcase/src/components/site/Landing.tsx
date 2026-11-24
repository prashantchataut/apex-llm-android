import { AppShell } from "@/components/app/AppShell";
import { PhoneFrame } from "@/components/app/PhoneFrame";
import { FanStack } from "@/components/ui/FanStack";
import { Chip3D } from "@/components/ui/Glass";
import { Icon } from "@/components/ui/Icon";
import { ThemeButton } from "./ThemeButton";
import { Archetypes } from "./Archetypes";
import { Cutout, GridFrame, GridRow, Ph, ScriptNote } from "@/components/ui/Swiss";
import { RELEASES_URL, REPO_URL } from "@/lib/site";

const CURL = `curl http://phone.local:11434/v1/chat/completions \\
  -H "Authorization: Bearer sk-pocket-…" \\
  -d '{"model":"qwen2.5-3b","messages":[{"role":"user","content":"hi"}]}'`;

export function Landing() {
  return (
    <div className="relative overflow-x-clip bg-canvas">
      <div className="aurora" data-tone="violet" style={{ height: 820 }} />
      <div className="grain pointer-events-none absolute inset-x-0 top-0 h-[820px]" />

      <header className="sticky top-4 z-50 mx-auto mt-4 w-[min(1100px,calc(100%-24px))]">
        <nav className="glass flex items-center justify-between px-3 py-2" aria-label="Site">
          <a href="#top" className="relative z-[1] flex h-11 items-center gap-2 pl-2 text-[15px] font-semibold tracking-tight">
            <span className="grid h-7 w-7 place-items-center rounded-[9px] bg-white text-black">
              <Icon name="bolt" size={16} strokeWidth={2.4} />
            </span>
            Apex
          </a>
          <div className="relative z-[1] hidden items-center gap-1 text-[13.5px] font-medium sm:flex">
            {[
              ["Try it", "#demo"],
              ["Looks", "#looks"],
              ["API", "#api"],
            ].map(([l, h]) => (
              <a key={l} href={h} className="flex h-11 items-center rounded-full px-3.5 text-ink-2 transition-colors hover:bg-white/15">
                {l}
              </a>
            ))}
          </div>
          <div className="relative z-[1] flex items-center gap-1">
            <ThemeButton />
            <a href={RELEASES_URL} className="flex h-11 items-center gap-1.5 rounded-full bg-white px-4 text-[13px] font-semibold text-black transition-transform active:scale-[0.97]">
              <Icon name="download" size={15} /> Get the APK
            </a>
          </div>
        </nav>
      </header>

      <GridFrame>
        <div id="top" className="relative px-5 pb-24 pt-24 sm:px-10 sm:pt-32">
          <div className="mono mb-8 text-[11px] uppercase tracking-[0.2em] text-ink-3">Private · Offline · Open source</div>
          <h1 className="display max-w-[13ch] text-[clamp(44px,8.4vw,118px)]">
            <Ph text="Real AI," from={1} to={1} /> <Cutout tone="cobalt" icon="bolt" tilt={-6} label="Lightning" /> <Ph text="in your" from={1} to={1} />{" "}
            <Cutout tone="violet" icon="cpu" tilt={5} label="Chip" /> <Ph text="pocket." from={1} to={0.35} />
          </h1>

          <div className="pointer-events-none absolute right-[4%] top-[34%] hidden lg:block">
            <ScriptNote flip>no signal needed</ScriptNote>
          </div>
          <div className="absolute right-[5%] top-[14%] hidden flex-col items-start gap-5 md:flex">
            <Chip3D tilt="rotate(-7deg)">
              <span className="mono">Q4_K_M</span>
            </Chip3D>
            <Chip3D tilt="rotate(5deg)" delay={0.8} className="ml-10">
              <Icon name="bolt" size={15} /> on-device
            </Chip3D>
            <Chip3D tilt="rotate(-3deg)" delay={1.6}>
              <span className="mono">:11434</span>
            </Chip3D>
          </div>

          <p className="mt-10 max-w-[34ch] text-[19px] leading-snug text-ink-2">Runs on your phone. Not a server. Every model is sized to your hardware before you download.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a href="#demo" className="flex min-h-[48px] items-center gap-2 rounded-full bg-white px-6 text-[15px] font-semibold text-black transition-transform hover:scale-[1.03] active:scale-95">
              Try it live <Icon name="arrow" size={17} strokeWidth={2.2} />
            </a>
            <a href={RELEASES_URL} className="glass flex min-h-[48px] items-center gap-2 px-6 text-[15px] font-semibold transition-transform hover:scale-[1.03] active:scale-95">
              <span className="relative z-[1] flex items-center gap-2">
                <Icon name="download" size={17} /> Releases
              </span>
            </a>
          </div>
        </div>

        <GridRow id="demo" className="px-5 py-20 sm:px-10">
          <div className="grid items-center gap-14 lg:grid-cols-2">
            <div>
              <div className="mono mb-4 text-[11px] uppercase tracking-[0.2em] text-ink-3">01 — Try it</div>
              <h2 className="display text-[clamp(34px,5vw,64px)]">
                <Ph text="Feel it" from={1} to={1} /> <Ph text="before you install." from={1} to={0.35} />
              </h2>
              <p className="mt-5 max-w-[34ch] text-[17px] leading-snug text-ink-2">This is the real interface. Ask something, open a thought, then preview a 4 GB phone.</p>
              <div className="mt-12 max-w-[440px]">
                <FanStack
                  cards={[
                    { label: "Speed", value: "18.4", unit: "t/s" },
                    { label: "RAM free", value: "4.6", unit: "GB" },
                    { label: "Quant", value: "Q4_K_M" },
                    { label: "Keys", value: "2" },
                    { label: "Context", value: "4096" },
                  ]}
                >
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-2">Today</div>
                  <div className="tnum mt-1 text-[28px] font-semibold tracking-tight">14,820 tokens</div>
                  <div className="text-[13px] text-ink-2">on this phone. $0 spent.</div>
                </FanStack>
                <p className="mt-3 text-[11px] text-ink-3">Tap to fan. Sample numbers.</p>
              </div>
            </div>
            <div className="flex justify-center">
              <PhoneFrame>
                <AppShell />
              </PhoneFrame>
            </div>
          </div>
        </GridRow>

        <GridRow id="looks" className="px-5 py-20 sm:px-10">
          <div className="mono mb-4 text-[11px] uppercase tracking-[0.2em] text-ink-3">02 — Looks</div>
          <h2 className="display mb-12 max-w-[16ch] text-[clamp(34px,5vw,64px)]">
            <Ph text="Four looks." from={1} to={1} /> <Ph text="One engine." from={1} to={0.35} />
          </h2>
          <Archetypes />
        </GridRow>

        <GridRow id="api" className="px-5 py-20 sm:px-10">
          <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
            <div>
              <div className="mono mb-4 text-[11px] uppercase tracking-[0.2em] text-ink-3">03 — API</div>
              <h2 className="display text-[clamp(34px,5vw,64px)]">
                <Ph text="Your phone." from={1} to={1} /> <Ph text="Your API." from={1} to={0.35} />
              </h2>
              <p className="mt-5 max-w-[30ch] text-[17px] leading-snug text-ink-2">Ollama and OpenAI compatible. One switch to turn on.</p>
            </div>
            <div className="bento overflow-hidden">
              <div className="flex items-center gap-1.5 border-b border-white/10 px-4 py-3" aria-hidden>
                <span className="h-2.5 w-2.5 rounded-full bg-white/25" />
                <span className="h-2.5 w-2.5 rounded-full bg-white/25" />
                <span className="h-2.5 w-2.5 rounded-full bg-white/25" />
              </div>
              <pre className="mono overflow-x-auto p-5 text-[12.5px] leading-relaxed text-ink-2">{CURL}</pre>
            </div>
          </div>
        </GridRow>

        <GridRow className="px-5 py-16 sm:px-10">
          <div className="grid gap-8 lg:grid-cols-[1.2fr_1fr] lg:items-end">
            <h2 className="display max-w-[14ch] text-[clamp(30px,4.4vw,56px)]">
              <Ph text="Alpha." from={1} to={1} /> <Ph text="Honest about it." from={1} to={0.35} />
            </h2>
            <p className="max-w-[40ch] text-[15px] leading-snug text-ink-3">
              The Android app builds from source and chats with llama.cpp. It hasn&apos;t been tested on a physical phone yet, and voice and image generation aren&apos;t in this build.
            </p>
          </div>
          <div className="mt-8 flex flex-wrap gap-3">
            <a href={REPO_URL} className="flex min-h-[48px] items-center gap-2 rounded-full bg-white px-6 text-[15px] font-semibold text-black">
              <Icon name="github" size={17} /> Source
            </a>
          </div>
        </GridRow>

        <GridRow className="px-5 py-10 sm:px-10">
          <div className="mono flex flex-wrap justify-between gap-3 text-[11px] text-ink-3">
            <span>Apex · MIT · Rust + Tauri v2</span>
            <span>Not affiliated with Ollama, OpenAI or Hugging Face.</span>
          </div>
        </GridRow>
      </GridFrame>
    </div>
  );
}
