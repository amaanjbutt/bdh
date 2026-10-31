import type { Frequency, Observation } from "./types";

export function fmtNumber(value: number, digits?: number): string {
  const d =
    digits ??
    (Math.abs(value) >= 1000 ? 0 : Math.abs(value) >= 100 ? 1 : Math.abs(value) >= 10 ? 2 : 2);
  return value.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}

export function fmtCompact(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return Number.isInteger(value) ? fmtCount(value) : fmtNumber(value);
}

export function fmtCount(value: number): string {
  return value.toLocaleString("en-US");
}

// A money series' unit encodes its scale (usd_mn = millions, bdt_bn = billions,
// usd_th = thousands). Stored values are faithful to BB; fmtValue converts to a
// readable magnitude so 46,463,285 bdt_mn reads as "46.46 tn" instead of a wall
// of digits. Non-money / unscaled units (count, index, percent, rates, and bare
// usd/bdt on datasets whose scale we haven't verified) are shown as-is.
function _magnitude(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e12) return `${(v / 1e12).toFixed(2)} tn`;
  if (a >= 1e9) return `${(v / 1e9).toFixed(2)} bn`;
  if (a >= 1e6) return `${(v / 1e6).toFixed(2)} mn`;
  if (a >= 1e3) return `${(v / 1e3).toFixed(1)} k`;
  return fmtNumber(v, 2);
}

const COUNT_UNITS = new Set(["count", "number", "bales", "persons"]);

export function fmtValue(value: number | null | undefined, unit?: string): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const u = (unit || "").toLowerCase();
  const mult = u.endsWith("_bn") ? 1e9 : u.endsWith("_mn") ? 1e6 : u.endsWith("_th") ? 1e3 : u.endsWith("_crore") ? 1e7 : 0;
  if (!mult && Number.isInteger(value) && COUNT_UNITS.has(u)) return fmtCount(value); // 471, not 471.0
  return mult ? _magnitude(value * mult) : fmtNumber(value);
}

// Live catalog rows for not-yet-backfilled series carry null dates, so every
// date formatter must tolerate a missing value rather than throw.
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00Z` : iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function fmtMonth(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}

export function fmtQuarter(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return "—";
  return `Q${Math.floor(d.getUTCMonth() / 3) + 1} ${d.getUTCFullYear()}`;
}

/**
 * Relative timestamp, computed against a fixed "now" on the server pass and the
 * real clock on the client. Both round to the same bucket for anything older
 * than a minute, so it does not fight hydration.
 */
export function fmtRelative(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const diff = Math.max(0, now - then);
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 24) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

export function unitLabel(unit: string): string {
  const u = (unit || "").toLowerCase();
  // Scaled money units carry their magnitude in the value (via fmtValue), so the
  // label is just the currency — "46.46 tn BDT", not "… BDT mn".
  const map: Record<string, string> = {
    percent: "%",
    index: "index",
    diffusion: "index",
    count: "count",
    number: "count",
    units: "units",
    gwh: "GWh",
    mw: "MW",
    mwh: "MWh",
    pkr_per_kwh: "Rs/kWh",
    pkr_per_litre: "Rs/litre",
    pkr_per_dozen: "Rs/dozen",
    pkr_per_kg: "Rs/kg",
    pkr_per_100kg: "Rs/100 kg",
    rank: "rank",
    sq_km: "km²",
    per_sq_km: "per km²",
    persons: "persons",
    ratio: "ratio",
    "metric ton": "t",
    bales: "bales",
    million: "million",
  };
  if (u in map) return map[u]!;
  if (u.startsWith("pkr_per_")) return "BDT/" + u.slice("pkr_per_".length);
  if (u.startsWith("bdt_per_")) return "BDT/" + u.slice("bdt_per_".length);
  if (u === "usd" || u.startsWith("usd_")) return "USD";
  if (u === "pkr" || u.startsWith("pkr_")) return "BDT";
  if (u === "bdt" || u.startsWith("bdt_")) return "BDT";
  return unit || "";
}

export function frequencyLabel(f: Frequency): string {
  return f.charAt(0).toUpperCase() + f.slice(1);
}

export function periodLabel(iso: string | null | undefined, frequency: Frequency): string {
  if (!iso) return "—";
  if (frequency === "monthly") return fmtMonth(iso);
  if (frequency === "quarterly") return fmtQuarter(iso);
  if (frequency === "annual" || frequency === "census" || frequency === "survey") return iso.slice(0, 4);
  return fmtDate(iso);
}

export function rangeCutoff(range: string, last: string): string | null {
  if (range === "Max") return null;
  const years = Number(range.replace("Y", ""));
  const d = new Date(`${last.slice(0, 10)}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() - years);
  return d.toISOString().slice(0, 10);
}

export function sliceRange(data: Observation[], range: string): Observation[] {
  const last = data[data.length - 1];
  if (!last) return data;
  const cutoff = rangeCutoff(range, last.date);
  if (!cutoff) return data;
  const sliced = data.filter((d) => d.date >= cutoff);
  return sliced.length > 1 ? sliced : data;
}

/**
 * Evenly downsample to at most `maxN` points, always keeping the first and last.
 * Public series pages render a downsampled chart so the page's SSR HTML doesn't
 * hand over every full-resolution value — the shape is the SEO hook; the data is
 * the product.
 */
export function downsample<T>(data: T[], maxN: number): T[] {
  if (data.length <= maxN) return data;
  const step = (data.length - 1) / (maxN - 1);
  const out: T[] = [];
  for (let i = 0; i < maxN; i++) out.push(data[Math.round(i * step)]!);
  return out;
}

export function changeBetween(data: Observation[]): { abs: number; pct: number } | null {
  if (data.length < 2) return null;
  const last = data[data.length - 1]!;
  const prev = data[data.length - 2]!;
  const abs = last.value - prev.value;
  return { abs, pct: prev.value === 0 ? 0 : (abs / prev.value) * 100 };
}
