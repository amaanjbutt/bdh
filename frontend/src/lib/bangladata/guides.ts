/**
 * "API guides" — a programmatically generated how-to page per flagship data point
 * (~200 of them), each answering an exact search intent like "how to fetch Bangladesh
 * CPI inflation data via REST API" with copy-pasteable code and the real, live
 * numbers for that series. These are distinct from the /series/{id} pages: they are
 * code-first recipes aimed at developer queries. Generated from the catalog, so a
 * page exists for every curated series and stays in sync with what the API serves.
 */
import type { CatalogRecord } from "./types";
import { FUND_COUNT } from "@/lib/bangladata/counts";

// Only these curated/flagship id families get a guide (clean, human-readable ids —
// never the auto-discovered `gp_*`/dataset-slug long-tail, which the series
// pages already cover). Ordered roughly by search demand.
const GUIDE_PREFIXES = [
  "fx.rate.",
  "fx.effective.",
  "rates.kibor.",
  "rates.policy",
  "rates.pkrv.",
  "rates.pkisrv.",
  "rates.auction.",
  "inflation.",
  "industry.",
  "remittances.",
  "telecom.",
  "sme.",
  "payments.",
  "commodities.",
  "cost_of_living.",
];

export const GUIDE_MODULES = ["forex", "fixed-income", "alternate", "commodities", "prices"];
// Guide families inside modules too large to list whole (telecom → social, LSM → real,
// remittances → external since the 2026-10-17 module merge).
export const GUIDE_FAMILIES = [
  { module: "social", q: "telecom." },
  { module: "real", q: "industry." },
  { module: "external", q: "remittances." },
];

// Raw, un-cleaned SBP series names we never want in a title (the EasyData long
// tail; the curated flagships have clean names). Keeps titles search-friendly.
const UGLY_NAME = /App \(\+\)|Dep \(-\)|BPM\d?|\bBOP\b|Survey/i;

/** A catalog record is guide-worthy if it's a clean, curated flagship series (short
 *  human id + clean name) and not a label-duplicate twin. This deliberately excludes
 *  the auto-discovered long tail — those series have long descriptive-slug ids
 *  and raw names, and are already covered by the /series/{id} pages. */
export function isGuideRecord(r: Pick<CatalogRecord, "id" | "canonical_id" | "name">): boolean {
  if (r.canonical_id) return false;
  if (/_\d+$/.test(r.id)) return false; // dedup suffix (e.g. fx.effective.reer_2)
  if (r.id.length > 40) return false; // long descriptive-slug id = long-tail, not a flagship
  if (UGLY_NAME.test(r.name || "")) return false; // un-cleaned raw name
  return GUIDE_PREFIXES.some((p) => r.id.startsWith(p));
}

/** The guide's URL slug is the stable series id (unique, keyword-bearing). */
export function guideSlug(id: string): string {
  return id;
}

/** Search-intent H1/title, e.g. "How to get Bangladesh CPI National (YoY) data via API". */
export function guideTitle(name: string): string {
  return `How to get Bangladesh ${name} data via API`;
}

/** Commodities are served by a convenience endpoint, not /v1/series. */
export function isCommodity(id: string): boolean {
  return id.startsWith("commodities.");
}

/** The API path a caller hits for this series (the thing the code snippets show). */
export function guideEndpoint(id: string): string {
  if (isCommodity(id)) return `/v1/commodities?item=${id.slice("commodities.".length)}`;
  return `/v1/series/${id}`;
}

export interface GuideCode {
  curl: string;
  python: string;
  node: string;
  pandas: string;
}

/** Copy-pasteable snippets in four languages for this exact series. */
export function guideCode(id: string): GuideCode {
  const base = "https://api.bangladatahub.com";
  const path = guideEndpoint(id);
  const sep = path.includes("?") ? "&" : "?";
  return {
    curl: `curl -H "X-API-Key: bd_live_xxx" \\\n  "${base}${path}${sep}from=2015-01-01&sort=asc"`,
    python: `import httpx

r = httpx.get(
    "${base}${path}",
    params={"from": "2015-01-01", "sort": "asc"},
    headers={"X-API-Key": "bd_live_xxx"}, timeout=30,
)
data = r.json()["data"]
print(len(data), "observations", data[-1])`,
    node: `const res = await fetch(
  "${base}${path}${sep}from=2015-01-01&sort=asc",
  { headers: { "X-API-Key": "bd_live_xxx" } },
);
const { data } = await res.json();
console.log(data.at(-1));`,
    pandas: `import pandas as pd
url = "${base}${path}${sep}format=csv&sort=asc&api_key=bd_live_xxx"
df = pd.read_csv(url, parse_dates=["date"])`,
  };
}

// ---- Dataset guides (funds, securities, auctions, AMCs, trade) --------------
// These are served by dedicated endpoints, not /v1/series, so they're hand-written
// (not catalog-derived). A GuideView is the normalized shape the /guides/$slug page
// renders — for both these and the auto-generated series guides.

