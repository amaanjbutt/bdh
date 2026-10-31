/**
 * Topic hubs: plain-language explainers that link into the catalog.
 * Keep prose free of typed figures; FAQ answers use {{value:id}} / {{period:id}}.
 */

export type TopicSection = { heading: string; blurb?: string; ids: string[] };
export type TopicFaq = { q: string; a: string };
export type Topic = {
  slug: string;
  title: string;
  h1: string;
  description: string;
  summary: string;
  intro: string[];
  key: string[];
  sections: TopicSection[];
  faq: TopicFaq[];
  related: string[];
  links?: { href: string; label: string }[];
};

export const TOPICS: Topic[] = [
  {
    slug: "inflation",
    title: "Bangladesh Inflation — CPI Data, Charts & API",
    h1: "Bangladesh inflation",
    description: "National, food and non-food CPI for Bangladesh: index levels, point-to-point inflation, 12-month averages and the long historical series from BBS.",
    summary: "CPI levels and inflation for Bangladesh, monthly from BBS.",
    intro: [
      "Bangladesh Bureau of Statistics publishes a monthly Consumer Price Index with a 2021-22 base. The headline number is the point-to-point change in the national all-items index; food and non-food are the two main splits.",
      "The series here also include the 12-month moving average (the measure the central bank often cites) and a long annual CPI history beginning in the 1970s.",
    ],
    key: ["inflation.cpi.national.yoy", "inflation.cpi.food.yoy", "inflation.cpi.non_food.yoy", "inflation.cpi.national.12m_avg"],
    sections: [
      { heading: "Headline CPI", ids: ["inflation.cpi.national", "inflation.cpi.national.yoy", "inflation.cpi.national.12m_avg", "inflation.cpi.national.mom"] },
      { heading: "Food and non-food", ids: ["inflation.cpi.food", "inflation.cpi.food.yoy", "inflation.cpi.non_food", "inflation.cpi.non_food.yoy"] },
      { heading: "Long history", ids: ["inflation.cpi.national.long", "inflation.cpi.national.yoy.long", "inflation.cpi.food.long", "inflation.cpi.non_food.long"] },
    ],
    faq: [
      { q: "What is Bangladesh's inflation rate?", a: "National CPI inflation was {{value:inflation.cpi.national.yoy}} in {{period:inflation.cpi.national.yoy}}." },
      { q: "How often is CPI published?", a: "Monthly, usually in the first week of the following month." },
    ],
    related: ["policy-rate", "food-prices", "gdp"],
    links: [{ href: "/data/inflation", label: "All inflation series" }],
  },
  {
    slug: "policy-rate",
    title: "Bangladesh Interest Rates — Call Money, T-Bills & Yields",
    h1: "Bangladesh interest rates",
    description: "The policy repo rate, call-money rate, bank deposit and lending rates, the spread, and T-bill/T-bond cut-off yields from Bangladesh Bank.",
    summary: "Policy, money-market, bank and government-security rates.",
    intro: [
      "Bangladesh Bank sets the policy repo rate at Monetary Policy Committee meetings and manages liquidity through repo, SLF and SDF facilities. The overnight call-money rate is the market's daily clearing rate.",
      "T-bill and T-bond cut-off yields come from the primary auctions; they are the reference points for the government yield curve.",
    ],
    key: ["rates.call_money", "rates.bank", "rates.deposit", "rates.lending", "rates.tbond.10y"],
    sections: [
      { heading: "Policy and money market", ids: ["rates.policy", "rates.bank", "rates.call_money", "rates.spread"] },
      { heading: "Bank rates", ids: ["rates.deposit", "rates.lending"] },
      { heading: "Government securities", ids: ["rates.tbill.91d", "rates.tbill.182d", "rates.tbill.364d", "rates.tbond.2y", "rates.tbond.5y", "rates.tbond.10y", "rates.tbond.15y", "rates.tbond.20y"] },
    ],
    faq: [
      { q: "What is the call-money rate today?", a: "The weighted-average call-money rate was {{value:rates.call_money}} in {{period:rates.call_money}}." },
      { q: "Where does the policy rate come from?", a: "The Monetary Policy Committee statement, published by Bangladesh Bank." },
    ],
    related: ["inflation", "monetary", "dse"],
    links: [{ href: "/data/rates", label: "All rate series" }],
  },
  {
    slug: "remittances",
    title: "Bangladesh Remittances — Monthly Inflows & Growth",
    h1: "Workers' remittances",
    description: "Monthly workers' remittance inflows to Bangladesh in USD and BDT, with year-on-year growth, from Bangladesh Bank.",
    summary: "Monthly remittance inflows and their growth rate.",
    intro: [
      "Bangladesh Bank publishes the monthly wage-earners' remittance inflow in US dollars and taka. It is one of the largest sources of foreign exchange and a key support for the current account.",
      "The derived layer adds year-on-year growth so the trend is visible without doing the arithmetic yourself.",
    ],
    key: ["remittances.total.usd", "remittances.total.bdt", "derived.remittances_growth_yoy"],
    sections: [
      { heading: "Monthly inflows", ids: ["remittances.total.usd", "remittances.total.bdt"] },
      { heading: "Growth", ids: ["derived.remittances_growth_yoy"] },
      { heading: "Historical annual", ids: ["remittances.total.history"] },
    ],
    faq: [
      { q: "How much did Bangladesh receive in remittances last month?", a: "{{value:remittances.total.usd}} million USD in {{period:remittances.total.usd}}." },
      { q: "Which countries send the most?", a: "Saudi Arabia, the UAE, the UK, the US and Malaysia are the largest sources in the annual country table." },
    ],
    related: ["reserves", "trade", "exchange-rate"],
    links: [{ href: "/data/external", label: "All external series" }],
  },
  {
    slug: "reserves",
    title: "Bangladesh Foreign Exchange Reserves — Gross & BPM6",
    h1: "Foreign exchange reserves",
    description: "Gross and BPM6 foreign exchange reserves of Bangladesh, monthly, plus the USD/BDT reference rate.",
    summary: "Gross and BPM6 reserves, monthly.",
    intro: [
      "Bangladesh Bank reports gross international reserves and the BPM6 measure, which excludes some non-liquid claims. The gross number is the headline in most press coverage; BPM6 is the IMF-compatible measure.",
      "Reserves are published monthly and updated through the latest completed month.",
    ],
    key: ["reserves.gross", "reserves.bpm6", "fx.rate.usd"],
    sections: [
      { heading: "Reserves", ids: ["reserves.gross", "reserves.bpm6"] },
      { heading: "Exchange rate", ids: ["fx.rate.usd", "fx.rate.usd.history"] },
    ],
    faq: [
      { q: "What are Bangladesh's reserves?", a: "Gross reserves were {{value:reserves.gross}} million USD in {{period:reserves.gross}}; BPM6 reserves were {{value:reserves.bpm6}} million." },
    ],
    related: ["remittances", "trade", "exchange-rate"],
    links: [{ href: "/data/external", label: "External sector series" }],
  },
  {
    slug: "trade",
    title: "Bangladesh Trade — Exports, Imports & Product Receipts",
    h1: "Bangladesh trade",
    description: "Exports, imports, the trade balance and product-level export receipts for Bangladesh from Bangladesh Bank and the Export Promotion Bureau.",
    summary: "Exports, imports and product-level receipts.",
    intro: [
      "Bangladesh Bank's balance-of-payments tables report goods exports and imports in taka crore; the Export Promotion Bureau publishes a more detailed product breakdown in US dollars.",
      "The two views are complementary: use the BOP totals for macro context and the EPB product table to see which lines are growing.",
    ],
    key: ["external.exports", "external.imports", "external.trade_balance"],
    sections: [
      { heading: "BOP totals", ids: ["external.exports", "external.imports", "external.trade_balance"] },
      { heading: "Product receipts", ids: ["trade.exports.18_rmg_61_and_62", "trade.exports.a_knitwear_61", "trade.exports.b_woven_garments_62", "trade.exports.7_leather_and_leather_products_41_43_and_6403", "trade.exports.1_frozen_and_live_fish_01_03"] },
    ],
    faq: [
      { q: "What did Bangladesh export last month?", a: "See the latest product receipts in the table; the BOP goods export total was {{value:external.exports}} in {{period:external.exports}}." },
    ],
    related: ["exchange-rate", "remittances", "gdp"],
    links: [{ href: "/data/external", label: "All trade series" }],
  },
  {
    slug: "dse",
    title: "Dhaka Stock Exchange — DSEX, Turnover & Market Data",
    h1: "Dhaka Stock Exchange",
    description: "DSEX, DS30, DSES, turnover, volume, trades, market capitalisation and every listed instrument's daily prices from the Dhaka Stock Exchange.",
    summary: "DSE indices, turnover and listed instruments.",
    intro: [
      "The Dhaka Stock Exchange publishes a live JSON snapshot with every instrument's open, high, low, close, volume and trade count, plus the DSEX, DS30 and DSES indices.",
      "We store the daily close and the instrument-level rows, so you can chart the market or screen individual scrips.",
    ],
    key: ["market.dse.index.dsex", "market.dse.index.ds30", "market.dse.index.dses", "market.dse.turnover", "market.dse.market_cap.total"],
    sections: [
      { heading: "Indices", ids: ["market.dse.index.dsex", "market.dse.index.ds30", "market.dse.index.dses"] },
      { heading: "Activity", ids: ["market.dse.turnover", "market.dse.volume", "market.dse.trades", "market.dse.market_cap.total"] },
      { heading: "Long history", ids: ["market.dse.index.general", "market.dse.turnover"] },
    ],
    faq: [
      { q: "What is the DSEX today?", a: "The DSEX closed at {{value:market.dse.index.dsex}} on {{period:market.dse.index.dsex}}." },
      { q: "Where are individual share prices?", a: "Every listed instrument is in the DSE market explorer, with daily OHLCV." },
    ],
    related: ["policy-rate", "inflation", "gdp"],
    links: [{ href: "/market", label: "DSE market explorer" }],
  },
  {
    slug: "mfs",
    title: "Bangladesh Mobile Financial Services — Accounts & Transactions",
    h1: "Mobile financial services",
    description: "MFS accounts, cash-in/cash-out, P2P, merchant payments, cards, internet banking and agent banking, monthly from Bangladesh Bank.",
    summary: "MFS, cards, internet banking and agent banking.",
    intro: [
      "Bangladesh Bank's e-banking and e-commerce statistics cover the digital payments stack: mobile financial services, cards, internet banking, QR payments, school banking and agent banking.",
      "The tables are monthly and include both number of transactions and their value in taka million.",
    ],
    key: ["payments.mfs_part_1.mfs_total_account_total", "payments.mfs_part_3.cash_in_total_amount", "payments.mfs_part_3.cash_out_total_amount", "payments.mfs_part_3.p2p_amount"],
    sections: [
      { heading: "Accounts", ids: ["payments.mfs_part_1.mfs_total_account_total", "payments.mfs_part_1.mfs_regular_male_account_total", "payments.mfs_part_1.mfs_regular_female_account_total"] },
      { heading: "Transactions", ids: ["payments.mfs_part_3.cash_in_total_amount", "payments.mfs_part_3.cash_out_total_amount", "payments.mfs_part_3.p2p_amount"] },
      { heading: "Cards & internet banking", ids: ["payments.cards.issued", "payments.internet_banking.customers"] },
    ],
    faq: [
      { q: "How many MFS accounts are there?", a: "{{value:payments.mfs_part_1.mfs_total_account_total}} accounts in {{period:payments.mfs_part_1.mfs_total_account_total}}." },
    ],
    related: ["gdp", "inflation", "dse"],
    links: [{ href: "/data/payments", label: "All payments series" }],
  },
  {
    slug: "gdp",
    title: "Bangladesh GDP — Current, Constant & Per Capita",
    h1: "Bangladesh GDP",
    description: "Nominal and real GDP, growth rates and per-capita income for Bangladesh from the Bangladesh Bureau of Statistics.",
    summary: "Nominal, real and per-capita GDP.",
    intro: [
      "BBS publishes annual GDP at current and constant market prices, with growth rates and per-capita income. The current series is the nominal economy; the constant series strips out price changes.",
      "Quarterly GDP is published separately; the annual table is the anchor for long-run comparisons.",
    ],
    key: ["gdp.current.market_price", "gdp.constant.market_price", "gdp.growth.current", "gdp.growth.constant", "gdp.per_capita.usd"],
    sections: [
      { heading: "Levels", ids: ["gdp.current.market_price", "gdp.constant.market_price"] },
      { heading: "Growth", ids: ["gdp.growth.current", "gdp.growth.constant"] },
      { heading: "Per capita", ids: ["gdp.per_capita.bdt", "gdp.per_capita.usd"] },
    ],
    faq: [
      { q: "What is Bangladesh's GDP?", a: "Nominal GDP was {{value:gdp.current.market_price}} billion taka in {{period:gdp.current.market_price}}." },
    ],
    related: ["inflation", "trade", "census"],
    links: [{ href: "/data/real", label: "All real-economy series" }],
  },
  {
    slug: "census",
    title: "Bangladesh Census 2022 — District Population & Households",
    h1: "Census 2022",
    description: "Population, households, sex ratio and age structure for every district of Bangladesh from the 2022 Population and Housing Census.",
    summary: "District population, households and age structure.",
    intro: [
      "The 2022 Population and Housing Census is the latest full count of Bangladesh. BBS publishes one workbook per district with household, population, age, literacy and SDG tables.",
      "The district explorer turns the headline C-01 table into a comparable profile for every district.",
    ],
    key: ["regional.census.population", "regional.census.households", "regional.census.sex_ratio"],
    sections: [
      { heading: "Headline", ids: ["regional.census.population", "regional.census.households", "regional.census.sex_ratio", "regional.census.population.male", "regional.census.population.female"] },
      { heading: "Age structure", ids: ["regional.census.c02.age_group_in_years_0_4", "regional.census.c02.age_group_in_years_15_19", "regional.census.c02.age_group_in_years_60_64"] },
    ],
    faq: [
      { q: "What is Bangladesh's population?", a: "The national total is in the district explorer; each district's 2022 count is on its profile." },
    ],
    related: ["gdp", "mfs", "inflation"],
    links: [{ href: "/districts", label: "District explorer" }],
  },
];

