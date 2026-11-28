import { ApexMark } from "./ApexMark";
import { REPO_URL, RELEASES_URL } from "@/lib/site";
import { BASE_PATH } from "@/lib/paths";
import { APP_VERSION } from "@/lib/version";
import { CalmApp } from "./CalmApp";
import { CIcon, type CIconName } from "./icons";
import { PromptDemo, Reveal, WaysTabs } from "./LandingDemo";
import "./calm.css";

export const APK_URL = `${REPO_URL}/releases/download/v${APP_VERSION}/Apex-LLM-v${APP_VERSION}-arm64-release.apk`;

const LINES: { i: CIconName; t: string; d: string }[] = [
  { i: "cube", t: "Local GGUF, uncensored if you want", d: "Run GGUF models fully on-device, import your own .gguf files, and keep Dolphin, Hermes and abliterated builds private." },
  { i: "lock", t: "Encrypted Apex API", d: "Hundreds of cloud models with automatic failover stay behind your Apex API key (AES-256-GCM, decrypted only on your device)." },
  { i: "mic", t: "Live Voice and Local RAG", d: "Talk hands-free, and ask questions over your own files with clickable source citations. All of it on-device." },
  { i: "file", t: "PDF reader and offline LaTeX", d: "Open a PDF, search it, summarize it or ask questions about it. Math renders with a bundled KaTeX, no network needed." },
  { i: "image", t: "Image Studio", d: "Describe it, and it appears. Drop it into a chat or save it." },
  { i: "tree", t: "Memory that stays yours", d: "Apex remembers your stack and tone across every model. Edit or wipe it any time." },
  { i: "plug", t: "Skills and MCP", d: "Read a page, open a repo, run a calculation, or connect any MCP server." },
  { i: "server", t: "A local server for your PC", d: "Serve this phone's model over an Ollama-compatible API on your network." },
];

