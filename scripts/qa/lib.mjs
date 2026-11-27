import { chromium } from "playwright";
export const BASE = process.env.BASE || "http://localhost:4173/apex-llm-android";
export const VIEWPORTS = [{w:360,h:800},{w:390,h:844},{w:412,h:915},{w:1280,h:800}];
export async function newPage(browser, vp, init) {
  const ctx = await browser.newContext({ viewport:{width:vp.w,height:vp.h}, deviceScaleFactor: vp.w<600?2:1, isMobile: vp.w<600, hasTouch: vp.w<600, acceptDownloads:true });
  if (init) await ctx.addInitScript(init);
  const page = await ctx.newPage(); page.errors = [];
  page.on("pageerror", e => page.errors.push(e.message));
  return page;
}
/** Visible, hit-testable interactive elements; reports unintended pairwise overlaps + horizontal overflow. */
export async function audit(page) {
  return page.evaluate(() => {
    const sel = "button,a[href],input,textarea,select,[role=button],[role=switch],[role=tab],[role=radio],[role=menuitem],summary";
    const vw = window.innerWidth, vh = window.innerHeight;
    const els = [...document.querySelectorAll(sel)].filter(e => {
      const r = e.getBoundingClientRect(); const cs = getComputedStyle(e);
      if (r.width < 2 || r.height < 2 || cs.visibility === "hidden" || cs.display === "none" || +cs.opacity < 0.05) return false;
      if (e.closest("[hidden],[inert],[aria-hidden=true]") || e.type === "hidden") return false;
      if (r.bottom <= 0 || r.top >= vh || r.right <= 0 || r.left >= vw) return false;
      // keep only elements whose visible centre is actually on top (covered controls are legitimately behind a backdrop)
      const cx = Math.min(Math.max(r.left + r.width / 2, 0), vw - 1), cy = Math.min(Math.max(r.top + r.height / 2, 0), vh - 1);
      const t = document.elementFromPoint(cx, cy); return !!t && (e === t || e.contains(t) || t.contains(e));
    });
    const name = e => (e.getAttribute("aria-label") || e.innerText || e.placeholder || e.tagName).trim().replace(/\s+/g, " ").slice(0, 40);
    // an element scrolled out of its own scroll container is not really visible
    const clipped = e => { let p = e.parentElement; const r = e.getBoundingClientRect(); while (p && p !== document.body) { const o = getComputedStyle(p); if (/(auto|scroll|hidden)/.test(o.overflowY + o.overflowX)) { const q = p.getBoundingClientRect(); if (r.bottom <= q.top + 1 || r.top >= q.bottom - 1 || r.right <= q.left + 1 || r.left >= q.right - 1) return true; } p = p.parentElement; } return false; };
    const vis = els.filter(e => !clipped(e));
    const out = [];
    for (let i = 0; i < vis.length; i++) for (let j = i + 1; j < vis.length; j++) {
      const a = vis[i], b = vis[j]; if (a.contains(b) || b.contains(a)) continue;
      const A = a.getBoundingClientRect(), B = b.getBoundingClientRect();
      const w = Math.min(A.right, B.right) - Math.max(A.left, B.left), h = Math.min(A.bottom, B.bottom) - Math.max(A.top, B.top);
      if (w > 3 && h > 3) out.push(`${name(a)} <> ${name(b)} (${Math.round(w)}x${Math.round(h)})`);
    }
    const off = [];
    for (const e of vis) { const r = e.getBoundingClientRect(); if (r.left < -1 || r.right > vw + 1) off.push(`${name(e)} offscreen-x (${Math.round(r.left)}..${Math.round(r.right)})`); }
    const sw = document.documentElement.scrollWidth;
    return { overlaps: out, offscreen: off, hscroll: sw > vw ? `scrollWidth ${sw} > ${vw}` : "", count: vis.length };
  });
}
export const sleep = ms => new Promise(r => setTimeout(r, ms));
