"use client";

import { useEffect } from "react";
import { routeUrl } from "@/lib/paths";

/** GitHub Pages is a static host: `/#/admin` and `/?admin=1` forward to the real `/admin/` route. */
export function AdminRedirect() {
  useEffect(() => {
    const wants = window.location.hash.startsWith("#/admin") || new URLSearchParams(window.location.search).get("admin") === "1";
    if (wants) window.location.replace(routeUrl("admin"));
  }, []);
  return null;
}
