import { REPO_URL, RELEASES_URL } from "@/lib/site";
import { APP_VERSION } from "@/lib/version";
import { CalmApp } from "./CalmApp";
import { CIcon, type CIconName } from "./icons";
import { PromptDemo, Reveal, WaysTabs } from "./LandingDemo";
import "./calm.css";

export const APK_URL = `${REPO_URL}/releases/download/v${APP_VERSION}/apex-llm-v${APP_VERSION}-arm64-v8a.apk`;

const LINES: { i: CIconName; t: string; d: string }[] = [
  { i: "image", t: "Image Studio", d: "Describe it, and it appears. Drop it into a chat or save it." },
  { i: "tree", t: "Memory that stays yours", d: "Apex remembers your stack and tone across every model. Edit or wipe it any time." },
  { i: "plug", t: "Skills and MCP", d: "Read a page, open a repo, run a calculation, or connect any MCP server." },
  { i: "server", t: "A local server for your PC", d: "Serve this phone's model over an Ollama-compatible API on your network." },
];

/** Grid-free editorial landing in the spirit of cuedesign.space / beautifului.dev: one centred column, open canvas, blur-to-sharp reveals. */
export function CalmLanding() {
  return (
    <div className="calm relative min-h-dvh overflow-x-clip" data-cmode="light">
      <div className="calm-glow" style={{ height: 720 }} aria-hidden="true" />
      <header className="relative z-10 mx-auto flex w-[min(1080px,calc(100%-40px))] items-center justify-between py-6">
        <span className="text-[19px] font-medium tracking-[-0.03em]">Apex</span>
        <nav aria-label="Site" className="flex items-center gap-1 text-[14px]">
          <a href="#try" className="hidden rounded-full px-4 py-2 text-[rgb(var(--ink-rgb)/var(--ink-2-a))] sm:block">Try it</a>
          <a href={REPO_URL} className="hidden rounded-full px-4 py-2 text-[rgb(var(--ink-rgb)/var(--ink-2-a))] sm:block">GitHub</a>
          <a href={APK_URL} className="calm-btn ml-1" data-primary="true">Download APK</a>
        </nav>
      </header>

      <main className="relative z-10">
        <section className="mx-auto flex w-[min(760px,calc(100%-40px))] flex-col items-center pb-20 pt-14 text-center sm:pt-24">
          <Reveal>
            <p className="calm-chip">v{APP_VERSION} · Open source</p>
          </Reveal>
          <Reveal delay={0.08}>
            <h1 className="mt-7 text-[clamp(42px,8vw,84px)] font-normal leading-[1.02] tracking-[-0.04em]">Intelligence that lives on your phone.</h1>
          </Reveal>
          <Reveal delay={0.18}>
            <p className="mx-auto mt-6 max-w-[46ch] text-[clamp(17px,2.2vw,20px)] leading-relaxed text-[rgb(var(--ink-rgb)/var(--ink-2-a))]">A quiet AI workspace that answers the moment you open it, and keeps working when you are offline.</p>
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
