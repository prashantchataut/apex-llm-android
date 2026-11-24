import type { NextConfig } from "next";

// GitHub Pages serves from /<repo>; the workflow sets NEXT_PUBLIC_BASE_PATH. Empty for local dev / Tauri.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  output: "export",
  basePath,
  assetPrefix: basePath || undefined,
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
