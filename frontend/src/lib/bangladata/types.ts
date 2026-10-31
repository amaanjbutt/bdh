/**
 * Shapes of the BanglaDataHub API responses. These mirror the documented contract
 * exactly, so switching from local fixtures to the live API is a config change.
 */

export type Frequency = "daily" | "weekly" | "fortnightly" | "monthly" | "quarterly" | "annual" | "irregular" | "census" | "survey";

export type Tier = "free" | "developer" | "pro" | "business";

export interface CatalogRecord {
  id: string;
  module: string;
  name: string;
  description: string;
  unit: string;
  frequency: Frequency;
  source: string;
  first_date: string;
  last_date: string;
  tier: Tier;
  dimensions?: Record<string, string[]>;
  observation_count?: number;
  /** Set when this series is a label-duplicate (identical name + description) of
      another. Points at the canonical id so the page emits rel=canonical +
      noindex and doesn't compete with its twins in search. */
  canonical_id?: string | null;
  /** Set on the BanglaDataHub derived layer (source "BanglaDataHub"): the published
      formula and the official series it is computed from. Null = official series. */
  derived?: { method: string; inputs: string[]; version: number } | null;
  /** The page's title core, resolved on the server (series-title.server.ts) — not an API field. */
  seo_title?: string | null;
}

export interface Observation {
  date: string;
  value: number;
}

export interface SeriesMeta {
  name: string;
  unit: string;
  frequency: Frequency;
  source: string;
  last_updated: string;
  /** Caveats on returned points — e.g. a value checked against the publisher and
   * confirmed as published, but implausible. Null/absent when none apply. */
  notes?: SeriesNote[] | null;
}

/** Any JSON value — server-function results must be serializable, and `unknown` isn't
 * (TanStack Start then types the whole result as `{}`). */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export interface SeriesNote {
  date: string;
  dims: Record<string, JsonValue>;
  note: string;
  kind: string;
}

export interface SeriesResponse {
  success: true;
  series: string;
  meta: SeriesMeta;
  data: Observation[];
}

export interface StatusModule {
  module: string;
  name: string;
  last_run: string;
  next_expected: string;
  state: "fresh" | "current" | "delayed" | "stale" | "error";
  series: number;
  observations: number;
  history: number[];
}

export interface StatusResponse {
  availability_pct: number | null;
  p95_ms: number | null;
  requests_24h: number;
  observations: number;
  series: number;
  last_ingestion: string;
  modules: StatusModule[];
}

export interface Plan {
  id: string;
  name: string;
  price_monthly: number;
  requests_day: number;
  requests_min: number;
  /** Free tier only: the monthly request allowance (resets on the 1st; null on paid plans). */
  free_credits?: number | null;
  /** Who the plan is for (value-based pricing, 2026-10-04). */
  for_who?: string;
  /** "internal" = your own analysis/models; "display" = may show the data to your users. */
  usage_rights?: "internal" | "display";
  history: string;
  core_modules: boolean;
  funds_alternate: boolean;
  csv: boolean;
  transforms: boolean;
  webhooks: string;
  bulk: boolean;
  vintages: boolean;
  sla: boolean;
  support: string;
  cta: string;
}

export interface CalendarEntry {
  date: string;
  indicator: string;
  source: string;
  series_id?: string;
}

export interface ModuleDef {
  slug: string;
  name: string;
  line: string;
  cadence: string;
  depth: string;
  source: string;
  flagship?: boolean;
  /** Override link target — used when a category has a dedicated page (e.g. funds)
   * rather than the generic /data/{module} series listing. */
  href?: string;
}

export interface ApiError {
  success: false;
  error: { code: string; message: string };
}

// ---- Mutual funds (BSEC) --------------------------------------------------

export interface FundNav {
  date: string;
  nav: number | null;
  offer?: number | null;
  repurchase?: number | null;
}

export interface FundRecord {
  fund_id: number;
  name: string;
  amc: string;
  sector: string | null;
  category: string | null;
  inception_date: string | null;
  trustee: string | null;
  /** Set after a source check, e.g. BSEC's NAVs for a sub-fund being wound up. */
  note?: string | null;
  latest_nav?: FundNav | null;
}

export interface FundReturns {
  date: string;
  rating: string | null;
  benchmark: string | null;
  ytd: number | null;
  mtd: number | null;
  d1: number | null;
  d15: number | null;
  d30: number | null;
  d90: number | null;
  d180: number | null;
  d270: number | null;
  d365: number | null;
}

export interface FundPayout {
  payout_date: string;
  per_unit: number | null;
  ex_nav: number | null;
}

export interface FundExpense {
  date: string;
  ter_mtd: number | null;
  ter_ytd: number | null;
  management_fee: number | null;
  selling_marketing: number | null;
}

// ---- Debt securities (BSEC) -----------------------------------------------

export type SecurityType = "pib_floating" | "gis_sukuk" | "tfc_sukuk";

export interface SecurityPrice {
  date: string;
  price: number | null;
  net_change?: number | null;
}

export interface SecurityRecord {
  code: string;
  type: SecurityType;
  name: string | null;
  rating_category: string | null;
  sbp_code: string | null;
  first_seen: string | null;
  last_seen: string | null;
  latest_price?: SecurityPrice | null;
}

export interface DebtTrade {
  trade_date: string;
  bats: string | null;
  issue_name: string;
  issue_date: string | null;
  maturity_date: string | null;
  listed: string | null;
  face_value: number | null;
  volume: number | null;
  value_mn: number | null;
  price_pct: number | null;
}