export const TOPIC_BY_SLUG: Record<string, Topic> = Object.fromEntries(TOPICS.map((t) => [t.slug, t]));

export function topicSeriesIds(t: Topic): string[] {
  return Array.from(new Set([...t.key, ...t.sections.flatMap((s) => s.ids)]));
}

export function topicLiveIds(t: Topic): string[] {
  return t.key.slice(0, 4);
}

export const TOPIC_OF_SERIES: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const t of TOPICS) for (const id of topicSeriesIds(t)) out[id] = t.slug;
  return out;
})();

export type LiveFigure = { value: number; date: string; unit: string; frequency: string };

export function pickHeadlineRow<T extends { value: unknown; dims?: Record<string, string> }>(rows: T[]): T | null {
  return rows.find((r) => !r.dims || Object.keys(r.dims).length === 0) ?? rows[0] ?? null;
}

export function topicTitle(t: Topic): string {
  return t.title;
}

export function fillFaq(
  text: string,
  figures: Record<string, LiveFigure | undefined>,
): string {
  return text
    .replace(/\{\{value:([^}]+)\}\}/g, (_, id: string) =>
      figures[id] ? Number(figures[id]!.value).toLocaleString("en-US", { maximumFractionDigits: 2 }) : "—")
    .replace(/\{\{period:([^}]+)\}\}/g, (_, id: string) => figures[id]?.date ?? "—");
}

export const TOPICS_INDEX_TITLE = "Bangladesh Economic Data by Topic | BanglaDataHub";
export const TOPICS_INDEX_DESCRIPTION =
  "Curated entry points to Bangladesh inflation, rates, remittances, reserves, trade, DSE, MFS, GDP and Census 2022 data.";

export function topicJsonLd(t: Topic, titles: Record<string, string>, faq: TopicFaq[]): object[] {
  return [
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faq.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    },
    {
      "@context": "https://schema.org",
      "@type": "Dataset",
      name: t.h1,
      description: t.description,
      variableMeasured: Object.values(titles),
    },
  ];
}

export function topicsIndexJsonLd(): object[] {
  return [{
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: TOPICS_INDEX_TITLE,
    description: TOPICS_INDEX_DESCRIPTION,
    hasPart: TOPICS.map((t) => ({ "@type": "WebPage", name: t.h1, url: `/topics/${t.slug}` })),
  }];
}
