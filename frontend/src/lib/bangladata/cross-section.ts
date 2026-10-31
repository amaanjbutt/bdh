/**
 * Cross-sectional series — one value per place (or plant) at a date, rather than one
 * value per date: the Census / Economic Census / Agricultural Census by district, the
 * LFS by province, NEPRA generation by plant. Plotting them as a time series interleaves
 * every place into one line, so the series page shows a ranked table of the latest date
 * instead. Pure helpers, shared by the server function and the page.
 */
import type { CatalogRecord } from "./types";

/** Headline values for the filter dimensions a series declares in the catalog. */
const PREFERRED = ["total", "all", "All sectors", "19th ICLS", "national", "offer"];

/** Energy series that are one value per plant (or per generation source) at a date. Prices,
 * demand and DISCO consumption are ordinary time series. */
const PLANT_LEVEL = [
  "energy.generation.plant",
  "energy.generation.by_source",
  "energy.utilization.plant",
  "energy.capacity.",
  "energy.power.merit_order.",
];

export function isCrossSectional(record: Pick<CatalogRecord, "id" | "module">): boolean {
  if (record.module === "regional") return true;
  return record.module === "energy" && PLANT_LEVEL.some((p) => record.id.startsWith(p));
}

export function headlineDims(dimensions?: Record<string, string[]>): Record<string, string> | undefined {
  if (!dimensions) return undefined;
  const out: Record<string, string> = {};
  for (const [k, vals] of Object.entries(dimensions)) {
    if (!vals?.length) continue;
    out[k] = PREFERRED.find((p) => vals.includes(p)) ?? vals[0]!;
  }
  return Object.keys(out).length ? out : undefined;
}

export interface CrossRow {
  label: string;
  level: "national" | "province" | "district" | "item";
  value: number;
}

export interface CrossSection {
  date: string;
  rows: CrossRow[];
  /** rows left out of the table (sub-districts, and the long tail beyond `max`) */
  omitted: number;
  /** what the rows are: "Area" for places, "Plant" for power plants, "Item" otherwise */
  rowLabel: string;
  filters: Record<string, string>;
}

const cap = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s);

/**
 * Latest-date rows → a ranked table: Bangladesh / province rows first (by value), then the
 * largest districts or items. Sub-district rows (tehsils) are left to the API. Pure.
 */
export function buildCrossSection(
  rows: { date: string; value: number | string | null; dims?: Record<string, string> }[],
  filters: Record<string, string>,
  max = 25,
  ascending = false,
): CrossSection | null {
  if (rows.length < 2) return null;
  const date = rows.reduce((d, r) => (r.date > d ? r.date : d), rows[0]!.date);
  const out: CrossRow[] = [];
  let omitted = 0;
  for (const r of rows) {
    if (r.date !== date || r.value === null || r.value === "") continue;
    const dims: Record<string, string> = { ...(r.dims ?? {}) };
    if (dims["subdistrict"]) {
      omitted++;
      continue;
    }
    for (const k of Object.keys(filters)) delete dims[k];
    const value = Number(r.value);
    const { province, district, plant, ...rest } = dims;
    const keys = Object.keys(rest);
    if (plant) {
      const extra = Object.values(rest).join(", ");
      out.push({ label: extra ? `${plant} (${extra})` : plant, level: "item", value });
    } else if (district) {
      out.push({ label: `${district}${province ? ` (${province})` : ""}`, level: "district", value });
    } else if (province && !keys.length) {
      out.push({ label: province, level: "province", value });
    } else if (!province && !keys.length) {
      out.push({ label: "Bangladesh", level: "national", value });
    } else {
      out.push({ label: cap(Object.values(rest).join(" · ")) + (province ? ` (${province})` : ""), level: "item", value });
    }
  }
  if (out.length < 2) return null;
  const order = { national: 0, province: 1, district: 2, item: 2 };
  const top = out.filter((r) => r.level === "national" || r.level === "province");
  const rest = out
    .filter((r) => r.level === "district" || r.level === "item")
    .sort((a, b) => (ascending ? a.value - b.value : b.value - a.value));
  top.sort((a, b) => order[a.level] - order[b.level] || b.value - a.value);
  const shown = [...top, ...rest.slice(0, max)];
  const plants = rows.some((r) => r.dims?.["plant"]);
  const places = out.some((r) => r.level !== "item");
  return {
    date,
    rows: shown,
    omitted: omitted + Math.max(0, rest.length - max),
    filters,
    rowLabel: plants ? "Plant" : places ? "Area" : "Item",
  };
}

/** Merit-order series read cheapest-first (the order the grid dispatches plants in). */
export const ascendingCross = (id: string) => id.startsWith("energy.power.merit_order.");
