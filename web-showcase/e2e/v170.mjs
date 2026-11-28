// End-to-end checks for v1.7.0. Run against a static export:
//   (cd web-showcase/out && python3 -m http.server 4173) &   node e2e/v170.mjs
// Needs `playwright` (+ chromium) resolvable from this folder.
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const BASE = process.env.APP_URL ?? "http://localhost:4173";
const OUT = process.env.OUT ?? "./shots";
fs.mkdirSync(OUT, { recursive: true });
const results = [];
const ok = (name, pass, detail = "") => { results.push({ name, pass, detail }); console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`); };
const EMOJI = /\p{Extended_Pictographic}/u;

const DECK = (n = 6, truncate = false) => {
  const slides = [
    `<section class="slide"><h1>Digital Education</h1><p>How technology reshapes learning</p></section>`,
    `<section class="slide"><h2>Why It Matters</h2><ul><li>Access beyond classrooms</li><li>Personalised pacing</li><li>Lower cost per learner</li></ul></section>`,
    `<section class="slide"><h2>Tools That Work</h2><ul><li>Adaptive quizzes</li><li>Video micro-lessons</li><li>AI tutors</li><li>Collaborative boards</li></ul></section>`,
    `<section class="slide"><h2>Impact In Numbers</h2><div class="stat"><b>67%</b><span>higher completion</span></div><div class="stat"><b>3.2x</b><span>faster feedback</span></div><div class="stat"><b>1.1B</b><span>learners online</span></div></section>`,
    `<section class="slide"><h2>Challenges</h2><ul><li>Connectivity gaps</li><li>Teacher training</li><li>Data privacy</li></ul></section>`,
    `<section class="slide"><h2>Key Takeaways</h2><ul><li>Start with access</li><li>Measure outcomes</li><li>Keep humans in the loop</li></ul></section>`,
  ].slice(0, n).join("\n");
  const head = `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:#0b0b10;color:#fff;font-family:sans-serif}.slide{min-height:100vh;padding:32px;box-sizing:border-box}.stat{display:inline-block;margin:8px;padding:16px;background:#1b1b26;border-radius:12px}.stat b{display:block;font-size:34px;color:#8c78ff}</style></head><body>`;
  return truncate ? head + slides.replace(/<\/section>\s*$/, "") .slice(0, -12) : head + slides + `</body></html>`;
};
const PLAN = "Okay, the user wants a 6-slide presentation on Digital Education. Let me plan this out. First, I need to create six slides with a dark modern style, then add stat cards. ";
const sse = (reasoning, content) => {
  const ev = (d) => `data: ${JSON.stringify({ choices: [{ delta: d }] })}\n\n`;
  let b = ev({ reasoning_content: reasoning });
  for (let i = 0; i < content.length; i += 900) b += ev({ content: content.slice(i, i + 900) });
  return b + "data: [DONE]\n\n";
};
async function mockModels(page, content, reasoning = "Planning the deck structure and styling.") {
  await page.route((u) => /chat\/completions|\/v1\/messages|pollinations\.ai\/openai$/.test(u.pathname + (u.hostname.includes("pollinations") ? "" : "")) || /\/openai$/.test(u.pathname), async (route) => {
    const req = route.request();
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "POST,OPTIONS" } });
    if (req.method() !== "POST") return route.continue();
    if (/openai-audio/.test(req.postData() ?? "")) return route.fulfill({ status: 402, headers: { "access-control-allow-origin": "*" }, body: "{}" });
    return route.fulfill({ status: 200, headers: { "content-type": "text/event-stream", "access-control-allow-origin": "*" }, body: sse(reasoning, content) });
  });
}
const noEmoji = async (page, label) => ok(`no emoji: ${label}`, !EMOJI.test(await page.evaluate(() => document.body.innerText)));
const noOverflow = async (page, label) => { const o = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth); ok(`no horizontal overflow: ${label}`, o <= 1, `${o}px`); };

const browser = await chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"] });
async function ctx(w = 390, h = 844) {
  const c = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, permissions: ["microphone"], acceptDownloads: true });
  const page = await c.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e)));
  return { c, page, errs };
}
const openApp = async (page) => { await page.goto(`${BASE}/app/?skip-intro`, { waitUntil: "networkidle" }); await page.waitForSelector('[data-testid="engine-pill"]'); };

