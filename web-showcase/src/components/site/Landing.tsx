import { AppShell } from "@/components/app/AppShell";
import { PhoneFrame } from "@/components/app/PhoneFrame";
import { FanStack } from "@/components/ui/FanStack";
import { Chip3D } from "@/components/ui/Glass";
import { Icon, type IconName } from "@/components/ui/Icon";
import { ThemeButton } from "./ThemeButton";
import { Cutout, GridFrame, GridRow, Ph, ScriptNote } from "@/components/ui/Swiss";
import { DOCS_URL, RELEASES_URL, REPO_URL } from "@/lib/site";

const FEATURES: { icon: IconName; title: string; body: string }[] = [
  { icon: "cpu", title: "Fit scoring", body: "Every model is checked against your RAM, chip and free storage before you download it." },
  { icon: "image", title: "Image and video", body: "Generate offline with Stable Diffusion, FLUX, Wan and LTX models sized for your phone." },
  { icon: "server", title: "Ollama-compatible server", body: "/api/chat and /v1/chat/completions on port 11434. Point Cursor or Continue at your phone." },
  { icon: "mic", title: "On-device dictation", body: "A small recognizer streams text into the prompt bar. No audio is uploaded." },
  { icon: "sparkle", title: "Readable reasoning", body: "Thinking streams into a live timeline. Math renders with KaTeX. Choices are tappable." },
  { icon: "swatch", title: "Six themes", body: "Obsidian, Vision, Swiss, Reasoning, Graphite and Paper. Each in light and dark." },
];

const STATUS: [string, string][] = [
  ["done", "Rust workspace: six crates with tests, formatted and clippy-clean in CI"],
  ["done", "Six themes in light and dark, saved across restarts, plus first-run setup"],
  ["done", "Image and video model catalog, scored against device capability"],
  ["next", "Android build with Tauri Mobile and the NDK"],
  ["next", "llama.cpp backend, benchmarked on a real phone"],
  ["next", "Image and video engine, and the dictation recognizer"],
];