export interface GuideView {
  slug: string;
  module: string;
  h1: string;
  name: string;
  description: string;
  endpoint: string;
  source: string;
  frequency: string;
  coverageFrom: string; // ISO date; shown as "from {date} to today"
  seriesId: string | null; // chart link target; null for dataset guides
  latest: { date: string; value: number; unit: string } | null;
  code: GuideCode;
  faq: { q: string; a: string }[];
}

// Snippets for a JSON endpoint (funds/securities/etc return JSON, not CSV).
function jsonCode(path: string): GuideCode {
  const base = "https://api.bangladatahub.com";
  return {
    curl: `curl -H "X-API-Key: bd_live_xxx" \\\n  "${base}${path}"`,
    python: `import httpx

r = httpx.get("${base}${path}", headers={"X-API-Key": "bd_live_xxx"}, timeout=30)
print(r.json())`,
    node: `const res = await fetch("${base}${path}", {
  headers: { "X-API-Key": "bd_live_xxx" },
});
console.log(await res.json());`,
    pandas: `import httpx, pandas as pd

r = httpx.get("${base}${path}", headers={"X-API-Key": "bd_live_xxx"})
df = pd.json_normalize(r.json().get("data", r.json()))`,
  };
}

export const DATASET_GUIDES: GuideView[] = [
  {
    slug: "mutual-funds",
    module: "funds",
    h1: "How to get Bangladesh mutual fund data via API",
    name: "mutual fund NAVs, returns & expense ratios",
    description:
      "Pull any Bangladeshi mutual fund's daily NAV history (back to 1996), trailing and annualized returns, dividend payouts and expense ratio (TER) from the /v1/funds endpoints — one key, JSON.",
    endpoint: "/v1/funds/{id}/nav",
    source: "MUFAP",
    frequency: "daily",
    coverageFrom: "1996-01-01",
    seriesId: null,
    latest: null,
    code: jsonCode("/v1/funds/12814/nav?sort=asc&limit=100"),
    faq: [
      {
        q: "How do I list all Bangladeshi mutual funds via the API?",
        a: "GET /v1/funds returns every fund with its AMC, category and latest NAV; filter with amc=, category= or q=. Each fund has an id you pass to /v1/funds/{id}/nav, /returns, /analytics, /payouts, /expenses and /portfolio.",
      },
      {
        q: "How far back does mutual fund NAV history go?",
        a: "Daily NAVs go back to 1996 for long-running funds, sourced from MUFAP and served as JSON via /v1/funds/{id}/nav.",
      },
      {
        q: "Can I get fund returns, TER and analytics?",
        a: "Yes — /v1/funds/{id}/returns for trailing returns, /expenses for TER history, and /v1/funds/{id}/analytics for computed CAGR, annualized volatility and max drawdown.",
      },
    ],
  },
  {
    slug: "fund-screener",
    module: "funds",
    h1: "How to screen all Bangladesh mutual funds in one API call",
    name: "the fund screener (returns + TER for every fund)",
    description:
      `GET /v1/funds/screener returns every active Bangladeshi mutual fund in a single response — latest NAV, trailing returns (YTD/3M/1Y), expense ratio (TER), rating and benchmark — so you can rank and filter ${FUND_COUNT} funds without a per-fund fan-out.`,
    endpoint: "/v1/funds/screener",
    source: "MUFAP",
    frequency: "daily",
    coverageFrom: "1996-01-01",
    seriesId: null,
    latest: null,
    code: jsonCode("/v1/funds/screener"),
    faq: [
      {
        q: "How do I rank all Bangladeshi mutual funds by return or expense ratio?",
        a: "GET /v1/funds/screener returns the whole ranked table in one call — fund_id, name, AMC, category, latest NAV, returns (ytd/m3/y1), ter_ytd and rating. Sort or filter it client-side.",
      },
      {
        q: "Is there a no-code fund screener?",
        a: "Yes — the free /tools/fund-screener page runs on this endpoint; it needs no key and lets you filter by AMC and category and sort by return or TER.",
      },
    ],
  },
  {
    slug: "debt-securities",
    module: "securities",
    h1: "How to get Bangladesh debt securities & bond prices via API",
    name: "PIB, GoP Ijara Sukuk & corporate TFC prices",
    description:
      "Fetch per-instrument valuation prices for floating-rate PIBs, GoP Ijara Sukuk and corporate TFC/Sukuk, plus trade-level secondary-market transactions, from the /v1/securities endpoints (MUFAP).",
    endpoint: "/v1/securities",
    source: "MUFAP",
    frequency: "daily",
    coverageFrom: "2022-01-01",
    seriesId: null,
    latest: null,
    code: jsonCode("/v1/securities?type=gis_sukuk"),
    faq: [
      {
        q: "How do I get Bangladesh government bond (PIB/Sukuk) prices via API?",
        a: "GET /v1/securities?type=pib_floating|gis_sukuk|tfc_sukuk lists instruments; GET /v1/securities/{code}/prices returns one instrument's price history. Codes may contain slashes for corporate TFCs.",
      },
      {
        q: "Is trade-level debt data available?",
        a: "Yes — GET /v1/securities/trades returns reported secondary-market debt transactions with date, venue, issue, face value, volume, value and price (% of face).",
      },
    ],
  },
  {
    slug: "auctions",
    module: "fixed-income",
    h1: "How to get Bangladesh T-Bill & PIB auction results via API",
    name: "T-Bill, PIB & Sukuk auction cut-off yields",
    description:
      "Fetch primary-market auction cut-off yields for T-Bills, PIBs and GoP Ijara Sukuk from /v1/fixed-income/auctions, with deep history for building a cut-off-yield series or feeding a rates model.",
    endpoint: "/v1/fixed-income/auctions",
    source: "SBP",
    frequency: "per auction",
    coverageFrom: "2000-01-01",
    seriesId: null,
    latest: null,
    code: jsonCode("/v1/fixed-income/auctions?type=tbill&from=2024-01-01"),
    faq: [
      {
        q: "How do I get Bangladesh treasury-bill auction cut-off yields via API?",
        a: "GET /v1/fixed-income/auctions?type=tbill (or pib, or gis) returns auction results with cut-off yields over a from/to date range. For the yield curve use the rates.pkrv.* / rates.pkisrv.* series; for KIBOR use rates.kibor.*.",
      },
    ],
  },
  {
    slug: "asset-managers",
    module: "funds",
    h1: "How to get Bangladesh AMC (asset manager) data via API",
    name: "AMC profiles — fund counts, TER & ratings",
    description:
      "Roll the fund store up to the asset-manager entity: GET /v1/amcs lists every AMC with fund count, average TER and categories, and GET /v1/amcs/{amc} returns its rating distribution and full fund list.",
    endpoint: "/v1/amcs",
    source: "MUFAP",
    frequency: "daily",
    coverageFrom: "1996-01-01",
    seriesId: null,
    latest: null,
    code: jsonCode("/v1/amcs"),
    faq: [
      {
        q: "How do I list Bangladesh's mutual-fund asset managers (AMCs) via API?",
        a: "GET /v1/amcs returns every AMC with fund_count, avg_ter_ytd, oldest_inception and categories; GET /v1/amcs/{amc} adds a credit-rating distribution and the AMC's full fund list.",
      },
    ],
  },
  {
    slug: "external-trade",
    module: "external",
    h1: "How to get Bangladesh trade (exports & imports) data via API",
    name: "monthly exports & imports by commodity",
    description:
      "Fetch Bangladesh's monthly exports and imports by commodity from /v1/trade (PBS) — build a trade-balance dashboard or track commodity-level export/import trends.",
    endpoint: "/v1/trade",
    source: "PBS",
    frequency: "monthly",
    coverageFrom: "2010-01-01",
    seriesId: null,
    latest: null,
    code: jsonCode("/v1/trade?flow=export&commodity=RICE"),
    faq: [
      {
        q: "How do I get Bangladesh export and import data via API?",
        a: "GET /v1/trade?flow=export|import returns monthly trade by commodity; filter with commodity= or group= and a from/to range.",
      },
    ],
  },
];