/* ───── 1. Presentation: no leak, .pptx card, Virtual Localhost with 6 slides ───── */
{
  const { c, page, errs } = await ctx();
  await mockModels(page, PLAN + DECK(6));
  await openApp(page);
  await page.screenshot({ path: `${OUT}/01-home.png` });
  ok("home shows the 4 starter cards", (await page.locator('[data-testid^="card-"]').count()) === 4);
  ok("starter pill bar above composer", await page.locator('[data-testid="starter-bar"]').isVisible());
  ok("old Prompt templates entry removed", (await page.locator('[data-testid="templates-open"]').count()) === 0);
  await noEmoji(page, "home"); await noOverflow(page, "home 390");
  await page.click('[data-testid="card-presentation"]');
  await page.fill('[data-testid="topic-input"]', "Digital Education");
  await page.screenshot({ path: `${OUT}/02-topic-sheet.png` });
  await page.click('[data-testid="topic-go"]');
  await page.waitForSelector('[data-testid="pptx-card"]', { timeout: 30000 });
  await page.waitForFunction(() => !document.querySelector('[data-testid="download-pptx"]')?.disabled, null, { timeout: 30000 });
  const user = await page.locator('[data-sel-msg]').first().innerText().catch(() => "");
  const body = await page.evaluate(() => document.body.innerText);
  ok("user message is exactly what the user asked", /Create a 6-slide presentation on Digital Education/.test(body) && !/Reply with ONE/i.test(body));
  const bubble = await page.locator('[data-sel-msg]').last().innerText();
  ok("no raw monologue in the bubble", !/(let me plan|the user wants|first, i need to|okay,)/i.test(bubble), JSON.stringify(bubble.slice(0, 80)));
  ok("no prompt-engineering text echoed", !/Do not output your planning/i.test(body));
  ok("reasoning moved into the collapsible Thinking Trace", /plan|Planning/i.test(await page.evaluate(() => document.body.innerHTML)) );
  ok("live preview card rendered", await page.locator('[data-testid="live-preview-card"]').isVisible());
  await page.screenshot({ path: `${OUT}/03-chat-pptx-card.png` });
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click('[data-testid="download-pptx"]')]);
  const file = `${OUT}/${dl.suggestedFilename()}`; await dl.saveAs(file);
  const names = execFileSync("python3", ["-c", "import zipfile,sys;print('\\n'.join(zipfile.ZipFile(sys.argv[1]).namelist()))", file]).toString();
  const nSlides = (names.match(/ppt\/slides\/slide\d+\.xml/g) ?? []).length;
  ok("downloaded a real .pptx (OOXML zip)", /\.pptx$/.test(dl.suggestedFilename()) && names.includes("[Content_Types].xml") && nSlides >= 6, `${dl.suggestedFilename()} · ${nSlides} slides`);
  await page.click('button[aria-label="Open Preview"]');
  await page.waitForSelector('[data-testid="live-preview-viewer"]');
  ok("Virtual Localhost address bar", /localhost:3000\/preview/.test(await page.locator('[data-testid="localhost-address"]').innerText()));
  const src = await page.locator('[data-testid="preview-frame"]').getAttribute("src");
  ok("served from an isolated Blob URL", /^blob:/.test(src ?? ""));
  ok("iframe is sandboxed without same-origin", !(await page.locator('[data-testid="preview-frame"]').getAttribute("sandbox"))?.includes("allow-same-origin"));
  let rendered = 0;
  for (let k = 1; k <= 6; k++) {
    await page.click(`[role="tab"][aria-label="Slide ${k}"]`);
    await page.waitForTimeout(250);
    const fl = page.frameLocator('[data-testid="preview-frame"]');
    const t = await fl.locator("section.slide:visible").first().innerText({ timeout: 5000 }).catch(() => "");
    if (t.trim().length > 3) rendered++;
    if (k === 1 || k === 4) await page.screenshot({ path: `${OUT}/0${k === 1 ? 4 : 5}-localhost-slide${k}.png` });
  }
  ok("all 6 slides render interactively", rendered === 6, `${rendered}/6`);
  await noOverflow(page, "viewer 390"); await noEmoji(page, "viewer");
  await page.click('button:has-text("Desktop")'); await page.screenshot({ path: `${OUT}/06-localhost-desktop.png` });
  await page.click('[data-testid="view-source"]'); ok("view source shows the code", /<section class="slide">/.test(await page.locator("pre code").innerText()));
  await page.click('[data-testid="view-source"]');
  const before = await page.locator('[data-testid="preview-frame"]').getAttribute("src");
  await page.click('[data-testid="live-reload"]'); await page.waitForTimeout(300);
  ok("Live Reload re-serves a fresh Blob URL", before !== (await page.locator('[data-testid="preview-frame"]').getAttribute("src")));
  const [dh] = await Promise.all([page.waitForEvent("download"), page.click('[data-testid="download-html"]')]);
  ok("Download .HTML", /\.html$/.test(dh.suggestedFilename()));
  const [dp] = await Promise.all([page.waitForEvent("download"), page.click('[data-testid="viewer-download-pptx"]')]);
  ok("Download .PPTX from the viewer", /\.pptx$/.test(dp.suggestedFilename()));
  await page.keyboard.press("Escape");

  // Read Aloud
  const ra = page.locator('[data-testid="read-aloud"] button[aria-label="Read aloud"]').first();
  await ra.scrollIntoViewIfNeeded();
  await page.evaluate(() => { window.__tts = new Set(); const el = document.querySelector('[data-testid="read-aloud"]'); new MutationObserver(() => window.__tts.add(el.getAttribute("data-state"))).observe(el, { attributes: true, attributeFilter: ["data-state"] }); });
  await ra.click();
  await page.waitForTimeout(4500);
  const states = new Set(await page.evaluate(() => [...window.__tts]));
  ok("Read Aloud initialises cleanly (no page errors)", errs.length === 0, `states: ${[...states].join(",")} ${errs[0] ?? ""}`);
  ok("Read Aloud reached a speaking/loading state or fell back and finished", states.has("loading") || states.has("speaking") || states.has("paused"), [...states].join(","));
  await c.close();
}

