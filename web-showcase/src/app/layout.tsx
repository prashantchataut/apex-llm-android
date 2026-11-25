import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { NO_FLASH_SCRIPT } from "@/lib/themes";

export const metadata: Metadata = {
  title: "Apex — local AI for Android",
  description:
    "Run language, image and video models on your phone. Serve an Ollama-compatible API to your PC. Rust core, no cloud required.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#14161c" },
    { media: "(prefers-color-scheme: light)", color: "#f8f9fa" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme="obsidian" data-mode="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var m=localStorage.getItem("apex.calm.mode")||"light";if(m==="system")m=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.dataset.cmode=m;var t=document.querySelector('meta[name="theme-color"]');if(t)t.setAttribute("content",m==="dark"?"#0a0b0f":"#f8f9fa")}catch(e){}})()` }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Caveat:wght@600&family=Inter+Tight:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
        />
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
