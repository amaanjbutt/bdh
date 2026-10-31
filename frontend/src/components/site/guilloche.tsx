import { useMemo } from "react";

import type { Observation } from "@/lib/bangladata/types";

/**
 * The signature: the real BDT/USD series drawn as fine engraved contour lines,
 * banknote guilloché style — offset copies of one curve at 0.5px, low opacity.
 */
export function Guilloche({
  data,
  copies = 11,
  reversed = false,
}: {
  data: Observation[];
  copies?: number;
  reversed?: boolean;
}) {
  const paths = useMemo(() => {
    if (data.length < 2) return [];
    const W = 1000;
    const H = 420;
    // Log-scale the curve. The real BDT/USD series is exponential (near-flat for
    // decades, then a steep run-up), which as a raw line collapses into a flat
    // baseline with a spike crammed in the last few percent of width. On a log
    // axis it becomes a gently rising contour that fills the whole field — which
    // is what makes the guilloché read as engraved wallpaper.
    const values = data.map((d) => Math.log(Math.max(d.value, 1e-6)));
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;

    const norm = data.map((d, i) => ({
      x: (i / (data.length - 1)) * W,
      y: H - ((d.value - min) / span) * (H * 0.78) - H * 0.08,
    }));

    return Array.from({ length: copies }, (_, c) => {
      const offset = (c - (copies - 1) / 2) * 13;
      const scale = 1 + (c - (copies - 1) / 2) * 0.012;
      return norm
        .map((p, i) => {
          const y = H - (H - p.y) * scale + offset;
          return `${i === 0 ? "M" : "L"}${p.x.toFixed(2)} ${y.toFixed(2)}`;
        })
        .join(" ");
    });
  }, [data, copies]);

  if (paths.length === 0) return null;

  const mask = reversed
    ? "linear-gradient(to top, black 0%, transparent 70%)"
    : "linear-gradient(to bottom, black 0%, transparent 65%)";

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <svg
        viewBox="0 0 1000 420"
        preserveAspectRatio="none"
        className="h-full w-full"
        style={{ maskImage: mask, WebkitMaskImage: mask }}
      >
        {paths.map((d, i) => (
          <path
            key={i}
            d={d}
            fill="none"
            stroke="var(--seal)"
            strokeWidth="0.5"
            vectorEffect="non-scaling-stroke"
            opacity={0.22 + (i % 3) * 0.05}
          />
        ))}
      </svg>
    </div>
  );
}
