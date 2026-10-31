import { useEffect, useId, useMemo, useRef, useState } from "react";

import { fmtDate, fmtValue, periodLabel, sliceRange, unitLabel } from "@/lib/bangladata/format";
import type { Frequency, Observation } from "@/lib/bangladata/types";
import { cn } from "@/lib/utils";

const RANGES = ["1Y", "5Y", "10Y", "Max"] as const;

interface ChartProps {
  seriesId: string;
  data: Observation[];
  frequency: Frequency;
  unit: string;
  apiBase: string;
  ground?: "paper" | "ink";
  height?: number;
  ranges?: boolean;
  dims?: Record<string, string>;
  showTable?: boolean;
  /** Teaser mode: fade older history, hide exact values, show an unlock CTA.
      The chart data is fetched with the site's own key, so this stays on for
      everyone (login ≠ plan entitlement) — real values/history come through the
      caller's own key via the API, which is plan-gated server-side. */
  gated?: boolean;
  /** Signed-in visitor: point the unlock CTA at the dashboard/API (they have a
      key) instead of nagging them to sign up. */
  authed?: boolean;
  /** The series' earliest date — powers the "unlock full history back to {year}" CTA. */
  historyFrom?: string;
  /** Range buttons the caller's plan may view; the rest are locked. Only applies
      when `gated`. Defaults to `["1Y"]` (free tier). Developer → +5Y/10Y; Pro/
      Business get an ungated chart (gated=false) instead. */
  unlockedRanges?: readonly string[];
  /** Override the API call shown under "</> API" and used for CSV (data that isn't a
      /v1/series id, e.g. /v1/agri/prices?commodity=onion&market=lahore). */
  requestPath?: string | undefined;
}

/**
 * Single stroke, 1.5px, no fill, no gridlines. Hover crosshair with a mono
 * readout. Corner affordances: CSV download and the exact API call.
 */