export function Landing() {
  return (
    <div className="relative overflow-x-clip bg-canvas">
      <div className="aurora" data-tone="violet" style={{ height: 820 }} />
      <div className="grain pointer-events-none absolute inset-x-0 top-0 h-[820px]" />

      {/* nav */}
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
              ["Features", "#features"],
              ["Demo", "#demo"],
              ["API", "#api"],
              ["Status", "#status"],
            ].map(([l, h]) => (
              <a key={l} href={h} className="flex h-11 items-center rounded-full px-3.5 text-ink-2 transition-colors hover:bg-white/15">
                {l}
              </a>
            ))}
          </div>
          <div className="relative z-[1] flex items-center gap-1">
            <ThemeButton />
            <a href={REPO_URL} className="flex h-11 items-center gap-1.5 rounded-full bg-white px-4 text-[13px] font-semibold text-black transition-transform active:scale-[0.97]">
              <Icon name="github" size={15} /> GitHub
            </a>
          </div>
        </nav>
      </header>

      <GridFrame>
        {/* hero */}
        <div id="top" className="relative px-5 pb-24 pt-24 sm:px-10 sm:pt-32">
          <div className="mono mb-8 text-[11px] uppercase tracking-[0.2em] text-ink-3">Alpha · Android · Rust</div>
          <h1 className="display max-w-[13ch] text-[clamp(44px,8.4vw,118px)]">
            <Ph text="Run models" from={1} to={1} /> <Cutout tone="cobalt" icon="bolt" tilt={-6} label="Lightning" /> <Ph text="on the phone" from={1} to={1} />{" "}
            <Cutout tone="violet" icon="cpu" tilt={5} label="Chip" /> <Ph text="you already own." from={1} to={0.35} />
          </h1>

          <div className="pointer-events-none absolute right-[4%] top-[34%] hidden lg:block">
            <ScriptNote flip>works offline</ScriptNote>
          </div>
          <div className="absolute right-[5%] top-[14%] hidden flex-col items-start gap-5 md:flex">
            <Chip3D tilt="rotate(-7deg)">
              <span className="mono">Q4_K_M</span>
            </Chip3D>
            <Chip3D tilt="rotate(5deg)" delay={0.8} className="ml-10">
              <Icon name="bolt" size={15} /> 18.4 tok/s
            </Chip3D>
            <Chip3D tilt="rotate(-3deg)" delay={1.6}>
              <span className="mono">:11434</span>
            </Chip3D>
          </div>

          <p className="mt-10 max-w-[52ch] text-[17px] leading-relaxed text-ink-2">
            Apex runs language, image and video models on your phone and serves an Ollama-compatible API to your PC. Each model is matched to your RAM and storage before you download.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a href="#demo" className="flex items-center gap-2 rounded-full bg-white px-6 py-3.5 text-[15px] font-semibold text-black transition-transform hover:scale-[1.03] active:scale-95">
              Open the app <Icon name="arrow" size={17} strokeWidth={2.2} />
            </a>
            <a href={RELEASES_URL} className="glass flex items-center gap-2 px-6 py-3.5 text-[15px] font-semibold transition-transform hover:scale-[1.03] active:scale-95">
              <span className="relative z-[1] flex items-center gap-2">
                <Icon name="download" size={17} /> Releases
              </span>
            </a>
          </div>
        </div>

        {/* demo + insight stack */}
        <GridRow id="demo" className="px-5 py-20 sm:px-10">
          <div className="grid items-center gap-14 lg:grid-cols-2">
            <div>
              <div className="mono mb-4 text-[11px] uppercase tracking-[0.2em] text-ink-3">01 — App</div>
              <h2 className="display text-[clamp(34px,5vw,64px)]">
                <Ph text="The real interface," from={1} to={1} /> <Ph text="running in your browser." from={1} to={0.35} />
              </h2>
              <p className="mt-5 max-w-[46ch] leading-relaxed text-ink-2">
                Ask a question, open a thought, then preview a 4 GB phone and watch every model re-score. Replies are scripted in the browser. On Android the same screens run on the Rust core.
              </p>
              <div className="mt-12 max-w-[440px]">
                <FanStack
                  cards={[
                    { label: "TPS", value: "18.4" },
                    { label: "RAM free", value: "4.6", unit: "GB" },
                    { label: "Quant", value: "Q4_K_M" },
                    { label: "Keys", value: "2", unit: "active" },
                    { label: "Context", value: "4096" },
                  ]}
                >
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-2">Today</div>
                  <div className="tnum mt-1 text-[28px] font-semibold tracking-tight">14,820 tokens</div>
                  <div className="text-[13px] text-ink-2">generated on this phone · no API spend</div>
                </FanStack>
                <p className="mt-3 text-[11px] text-ink-3">Tap the card to fan it out. Numbers are illustrative.</p>
              </div>
            </div>
            <div className="flex justify-center">
              <PhoneFrame>
                <AppShell />
              </PhoneFrame>
            </div>
          </div>
        </GridRow>

        {/* features */}
        <GridRow id="features" className="px-5 py-20 sm:px-10">
          <div className="mono mb-4 text-[11px] uppercase tracking-[0.2em] text-ink-3">02 — Features</div>
          <h2 className="display max-w-[18ch] text-[clamp(34px,5vw,64px)]">
            <Ph text="A serious engine," from={1} to={1} /> <Ph text="a quiet interface." from={1} to={0.35} />
          </h2>
          <div className="mt-14 grid gap-px overflow-hidden rounded-3xl border border-white/[0.12] bg-white/[0.12] sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <article key={f.title} className="group bg-surface-2 p-7 transition-colors hover:bg-surface">
                <span className="icon-pill mb-10 transition-transform duration-300 group-hover:-translate-y-1 group-hover:rotate-[-6deg]">
                  <Icon name={f.icon} size={18} />
                </span>
                <h3 className="text-[19px] font-semibold tracking-tight">{f.title}</h3>
                <p className="mt-2 text-[14.5px] leading-relaxed text-ink-3">{f.body}</p>
              </article>
            ))}
          </div>
        </GridRow>

        {/* API */}
        <GridRow id="api" className="px-5 py-20 sm:px-10">
          <div className="grid gap-12 lg:grid-cols-2">
            <div>
              <div className="mono mb-4 text-[11px] uppercase tracking-[0.2em] text-ink-3">03 — API</div>
              <h2 className="display text-[clamp(34px,5vw,64px)]">
                <Ph text="Your phone" from={1} to={1} /> <Ph text="is the model server." from={1} to={0.35} />
              </h2>
              <ul className="mono mt-8 space-y-2 text-[13px] text-ink-2">
                {["GET  /api/tags   /api/ps   /api/version", "POST /api/chat   /api/generate   /api/pull", "GET  /v1/models", "POST /v1/chat/completions  (JSON + SSE)"].map((l) => (
                  <li key={l} className="flex gap-3">
                    <span className="text-ok">▸</span>
                    {l}
                  </li>
                ))}
              </ul>
            </div>
            <div className="bento overflow-hidden">
              <div className="flex items-center gap-1.5 border-b border-white/[0.07] px-4 py-3">
                <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
                <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
                <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
                <span className="mono ml-3 text-[11px] text-ink-3">on your PC</span>
              </div>
              <pre className="mono scroll-hide overflow-x-auto p-5 text-[12.5px] leading-[1.75] text-ink-2">{`$ curl http://192.168.1.42:11434/v1/chat/completions \\
    -H "Authorization: Bearer sk-pocket-••••" \\
    -d '{"model":"qwen2.5-3b-instruct","stream":true,
         "messages":[{"role":"user","content":"hi"}]}'

data: {"choices":[{"delta":{"content":"Hello"}}]}
data: {"choices":[{"delta":{"content":"!"}}]}
data: [DONE]`}</pre>
            </div>
          </div>
        </GridRow>

        {/* status / docs */}
        <GridRow id="status" className="px-5 py-20 sm:px-10">
          <div className="mono mb-4 text-[11px] uppercase tracking-[0.2em] text-ink-3">04 — Status</div>
          <h2 className="display max-w-[16ch] text-[clamp(34px,5vw,64px)]">
            <Ph text="Early alpha." from={1} to={1} /> <Ph text="Android build in progress." from={1} to={0.35} />
          </h2>
          <ul className="mt-10 grid max-w-[720px] gap-3">
            {STATUS.map(([s, t]) => (
              <li key={t} className="flex items-start gap-3 text-[15px] text-ink-2">
                <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] ${s === "done" ? "bg-ok/20 text-ok" : "border border-white/25 text-ink-3"}`}>{s === "done" ? <Icon name="check" size={12} strokeWidth={3} /> : "·"}</span>
                {t}
              </li>
            ))}
          </ul>
          <div className="mt-12 flex flex-wrap gap-3">
            <a href={DOCS_URL} className="glass flex items-center gap-2 px-6 py-3.5 text-[15px] font-semibold">
              <span className="relative z-[1] flex items-center gap-2">
                <Icon name="book" size={17} /> Architecture
              </span>
            </a>
            <a href={REPO_URL} className="flex items-center gap-2 rounded-full bg-white px-6 py-3.5 text-[15px] font-semibold text-black">
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