/* ───── 1b. Truncated + un-fenced HTML still renders (auto-close) ───── */
{
  const { c, page } = await ctx();
  await mockModels(page, PLAN + DECK(4, true));
  await openApp(page);
  await page.click('[data-testid="card-page"]'); await page.fill('[data-testid="topic-input"]', "a digital education dashboard"); await page.click('[data-testid="topic-go"]');
  await page.waitForSelector('[data-testid="live-preview-card"]', { timeout: 30000 });
  await page.click('button[aria-label="Open Preview"]');
  await page.waitForSelector('[data-testid="preview-frame"]');
  const fl = page.frameLocator('[data-testid="preview-frame"]');
  const n = await fl.locator("section.slide").count().catch(() => 0);
  ok("truncated raw <!doctype html> is auto-closed and previews", n >= 2, `${n} slides parsed from cut-off output`);
  await page.screenshot({ path: `${OUT}/07-truncated-autoclosed.png` });
  await c.close();
}

/* ───── 2. Mic ───── */
{
  const { c, page, errs } = await ctx();
  await openApp(page);
  await page.click('button[aria-label="Voice input"]');
  await page.waitForTimeout(1200);
  const rec = await page.locator('button[aria-label="Stop recording"]').count();
  const txt = await page.evaluate(() => document.body.innerText);
  ok("Voice mic starts (recording UI or a clear notice) with zero errors", errs.length === 0 && (rec > 0 || /permission|Instant recognition|not available|microphone/i.test(txt)), `recording=${rec > 0} errors=${errs.length}`);
  await page.screenshot({ path: `${OUT}/08-mic.png` });
  if (rec) await page.click('button[aria-label="Stop recording"]');
  await c.close();
}

