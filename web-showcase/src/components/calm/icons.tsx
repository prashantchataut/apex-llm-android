import type { SVGProps } from "react";

const P = {
  menu: "M4 7h16M4 12h16M4 17h10",
  plus: "M12 5v14M5 12h14",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4",
  wand: "M5 19L15 9M14 4l1 2 2 1-2 1-1 2-1-2-2-1 2-1zM19 13l.6 1.4L21 15l-1.4.6L19 17l-.6-1.4L17 15l1.4-.6z",
  tree: "M6 6m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0M6 18m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0M18 9m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0M6 8v8M6 12c0-2.5 2-3 5-3h5",
  clip: "M20 11l-8.5 8.5a5 5 0 0 1-7-7L13 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L14 7",
  image: "M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M9 9h.01",
  mic: "M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM6 11a6 6 0 0 0 12 0M12 17v4",
  up: "M12 19V5M6 11l6-6 6 6",
  stop: "M7 7h10v10H7z",
  trash: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13",
  pin: "M9 4h6l-1 6 3 3H7l3-3zM12 13v7",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  pencil: "M4 20l1-4L16 5l3 3L8 19zM14 7l3 3",
  chevron: "M6 9l6 6 6-6",
  check: "M5 12l5 5 9-10",
  x: "M6 6l12 12M18 6L6 18",
  download: "M12 4v12M7 11l5 5 5-5M4 20h16",
  pause: "M8 5v14M16 5v14",
  play: "M7 4l13 8-13 8z",
  refresh: "M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7",
  copy: "M9 9h11v11H9zM5 15V4h11",
  cube: "M12 2l9 5v10l-9 5-9-5V7l9-5zM12 12l9-5M12 12v10M12 12L3 7",
  plug: "M9 3v5M15 3v5M7 8h10v3a5 5 0 0 1-10 0zM12 16v5",
  server: "M4 4h16v6H4zM4 14h16v6H4zM8 7h.01M8 17h.01",
  gear: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 13a7.6 7.6 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7.5 7.5 0 0 0-1.7-1L15 3.5h-4L10.7 6a7.5 7.5 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.6a7.6 7.6 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7.5 7.5 0 0 0 1.7 1l.3 2.5h4l.3-2.5a7.5 7.5 0 0 0 1.7-1l2.4 1 2-3.4z",
  sun: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
  moon: "M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z",
  speaker: "M4 9v6h4l5 4V5L8 9zM16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11",
  corner: "M6 4v8a3 3 0 0 0 3 3h9M14 11l4 4-4 4",
  back: "M15 6l-6 6 6 6",
  dice: "M5 5h14v14H5zM9 9h.01M15 9h.01M12 12h.01M9 15h.01M15 15h.01",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  globe: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9S14.5 18.4 12 21c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z",
  branch: "M7 4v10M7 18m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0M7 4m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0M17 8m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0M17 10c0 4-6 3-10 6",
  code: "M8 7l-5 5 5 5M16 7l5 5-5 5M14 5l-4 14",
  alert: "M12 4l9 16H3zM12 10v4M12 17h.01",
  info: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 11v5M12 8h.01",
  sparkle: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.7 1.8L21.5 18.5l-1.8.7L19 21l-.7-1.8-1.8-.7 1.8-.7z",
  lock: "M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3",
  bolt: "M13 3L5 13h6l-1 8 8-10h-6z",
  layers: "M12 3l9 5-9 5-9-5zM3 13l9 5 9-5",
  file: "M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6",
  sidebar: "M4 5h16v14H4zM9 5v14",
  arrow: "M5 12h14M13 6l6 6-6 6",
  sliders: "M4 8h10M18 8h2M4 16h2M10 16h10M14 8m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0M8 16m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z",
  phone: "M8 3h8a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM11 18h2",
  cloud: "M7 18a4 4 0 0 1-.5-8 5.5 5.5 0 0 1 10.6 1.3A3.4 3.4 0 0 1 17 18z",
  unlock: "M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 6.8-1.2",
} as const;

export type CIconName = keyof typeof P;

export function CIcon({ name, size = 20, ...rest }: { name: CIconName; size?: number } & Omit<SVGProps<SVGSVGElement>, "name">) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      <path d={P[name]} />
    </svg>
  );
}

/** Resolve a loosely-typed icon key (skills, tool notes) to a vector icon; unknown keys fall back to a sparkle. */
export function KeyIcon({ k, size = 16 }: { k: string; size?: number }) {
  const name = (k in P ? k : "sparkle") as CIconName;
  return <CIcon name={name} size={size} />;
}
