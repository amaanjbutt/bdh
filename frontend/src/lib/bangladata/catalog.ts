import { LIVE_COUNTS } from "./counts";
import type { CalendarEntry, CatalogRecord, ModuleDef, Plan } from "./types";

/** The public module taxonomy. Slugs are also the API `module` filter values. */
export const MODULES: ModuleDef[] = [
  {
    slug: "forex",
    name: "Exchange Rates",
    line: "USD/BDT and major crosses, the daily interbank reference rate, and the 1972–2024 annual history",
    cadence: "Daily & annual",
    depth: "1972 →",
    source: "Bangladesh Bank",
    flagship: true,
  },
  {
    slug: "inflation",
    name: "Inflation & Prices",
    line: "National, food and non-food CPI, point-to-point and 12-month average inflation, and the long historical series",
    cadence: "Monthly",
    depth: "1973 →",
    source: "BBS",
    flagship: true,
  },
  {
    slug: "rates",
    name: "Interest Rates & Yields",
    line: "Policy repo, call money, bank deposit/lending rates, T-bill and T-bond cut-off yields",
    cadence: "Daily & monthly",
    depth: "2025 →",
    source: "Bangladesh Bank",
    flagship: true,
  },
  {
    slug: "monetary",
    name: "Money & Banking",
    line: "M1, M2, currency outside banks, reserve money, private-sector credit and the monetary survey",
    cadence: "Monthly",
    depth: "2009 →",
    source: "Bangladesh Bank",
  },
  {
    slug: "external",
    name: "Trade & External",
    line: "Exports, imports, the trade balance, reserves, remittances and product-level export receipts",
    cadence: "Monthly",
    depth: "1972 →",
    source: "Bangladesh Bank · EPB",
    flagship: true,
  },
  {
    slug: "fiscal",
    name: "Public Finance",
    line: "NBR tax receipts, customs, VAT, income tax and the public-sector borrowing backdrop",
    cadence: "Monthly",
    depth: "2010 →",
    source: "NBR · Bangladesh Bank",
  },
  {
    slug: "real",
    name: "Real Economy",
    line: "GDP at current and constant prices, growth, per-capita income, agriculture and industrial production",
    cadence: "Annual & monthly",
    depth: "1972 →",
    source: "BBS · BB",
  },
  {
    slug: "industry",
    name: "Industry",
    line: "Monthly production of chemicals, fertiliser, textiles, steel, food, glass, matches and cigarettes",
    cadence: "Monthly",
    depth: "2010 →",
    source: "Bangladesh Bank",
  },
  {
    slug: "payments",
    name: "Digital Payments",
    line: "MFS accounts and transactions, cards, internet banking, QR payments and agent banking",
    cadence: "Monthly",
    depth: "2020 →",
    source: "Bangladesh Bank",
    flagship: true,
  },
  {
    slug: "telecom",
    name: "Telecom",
    line: "Mobile and internet subscribers, teledensity, mobile broadband, 3G/4G and operator tower counts",
    cadence: "Monthly",
    depth: "2021 →",
    source: "BTRC",
  },
  {
    slug: "energy",
    name: "Energy & Power",
    line: "Daily generation, demand, fuel mix by zone, cross-border imports and load-shedding",
    cadence: "Daily",
    depth: "2026 →",
    source: "BPDB · NLDC",
  },
  {
    slug: "funds",
    name: "Mutual Funds",
    line: "Daily NAVs from 20 asset managers, 82 funds and BSEC's full 141-fund registry",
    cadence: "Daily",
    depth: "2010 →",
    source: "20 AMCs · BSEC",
  },
  {
    slug: "market",
    name: "Capital Markets",
    line: "DSEX, DS30, DSES, turnover, market capitalisation and every listed instrument's daily OHLCV",
    cadence: "Daily",
    depth: "2025 →",
    source: "Dhaka Stock Exchange",
    href: "/market",
  },
  {
    slug: "commodities",
    name: "Commodity Prices",
    line: "Gold, Brent and Dubai crude, and Bangladesh Bank's monthly retail price table",
    cadence: "Monthly",
    depth: "2002 →",
    source: "Bangladesh Bank",
  },
  {
    slug: "agri",
    name: "Agriculture",
    line: "Rice, wheat, jute, pulses, oilseeds, tea, sugarcane, cotton and tobacco area and production",
    cadence: "Annual",
    depth: "1990s →",
    source: "Bangladesh Bank",
  },
  {
    slug: "social",
    name: "Population & Society",
    line: "Wage Rate Index and social indicators from Bangladesh Bank's statistical tables",
    cadence: "Monthly",
    depth: "1973 →",
    source: "Bangladesh Bank",
  },
  {
    slug: "regional",
    name: "Districts",
    line: "Every district's Census 2022 population, households, age structure and SDG indicators",
    cadence: "Census",
    depth: "2022",
    source: "BBS",
    href: "/districts",
  },
];

