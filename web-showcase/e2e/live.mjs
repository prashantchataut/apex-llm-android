// Live end-to-end: unlock Apex API with the real key dialog, send the presentation prompt to a real flagship relay,
// and verify no monologue leaks, the .pptx card appears and the Virtual Localhost renders 6 slides.
//   APP_URL=http://localhost:4173/apex-llm-android APEX_KEY=... MODELS="Claude 4 Sonnet,Apex Auto Pro" node e2e/live.mjs
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = process.env.APP_URL ?? "http://localhost:4173";
const OUT = process.env.OUT ?? "./shots";
const KEY = process.env.APEX_KEY ?? "APEX-PRO-2026";
const MODELS = (process.env.MODELS ?? "Claude 4 Sonnet,Apex Auto Pro").split(",");
const WAIT = Number(process.env.WAIT_MS ?? 240000);
fs.mkdirSync(OUT, { recursive: true });
const results = [];
const ok = (name, pass, detail = "") => { results.push({ name, pass, detail }); console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`); };
const LEAK = /(let me|the user wants|first, i need|i should|okay, so|reply with one html)/i;
const slug = (m) => m.toLowerCase().replace(/[^a-z0-9]+/g, "-");

const browser = await chromium.launch();
let done = false;
for (const model of MODELS) {
  if (done) break;
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, acceptDownloads: true });
  const page = await c.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e)));
  await page.goto(`${BASE}/app/?skip-intro`, { waitUntil: "networkidle" });
  await page.waitForSelector('[data-testid="engine-pill"]');

  await page.click('[data-testid="engine-pill"]');
  await page.click('[data-testid="tab-api"]');
  await page.click('[data-testid="apex-locked-card"]');
  await page.fill("#access-key-input", KEY);
  await page.keyboard.press("Enter");
  await page.waitForSelector("#access-key-input", { state: "detached", timeout: 30000 }).catch(() => {});
  ok("Apex API key accepted through the dialog", await page.evaluate(() => !!localStorage.getItem("apex_unlocked_key_hash")));

  await page.click('[data-testid="engine-pill"]');
  await page.click('[data-testid="tab-api"]');
  const row = page.locator('[data-testid="pane-api"] [data-testid="switcher-row"]', { hasText: model }).first();
  await row.waitFor({ timeout: 20000 });
  await row.click();
  await page.fill('textarea[aria-label="Message"]', "Create a 6-slide presentation on Digital Education");
  await page.keyboard.press("Enter");
  const t0 = Date.now();
  const got = await page.waitForSelector('[data-testid="pptx-card"]', { timeout: WAIT }).then(() => true).catch(() => false);
  const secs = Math.round((Date.now() - t0) / 1000);
  const bubble = await page.locator("[data-sel-msg]").last().innerText().catch(() => "");
  await page.screenshot({ path: `${OUT}/16-live-${slug(model)}.png` });
  if (!got) { ok(`LIVE ${model}: deck + .pptx card`, false, `none within ${secs}s; bubble: ${JSON.stringify(bubble.slice(0, 120))}`); await c.close(); continue; }
  ok(`LIVE ${model}: .pptx card appears`, true, `${secs}s`);
  ok(`LIVE ${model}: no raw monologue in the bubble`, !LEAK.test(bubble.slice(0, 240)), JSON.stringify(bubble.slice(0, 80)));
  await page.locator('[data-testid="live-preview-card"]').first().click().catch(() => {});
  await page.waitForTimeout(1500);
  const slides = await page.frameLocator("iframe").first().locator("section").count().catch(() => 0);
  ok(`LIVE ${model}: Virtual Localhost renders slides`, slides >= 6, `${slides} sections in the sandboxed iframe`);
  await page.screenshot({ path: `${OUT}/17-live-localhost-${slug(model)}.png` });
  ok(`LIVE ${model}: zero page errors`, errs.length === 0, errs.join(" | ").slice(0, 200));
  done = true;
  await c.close();
}
await browser.close();
fs.writeFileSync(`${OUT}/live-results.json`, JSON.stringify(results, null, 2));
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
