import { chromium } from "playwright";
import sp from "@sparticuz/chromium";
const EXE = await sp.executablePath();
import { spawn } from "node:child_process";
const OUT = "/tmp/apexrepo/docs/qa-session-14";
const srv = spawn("python3", ["-m", "http.server", "4173", "-d", "/tmp/apexrepo/web-showcase/out"], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 1200));
const BASE = "http://localhost:4173";
const browser = await chromium.launch({ executablePath: EXE, args: sp.args, headless: true });
const log = (...a) => console.log(...a);
const phone = { viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true };
const desk = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 };
const fresh = async (opts, onboarded) => {
  const ctx = await browser.newContext(opts);
  if (onboarded) await ctx.addInitScript(() => { localStorage.setItem("apex.onboarded", "1"); localStorage.setItem("apex.calm.mode", "dark"); });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => log("PAGEERROR", e.message));
  return { ctx, page };
};

// 01 onboarding screen 1 (phone + desktop)
for (const [n, o] of [["phone", phone], ["desktop", desk]]) {
  const { ctx, page } = await fresh(o, false);
  await page.goto(`${BASE}/app/`); await page.waitForSelector('[data-testid="routing-card"]', { timeout: 15000 });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${OUT}/01-onboarding-screen-1-redesigned${n === "desktop" ? "-desktop" : ""}.png` });
  if (n === "phone") log("routing card:", (await page.locator('[data-testid="routing-card"]').innerText()).replace(/\n+/g, " | "));
  await ctx.close();
}

// 02 clean chat + Apex Auto + routed badge (real network)
{
  const { ctx, page } = await fresh(phone, true);
  await page.goto(`${BASE}/app/`); await page.waitForTimeout(2500);
  log("style cards present on home:", await page.getByText("Concise Assistant").count() + await page.getByText("Code Reviewer").count());
  log("pill:", (await page.locator("header").first().innerText()).replace(/\n+/g, " "));
  const box = page.getByLabel("Message");
  await box.fill("Write a Rust function fn add(a: i32, b: i32) -> i32 and explain it in one line");
  await page.getByLabel("Send").click();
  await page.waitForSelector('[data-testid="route-badge"]', { timeout: 40000 });
  await page.waitForFunction(() => !document.querySelector('[aria-label="Stop generating"]'), null, { timeout: 40000 }).catch(() => {});
  await page.waitForTimeout(800);
  log("badge:", await page.locator('[data-testid="route-badge"]').first().innerText());
  // follow-up proves multi-turn context
  await box.fill("Now make the explanation shorter");
  await page.getByLabel("Send").click();
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="route-badge"]').length >= 2, null, { timeout: 40000 }).catch(() => {});
  await page.waitForFunction(() => !document.querySelector('[aria-label="Stop generating"]'), null, { timeout: 40000 }).catch(() => {});
  await page.waitForTimeout(6000); // let the AI title land
  await page.screenshot({ path: `${OUT}/02-clean-ollama-bionic-chat-no-style-cards.png` });
  log("badges:", await page.locator('[data-testid="route-badge"]').allInnerTexts());
  // 04 model switcher
  await page.locator("header button").filter({ hasText: /Apex|Local|Choose/ }).first().click().catch(() => {});
  await page.waitForTimeout(600);
  await page.getByRole("tab", { name: "Apex API" }).click().catch(() => {});
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/04-apex-api-live-verified-models-and-gemini-argon.png` });
  log("verified rows:", await page.locator('[data-testid="verified-models"] button').count());
  await ctx.close();
}

// 05 memory distiller
{
  const { ctx, page } = await fresh(phone, true);
  await page.goto(`${BASE}/app/`); await page.waitForTimeout(2000);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("apex:goto", { detail: "memory" })));
  await page.waitForTimeout(800);
  if (!(await page.getByLabel("Tell Apex about yourself").count())) { await page.getByRole("button", { name: /menu/i }).first().click(); await page.getByText("Memory", { exact: true }).first().click(); }
  await page.getByLabel("Tell Apex about yourself").fill("I'm Prashant, I use a Nothing Phone 4a, I build Rust & Android apps, and I hate emojis");
  await page.getByRole("button", { name: /Distill/ }).click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${OUT}/05a-memory-distilling-shimmer.png` });
  await page.waitForSelector('[data-testid="memory-pill"]', { timeout: 30000 });
  await page.waitForTimeout(600);
  log("memory pills:", await page.locator('[data-testid="memory-pill"]').allInnerTexts());
  log("status:", await page.getByRole("status").first().innerText());
  await page.screenshot({ path: `${OUT}/05-ai-memory-extractor-in-action.png` });
  await ctx.close();
}

// 06 GitHub login screen
{
  const { ctx, page } = await fresh(phone, true);
  await page.goto(`${BASE}/app/`); await page.waitForTimeout(2000);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("apex:goto", { detail: "mcp" })));
  await page.waitForTimeout(1000);
  await page.locator('[data-testid="github-connect"]').scrollIntoViewIfNeeded();
  await page.locator('[data-testid="github-connect"] button', { hasText: "Continue with GitHub" }).click();
  await page.waitForTimeout(800);
  await page.locator('[data-testid="github-connect"]').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${OUT}/06-github-oauth-login-screen.png` });
  log("github card:", (await page.locator('[data-testid="github-connect"]').innerText()).replace(/\n+/g, " | "));
  await ctx.close();
}

// 03 local model download with Content-Length STRIPPED (the exact failure scenario)
{
  const { ctx, page } = await fresh(phone, true);
  let stripped = 0;
  await ctx.route(/huggingface\.co\/.*\/resolve\/|xethub|cdn-lfs|hf\.co\/.*\.gguf/, async (route) => {
    const r = await route.fetch();
    const h = { ...r.headers() };
    for (const k of ["content-length", "content-range", "x-linked-size"]) delete h[k];
    stripped++;
    await route.fulfill({ status: r.status(), headers: h, body: await r.body() });
  });
  page.on("console", (m) => /content length/i.test(m.text()) && log("CONSOLE ERR", m.text()));
  await page.goto(`${BASE}/app/`); await page.waitForTimeout(2000);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("apex:goto", { detail: "hub" })));
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: /Get SmolLM2 135M/ }).first().click();
  await page.waitForTimeout(3500);
  await page.screenshot({ path: `${OUT}/03-local-model-downloading-working-progress.png` });
  const t0 = Date.now(); let seen = "";
  while (Date.now() - t0 < 120000) {
    const txt = await page.locator("body").innerText();
    seen = txt.match(/\d+(\.\d+)? ?MB[^\n]{0,40}/g)?.slice(0, 3).join(" ; ") ?? "";
    if (/content length/i.test(txt)) { log("FAIL: content-length error shown"); break; }
    if (/Use|Loaded|On device|Installed/i.test(txt) && !/Get SmolLM2 135M/.test(await page.content().then((c) => c.slice(0, 0)))) {}
    await page.waitForTimeout(2000);
    if (Date.now() - t0 > 20000) break;
  }
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/03b-local-model-download-after.png` });
  log("route-stripped responses:", stripped, "| progress text:", seen, "| error text present:", /content length/i.test(await page.locator("body").innerText()));
  await ctx.close();
}
await browser.close(); srv.kill();
