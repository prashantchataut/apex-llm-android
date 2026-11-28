import type { Metadata } from "next";
import { AdminPanel } from "@/components/calm/AdminPanel";

export const metadata: Metadata = { title: "Apex Admin", robots: { index: false, follow: false } };

export default function AdminPage() {
  return <AdminPanel />;
}
