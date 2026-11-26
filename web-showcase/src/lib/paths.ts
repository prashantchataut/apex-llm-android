/**
 * One place that knows where the app is served from.
 *  - GitHub Pages: `/apex-llm-android` (the deploy workflow sets NEXT_PUBLIC_BASE_PATH)
 *  - Android APK / local dev: "" (assets are served from the root of the WebView origin)
 * Every fetch(), WASM URL and dynamic import of a bundled static asset must go through `assetUrl()`.
 */
export const BASE_PATH: string = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/+$/, "");

/** `assetUrl("wllama/wllama.wasm")` -> `/apex-llm-android/wllama/wllama.wasm` on Pages, `/wllama/wllama.wasm` in the APK. */
export const assetUrl = (p: string): string => `${BASE_PATH}/${p.replace(/^\/+/, "")}`;

/** Same as `assetUrl` but absolute (needed for `import()` of vendored ES modules). */
export const absoluteAssetUrl = (p: string): string => (typeof location === "undefined" ? assetUrl(p) : `${location.origin}${assetUrl(p)}`);

/** Route helper with the trailing slash that the static export (`trailingSlash: true`) expects. */
export const routeUrl = (r: string): string => `${BASE_PATH}/${r.replace(/^\/+|\/+$/g, "")}/`.replace(/\/{2,}$/, "/");
