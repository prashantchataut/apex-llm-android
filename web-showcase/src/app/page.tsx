import AppPage from "./app/page";
import { CalmLanding } from "@/components/calm/CalmLanding";

/** `NEXT_PUBLIC_APEX_TARGET=tauri` makes `/` the app itself (Tauri frontendDist root). */
export default function Home() {
  if (process.env.NEXT_PUBLIC_APEX_TARGET === "tauri") return <AppPage />;
  return <CalmLanding />;
}
