import type { Metadata } from "next";
import { AppShell } from "@/components/app/AppShell";
import { PhoneFrame } from "@/components/app/PhoneFrame";

export const metadata: Metadata = { title: "Apex — app" };

/** The exact UI the Tauri Mobile shell loads. Full-bleed on phones, bezel-framed on desktop. */
export default function AppPage() {
  return (
    <main className="grid min-h-dvh place-items-center bg-[#050507] md:py-8">
      <PhoneFrame responsive>
        <AppShell />
      </PhoneFrame>
    </main>
  );
}