/** Grid-free editorial landing in the spirit of cuedesign.space / beautifului.dev: one centred column, open canvas, blur-to-sharp reveals. */
export function CalmLanding() {
  return (
    <div className="calm relative min-h-dvh overflow-x-clip" data-cmode="dark">
      <div className="calm-glow" style={{ height: 720 }} aria-hidden="true" />
      <header className="relative z-10 mx-auto flex w-[min(1080px,calc(100%-40px))] items-center justify-between py-6">
        <span className="flex items-center gap-2.5 text-[19px] font-medium tracking-[-0.03em]"><ApexMark size={30} />Apex</span>
        <nav aria-label="Site" className="flex items-center gap-1 text-[14px]">
          <a href="#try" className="hidden rounded-full px-4 py-2 text-[rgb(var(--ink-rgb)/var(--ink-2-a))] sm:block">Try it</a>
          <a href={REPO_URL} className="hidden rounded-full px-4 py-2 text-[rgb(var(--ink-rgb)/var(--ink-2-a))] sm:block">GitHub</a>
          <a href={APK_URL} className="calm-btn ml-1" data-primary="true">Download APK</a>
        </nav>
      </header>

      <main className="relative z-10">
        <section className="mx-auto flex w-[min(760px,calc(100%-40px))] flex-col items-center pb-20 pt-14 text-center sm:pt-24">
          <Reveal>
            <p className="calm-chip">v{APP_VERSION} · On-Device Local AI Runner</p>
          </Reveal>
          <Reveal delay={0.08}>
            <h1 className="mt-7 text-[clamp(42px,8vw,84px)] font-normal leading-[1.02] tracking-[-0.04em]">Your private pocket intelligence studio.</h1>
          </Reveal>
          <Reveal delay={0.18}>
            <p className="mx-auto mt-6 max-w-[46ch] text-[clamp(17px,2.2vw,20px)] leading-relaxed text-[rgb(var(--ink-rgb)/var(--ink-2-a))]">Run Qwen 3, Gemma 3, Llama 3.2 and DeepSeek R1 on your phone's own silicon. Read PDFs, render LaTeX and generate images privately, with cloud models on standby when you want them.</p>
          </Reveal>
          <Reveal delay={0.28} className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <a href={APK_URL} className="calm-btn !h-[52px] !px-7 !text-[15px]" data-primary="true">
              <CIcon name="download" size={17} /> Download Android APK <span className="opacity-60">v{APP_VERSION}</span>
            </a>
            <a href={RELEASES_URL} className="calm-btn !h-[52px] !px-6 !text-[15px] !shadow-none !bg-transparent text-[rgb(var(--ink-rgb)/var(--ink-2-a))]">All releases</a>
          </Reveal>
        </section>

        <Reveal className="relative mx-auto w-[min(392px,calc(100%-32px))] pb-28">
          <div className="rounded-[52px] bg-[#101012] p-[7px] shadow-[0_60px_100px_-40px_rgb(40_40_60/0.5),0_20px_40px_-20px_rgb(0_0_0/0.25)]">
            <div className="h-[780px] overflow-hidden rounded-[45px] bg-[var(--canvas)]">
              <CalmApp embedded />
            </div>
          </div>
          <p className="mt-6 text-center text-[13px] text-[rgb(var(--ink-rgb)/var(--ink-3-a))]">The real app, running in your browser.</p>
        </Reveal>


        <section id="download" aria-labelledby="dl-h" className="mx-auto w-[min(920px,calc(100%-32px))] pb-28" data-testid="apk-card">
          <div className="rounded-[28px] bg-[var(--surface)] p-6 shadow-[var(--specular),var(--shadow-card)] sm:p-9">
            <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
              <div className="min-w-0">
                <p className="calm-chip">v{APP_VERSION} · arm64-v8a · Android 8 and up</p>
                <h2 id="dl-h" className="mt-4 text-[clamp(24px,4vw,34px)] font-normal leading-[1.1] tracking-[-0.03em]">Apex LLM for Android</h2>
                <p className="mt-2 max-w-[48ch] text-[15.5px] leading-relaxed text-[rgb(var(--ink-rgb)/var(--ink-2-a))]">Signed release APK built for the Nothing Phone 4a and any Android 15 phone. Updates arrive inside the app, with a live progress bar and the system installer.</p>
              </div>
              <div className="flex w-full flex-wrap gap-2.5 sm:w-auto">
                <a href={APK_URL} className="calm-btn !h-[52px] !px-7 !text-[15px]" data-primary="true" data-testid="apk-download"><CIcon name="download" size={17} /> Download APK</a>
                <a href={`${BASE_PATH}/app/`} className="calm-btn !h-[52px] !px-6 !text-[15px]">Web Studio</a>
                <a href={`${BASE_PATH}/admin/`} className="calm-btn !h-[52px] !px-6 !text-[15px]">Admin</a>
              </div>
            </div>
            <ul className="mt-7 grid gap-3 sm:grid-cols-2">
              {["Frontier Flagships tier: Claude, GPT, Gemini, Grok, DeepSeek, Qwen and Llama routes with automatic failover", "Compare 2 Models: one prompt, two cards, live latency and tokens per second", "Searchable model switcher with pinned models, provider filters and capability tags", "Offline GGUF models for phones: Qwen 3, Gemma 3, LFM2, Phi-4 mini, Llama 3.2"].map((t) => (
                <li key={t} className="flex min-w-0 items-start gap-3 rounded-2xl bg-[var(--surface-2)] p-4 text-[14px] leading-snug">
                  <CIcon name="check" size={16} className="mt-0.5 shrink-0" />
                  <span className="min-w-0">{t}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="try" className="mx-auto w-[min(760px,calc(100%-40px))] pb-36 text-center">
          <Reveal>
            <h2 className="text-[clamp(30px,5vw,48px)] font-normal leading-[1.08] tracking-[-0.035em]">Ask anything.</h2>
            <p className="mx-auto mb-12 mt-4 max-w-[40ch] text-[17px] leading-relaxed text-[rgb(var(--ink-rgb)/var(--ink-2-a))]">One prompt bar for text, images, files and voice.</p>
          </Reveal>
          <Reveal delay={0.1}>
            <PromptDemo />
          </Reveal>
        </section>

        <section className="mx-auto w-[min(760px,calc(100%-40px))] pb-40">
          <Reveal>
            <WaysTabs />
          </Reveal>
        </section>

        <section className="mx-auto w-[min(640px,calc(100%-40px))] pb-40">
          <ul className="space-y-14">
            {LINES.map((l, k) => (
              <li key={l.t}>
                <Reveal delay={k * 0.04} className="flex items-start gap-5">
                  <span className="mt-1 grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[var(--surface)] shadow-[var(--specular),var(--shadow-card)]"><CIcon name={l.i} size={20} /></span>
                  <div>
                    <h3 className="text-[22px] font-normal tracking-[-0.025em]">{l.t}</h3>
                    <p className="mt-1.5 max-w-[44ch] text-[16.5px] leading-relaxed text-[rgb(var(--ink-rgb)/var(--ink-2-a))]">{l.d}</p>
                  </div>
                </Reveal>
              </li>
            ))}
          </ul>
        </section>

        <section className="mx-auto w-[min(640px,calc(100%-40px))] pb-40 text-center">
          <Reveal>
            <h2 className="text-[clamp(32px,5.4vw,56px)] font-normal leading-[1.06] tracking-[-0.035em]">Put it in your pocket.</h2>
            <a href={APK_URL} className="calm-btn mt-9 !h-[52px] !px-7 !text-[15px]" data-primary="true">
              <CIcon name="download" size={17} /> Download Android APK <span className="opacity-60">v{APP_VERSION}</span>
            </a>
            <p className="mt-4 text-[13px] text-[rgb(var(--ink-rgb)/var(--ink-3-a))]">arm64-v8a · Android 8 and up</p>
          </Reveal>
        </section>
      </main>
      <footer className="relative z-10 pb-10 text-center text-[13px] text-[rgb(var(--ink-rgb)/var(--ink-3-a))]">
        Apex v{APP_VERSION} · <a href={REPO_URL} className="underline underline-offset-2">Source on GitHub</a>
      </footer>
    </div>
  );
}
