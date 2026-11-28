/**
 * The Apex logo: the exact geometric mark served as the live site favicon (`src/app/icon.svg`).
 * One component so Onboarding, Header, Home, Drawer, Settings and the website all render the same design.
 */
export function ApexMark({ size = 32, framed = true, className, title }: { size?: number; framed?: boolean; className?: string; title?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} role={title ? "img" : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
      {framed && <rect width="64" height="64" rx="16" fill="#050507" />}
      <g transform="translate(9.6 9.6) scale(.7)" fill="#fff" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round">
        <polygon points="8,18 32,4 32,32" />
        <polygon points="32,4 56,18 32,32" />
        <polygon points="56,18 56,46 32,32" />
        <polygon points="56,46 32,60 32,32" fill="none" />
        <polygon points="8,18 32,32 8,46" fill="none" />
        <polygon points="32,32 32,60 8,46" />
      </g>
    </svg>
  );
}
