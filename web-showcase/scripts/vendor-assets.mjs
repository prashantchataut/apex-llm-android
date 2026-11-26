// Copies the WebAssembly runtimes (llama.cpp via wllama, ONNX Runtime for Whisper) into public/ so the static export
// — GitHub Pages and the Android WebView alike — serves them from its own origin and works offline after first load.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const nm = join(root, "node_modules");
const jobs = [
  [join(nm, "@wllama/wllama/esm/wasm/wllama.wasm"), join(root, "public/wllama/wllama.wasm")],
  [join(nm, "onnxruntime-web/dist/ort-wasm-simd-threaded.mjs"), join(root, "public/vendor/transformers/ort-wasm-simd-threaded.mjs")],
  [join(nm, "onnxruntime-web/dist/ort-wasm-simd-threaded.wasm"), join(root, "public/vendor/transformers/ort-wasm-simd-threaded.wasm")],
  [join(nm, "onnxruntime-web/dist/ort.wasm.bundle.min.mjs"), join(root, "public/vendor/transformers/ort-bundle.js")],
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

// transformers.js >= 4 ships `transformers.web.min.js` with a BARE `import ... from "onnxruntime-web/webgpu"`. A browser (and the
// Android WebView) cannot resolve a bare specifier when the file is loaded by URL, so on-device Whisper never started in the
// production build ("speech model could not load"). Vendor ORT's self-contained WASM-ONLY bundle (device "wasm" is all we use; this drops the 28 MB JSEP/WebGPU binary for the 14 MB plain one) next to it and rewrite the specifier to a
// relative URL, which resolves identically on GitHub Pages (/apex-llm-android/...) and in the APK (/...).
const tf = join(nm, "@huggingface/transformers/dist/transformers.web.min.js");
const tfOut = join(root, "public/vendor/transformers/transformers.web.min.js");
if (existsSync(tf)) {
  const src = readFileSync(tf, "utf8");
  const bare = /(["'])onnxruntime-(?:web\/webgpu|common)\1/g; // both resolve to ORT's bundle (it re-exports Tensor), so there is a single Tensor class
  const hits = (src.match(bare) ?? []).length;
  if (hits === 0) console.warn("[vendor-assets] no bare onnxruntime-web import found in transformers.web.min.js (library layout changed?)");
  mkdirSync(dirname(tfOut), { recursive: true });
  writeFileSync(tfOut, src.replace(bare, '"./ort-bundle.js"'));
  console.log(`[vendor-assets] transformers.web.min.js: rewrote ${hits} bare ort import(s) to ./ort-bundle.js`);
} else console.warn(`[vendor-assets] missing ${tf} — run npm ci first`);
