import { chromium } from "playwright";
import { BASE, sleep } from "./lib.mjs";
const b = await chromium.launch(); let fail = 0;
const ok = (c, m) => { console.log(`${c ? "PASS" : "FAIL"} ${m}`); if (!c) fail++; };
async function login(pass) {
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 } }); if (process.env.LOCALVAULT) { const fs = await import("node:fs"); const body = fs.readFileSync(process.env.LOCALVAULT, "utf8");
    await ctx.route(/api\.github\.com\/repos\/.*apex-vault\.json/, r => r.fulfill({ json: { content: Buffer.from(body).toString("base64"), sha: "local" } }));
    await ctx.route(/raw\.githubusercontent\.com\/.*apex-vault\.json/, r => r.fulfill({ body, contentType: "application/json" })); }
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", e => errs.push(e.message));
  await p.goto(`${BASE}/admin/`); await p.waitForSelector('[data-testid="admin-gate"]');
  const inputs = await p.locator("input").count(); const txt = await p.innerText("body");
  await p.getByLabel("Admin passphrase").fill(pass); await p.getByRole("button", { name: /Unlock/ }).click();
  const unlocked = await p.getByText(/Unlocked with the admin passphrase/).waitFor({ timeout: 15000 }).then(() => true, () => false);
  return { p, ctx, errs, unlocked, inputs, txt };
}
for (const pass of ["apex-admin-2025", "APEX-PRO-2025", "  Apex-Admin-2025 ", "apex-pro-2025"]) {
  const r = await login(pass); ok(r.unlocked, `unlock with "${pass}"`);
  if (pass === "apex-admin-2025") {
    ok(r.inputs === 1 && !/token|PAT/i.test(r.txt.replace(/repository token, if you connect one/i, "")), "gate has exactly one input (passphrase); no PAT field");
    const p = r.p; await p.waitForSelector('[data-testid="mesh-models"]');
    await sleep(9000);
    const total = await p.locator('[data-testid="mesh-models"]').innerText();
    console.log("  models header:", total.split("\n").slice(0, 3).join(" | "));
    ok(await p.locator('[data-testid="mesh-model-row"]').count() > 0, "model management table renders rows");
    for (const t of ["frontier", "all", "working", "enabled", "anthropic", "openai", "google", "deepseek-qwen", "llama-mistral", "uncensored", "untested"]) { await p.getByTestId(`tab-${t}`).click(); await sleep(300); console.log(`  tab ${t}:`, (await p.getByTestId(`tab-${t}`).innerText()).replace(/\s+/g, " ")); }
    await p.getByTestId("tab-frontier").click(); await sleep(400);
    const fr = await p.locator('[data-testid="mesh-model-row"]').allInnerTexts();
    ok(fr.length > 0 && fr.some(t => /claude.*opus|opus/i.test(t)), `Frontier tab lists Claude Opus routes (${fr.length} frontier rows)`);
    await p.getByTestId("tab-anthropic").click(); await sleep(300);
    const total600 = parseInt((await p.getByTestId("tab-all").innerText()).replace(/\D+/g, ""), 10);
    ok(total600 >= 600, `All Models tab shows 600+ models (${total600})`);
    await p.getByTestId("tab-all").click();
    await p.getByLabel("Search models").fill("llama"); await sleep(400); ok(await p.locator('[data-testid="mesh-model-row"]').count() > 0, "search filters models");
    const sw = p.locator('[data-testid="mesh-model-row"] [role=switch]').first(); const before = await sw.getAttribute("aria-checked"); await sw.click(); await sleep(300);
    ok((await p.locator('[data-testid="mesh-model-row"] [role=switch]').first().getAttribute("aria-checked")) !== before, "toggle model ON/OFF");
    await p.locator('[data-testid="model-name"]').first().click(); await p.getByLabel("Model name").fill("Renamed Model X"); await p.keyboard.press("Enter"); await sleep(300);
    ok(await p.getByText("Renamed Model X").count() > 0, "inline rename");
    ok(await p.locator('[data-testid="mesh-model-row"] select[aria-label=Category]').first().isVisible(), "category selector present");
    await p.locator('[data-testid="model-test"]').first().click(); await p.waitForFunction(() => { const s = document.querySelector('[data-testid="mesh-model-row"] [data-testid=model-status]'); return s && ["working", "offline"].includes(s.getAttribute("data-kind")); }, null, { timeout: 30000 }).catch(() => {});
    console.log("  Test Live ->", await p.locator('[data-testid="mesh-model-row"] [data-testid=model-status]').first().innerText());
    ok(await p.getByTestId("mesh-publish").count() > 0 && /Save & Publish|Publish/.test(await p.getByTestId("publish-bar").innerText()), "Save & Publish bar present");
    ok(await p.getByText("APEX-PRO-2025").count() > 0, "access key APEX-PRO-2025 visible/editable in key list");
    await p.screenshot({ path: process.env.SHOT || "/tmp/admin-ok.png" });
  }
  ok(r.errs.length === 0, `no page errors (${r.errs[0] || "none"})`); await r.ctx.close();
}
const w = await login("definitely-wrong-passphrase"); ok(!w.unlocked, "wrong passphrase rejected"); await w.ctx.close();
await b.close(); console.log(fail ? `${fail} FAILED` : "ADMIN ALL PASS"); process.exit(fail ? 1 : 0);
