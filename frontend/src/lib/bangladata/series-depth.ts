import type { CatalogRecord } from "./types";

/**
 * Programmatic per-series depth. The series pages can't be hand-written,
 * so this derives use cases, personas and an FAQ from the catalog record —
 * module, unit, frequency and name. Every page gets real, indexable depth; the
 * hand-written `content/series/<id>.md` override (series-content.ts) wins where
 * it exists. This is the SEO/GEO surface: thousands of question-shaped pages.
 */

export interface SeriesDepth {
  useCases: string[];
  personas: string[];
  faq: { q: string; a: string }[];
}

// Personas keyed by module (both backend and fixture slug names).
const PERSONAS: Record<string, string[]> = {
  forex: ["Macro researcher", "Treasury & FX desk", "Fintech / remittance app", "Journalist"],
  prices: ["Bank risk & credit analyst", "Macro researcher", "Policy analyst", "Journalist"],
  inflation: ["Bank risk & credit analyst", "Macro researcher", "Policy analyst", "Journalist"],
  rates: ["Fixed-income analyst", "Bank ALM / treasury", "Quant researcher", "Corporate CFO"],
  "fixed-income": ["Fixed-income analyst", "Bank ALM / treasury", "Quant researcher", "Corporate CFO"],
  commodities: ["Commodity analyst", "FMCG / retail planner", "Policy analyst", "Journalist"],
  payments: ["Fintech founder / analyst", "Payments operator", "VC / diligence", "Policy researcher"],
  alternate: ["Fintech founder / analyst", "Payments operator", "VC / diligence", "Policy researcher"],
  external: ["Macro researcher", "Trade analyst", "Economist", "Journalist"],
  monetary: ["Bank / ALM analyst", "Macro researcher", "Economist", "Fixed-income desk"],
  real: ["Equity & sector analyst", "Economist", "Corporate strategist", "Journalist"],
  social: ["Development researcher", "Policy analyst", "Academic", "Journalist"],
  fiscal: ["Public-finance analyst", "Economist", "Policy analyst", "Journalist"],
  "public-finance": ["Public-finance analyst", "Economist", "Policy analyst", "Journalist"],
  debt: ["Sovereign-risk analyst", "Fixed-income analyst", "Economist", "Journalist"],
  energy: ["Energy & power analyst", "Logistics / fleet planner", "Economist", "Journalist"],
  regional: ["Development researcher", "Market-sizing / retail planner", "Policy analyst", "Journalist"],
};

const DEFAULT_PERSONAS = ["Analyst", "Economist / researcher", "Data / BI team", "Journalist"];

// Natural-language topic phrase per module, for entity-rich, question-shaped FAQ
// that matches how people (and LLMs) ask — e.g. "does BanglaDataHub have Bangladesh
// balance-of-payments data on Nigeria". This is the GEO surface: the answer text
// pairs "Bangladesh", the concept, and the specific series name on every page.
const MODULE_CONCEPT: Record<string, string> = {
  forex: "exchange-rate",
  prices: "inflation and price",
  inflation: "inflation and price",
  rates: "interest-rate and yield",
  "fixed-income": "interest-rate and yield",
  commodities: "commodity-price",
  payments: "digital-payments and alternate",
  alternate: "digital-payments and alternate",
  external: "balance-of-payments and external-sector",
  monetary: "money and banking",
  real: "real-economy",
  social: "population and social",
  fiscal: "public-finance",
  "public-finance": "public-finance",
  debt: "government-debt",
  economic: "economic",
  energy: "energy and fuel-price",
  regional: "provincial and district",
};

// Module-flavoured use-case templates. `n` is the lower-cased series name.
function moduleUseCases(module: string, n: string): string[] {
  const map: Record<string, string[]> = {
    forex: [`Convert or index amounts against ${n}`, `Backtest an FX or macro model on ${n}`],
    prices: [`Feed ${n} into an inflation or pricing model`, `Compute real (inflation-adjusted) values`],
    inflation: [`Feed ${n} into an inflation or pricing model`, `Compute real (inflation-adjusted) values`],
    rates: [`Price or discount cash flows off ${n}`, `Drive an ALM, treasury or rates model`],
    "fixed-income": [`Price or discount cash flows off ${n}`, `Drive an ALM, treasury or rates model`],
    commodities: [`Track ${n} for a cost-of-living or margin model`, `Compare prices across cities and time`],
    payments: [`Size the market and adoption trend from ${n}`, `Use ${n} as a KPI in a product dashboard`],
    alternate: [`Size the market and adoption trend from ${n}`, `Use ${n} as a KPI in a product dashboard`],
    external: [`Build a trade or balance-of-payments view around ${n}`, `Track external-sector risk`],
    monetary: [`Track money and credit conditions via ${n}`, `Feed ${n} into a banking or liquidity model`],
    real: [`Nowcast activity from ${n}`, `Build a sector or equity thesis on ${n}`],
    social: [`Ground demographic or development analysis in ${n}`, `Benchmark ${n} over time`],
    fiscal: [`Track the fiscal position via ${n}`, `Model revenue or spending trends from ${n}`],
    "public-finance": [`Track the fiscal position via ${n}`, `Model revenue or spending trends from ${n}`],
    debt: [`Assess sovereign-debt dynamics with ${n}`, `Feed ${n} into a debt-sustainability model`],
    energy: [`Track fuel or power costs with ${n}`, `Model the generation mix or a plant's output from ${n}`],
    regional: [`Size a market district by district with ${n}`, `Compare provinces and districts on ${n}`],
  };
  return map[module] ?? [];
}

// Generated depth for a whole module (used on /data/{module} when there's no
// hand-written content/modules/<slug>.md guide).
export function moduleDepth(module: string, name: string): { useCases: string[]; personas: string[] } {
  const n = name.toLowerCase();
  return {
    useCases: [`Explore every ${n} series through one API`, ...moduleUseCases(module, n)].slice(0, 4),
    personas: PERSONAS[module] ?? DEFAULT_PERSONAS,
  };
}

export function seriesDepth(r: CatalogRecord): SeriesDepth {
  const n = r.name.toLowerCase();
  const useCases = [
    `Chart ${n} and its full history in a dashboard or research note`,
    ...moduleUseCases(r.module, n),
    `Pull ${n} into your stack as JSON or CSV`,
  ].slice(0, 4);

  const personas = PERSONAS[r.module] ?? DEFAULT_PERSONAS;

  const range =
    r.first_date && r.last_date
      ? `${r.first_date.slice(0, 4)} to ${r.last_date.slice(0, 4)}`
      : "its full available history";
  const concept = MODULE_CONCEPT[r.module] || "economic";
  const faq = [
    {
      q: `What is ${r.name}?`,
      a: r.description || `${r.name} is a ${r.frequency} series published by ${r.source}.`,
    },
    {
      q: `Does BanglaDataHub have Bangladesh ${concept} data on ${r.name}?`,
      a: `Yes. ${r.name} is an official Bangladesh ${concept} time series (${r.frequency}, from ${r.source}) available on the BanglaDataHub API, covering ${range}. Query it as JSON or CSV at /v1/series/${r.id}, with server-side transforms (YoY, index, % change).`,
    },
    {
      q: `How far back does ${r.name} go?`,
      a: `BanglaDataHub carries ${r.name} covering ${range}, updated on a ${r.frequency} basis from ${r.source}.`,
    },
    {
      q: `How do I get ${r.name} via the API?`,
      a: `Call GET /v1/series/${r.id} with your API key. Add ?format=csv for a download, or filter by date with from/to.`,
    },
  ];

  return { useCases, personas, faq };
}
