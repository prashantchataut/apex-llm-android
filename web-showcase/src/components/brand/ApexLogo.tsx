"use client";

import { motion } from "framer-motion";
import { useId, type CSSProperties } from "react";

/**
 * The Apex Tensor Prism — an isometric split cube.
 * Six triangular facets (two per visible face) meet at the central vertex (32,32).
 * Each facet is inset so the cube reads as machined blocks with hairline gaps.
 *
 *  idle        crisp facets, a slow specular sweep drifts across the faces
 *  scanning    facets separate along their own axis and pulse with a staggered phase
 *  thinking    alias of `scanning`
 *  monochrome  one-colour stencil (currentColor) for Swiss mode, favicons, launcher glyphs
 */
export type ApexLogoState = "idle" | "scanning" | "thinking" | "monochrome";

type P = [number, number];
interface Facet {
  id: string;
  pts: [P, P, P];
  /** gradient stops (light → dark) */
  g: [string, string];
  /** monochrome treatment */
  solid: boolean;
}

export const APEX_FACETS: Facet[] = [
  { id: "t1", pts: [[8, 18], [32, 4], [32, 32]], g: ["#ffffff", "#c9cdf5"], solid: true },
  { id: "t2", pts: [[32, 4], [56, 18], [32, 32]], g: ["#efeaff", "#a99bff"], solid: true },
  { id: "r1", pts: [[56, 18], [56, 46], [32, 32]], g: ["#9b7dff", "#5b34d6"], solid: true },
  { id: "r2", pts: [[56, 46], [32, 60], [32, 32]], g: ["#5b34d6", "#2b1688"], solid: false },
  { id: "l1", pts: [[8, 18], [32, 32], [8, 46]], g: ["#323a86", "#1a1e4c"], solid: false },
  { id: "l2", pts: [[32, 32], [32, 60], [8, 46]], g: ["#171a45", "#0a0b20"], solid: true },
];

const centroid = (f: Facet): P => [(f.pts[0][0] + f.pts[1][0] + f.pts[2][0]) / 3, (f.pts[0][1] + f.pts[1][1] + f.pts[2][1]) / 3];
const poly = (f: Facet) => f.pts.map((p) => p.join(",")).join(" ");
const HEX = "32,4 56,18 56,46 32,60 8,46 8,18";

export function ApexLogo({
  size = 40,
  state = "idle",
  assemble = false,
  delay = 0,
  className = "",
  title = "Apex",
}: {
  size?: number;
  state?: ApexLogoState;
  /** Facets fly in from outside and lock together with a spring (onboarding scene 1). */
  assemble?: boolean;
  delay?: number;
  className?: string;
  title?: string;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const mono = state === "monochrome";
  const busy = state === "scanning" || state === "thinking";

  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={title} className={`apex-logo ${className}`} data-state={state === "thinking" ? "scanning" : state} style={{ overflow: "visible" }}>
      {!mono && (
        <defs>
          {APEX_FACETS.map((f) => (
            <linearGradient key={f.id} id={`${uid}${f.id}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor={f.g[0]} />
              <stop offset="1" stopColor={f.g[1]} />
            </linearGradient>
          ))}
          <linearGradient id={`${uid}spec`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#fff" stopOpacity="0" />
            <stop offset="0.5" stopColor="#fff" stopOpacity="0.55" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <clipPath id={`${uid}clip`}>
            <polygon points={HEX} />
          </clipPath>
        </defs>
      )}

      {APEX_FACETS.map((f, i) => {
        const [cx, cy] = centroid(f);
        const vx = cx - 32;
        const vy = cy - 32;
        const len = Math.hypot(vx, vy) || 1;
        const sep = 3.4;
        const style = {
          "--dx": `${(vx / len) * sep}px`,
          "--dy": `${(vy / len) * sep}px`,
          "--d": `${i * 90}ms`,
        } as CSSProperties;
        const ax = (vx / len) * 26;
        const ay = (vy / len) * 26;
        return (
          <motion.g
            key={f.id}
            initial={assemble ? { x: ax, y: ay, opacity: 0, rotate: i % 2 ? 14 : -14 } : false}
            animate={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 26, delay: delay + i * 0.08 }}
            style={{ transformBox: "fill-box", transformOrigin: "center" }}
          >
            <g className="apex-facet" style={style} data-busy={busy || undefined}>
              <polygon
                points={poly(f)}
                className="apex-facet-shape"
                fill={mono ? (f.solid ? "currentColor" : "none") : `url(#${uid}${f.id})`}
                stroke={mono ? "currentColor" : "rgba(255,255,255,.28)"}
                strokeWidth={mono ? 1.6 : 0.6}
                strokeLinejoin="round"
              />
            </g>
          </motion.g>
        );
      })}

      {!mono && (
        <g clipPath={`url(#${uid}clip)`} pointerEvents="none">
          <rect className="apex-spec" x="-30" y="-6" width="26" height="76" fill={`url(#${uid}spec)`} transform="skewX(-18)" />
        </g>
      )}
    </svg>
  );
}

/** App-icon tile: obsidian squircle with a hairline border and the prism inside. */
export function ApexTile({ size = 32, state = "idle", className = "" }: { size?: number; state?: ApexLogoState; className?: string }) {
  return (
    <span
      className={`inline-grid shrink-0 place-items-center ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.28,
        background: "linear-gradient(160deg,#14152b 0%,#050507 70%)",
        boxShadow: "inset 0 0 0 1px rgba(255,255,255,.14), inset 0 1px 0 rgba(255,255,255,.22), 0 6px 18px rgba(0,0,0,.35)",
      }}
    >
      <ApexLogo size={size * 0.64} state={state} />
    </span>
  );
}
