import type { Metadata } from "next";
import { CalmApp } from "@/components/calm/CalmApp";

export const metadata: Metadata = { title: "Apex — app" };

/** The exact UI the Tauri Mobile shell loads. Full-bleed on every screen size. */
export default function AppPage() {
  return (
    <main className="h-dvh w-full">
      <CalmApp />
    </main>
  );
}