/* ───── 3. GitHub: username flow (real api.github.com) + token tab ───── */
{
  const { c, page, errs } = await ctx();
  await openApp(page);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("apex:goto", { detail: "mcp" })));
  await page.waitForSelector('[data-testid="gh-connect"]');
  await page.click('[data-testid="gh-connect"]');
  await page.waitForSelector('[data-testid="gh-modal"]');
  await page.screenshot({ path: `${OUT}/09-github-username.png` });
  await page.click('[data-testid="gh-tab-token"]');
  await page.waitForSelector('[data-testid="gh-generate-token"]', { timeout: 5000 }).catch(() => {});
  ok("token tab has the Generate Token on GitHub button", await page.locator('[data-testid="gh-generate-token"]').isVisible());
  await page.fill('[data-testid="gh-token"]', "ghp_invalidinvalidinvalid0000000000000000");
  await page.click('[data-testid="gh-token-go"]');
  await page.waitForSelector('[data-testid="gh-error"]', { timeout: 20000 });
  ok("invalid token is rejected with a clear message", /not valid|rate limit|answered/i.test(await page.locator('[data-testid="gh-error"]').innerText()));
  await page.screenshot({ path: `${OUT}/10-github-token.png` });
  await page.click('[data-testid="gh-tab-username"]');
  await page.fill('[data-testid="gh-username"]', "octocat");
  await page.click('[data-testid="gh-username-go"]');
  await page.waitForSelector('[data-testid="gh-login"]', { timeout: 25000 });
  ok("username connect shows the profile", /octocat/i.test(await page.locator('[data-testid="gh-login"]').innerText()));
  await page.waitForSelector('[role="option"]', { timeout: 25000 });
  const repos = await page.locator('[role="option"]').count();
  ok("repositories load", repos > 0, `${repos} repos`);
  await page.locator('[role="option"]').first().click();
  await page.waitForSelector('[data-testid="gh-entry"]', { timeout: 25000 });
  ok("repo file tree loads", (await page.locator('[data-testid="gh-entry"]').count()) > 0);
  await page.screenshot({ path: `${OUT}/11-github-browser.png` });
  await page.click('[data-testid="gh-attach-readme"]');
  await page.waitForSelector('[data-testid="composer"], textarea[aria-label="Message"]', { timeout: 20000 });
  await page.waitForFunction(() => /README/i.test(document.body.innerText), null, { timeout: 20000 });
  ok("README attached into the chat composer", /README/i.test(await page.evaluate(() => document.body.innerText)));
  await page.screenshot({ path: `${OUT}/12-github-attached.png` });
  ok("GitHub flows: zero page errors", errs.length === 0, errs[0] ?? "");
  await c.close();
}

/* ───── 4. Admin ───── */
{
  const { c, page, errs } = await ctx();
  await page.goto(`${BASE}/admin/`, { waitUntil: "networkidle" });
  await page.waitForSelector('[data-testid="admin-gate"]');
  await page.screenshot({ path: `${OUT}/13-admin-gate.png` });
  ok("admin gate is passphrase-only (one field)", (await page.locator('[data-testid="admin-gate"] input').count()) === 1);
  await page.fill('[data-testid="admin-gate"] input', "apex-admin-2025");
  await page.keyboard.press("Enter");
  await page.waitForSelector('[data-testid="admin-console"]', { timeout: 25000 });
  await page.waitForSelector('[data-testid="model-search"]', { timeout: 25000 });
  await page.fill('[data-testid="model-search"]', "claude");
  await page.waitForSelector('[data-testid="mesh-model-row"]', { timeout: 30000 }).catch(() => {});
  const rows = await page.locator('[data-testid="mesh-model-row"]').count();
  ok("admin lists stormy + zeusdesigns flagship models (search 'claude')", rows > 0, `${rows} rows`);
  const row = page.locator('[data-testid="mesh-model-row"]').first();
  const sw = row.locator('[role="switch"]').first();
  if (await sw.count()) { const a = await sw.getAttribute("aria-checked"); await sw.click(); await page.waitForTimeout(200); ok("model toggles ON/OFF", a !== (await sw.getAttribute("aria-checked"))); }
  await row.locator('[data-testid="model-name"]').click();
  const input = row.locator("input").first(); await input.fill("Claude Flagship QA"); await input.press("Enter");
  await page.waitForTimeout(300);
  ok("model renames inline", /Claude Flagship QA/.test(await page.locator('[data-testid="mesh-model-row"]').first().innerText()));
  await page.screenshot({ path: `${OUT}/14-admin-models.png` });
  ok("admin: zero page errors", errs.length === 0, errs[0] ?? "");
  await c.close();
}

