#!/usr/bin/env node
// Fails (exit 1) when user-facing text contains emoji. Only emoji-presentation characters and emoji variation sequences are
// flagged, so legitimate mathematical/typographic symbols (∑ ∞ ≤ ≥ × → ·) are untouched.
import fs from "node:fs";
import path from "node:path";
const ROOTS = ["web-showcase/src", "web-showcase/public", "README.md", "docs/release-notes", "app-ui/src-tauri/gen/android/app/src/main/res/values"];
const SKIP = [/zeus-catalog\.json$/, /node_modules/, /\.(png|jpg|jpeg|webp|ico|woff2?|gguf|wasm|mjs\.map|map|pdf)$/i, /public\/vendor\//];
const EMOJI = /\p{Emoji_Presentation}|\p{Extended_Pictographic}\uFE0F|[\u{1F1E6}-\u{1F1FF}]|\u200D/u;
const hits = [];
(function walk(p) {
  if (!fs.existsSync(p) || SKIP.some((r) => r.test(p))) return;
  const st = fs.statSync(p);
  if (st.isDirectory()) return fs.readdirSync(p).forEach((f) => walk(path.join(p, f)));
  fs.readFileSync(p, "utf8").split("\n").forEach((line, i) => {
    const m = line.match(EMOJI);
    if (m) hits.push(`${p}:${i + 1}: U+${m[0].codePointAt(0).toString(16).toUpperCase()}`);
  });
})("");
ROOTS.forEach((r) => (function w(p) {
  if (!fs.existsSync(p) || SKIP.some((x) => x.test(p))) return;
  const st = fs.statSync(p);
  if (st.isDirectory()) return fs.readdirSync(p).forEach((f) => w(path.join(p, f)));
  fs.readFileSync(p, "utf8").split("\n").forEach((line, i) => {
    const m = line.match(EMOJI);
    if (m) hits.push(`${p}:${i + 1}: U+${m[0].codePointAt(0).toString(16).toUpperCase()}`);
  });
})(r));
console.log(hits.length ? hits.join("\n") : "emoji scan: clean");
process.exit(hits.length ? 1 : 0);