export const EXPLORERS: { module: string; href: "/districts" | "/market" | "/topics"; label: string; line: string }[] = [
  { module: "regional", href: "/districts", label: "District profiles", line: "Census 2022 for all 64 districts" },
  { module: "market", href: "/market", label: "DSE market", line: "Indices, turnover and 600+ listed instruments" },
  { module: "external", href: "/topics", label: "Topic hubs", line: "Curated entry points for headline questions" },
];

export const RETIRED_MODULES: Record<string, string> = {
  economic: "inflation",
  prices: "inflation",
};

/** Our API module names are the frontend slugs; kept for compatibility. */
export const MODULE_TO_BACKEND: Record<string, string> = {
  inflation: "inflation",
  payments: "payments",
  rates: "rates",
  fiscal: "fiscal",
};
const MODULE_TO_FRONTEND: Record<string, string> = Object.fromEntries(
  Object.entries(MODULE_TO_BACKEND).map(([fe, be]) => [be, fe]),
);
export const toBackendModule = (slug: string): string => MODULE_TO_BACKEND[slug] ?? slug;
export const toFrontendModule = (slug: string): string => MODULE_TO_FRONTEND[slug] ?? slug;

export function moduleSeriesCount(slug: string): number | undefined {
  return LIVE_COUNTS.modules?.[toBackendModule(slug)];
}

export const MODULE_BY_SLUG: Record<string, ModuleDef> = Object.fromEntries(
  MODULES.map((m) => [m.slug, m]),
);

type Seed = Omit<CatalogRecord, "description"> & { description?: string };

const seeds: Seed[] = [
  { id: "fx.rate.usd", module: "forex", name: "USD/BDT reference rate", unit: "bdt", frequency: "daily", source: "BB", first_date: "2026-10-29", last_date: "2026-10-29", tier: "free" },
  { id: "fx.rate.usd.history", module: "forex", name: "USD/BDT annual history", unit: "bdt", frequency: "annual", source: "BB", first_date: "1972-06-30", last_date: "2024-06-30", tier: "free" },
  { id: "inflation.cpi.national", module: "inflation", name: "CPI (national, all items)", unit: "index", frequency: "monthly", source: "BBS", first_date: "2023-06-30", last_date: "2026-09-01", tier: "free" },
  { id: "inflation.cpi.national.yoy", module: "inflation", name: "CPI inflation (national, YoY)", unit: "percent", frequency: "monthly", source: "BBS", first_date: "2023-06-30", last_date: "2026-09-01", tier: "free" },
  { id: "rates.call_money", module: "rates", name: "Weighted average call money rate", unit: "percent", frequency: "monthly", source: "BB", first_date: "2025-01-01", last_date: "2026-09-01", tier: "free" },
  { id: "monetary.m2", module: "monetary", name: "Broad money (M2)", unit: "bdt_bn", frequency: "monthly", source: "BB", first_date: "2025-08-01", last_date: "2026-08-01", tier: "free" },
  { id: "reserves.gross", module: "external", name: "Gross foreign exchange reserves", unit: "usd_mn", frequency: "monthly", source: "BB", first_date: "2024-10-01", last_date: "2026-09-01", tier: "free" },
  { id: "remittances.total.usd", module: "external", name: "Workers' remittances", unit: "usd_mn", frequency: "monthly", source: "BB", first_date: "2023-07-01", last_date: "2026-09-01", tier: "free" },
  { id: "gdp.current.market_price", module: "real", name: "GDP at current market prices", unit: "bdt_bn", frequency: "annual", source: "BBS", first_date: "2003-06-30", last_date: "2026-06-30", tier: "free" },
  { id: "market.dse.index.dsex", module: "market", name: "DSEX broad index", unit: "index", frequency: "daily", source: "DSE", first_date: "2025-02-23", last_date: "2026-10-29", tier: "free" },
  { id: "regional.census.population", module: "regional", name: "Census 2022 population", unit: "count", frequency: "census", source: "BBS", first_date: "2022-06-30", last_date: "2022-06-30", tier: "free" },
];

