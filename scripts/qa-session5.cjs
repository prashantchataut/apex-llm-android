// Playwright QA for Session 5. Usage: node qa-session5.cjs <mobile|desktop>
const { chromium } = require("/tmp/pw/node_modules/playwright");
const OUT = "/tmp/apex/docs/qa-session-5";
const URL = "http://localhost:8099/app/";
const VPS = { mobile: { width: 390, height: 844 }, desktop: { width: 1440, height: 900 } };
const which = process.argv[2] || "mobile";
const log = (...a) => console.log(`[${which}]`, ...a);

async function newCtx(browser) {
  const ctx = await browser.newContext({ viewport: VPS[which], deviceScaleFactor: 2, colorScheme: "dark", permissions: ["microphone"] });
  await ctx.addInitScript(() => localStorage.setItem("apex.onboarding.v1", JSON.stringify({ done: true, uses: [], picks: [] })));
  return ctx;
}
async function open(ctx) {
  const page = await ctx.newPage();
  page.on("pageerror", (e) => log("pageerror", String(e).slice(0, 200)));
  await page.goto(URL, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /^chat$/i }).first().click().catch(async () => page.locator("nav button").nth(1).click());
  await page.waitForTimeout(700);
  return page;
}
const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}-${which}.png` });
const composer = (page) => page.locator("form input").last();
async function send(page, text) {
  await composer(page).fill(text);
  await composer(page).press("Enter");
}
async function step(name, fn) {
  try { await fn(); log("ok", name); } catch (e) { log("FAIL", name, String(e).slice(0, 300)); }
}

(async () => {
  const browser = await chromium.launch({ args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--autoplay-policy=no-user-gesture-required"] });

  // ── 02 artifacts (fresh profile → sandbox engine, labelled SIMULATED) ──
  await step("artifacts", async () => {
    const ctx = await newCtx(browser);
    const page = await open(ctx);
    await send(page, "draw an svg logo");
    await page.getByRole("button", { name: /Open Live Artifact/ }).first().waitFor({ timeout: 30000 });
    await page.waitForTimeout(500);
    await page.getByRole("button", { name: /Open Live Artifact/ }).first().click();
    await page.waitForTimeout(1800);
    await shot(page, "02-live-artifacts-svg-html-preview");
    await page.getByRole("button", { name: "Close artifact" }).click({ force: true });
    await page.waitForTimeout(500);
    await send(page, "mermaid flowchart of a login");
    await page.getByRole("button", { name: /Open Live Artifact/ }).nth(1).waitFor({ timeout: 30000 });
    await page.waitForTimeout(1500);
    await page.getByRole("button", { name: /Open Live Artifact/ }).nth(1).click({ force: true });
    await page.waitForTimeout(3500);
    await shot(page, "02b-live-artifact-mermaid");
    await ctx.close();
  });

  if (process.env.ONLY === "artifacts") { await browser.close(); return; }
  // ── 01 / 03 / 05 / 04 real engine session ──
  const ctx = await newCtx(browser);
  const page = await open(ctx);
  await shot(page, "00-sandbox-before-model");
  let loaded = false;
  await step("download+load", async () => {
    await page.getByRole("button", { name: "Execution engine" }).first().click();
    await page.waitForTimeout(600);
    await page.getByRole("dialog").getByRole("button", { name: /Download/ }).first().click();
    await page.waitForTimeout(2500);
    await shot(page, "01a-real-gguf-download-progress");
    await page.getByRole("button", { name: "Execution engine" }).first().waitFor();
    await page.waitForFunction(() => /WLLAMA GGUF/.test(document.body.innerText), null, { timeout: 280000 });
    loaded = true;
    await page.waitForTimeout(500);
    await page.getByRole("button", { name: "Close engine panel" }).click({ force: true }).catch(() => {});
    await page.waitForTimeout(400);
  });
  if (loaded) {
    await step("live-inference", async () => {
      await send(page, "What is the capital of France? Answer in one sentence.");
      await page.waitForTimeout(6000);
      await shot(page, "01b-live-inference-streaming");
      await page.getByRole("button", { name: "Open telemetry inspector" }).waitFor({ timeout: 240000 });
      await page.waitForTimeout(600);
      await shot(page, "01-real-gguf-download-and-live-inference");
    });
    await step("telemetry+bento", async () => {
      await page.getByRole("button", { name: "Open telemetry inspector" }).click();
      await page.waitForTimeout(900);
      await shot(page, "05a-per-message-telemetry-popover");
      await page.getByRole("button", { name: "Close telemetry" }).click({ force: true });
      await page.waitForTimeout(400);
      await page.getByRole("button", { name: "Share Bento Card" }).click();
      await page.getByRole("img", { name: /bento card/i }).waitFor({ timeout: 20000 });
      await page.waitForTimeout(900);
      await shot(page, "05-shareable-bento-card-export");
      await page.getByRole("button", { name: "Close preview" }).click({ force: true });
      await page.waitForTimeout(400);
    });
    await step("branching", async () => {
      await page.getByRole("button", { name: "Regenerate" }).click();
      await page.waitForTimeout(500);
      await page.getByRole("button", { name: "Open telemetry inspector" }).waitFor({ timeout: 240000 });
      await page.waitForTimeout(600);
      await shot(page, "03b-branch-pager-regenerated");
    });
    await step("arena", async () => {
      await page.getByRole("button", { name: "Toggle Arena mode" }).click();
      await page.waitForTimeout(700);
      await send(page, "Explain what a KV cache is in two sentences.");
      await page.waitForTimeout(9000);
      await shot(page, "03a-arena-streaming");
      await page.waitForFunction(() => [...document.querySelectorAll("button[aria-label^='Crown lane']")].every((b) => !b.disabled), null, { timeout: 280000 });
      await page.getByRole("button", { name: "Crown lane A winner" }).click();
      await page.waitForTimeout(450);
      await shot(page, "03-model-arena-split-duel");
      await page.getByRole("button", { name: "Toggle Arena mode" }).click();
    });
  }
  await step("voice", async () => {
    await page.getByRole("button", { name: /Voice/ }).first().click();
    await page.waitForTimeout(2200);
    await shot(page, "04-real-voice-fft-transcriber");
    await page.getByRole("button", { name: /Voice/ }).first().click().catch(() => page.locator("form button").first().click());
    await page.waitForTimeout(2500);
    await shot(page, "04b-whisper-transcribing-status");
    await page.waitForFunction(() => /ms for [\d.]+ s of audio|Heard silence|could not load/.test(document.body.innerText), null, { timeout: 200000 }).catch(() => {});
    await page.waitForTimeout(500);
    await shot(page, "04c-whisper-result");
    log("composer text:", JSON.stringify(await composer(page).inputValue().catch(() => "")));
  });
  await browser.close();
  log("done");
})();
