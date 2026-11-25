import { REPO_URL, RELEASES_URL } from "@/lib/site";
import { APP_VERSION } from "@/lib/version";
import { CalmApp } from "./CalmApp";
import "./calm.css";

export const APK_URL = `${REPO_URL}/releases/download/v${APP_VERSION}/apex-llm-v${APP_VERSION}-arm64-v8a.apk`;

const FEATURES = [
  { i: "⚡", t: "Keyless AI, instantly", d: "Open the app and chat. No account, no API key, no 1 GB download first." },
  { i: "🔓", t: "Local & uncensored", d: "Dolphin, Hermes and abliterated GGUFs run on your phone, fully offline." },
  { i: "📦", t: "Real downloads", d: "Byte-accurate progress, MB/s, pause, resume and cancel. Search any GGUF on Hugging Face." },
  { i: "🎨", t: "Image Studio", d: "Flux and Turbo engines, aspect ratios, styles, seeds — in chat or full screen." },
  { i: "🧠", t: "Memory that stays yours", d: "Apex remembers your stack and tone across every model. Edit or wipe it anytime." },
  { i: "🔌", t: "MCP & skills", d: "Web reader, GitHub, a JS sandbox, and any MCP server over HTTP." },
];

export function CalmLanding() {
  return (
    <div className="calm relative min-h-dvh overflow-x-clip" data-cmode="light">
      <div className="calm-glow" style={{ height: 620 }} aria-hidden="true" />
      <header className="relative z-10 mx-auto flex w-[min(1080px,calc(100%-32px))] items-center justify-between py-5">
        <span className="text-[17px] font-medium tracking-tight">Apex</span>
        <nav aria-label="Site" className="flex items-center gap-2 text-[14px]">
          <a href="#features" className="hidden rounded-full px-3 py-2 sm:block">Features</a>
          <a href={REPO_URL} className="hidden rounded-full px-3 py-2 sm:block">GitHub</a>
          <a href={APK_URL} className="calm-btn" data-primary="true">Get the APK</a>
        </nav>
      </header>

      <main className="relative z-10">
        <section className="mx-auto grid w-[min(1080px,calc(100%-32px))] items-center gap-10 pb-16 pt-8 lg:grid-cols-[1.1fr_auto] lg:pt-16">
          <div>
            <p className="calm-chip mb-5">v{APP_VERSION} · Private · Open source</p>
            <h1 className="max-w-[14ch] text-[clamp(38px,6.4vw,72px)] font-normal leading-[1.04] tracking-[-0.03em]">A calm AI workspace that works the moment you open it.</h1>
            <p className="mt-5 max-w-[52ch] text-[17px] leading-relaxed text-[rgb(var(--ink-rgb)/var(--ink-2-a))]">Keyless chat out of the box. Uncensored models on-device when you want them. Images, memory and MCP tools in one quiet interface.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href={APK_URL} className="calm-btn !h-12 !px-6" data-primary="true">Download for Android</a>
              <a href={RELEASES_URL} className="calm-btn !h-12 !px-6">All releases</a>
            </div>
            <p className="mt-3 text-[12.5px] text-[rgb(var(--ink-rgb)/var(--ink-3-a))]">arm64-v8a · The demo on the right is the real app running in your browser.</p>
          </div>
          <div className="mx-auto h-[780px] w-[min(380px,100%)] overflow-hidden rounded-[46px] border-[9px] border-[#1b1e26] bg-[var(--canvas)] shadow-[0_40px_90px_-30px_rgb(40_50_80/0.45)]">
            <CalmApp embedded />
          </div>
        </section>

        <section id="features" className="mx-auto w-[min(1080px,calc(100%-32px))] pb-24">
          <h2 className="mb-8 text-[28px] font-normal tracking-[-0.02em]">Everything you need, nothing you don’t.</h2>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <li key={f.t} className="calm-card p-5">
                <span className="grid h-10 w-10 place-items-center rounded-full bg-[var(--surface-2)] text-[19px]" aria-hidden="true">{f.i}</span>
                <h3 className="mt-4 text-[16px] font-medium">{f.t}</h3>
                <p className="mt-1 text-[14px] leading-relaxed text-[rgb(var(--ink-rgb)/var(--ink-2-a))]">{f.d}</p>
              </li>
            ))}
          </ul>
        </section>
      </main>
      <footer className="relative z-10 border-t border-[var(--hairline)] py-8 text-center text-[13px] text-[rgb(var(--ink-rgb)/var(--ink-3-a))]">
        Apex v{APP_VERSION} · <a href={REPO_URL} className="underline underline-offset-2">Source on GitHub</a>
      </footer>
    </div>
  );
}