export const CATALOG: CatalogRecord[] = seeds.map((s) => ({
  ...s,
  description: s.description ?? s.name,
}));

export const CATALOG_BY_ID: Record<string, CatalogRecord> = Object.fromEntries(
  CATALOG.map((s) => [s.id, s]),
);

/** Fallback counts for fixture mode; live values come from /v1/catalog. */
export const MODULE_SERIES_COUNTS: Record<string, number> = {
  forex: 149,
  inflation: 36,
  rates: 24,
  monetary: 88,
  external: 373,
  fiscal: 48,
  real: 111,
  industry: 13,
  payments: 1298,
  telecom: 26,
  energy: 102,
  funds: 136,
  market: 27,
  commodities: 148,
  agri: 25,
  social: 231,
  regional: 750,
};

export const TOTAL_SERIES = Object.values(MODULE_SERIES_COUNTS).reduce((a, b) => a + b, 0);
export const TOTAL_OBSERVATIONS = 115_901;
export const TOTAL_FUNDS = 82;

export const PLANS: Plan[] = [
  { id: "free", for_who: "Evaluating, students, journalists", usage_rights: "internal", name: "Free", price_monthly: 0, requests_day: 500, requests_min: 10, free_credits: 500, history: "1 year", core_modules: true, funds_alternate: true, csv: true, transforms: true, webhooks: "—", bulk: false, vintages: false, sla: false, support: "Community", cta: "Get a key" },
  { id: "developer", for_who: "One analyst or developer", usage_rights: "internal", name: "Developer", price_monthly: 19, requests_day: 10000, requests_min: 60, history: "10 years", core_modules: true, funds_alternate: true, csv: true, transforms: true, webhooks: "3", bulk: false, vintages: false, sla: false, support: "Email", cta: "Start" },
  { id: "pro", for_who: "Risk, treasury and research teams", usage_rights: "internal", name: "Pro", price_monthly: 49, requests_day: 100000, requests_min: 300, history: "Full, to 1972", core_modules: true, funds_alternate: true, csv: true, transforms: true, webhooks: "50", bulk: true, vintages: true, sla: false, support: "Priority", cta: "Start" },
  { id: "business", for_who: "Apps that show the data to their users", usage_rights: "display", name: "Business", price_monthly: 199, requests_day: 500000, requests_min: 600, history: "Full, to 1972", core_modules: true, funds_alternate: true, csv: true, transforms: true, webhooks: "Unlimited", bulk: true, vintages: true, sla: true, support: "Dedicated", cta: "Start" },
];

export const CALENDAR: CalendarEntry[] = [
  { date: "2026-11-02", indicator: "CPI inflation, October 2026", source: "BBS", series_id: "inflation.cpi.national.yoy" },
  { date: "2026-11-05", indicator: "Foreign exchange reserves", source: "BB", series_id: "reserves.gross" },
  { date: "2026-11-10", indicator: "Workers' remittances, October 2026", source: "BB", series_id: "remittances.total.usd" },
  { date: "2026-11-15", indicator: "Monetary Policy Statement", source: "BB", series_id: "rates.policy" },
  { date: "2026-11-20", indicator: "DSE monthly market report", source: "DSE", series_id: "market.dse.turnover" },
];

export const COMMODITY_ITEMS = [
  { id: "commodities.gold", name: "Gold (London)" },
  { id: "commodities.brent", name: "Brent crude" },
  { id: "commodities.dubai_crude", name: "Dubai crude" },
];

export const COMMODITY_CITIES = ["national", "dhaka", "chattogram", "khulna", "rajshahi", "sylhet"];
