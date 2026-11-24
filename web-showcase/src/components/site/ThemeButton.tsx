"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { ThemeSheet } from "@/components/theme/ThemePicker";

/** Opens the same Appearance sheet the app uses, so visitors can try every theme on the page. */
export function ThemeButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} aria-label="Change theme" className="relative z-[1] grid h-11 w-11 place-items-center rounded-full transition-[background-color,transform] hover:bg-white/15 active:scale-[0.97]">
        <Icon name="swatch" size={18} />
      </button>
      <ThemeSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}