export function getDatasetGuide(slug: string): GuideView | undefined {
  return DATASET_GUIDES.find((g) => g.slug === slug);
}

/** Build the normalized GuideView for a catalog series. */
export function seriesGuideView(rec: {
  id: string;
  name: string;
  description: string;
  module: string;
  unit: string;
  frequency: string;
  source: string;
  first_date: string;
}, latest: { date: string; value: number } | null): GuideView {
  const endpoint = guideEndpoint(rec.id);
  return {
    slug: rec.id,
    module: rec.module,
    h1: guideTitle(rec.name),
    name: rec.name,
    description: rec.description || `Bangladesh ${rec.name}.`,
    endpoint,
    source: rec.source,
    frequency: rec.frequency,
    coverageFrom: rec.first_date,
    seriesId: rec.id,
    latest: latest ? { date: latest.date, value: latest.value, unit: rec.unit } : null,
    code: guideCode(rec.id),
    faq: [
      {
        q: `How do I fetch Bangladesh ${rec.name} data from an API?`,
        a: `Send a GET request to ${endpoint} on the BanglaDataHub REST API with your X-API-Key header. It returns ${rec.frequency} observations as JSON (or CSV with format=csv). Get a free key at bangladatahub.com/signup.`,
      },
      {
        q: `Is Bangladesh ${rec.name} available as JSON or CSV?`,
        a: `Both. The endpoint returns JSON by default; append format=csv for a downloadable CSV that loads straight into pandas or a spreadsheet.`,
      },
      {
        q: `How far back does the ${rec.name} data go?`,
        a: `BanglaDataHub carries this series from ${rec.first_date} to today, sourced from ${rec.source} and cross-validated against published figures.`,
      },
      {
        q: `Do I need an API key?`,
        a: `Yes — a free key. Sign up in under a minute at bangladatahub.com/signup and get 500 free API calls every month; no card required.`,
      },
    ],
  };
}
