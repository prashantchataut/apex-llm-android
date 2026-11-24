import type { MsgStats, EngineTag } from "@/components/app/useChat";

export interface BentoInput {
  prompt: string;
  think?: string;
  answer: string;
  stats?: MsgStats;
  engine?: EngineTag;
}

const W = 1080;
const H = 1350;

function plain(s: string): string {
  return s
    .replace(/```[\s\S]*?```/g, " [code] ")
    .replace(/\[\[choices\]\][\s\S]*$/g, "")
    .replace(/\$\$?([^$]+)\$\$?/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\s+\n/g, "\n")
    .trim();
}

function wrap(g: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number): string[] {
  const lines: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/)) {
      const t = line ? `${line} ${word}` : word;
      if (g.measureText(t).width > maxW && line) {
        lines.push(line);
        line = word;
      } else line = t;
    }
    lines.push(line);
  }
  if (lines.length > maxLines) {
    const cut = lines.slice(0, maxLines);
    cut[maxLines - 1] = `${cut[maxLines - 1].replace(/\s+\S*$/, "")} …`;
    return cut;
  }
  return lines;
}

function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}

/** High-contrast, watermarked share card: prompt + `<think>` summary + response + measured telemetry. */
export async function renderBento(i: BentoInput): Promise<Blob> {
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d");
  if (!g) throw new Error("canvas unavailable");
  g.fillStyle = "#050507";
  g.fillRect(0, 0, W, H);
  const a1 = g.createRadialGradient(W * 0.2, -60, 20, W * 0.2, -60, 760);
  a1.addColorStop(0, "rgba(109,40,217,0.75)");
  a1.addColorStop(1, "rgba(109,40,217,0)");
  g.fillStyle = a1;
  g.fillRect(0, 0, W, H);
  const a2 = g.createRadialGradient(W * 0.95, 80, 20, W * 0.95, 80, 640);
  a2.addColorStop(0, "rgba(29,78,216,0.65)");
  a2.addColorStop(1, "rgba(29,78,216,0)");
  g.fillStyle = a2;
  g.fillRect(0, 0, W, H);
  // hairline Swiss grid
  g.strokeStyle = "rgba(255,255,255,0.06)";
  g.lineWidth = 1;
  for (let x = 60; x < W; x += 120) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, H);
    g.stroke();
  }

  const sans = "600 30px ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif";
  const mono = "500 22px ui-monospace, SFMono-Regular, Menlo, monospace";
  let y = 84;
  // header
  g.fillStyle = "#fff";
  g.font = "700 34px ui-sans-serif, system-ui, sans-serif";
  g.fillText("APEX", 72, y);
  g.fillStyle = "rgba(255,255,255,0.55)";
  g.font = mono;
  g.fillText("PRIVATE · ON-DEVICE · OFFLINE", 72 + 110, y - 2);
  y += 40;

  // prompt card
  g.font = "600 36px ui-sans-serif, system-ui, sans-serif";
  const pLines = wrap(g, plain(i.prompt), W - 72 * 2 - 64, 3);
  const pH = 56 + pLines.length * 48;
  g.fillStyle = "rgba(255,255,255,0.10)";
  rr(g, 72, y, W - 144, pH, 36);
  g.fill();
  g.strokeStyle = "rgba(255,255,255,0.16)";
  rr(g, 72, y, W - 144, pH, 36);
  g.stroke();
  g.fillStyle = "rgba(255,255,255,0.5)";
  g.font = mono;
  g.fillText("PROMPT", 104, y + 40);
  g.fillStyle = "#fff";
  g.font = "600 36px ui-sans-serif, system-ui, sans-serif";
  pLines.forEach((l, k) => g.fillText(l, 104, y + 92 + k * 48));
  y += pH + 28;

  // think summary
  const think = i.think ? plain(i.think) : "";
  if (think) {
    g.font = "italic 400 26px ui-sans-serif, system-ui, sans-serif";
    const tl = wrap(g, think, W - 144 - 64, 3);
    const th = 56 + tl.length * 38;
    g.fillStyle = "rgba(109,40,217,0.22)";
    rr(g, 72, y, W - 144, th, 30);
    g.fill();
    g.fillStyle = "#c4b5fd";
    g.font = mono;
    g.fillText("THOUGHT · SUMMARY", 104, y + 38);
    g.fillStyle = "rgba(255,255,255,0.82)";
    g.font = "italic 400 26px ui-sans-serif, system-ui, sans-serif";
    tl.forEach((l, k) => g.fillText(l, 104, y + 80 + k * 38));
    y += th + 28;
  }

  // answer card (fills the remaining height)
  const footH = 190;
  const aH = H - y - footH - 20;
  g.fillStyle = "#121216";
  rr(g, 72, y, W - 144, aH, 40);
  g.fill();
  g.strokeStyle = "rgba(255,255,255,0.12)";
  rr(g, 72, y, W - 144, aH, 40);
  g.stroke();
  g.fillStyle = "#34d399";
  g.font = mono;
  g.fillText("RESPONSE", 108, y + 50);
  g.fillStyle = "#fff";
  g.font = "400 32px ui-sans-serif, system-ui, sans-serif";
  const maxLines = Math.max(4, Math.floor((aH - 110) / 46));
  wrap(g, plain(i.answer) || "…", W - 144 - 72, maxLines).forEach((l, k) => g.fillText(l, 108, y + 112 + k * 46));

  // telemetry + watermark
  const fy = H - footH + 10;
  const s = i.stats;
  const chips: [string, string][] = [
    ["TOK/S", s ? s.tps.toFixed(1) : "—"],
    ["TTFT", s?.ttftMs !== undefined ? `${s.ttftMs} ms` : "—"],
    ["TOKENS", s ? String(s.tokens) : "—"],
  ];
  chips.forEach(([k, v], idx) => {
    const x = 72 + idx * 232;
    g.fillStyle = "rgba(255,255,255,0.08)";
    rr(g, x, fy, 216, 92, 28);
    g.fill();
    g.fillStyle = "rgba(255,255,255,0.5)";
    g.font = "500 18px ui-monospace, Menlo, monospace";
    g.fillText(k, x + 24, fy + 34);
    g.fillStyle = "#fff";
    g.font = "700 34px ui-monospace, Menlo, monospace";
    g.fillText(v, x + 24, fy + 72);
  });
  const real = i.engine && i.engine.backend !== "sandbox";
  g.fillStyle = real ? "#34d399" : "#fbbf24";
  g.font = "600 20px ui-monospace, Menlo, monospace";
  g.textAlign = "right";
  g.fillText(real ? "● REAL WEIGHTS" : "● SIMULATED PREVIEW", W - 72, fy + 34);
  g.fillStyle = "rgba(255,255,255,0.7)";
  g.font = "500 20px ui-monospace, Menlo, monospace";
  g.fillText((i.engine?.label ?? "Apex").slice(0, 34), W - 72, fy + 66);
  g.textAlign = "left";
  g.fillStyle = "rgba(255,255,255,0.4)";
  g.font = "500 22px ui-monospace, Menlo, monospace";
  g.fillText("github.com/prashantchataut/apex-llm-android", 72, H - 48);
  g.textAlign = "right";
  g.fillText("made with Apex", W - 72, H - 48);
  g.textAlign = "left";
  void sans;
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("png encode failed"))), "image/png"));
}
