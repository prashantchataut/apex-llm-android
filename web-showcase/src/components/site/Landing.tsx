import { AppShell } from "@/components/app/AppShell";
import { PhoneFrame } from "@/components/app/PhoneFrame";
import { FanStack } from "@/components/ui/FanStack";
import { Chip3D } from "@/components/ui/Glass";
import { ApexLogo, ApexTile } from "@/components/brand/ApexLogo";
import { Icon } from "@/components/ui/Icon";
import { LiveLab } from "./LiveLab";
import { ApkDownload } from "./ApkDownload";
import { CartridgeShowcase } from "./CartridgeShowcase";
import { CountUp, Reveal, Tilt } from "./Choreo";
import { HeroDevice } from "./HeroDevice";
import { ThemeButton } from "./ThemeButton";
import { Archetypes } from "./Archetypes";
import { Cutout, GridFrame, GridRow, Ph, ScriptNote } from "@/components/ui/Swiss";
import { RELEASES_URL, REPO_URL } from "@/lib/site";

const CURL = `curl http://phone.local:11434/v1/chat/completions \\
  -H "Authorization: Bearer sk-apex-…" \\
  -d '{"model":"qwen2.5-3b","messages":[{"role":"user","content":"hi"}]}'`;

export function Landing() {
  return (
    <div className="relative overflow-x-clip bg-canvas">
      <div className="aurora" data-tone="violet" style={{ height: 820 }} />
      <div className="grain pointer-events-none absolute inset-x-0 top-0 h-[820px]" />

      <header className="sticky top-4 z-50 mx-auto mt-4 w-[min(1100px,calc(100%-24px))]">
        <nav className="glass flex items-center justify-between px-3 py-2" aria-label="Site">
          <a href="#top" className="relative z-[1] flex h-11 items-center gap-2 pl-2 text-[15px] font-semibold tracking-tight">
            <ApexTile size={32} />
            Apex
          </a>
          <div className="relative z-[1] hidden items-center gap-1 text-[13.5px] font-medium sm:flex">
            {[
              ["Try it", "#demo"],
              ["Lab", "#lab"],
              ["Looks", "#looks"],
              ["Cartridges", "#cartridges"],
              ["API", "#api"],
            ].map(([l, h]) => (
              <a key={l} href={h} className="flex h-11 items-center rounded-full px-3.5 text-ink-2 transition-colors hover:bg-white/15">
                {l}
              </a>
            ))}
          </div>
          <div className="relative z-[1] flex items-center gap-1">
            <ThemeButton />
            <ApkDownload variant="nav" label="Get the APK" />
          </div>
        </nav>
      </header>

      <GridFrame>
        <div id="top" className="relative px-5 pb-24 pt-24 sm:px-10 sm:pt-32">
          <div className="mono mb-8 text-[11px] uppercase tracking-[0.2em] text-ink-3">Private · Offline · Open source</div>
          <h1 className="display max-w-[13ch] text-[clamp(44px,8.4vw,118px)]">
            <Ph text="Real AI," from={1} to={1} /> <Cutout tone="cobalt" tilt={-6} label="Apex prism"><ApexLogo size={44} state="idle" className="h-[0.6em] w-[0.6em]" /></Cutout> <Ph text="in your" from={1} to={1} />{" "}
            <Cutout tone="violet" icon="cpu" tilt={5} label="Chip" /> <Ph text="pocket." from={1} to={0.35} />
          </h1>

          <div className="absolute right-[6%] top-[12%] hidden flex-col items-center lg:flex">
            <HeroDevice />
            <div className="mt-4 pointer-events-none">
              <ScriptNote flip>no signal needed</ScriptNote>
            </div>
          </div>
          <div className="absolute right-[5%] top-[14%] hidden flex-col items-start gap-5 md:flex lg:hidden">
            <Chip3D tilt="rotate(-7deg)">
              <span className="mono">Q4_K_M</span>
            </Chip3D>
            <Chip3D tilt="rotate(5deg)" delay={0.8} className="ml-10">
              <ApexLogo size={16} state="monochrome" /> on-device
            </Chip3D>
            <Chip3D tilt="rotate(-3deg)" delay={1.6}>
              <span className="mono">:11434</span>
            </Chip3D>
          </div>

          <p className="mt-10 max-w-[34ch] text-[19px] leading-snug text-ink-2">Runs on your phone. Not a server. Every model is sized to your hardware before you download.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <ApkDownload variant="hero" />
            <a href="#demo" className="glass flex min-h-[52px] items-center gap-2 px-6 text-[15px] font-semibold transition-transform hover:scale-[1.03] active:scale-95">
              <span className="relative z-[1] flex items-center gap-2">
                Try it live <Icon name="arrow" size={17} strokeWidth={2.2} />
              </span>
            </a>
          </div>
          <p className="mono mt-4 text-[11px] text-ink-3">ARM64 · Android 8.0+ · signed alpha · <a href={RELEASES_URL} className="underline decoration-white/30 underline-offset-4">all releases</a></p>
        </div>

        <GridRow className="px-5 py-12 sm:px-10">
          <div className="grid grid-cols-2 gap-x-6 gap-y-8 lg:grid-cols-4">
            {[
              { n: 18.4, d: 1, u: "tok/s", l: "typical on an 8 GB phone*" },
              { n: 4.6, d: 1, u: "GB", l: "RAM left for the model*" },
              { n: 94, d: 0, u: "MB", l: "Instant Nano download" },
              { n: 6, d: 0, u: "", l: "haptic signatures" },
            ].map((c, i) => (
              <Reveal key={c.l} delay={i * 0.08}>
                <div className="display text-[clamp(38px,5.4vw,72px)] leading-none">
                  <CountUp to={c.n} decimals={c.d} />
                  <span className="ml-1 text-[0.36em] text-ink-3">{c.u}</span>
                </div>
                <div className="mono mt-2 text-[11px] uppercase tracking-[0.14em] text-ink-3">{c.l}</div>
              </Reveal>
            ))}
          </div>
          <p className="mt-6 text-[11px] text-ink-3">* Planning estimates for the 8 GB class, not a benchmark of one device.</p>
        </GridRow>

        <GridRow id="demo" className="px-5 py-20 sm:px-10">
          <div className="grid items-center gap-14 lg:grid-cols-2">
            <div>
              <div className="mono mb-4 text-[11px] uppercase tracking-[0.2em] text-ink-3">01 — Try it</div>
              <h2 className="display text-[clamp(34px,5vw,64px)]">
                <Ph text="Feel it" from={1} to={1} /> <Ph text="before you install." from={1} to={0.35} />
              </h2>
              <p className="mt-5 max-w-[34ch] text-[17px] leading-snug text-ink-2">This is the real interface. Ask something, open a thought, then preview a 4 GB phone.</p>
              <div className="mt-12 max-w-[440px]">
                <Tilt max={7} className="rounded-[28px]">
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
                </Tilt>
                <p className="mt-3 text-[11px] text-ink-3">Tap to fan. Sample numbers.</p>
              </div>
            </div>
            <div className="flex justify-center">
              <Tilt max={5} className="rounded-[56px]">
                <PhoneFrame>
                  <AppShell />
                </PhoneFrame>
              </Tilt>
            </div>
          </div>
        </GridRow>

        <GridRow id="lab" className="px-5 py-20 sm:px-10">
          <div className="mono mb-4 text-[11px] uppercase tracking-[0.2em] text-ink-3">02 — Live lab</div>
          <h2 className="display mb-4 max-w-[18ch] text-[clamp(34px,5vw,64px)]">
            <Ph text="Touch the" from={1} to={1} /> <Ph text="real parts." from={1} to={0.35} />
          </h2>
          <p className="mb-10 max-w-[44ch] text-[17px] leading-snug text-ink-2">Switch the look and the whole page morphs. Run the hardware scan. Open a thought, read the math, answer a clarifying question, and feel the haptics.</p>
          <LiveLab />
        </GridRow>

        <GridRow id="looks" className="px-5 py-20 sm:px-10">
          <div className="mono mb-4 text-[11px] uppercase tracking-[0.2em] text-ink-3">03 — Looks</div>
          <h2 className="display mb-12 max-w-[16ch] text-[clamp(34px,5vw,64px)]">
            <Ph text="Four looks." from={1} to={1} /> <Ph text="One engine." from={1} to={0.35} />
          </h2>
          <Archetypes />
        </GridRow>

        <GridRow id="cartridges" className="px-5 py-20 sm:px-10">
          <Reveal>
            <div className="mono mb-4 text-[11px] uppercase tracking-[0.2em] text-ink-3">04 — Cartridges</div>
            <h2 className="display mb-4 max-w-[16ch] text-[clamp(34px,5vw,64px)]">
              <Ph text="Load a" from={1} to={1} /> <Ph text="personality." from={1} to={0.35} />
            </h2>
            <p className="mb-8 max-w-[44ch] text-[17px] leading-snug text-ink-2">Modelfile presets for the system prompt, temperature, top-p and context window. Tilt them, tap one to load it, or write your own.</p>
          </Reveal>
          <CartridgeShowcase />
        </GridRow>

        <GridRow id="api" className="px-5 py-20 sm:px-10">
          <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
            <div>
              <div className="mono mb-4 text-[11px] uppercase tracking-[0.2em] text-ink-3">05 — API</div>
              <h2 className="display text-[clamp(34px,5vw,64px)]">
                <Ph text="Your phone." from={1} to={1} /> <Ph text="Your API." from={1} to={0.35} />
              </h2>
              <p className="mt-5 max-w-[30ch] text-[17px] leading-snug text-ink-2">Ollama and OpenAI compatible. One switch, a QR code to pair, and a web console on :11434.</p>
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
