// Runs after `next build` (npm "postbuild" hook). GitHub Pages is a static host with no rewrites, so:
//  1. out/404.html becomes a SPA fallback: any unknown URL under the base path is redirected to the right route
//     (/admin/**, /app/**, everything else -> landing) instead of showing a dead 404.
//  2. out/.nojekyll stops Pages from dropping the `_next/` folder.
// The Android build (NEXT_PUBLIC_APEX_TARGET=tauri) serves from the WebView root and does not need either; the files are harmless.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const out = join(dirname(fileURLToPath(import.meta.url)), "..", "out");
if (!existsSync(out)) {
  console.warn("[postbuild] no out/ directory, skipping");
  process.exit(0);
}
const base = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/+$/, "");
const home = existsSync(join(out, "index.html")) ? readFileSync(join(out, "index.html"), "utf8") : "";
const redirect = `<script>(function(){var b=${JSON.stringify(base)};var p=location.pathname.slice(b.length)||"/";var t="/";
if(/^\\/admin(\\/|$)/.test(p))t="/admin/";else if(/^\\/app(\\/|$)/.test(p))t="/app/";
var q=new URLSearchParams(location.search);if(q.get("admin")==="1")t="/admin/";
location.replace(b+t+location.hash)})()</script>`;
const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Apex</title><meta name="robots" content="noindex">${redirect}<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0a0b0f;color:#e9eaee;font:15px system-ui,sans-serif}a{color:#9db4ff}</style></head><body><p>Redirecting to <a href="${base}/">Apex</a>…</p></body></html>`;
writeFileSync(join(out, "404.html"), page);
writeFileSync(join(out, ".nojekyll"), "");
console.log(`[postbuild] wrote out/404.html (SPA fallback, base="${base}") and out/.nojekyll; index.html ${home.length} bytes`);

// 3. Physical routes. GitHub Pages answers a 404 for any path without a real file, so /admin/ and /app/ must exist on disk.
//    Next's `trailingSlash` export already emits them; if a refactor ever drops one we copy the home document there so the
//    URL still returns HTTP 200 (every asset URL is absolute, so the copy boots the same bundle). Then we assert.
for (const route of ["admin", "app"]) {
  const f = join(out, route, "index.html");
  if (!existsSync(f) && home) {
    mkdirSync(join(out, route), { recursive: true });
    writeFileSync(f, home);
    console.warn(`[postbuild] out/${route}/index.html was missing, copied from index.html`);
  }
  if (!existsSync(f)) {
    console.error(`[postbuild] FATAL: out/${route}/index.html does not exist`);
    process.exit(1);
  }
}
console.log("[postbuild] verified out/admin/index.html and out/app/index.html");