export function Chart({
  seriesId,
  data,
  frequency,
  unit,
  apiBase,
  ground = "paper",
  height = 360,
  ranges = true,
  dims,
  showTable = true,
  gated = false,
  authed = false,
  historyFrom,
  unlockedRanges = ["1Y"],
  requestPath: requestPathOverride,
}: ChartProps) {
  // Free/public chart shows one year only; longer ranges are locked (the data
  // isn't even in the payload). Paid/ungated charts default to the full range.
  const [range, setRange] = useState<(typeof RANGES)[number]>(gated ? "1Y" : "Max");
  const [lockedView, setLockedView] = useState(false);
  // When a plan unlocks the full chart after mount (gated flips false — e.g. a Pro
  // visitor loads client-side), default to the full range so they see everything.
  useEffect(() => {
    if (!gated) setRange("Max");
  }, [gated]);
  const [hover, setHover] = useState<number | null>(null);
  const [showCall, setShowCall] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const gradientId = useId();
  const fadeId = useId();

  const points = useMemo(() => (ranges ? sliceRange(data, range) : data), [data, range, ranges]);

  const W = 1000;
  const H = 320;
  const PAD = { l: 8, r: 8, t: 18, b: 26 };

  const geometry = useMemo(() => {
    if (points.length < 2) return null;
    const values = points.map((p) => p.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || Math.abs(max) || 1;
    const innerW = W - PAD.l - PAD.r;
    const innerH = H - PAD.t - PAD.b;

    const xy = points.map((p, i) => {
      const x = PAD.l + (i / (points.length - 1)) * innerW;
      const y = PAD.t + innerH - ((p.value - min) / span) * innerH;
      return { x, y, ...p };
    });

    const d = xy.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ");
    return { xy, d, min, max };
  }, [points]);

  const dimQuery = dims
    ? `&dims=${Object.entries(dims)
        .map(([k, v]) => `${k}:${v}`)
        .join(",")}`
    : "";
  const requestPath =
    requestPathOverride ?? `/v1/series/${seriesId}?from=${points[0]?.date ?? ""}&sort=asc${dimQuery}`;
  const csvHref = `${apiBase}${requestPath}&format=csv`;

  const active = hover !== null && geometry ? geometry.xy[hover] : null;
  const stroke = ground === "ink" ? "var(--gilt)" : "var(--seal)";

  function onMove(event: React.PointerEvent<SVGSVGElement>) {
    if (!geometry || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    const idx = Math.round(ratio * (geometry.xy.length - 1));
    setHover(Math.min(Math.max(idx, 0), geometry.xy.length - 1));
  }

  return (
    <figure className="w-full">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-rule pb-3">
        <div className="num flex items-center gap-4 text-[12px] text-ink-soft">
          {ranges
            ? RANGES.map((r) => {
                const locked = gated && !unlockedRanges.includes(r);
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() =>
                      locked ? setLockedView(true) : (setLockedView(false), setRange(r))
                    }
                    aria-pressed={!locked && range === r}
                    title={locked ? "Full history needs an API key" : undefined}
                    className={cn(
                      "px-1 uppercase tracking-[0.08em] transition-colors hover:text-ink",
                      !locked && range === r && "text-ink underline underline-offset-4",
                      locked && "text-ink-soft/50",
                    )}
                  >
                    {r}
                    {locked ? <span aria-hidden="true"> 🔒</span> : ""}
                  </button>
                );
              })
            : null}
        </div>
        <div className="num flex items-center gap-5 text-[12px]">
          {/* A plain link can't send the X-API-Key header, so pointing it at the API
              always 401'd. Send people where they can actually get the CSV: a free key,
              or the dashboard (API playground) if they already have one. The exact CSV
              request is in the "</> API" drawer. */}
          <a
            href={authed ? "/dashboard" : "/signup"}
            title={`CSV export needs an API key — ${csvHref}`}
            className="text-ink-soft transition-colors hover:text-seal"
          >
            ↓ CSV
          </a>
          <button
            type="button"
            onClick={() => setShowCall((v) => !v)}
            aria-expanded={showCall}
            className="text-ink-soft transition-colors hover:text-seal"
          >
            {"</> API"}
          </button>
        </div>
      </div>

      {showCall ? (
        <div className="num overflow-x-auto border-b border-rule bg-paper-sunk px-4 py-3 text-[13px]">
          <code>{`curl -H "X-API-Key: bd_live_xxx" "${apiBase}${requestPath}"`}</code>
        </div>
      ) : null}

      <div className="relative" style={{ height }}>
        {geometry ? (
          <svg
            ref={svgRef}
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            className="h-full w-full touch-none"
            role="img"
            aria-label={`${seriesId} from ${points[0]?.date} to ${points[points.length - 1]?.date}`}
            onPointerMove={onMove}
            onPointerLeave={() => setHover(null)}
          >
            <defs>
              <clipPath id={gradientId}>
                <rect x="0" y="0" width={W} height={H} />
              </clipPath>
              {/* Teaser: older history fades out, recent stays crisp. */}
              <linearGradient id={fadeId} x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stopColor={stroke} stopOpacity="0.1" />
                <stop offset="0.55" stopColor={stroke} stopOpacity="0.16" />
                <stop offset="0.8" stopColor={stroke} stopOpacity="0.55" />
                <stop offset="1" stopColor={stroke} stopOpacity="1" />
              </linearGradient>
            </defs>
            <line
              x1={PAD.l}
              x2={W - PAD.r}
              y1={H - PAD.b}
              y2={H - PAD.b}
              stroke="var(--rule)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
            <path
              d={geometry.d}
              fill="none"
              stroke={stroke}
              strokeWidth="1.5"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
            {active ? (
              <g>
                <line
                  x1={active.x}
                  x2={active.x}
                  y1={PAD.t}
                  y2={H - PAD.b}
                  stroke="var(--rule)"
                  strokeWidth="1"
                  vectorEffect="non-scaling-stroke"
                />
                <circle cx={active.x} cy={active.y} r="3" fill={stroke} />
              </g>
            ) : null}
          </svg>
        ) : (
          <p className="num p-4 text-[13px] text-ink-soft">No observations in this range.</p>
        )}

        {geometry ? (
          <div className="num pointer-events-none absolute inset-x-0 top-0 flex justify-between text-[12px] text-ink-soft">
            <span>{fmtValue(geometry.max, unit)}</span>
            <span>
              {active
                ? `${periodLabel(active.date, frequency)} · ${fmtValue(active.value, unit)}`
                : unitLabel(unit)}
            </span>
          </div>
        ) : null}

        {geometry ? (
          <div className="num pointer-events-none absolute inset-x-0 bottom-0 flex justify-between text-[12px] text-ink-soft">
            <span>{fmtDate(points[0]!.date)}</span>
            <span>{fmtValue(geometry.min, unit)}</span>
            <span>{fmtDate(points[points.length - 1]!.date)}</span>
          </div>
        ) : null}

        {gated && lockedView ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-paper/45 px-4 backdrop-blur-md">
            <a
              href={authed ? "/dashboard" : "/signup"}
              className="max-w-[320px] border border-rule bg-paper px-5 py-4 text-center shadow-sm transition-colors hover:border-seal"
            >
              <span className="block text-[15px] font-medium text-ink">
                🔒 Full history{historyFrom ? ` back to ${historyFrom.slice(0, 4)}` : ""} is locked
              </span>
              <span className="mt-1.5 block text-[13px] text-ink-soft">
                {authed ? "Use your API key" : "Get a free API key"} to chart and export every
                observation →
              </span>
            </a>
          </div>
        ) : null}
      </div>

      {showTable ? (
      <details className="mt-3 border-t border-rule pt-3">
        <summary className="eyebrow cursor-pointer">Observations as a table</summary>
        <div className="mt-3 max-h-64 overflow-auto">
          <table className="num w-full text-[13px]">
            <caption className="sr-only">{seriesId} observations</caption>
            <thead>
              <tr className="eyebrow border-b border-rule text-left">
                <th scope="col" className="py-1.5 pr-4 font-normal">
                  Date
                </th>
                <th scope="col" className="py-1.5 text-right font-normal">
                  Value
                </th>
              </tr>
            </thead>
            <tbody>
              {[...points]
                .slice(-40)
                .reverse()
                .map((p) => (
                  <tr key={p.date} className="border-b border-rule/60">
                    <td className="py-1.5 pr-4">{fmtDate(p.date)}</td>
                    <td className="py-1.5 text-right">{fmtValue(p.value, unit)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </details>
      ) : null}
    </figure>
  );
}