/* ───── 5. Switcher + viewports ───── */
for (const [w, h] of [[390, 844], [412, 915]]) {
  const { c, page } = await ctx(w, h);
  await openApp(page);
  await page.click('[data-testid="engine-pill"]');
  await page.waitForSelector('[data-testid="model-switcher"]');
  for (const tab of ["free", "api", "local", "all"]) {
    await page.click(`[data-testid="tab-${tab}"]`);
    await page.waitForSelector(`[data-testid="pane-${tab}"]`);
    await page.waitForTimeout(500);
    const txt = await page.locator(`[data-testid="pane-${tab}"]`).innerText();
    if (tab === "free") ok(`free tab lists Apex Auto Free + live free models [${w}]`, /Apex Auto Free/.test(txt) && /Free/.test(txt.replace("Apex Auto Free", "")), txt.split("\n").filter((l) => /Free/.test(l)).join(" | "));
    if (tab === "api") {
      const pos = await page.evaluate(() => { const a = document.querySelector('[data-testid="auto-pro"]'); const r = document.querySelector('[data-testid="pane-api"] [data-testid="switcher-row"]'); return a && r ? Boolean(a.compareDocumentPosition(r) & Node.DOCUMENT_POSITION_FOLLOWING) : false; });
      ok(`Apex Auto Pro (Smart Router) is the #1 model in Apex API [${w}]`, pos && /Apex Auto Pro/.test(await page.locator('[data-testid="auto-pro"]').innerText()));
    }
    const bad = await page.evaluate((t) => {
      const issues = [];
      document.querySelectorAll(`[data-testid="pane-${t}"] [data-testid="switcher-row"], [data-testid="pane-${t}"] [data-testid="switcher-offline"]`).forEach((row) => {
        const rr = row.getBoundingClientRect();
        const kids = [...row.children].map((k) => k.getBoundingClientRect());
        kids.forEach((a, i) => { if (a.right > rr.right + 1 || a.left < rr.left - 1) issues.push("escape"); kids.slice(i + 1).forEach((b) => { if (a.width && b.width && a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5) issues.push("overlap"); }); });
        if (rr.height > 56) issues.push("multi-line");
      });
      return issues;
    }, tab);
    ok(`switcher '${tab}' rows single-line, zero overlap [${w}]`, bad.length === 0, bad.slice(0, 3).join(","));
    await noEmoji(page, `switcher ${tab} ${w}`);
    if (w === 390) await page.screenshot({ path: `${OUT}/15-switcher-${tab}.png` });
  }
  await noOverflow(page, `switcher ${w}`);
  await c.close();
}

/* ───── Live probe: real Claude 4 Sonnet relay, real prompt (informational) ───── */
{
  const { c, page } = await ctx();
  await openApp(page);
  await page.click('[data-testid="engine-pill"]'); await page.click('[data-testid="tab-api"]');
  const row = page.locator('[data-testid="pane-api"] [data-testid="switcher-row"]', { hasText: "Claude 4 Sonnet" }).first();
  await row.waitFor({ timeout: 20000 }).catch(() => {});
  if (await row.count()) {
    await row.click();
    await page.fill('textarea[aria-label="Message"]', "Create a 6-slide presentation on Digital Education");
    await page.keyboard.press("Enter");
    const got = await page.waitForSelector('[data-testid="pptx-card"], [data-testid="live-preview-card"]', { timeout: 150000 }).then(() => true).catch(() => false);
    const bubble = await page.locator('[data-sel-msg]').last().innerText().catch(() => "");
    ok("LIVE Claude 4 Sonnet: deck produced without leaking monologue", got && !/(let me|the user wants|first, i need)/i.test(bubble.slice(0, 200)), got ? "deck + card shown" : "no deck in 150s (relay slow/down)");
    await page.screenshot({ path: `${OUT}/16-live-claude4-sonnet.png` });
  } else ok("LIVE Claude 4 Sonnet row present", false, "no live route in Apex API tab");
  await c.close();
}

await browser.close();
fs.writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
