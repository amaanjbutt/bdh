/**
 * Site search results (GET /v1/search?kinds=all): series plus trade products and partners,
 * districts, power plants, mandi crops and markets, funds, AMCs and debt securities. Every hit
 * carries the page it opens (`url`). Shared by ⌘K, /coverage and the dashboard.
 */
import { MODULE_BY_SLUG } from "./catalog";

export type SearchKind =
  | "series"
  | "trade_product"
  | "trade_country"
  | "district"
  | "plant"
  | "mandi_crop"
  | "mandi_market"
  | "fund"
  | "amc"
  | "security";

export interface SearchHit {
  kind: SearchKind;
  title: string;
  subtitle: string | null;
  url: string;
  /** series only */
  id?: string;
  /** series only — the frontend module slug */
  module?: string;
  unit?: string;
  frequency?: string;
}

export const KIND_LABELS: Record<Exclude<SearchKind, "series">, string> = {
  trade_product: "Traded products",
  trade_country: "Trade partners",
  district: "Districts",
  plant: "Power plants",
  mandi_crop: "Mandi rates",
  mandi_market: "Mandi markets",
  fund: "Mutual funds",
  amc: "Asset managers",
  security: "Debt securities",
};

/** The group a hit is listed under: its module for series, its kind otherwise. */
export function searchGroup(hit: SearchHit): { key: string; label: string } {
  if (hit.kind === "series") {
    const key = hit.module ?? "series";
    return { key, label: MODULE_BY_SLUG[key]?.name ?? "Series" };
  }
  return { key: hit.kind, label: KIND_LABELS[hit.kind] };
}

/** Group hits in first-appearance order (the API already ranks them). */
export function groupHits(hits: SearchHit[]): { key: string; label: string; hits: SearchHit[] }[] {
  const out = new Map<string, { key: string; label: string; hits: SearchHit[] }>();
  for (const h of hits) {
    const g = searchGroup(h);
    const have = out.get(g.key) ?? { ...g, hits: [] };
    have.hits.push(h);
    out.set(g.key, have);
  }
  return [...out.values()];
}
