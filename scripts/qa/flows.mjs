import { chromium } from "playwright";
import fs from "node:fs";
import { BASE, VIEWPORTS, newPage, audit, sleep } from "./lib.mjs";
const SHOTS = process.env.SHOTS || ""; // dir for screenshots (only for 390x844 unless ALLSHOTS)
const only = process.env.VP ? process.env.VP.split(",").map(Number) : null;
const CONVO = { id: "c-demo", title: "Gradient descent and LaTeX", pinned: false, updated: Date.now(), snap: { sel: {}, next: 3, nodes: [
  { id: 1, parentId: null, role: "user", text: "Explain gradient descent briefly, with the update rule and the closed form for least squares." },
  { id: 2, parentId: 1, role: "assistant", text: "Gradient descent moves parameters against the gradient. The update rule is $\\theta_{t+1} = \\theta_t - \\eta \\nabla_\\theta L(\\theta_t)$ where $\\eta$ is the learning rate.\n\nFor least squares the minimiser has a closed form:\n\n$$\\hat{\\beta} = (X^\\top X)^{-1} X^\\top y$$\n\nA tiny sketch in code:\n\n```python\nfor step in range(100):\n    theta -= lr * grad(theta)\n```\n\n- Small $\\eta$ converges slowly.\n- Large $\\eta$ can diverge, a very-long-unbroken-token-that-must-wrap-correctly-on-narrow-phones-0123456789abcdefghij.", streaming: false, engine: { backend: "cloud", label: "Apex Cloud" } },
] } };
const AND = process.env.ANDROID ? `document.addEventListener("DOMContentLoaded",()=>{document.documentElement.style.setProperty("--safe-top","38px");document.documentElement.style.setProperty("--safe-bottom","16px")});` : "";
const seed = AND + `localStorage.setItem("apex.onboarded","1"); localStorage.setItem("apex.convos.v1", ${JSON.stringify(JSON.stringify([CONVO]))});`;
const results = []; let failed = 0;
async function shot(page, vp, name) { if (SHOTS && (vp.w === 390 || process.env.ALLSHOTS)) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: `${SHOTS}/${vp.w}-${name}.png` }); } }
async function record(page, vp, name) {
  await sleep(500); const r = await audit(page); await shot(page, vp, name);
  const bad = r.overlaps.length + r.offscreen.length + (r.hscroll ? 1 : 0);
  if (bad) failed++;
  results.push({ vp: `${vp.w}x${vp.h}`, screen: name, interactive: r.count, ...r });
  console.log(`${bad ? "FAIL" : "PASS"} ${vp.w}x${vp.h} ${name} (${r.count} controls)`, bad ? JSON.stringify({ o: r.overlaps.slice(0, 6), x: r.offscreen.slice(0, 4), h: r.hscroll }) : "");
}
const burger = p => p.getByRole("button", { name: /Open sidebar/ }).first();
async function openDrawer(p, vp) { if (vp.w < 1024) { await burger(p).click(); await sleep(700); } }
async function nav(p, vp, label) { await openDrawer(p, vp); await p.getByRole("navigation", { name: "Workspace" }).getByRole("button", { name: new RegExp(label) }).click(); await sleep(900); }
const browser = await chromium.launch();
for (const vp of VIEWPORTS) {
  if (only && !only.includes(vp.w)) continue;
  const step = async (name, init, fn) => {
    const p = await newPage(browser, vp, init);
    try { await fn(p); } catch (e) { failed++; console.log(`FAIL ${vp.w}x${vp.h} ${name} threw: ${e.message.split("\n")[0]}`); results.push({ vp: `${vp.w}x${vp.h}`, screen: name, error: e.message.split("\n")[0] }); }
    if (p.errors.length) console.log(`  page errors (${name}):`, p.errors.slice(0, 2).join(" | "));
    await p.context().close();
  };
  await step("Onboarding", AND, async p => {
    await p.goto(`${BASE}/app/`); await sleep(2500); await record(p, vp, "onboarding-1");
    for (let i = 2; i <= 3; i++) { const b = p.getByRole("button", { name: /^(Continue|Next|Get started|Skip)/i }).first(); if (await b.count()) { await b.click(); await sleep(900); await record(p, vp, `onboarding-${i}`); } }
  });
  await step("Chat Empty State", seed, async p => { await p.goto(`${BASE}/app/`); await sleep(2500); await record(p, vp, "chat-empty"); });
  await step("Chat Conversation", seed, async p => {
    await p.goto(`${BASE}/app/`); await sleep(2000); await openDrawer(p, vp);
    await record(p, vp, "drawer");
    await p.getByText("Gradient descent and LaTeX").first().click(); await sleep(1500);
    await record(p, vp, "chat-latex");
    // model selector popover
    await p.getByRole("button", { name: /Switch model/ }).click(); await sleep(700); await record(p, vp, "model-popover");
    await p.keyboard.press("Escape");
  });
  await step("Local Model Hub", seed, async p => { await p.goto(`${BASE}/app/`); await sleep(2000); await nav(p, vp, "Models"); await record(p, vp, "model-hub"); });
  await step("Image Generation Studio", seed, async p => { await p.goto(`${BASE}/app/`); await sleep(2000); await nav(p, vp, "Image Studio"); await record(p, vp, "image-studio"); });
  await step("PDF Viewer", seed, async p => {
    await p.goto(`${BASE}/app/`); await sleep(2000);
    await p.setInputFiles('[data-testid="pdf-input"]', "sample.pdf"); await sleep(3500); await record(p, vp, "pdf-viewer");
  });
  await step("Settings", seed, async p => { await p.goto(`${BASE}/app/`); await sleep(2000); await nav(p, vp, "Settings"); await record(p, vp, "settings"); await p.mouse.wheel(0, 900); await sleep(400); await record(p, vp, "settings-lower"); });
  await step("GitHub Connect", seed, async p => {
    await p.goto(`${BASE}/app/`); await sleep(2000); await nav(p, vp, "Skills");
    const b = p.getByText(/Connect (GitHub|@)|GitHub/i).first(); await b.scrollIntoViewIfNeeded({timeout:5000}).catch(()=>{}); await record(p, vp, "github-connect");
  });
  await step("Admin", AND, async p => {
    await p.goto(`${BASE}/admin/`); await sleep(1500); await record(p, vp, "admin-gate");
    await p.getByLabel("Admin passphrase").fill("apex-admin-2025"); await p.getByRole("button", { name: /Unlock/ }).click();
    await p.getByText(/Unlocked with the admin passphrase/).waitFor({ timeout: 20000 }); await sleep(6000); await record(p, vp, "admin-dashboard");
  });
}
await browser.close();
fs.writeFileSync("audit-results.json", JSON.stringify(results, null, 1));
console.log(failed ? `\n${failed} FAILING screens` : "\nALL PASS"); process.exit(failed ? 1 : 0);
