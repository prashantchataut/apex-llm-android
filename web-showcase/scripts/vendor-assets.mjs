// Copies the WebAssembly runtimes (llama.cpp via wllama, ONNX Runtime for Whisper) into public/ so the static export
// — GitHub Pages and the Android WebView alike — serves them from its own origin and works offline after first load.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const nm = join(root, "node_modules");
const jobs = [
  [join(nm, "@wllama/wllama/esm/wasm/wllama.wasm"), join(root, "public/wllama/wllama.wasm")],
  [join(nm, "@huggingface/transformers/dist/transformers.web.min.js"), join(root, "public/vendor/transformers/transformers.web.min.js")],
  [join(nm, "@huggingface/transformers/dist/ort-wasm-simd-threaded.jsep.mjs"), join(root, "public/vendor/transformers/ort-wasm-simd-threaded.jsep.mjs")],
  [join(nm, "onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.wasm"), join(root, "public/vendor/transformers/ort-wasm-simd-threaded.jsep.wasm")],
];
for (const [from, to] of jobs) {
  if (!existsSync(from)) {
    console.warn(`[vendor-assets] missing ${from} — run npm ci first`);
    continue;
  }
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
}
console.log("[vendor-assets] copied", jobs.length, "runtime assets");
