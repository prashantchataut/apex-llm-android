import type { Metadata } from "next";
import { AdminConsole } from "@/components/calm/AdminConsole";

export const metadata: Metadata = { title: "Apex Admin — API Vault", robots: { index: false, follow: false } };

export default function AdminPage() {
  return <AdminConsole />;
}
