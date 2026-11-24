import type { SVGProps } from "react";

const PATHS = {
  home: "M3 11l9-8 9 8M5 10v10h14V10",
  chat: "M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z",
  cube: "M12 2l9 5v10l-9 5-9-5V7l9-5zM12 12l9-5M12 12v10M12 12L3 7",
  server: "M4 4h16v6H4zM4 14h16v6H4zM8 7h.01M8 17h.01",
  mic: "M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM6 11a6 6 0 0 0 12 0M12 17v4",
  camera: "M4 8h3l2-3h6l2 3h3v11H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  upload: "M12 16V4M7 9l5-5 5 5M4 20h16",
  send: "M12 19V5M6 11l6-6 6 6",
  check: "M5 12l5 5 9-10",
  copy: "M9 9h11v11H9zM5 15V4h11",
  key: "M14 10a4 4 0 1 1-3.5-4M10.5 10.5L3 18v3h3v-2h2v-2h2l2-2",
  github:
    "M9 19c-4 1-4-2-6-2m12 4v-3.5a3 3 0 0 0-.8-2.3c2.7-.3 5.5-1.3 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.3 4.3 0 0 0-.1-3.2s-1-.3-3.4 1.3a11.7 11.7 0 0 0-6.2 0C6.3 2.7 5.3 3 5.3 3a4.3 4.3 0 0 0-.1 3.2A4.6 4.6 0 0 0 3.9 9.4c0 4.6 2.8 5.7 5.5 6a3 3 0 0 0-.8 2.3V21",
  download: "M12 4v12M7 11l5 5 5-5M4 20h16",
  pause: "M8 5v14M16 5v14",
  cpu: "M7 7h10v10H7zM9 3v4M15 3v4M9 17v4M15 17v4M3 9h4M3 15h4M17 9h4M17 15h4",
  prism: "M12 4L3 19h18L12 4zM12 4v15M7.6 12.2L12 15l4.4-2.8",
  chevron: "M6 9l6 6 6-6",
  x: "M6 6l12 12M18 6L6 18",
  arrow: "M7 17L17 7M8 7h9v9",
  play: "M7 4l13 8-13 8z",
  wifi: "M2 9a15 15 0 0 1 20 0M5.5 12.5a10 10 0 0 1 13 0M9 16a5 5 0 0 1 6 0M12 20h.01",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z",
  code: "M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16",
  book: "M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 19V5",
  sun: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
  moon: "M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z",
  monitor: "M3 5h18v11H3zM8 20h8M12 16v4",
  image: "M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M9 9h.01",
  film: "M4 4h16v16H4zM8 4v16M16 4v16M4 9h4M4 15h4M16 9h4M16 15h4",
  sliders: "M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M6 14v6",
  swatch: "M12 3a9 9 0 1 0 0 18c1.5 0 2-1 2-2 0-1.3-1-1.5-1-2.7 0-1 .8-1.8 1.8-1.8H17a4 4 0 0 0 4-4C21 6.4 17 3 12 3zM7.5 11h.01M10 7.5h.01M14.5 7.5h.01",
  plus: "M12 5v14M5 12h14",
  back: "M15 6l-6 6 6 6",
  pencil: "M4 20l1-4L16 5l3 3L8 19zM14 7l3 3",
  thermo: "M10 14V5a2 2 0 1 1 4 0v9a4 4 0 1 1-4 0zM12 9v7",
  qr: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2v2M14 18h2v2M18 18h2v2",
  vibrate: "M9 4h6v16H9zM5 8v8M2 10v4M19 8v8M22 10v4",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20, ...rest }: { name: IconName; size?: number } & Omit<SVGProps<SVGSVGElement>, "name">) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
