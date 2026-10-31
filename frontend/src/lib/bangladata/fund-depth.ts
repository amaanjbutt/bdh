import type { FundRecord, FundReturns, SecurityRecord } from "./types";

/**
 * Programmatic depth for fund and security pages — mirrors series-depth.ts so the
 * every fund page and debt-security page carry the same use-cases / personas /
 * FAQ SEO surface as every series page.
 */

export interface Depth {
  useCases: string[];
  personas: string[];
  faq: { q: string; a: string }[];
}

const FUND_PERSONAS = [
  "Wealth & portfolio manager",
  "Financial advisor",
  "Retail investor",
  "Fintech / robo-advisor",
];

const SECURITY_PERSONAS = [
  "Fixed-income analyst",
  "Bank treasury / ALM",
  "Asset-management ops",
  "Auditor / valuer",
];

function pct(v: number | null | undefined): string | null {
  return v == null ? null : `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

export function fundDepth(f: FundRecord, returns?: FundReturns | null): Depth {
  const cat = f.category ?? "mutual fund";
  const useCases = [
    `Track ${f.name}'s NAV and total-return performance over time`,
    `Compare ${f.name} against peers by AMC or category`,
    `Screen for ${cat.toLowerCase()} funds by return, payout or expense ratio`,
    `Pull ${f.name}'s full daily NAV history into your stack as JSON or CSV`,
  ];

  const perf =
    returns && (returns.d365 != null || returns.ytd != null)
      ? `As of the latest data, its trailing return is ${pct(returns.d365) ?? pct(returns.ytd)}${
          returns.d365 != null ? " over one year" : " year-to-date"
        }.`
      : "Trailing returns and NAV history are available through the API.";

  const faq = [
    {
      q: `What is ${f.name}?`,
      a: `${f.name} is a ${cat} managed by ${f.amc}, an asset-management company in Bangladesh. Its daily NAV is published by BSEC.`,
    },
    {
      q: `How has ${f.name} performed?`,
      a: perf,
    },
    {
      q: `How do I get ${f.name}'s NAV history via the API?`,
      a: `Call GET /v1/funds/${f.fund_id}/nav with your API key for the full daily NAV series, or /returns, /payouts and /expenses for performance, dividends and TER. Add ?format=csv for a download.`,
    },
  ];

  return { useCases, personas: FUND_PERSONAS, faq };
}

const SECURITY_KIND: Record<string, string> = {
  pib_floating: "floating-rate Bangladesh Investment Bond",
  gis_sukuk: "Government of Bangladesh Ijara Sukuk",
  tfc_sukuk: "corporate Term Finance Certificate / Sukuk",
};

export function securityDepth(s: SecurityRecord): Depth {
  const kind = SECURITY_KIND[s.type] ?? "debt security";
  const label = s.name || s.code;
  const useCases = [
    `Value a fixed-income book that holds ${label}`,
    `Track ${label}'s daily price and spread over time`,
    `Feed ${label} into a portfolio-valuation or risk model`,
    `Pull ${label}'s price history as JSON or CSV`,
  ];

  const faq = [
    {
      q: `What is ${label}?`,
      a: `${label} is a ${kind}${s.rating_category ? ` (${s.rating_category})` : ""}, priced daily by BSEC for valuation purposes.`,
    },
    {
      q: `How is ${label} priced?`,
      a: `BanglaDataHub carries BSEC's daily valuation price for ${s.code}${
        s.first_seen && s.last_seen ? `, covering ${s.first_seen.slice(0, 4)} to ${s.last_seen.slice(0, 4)}` : ""
      }.`,
    },
    {
      q: `How do I get ${s.code} prices via the API?`,
      a: `Call GET /v1/securities/${s.code}/prices with your API key. Add ?format=csv for a download, or from/to to filter by date.`,
    },
  ];

  return { useCases, personas: SECURITY_PERSONAS, faq };
}
