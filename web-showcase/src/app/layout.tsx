import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { NO_FLASH_SCRIPT } from "@/lib/themes";
import { routeScript } from "@/lib/route-script";
import { BASE_PATH } from "@/lib/paths";

export const metadata: Metadata = {
  title: "Apex — On-Device Local AI Runner and Private Pocket Intelligence Studio",
  description:
    "Run open-weight GGUF models fully offline on your phone, read PDFs, render LaTeX and generate images in one private pocket studio. Rust core, your data stays on the device.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#09090B" },
    { media: "(prefers-color-scheme: light)", color: "#f8f7f4" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme="obsidian" data-mode="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: routeScript(BASE_PATH) }} />
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var m=localStorage.getItem("apex.calm.mode")||"light";if(m==="system")m=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.dataset.cmode=m;var t=document.querySelector('meta[name="theme-color"]');if(t)t.setAttribute("content",m==="dark"?"#0a0b0f":"#f8f9fa")}catch(e){}})()` }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;450;500&family=JetBrains+Mono:wght@400&display=swap"
        />
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
