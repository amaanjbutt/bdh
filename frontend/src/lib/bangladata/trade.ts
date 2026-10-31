/**
 * Trade product and partner pages — shared types, URLs and SEO.
 *
 * Pure module (no server imports): used by the /trade routes, the server functions, the
 * crawler renderer and the Worker entry (old /trade?code= links). Each page is one API call:
 * /v1/trade/product/{code}, /v1/trade/partner/{slug}, and the public /v1/trade/pages for the
 * two index pages. The API decides names, slugs and which pages are indexable; `slugify` here
 * mirrors backend/ingestion/trade_names.py so the explorer can link without a lookup.
 */

import { partnerSlug, slugify } from "./slugs";

export { partnerSlug, productCode, movedTradeLink, slugify } from "./slugs";

const SITE = "https://bangladatahub.com";
const SOURCE = { "@type": "Organization", name: "Bangladesh Bureau of Statistics" };

export type TradeFlow = "export" | "import";

export interface TradeYear {
  fy: number;
  fiscal_year: string;
  export_pkr_th: number | null;
  export_usd_th: number | null;
  import_pkr_th: number | null;
  import_usd_th: number | null;
  export_quantity?: number | null;
  import_quantity?: number | null;
}

export interface TradePartnerRow {
  country: string;
  path: string;
  value_pkr_th: number | null;
  value_usd_th: number | null;
  share_pct: number | null;
}

export interface TradeProductRef {
  code: string;
  name: string;
  path: string;
  indexable: boolean;
  export_usd_th: number;
  import_usd_th: number;
}

export interface TradeProductPage {
  code: string;
  level: "heading" | "code";
  classification: "HS" | "SITC";
  name: string;
  /** the full official HS text (headings, and codes that are an official HS item) */
  official_name: string | null;
  /** an 8-digit code's official HS 6-digit parent text */
  hs6_heading: string | null;
  /** PBS's own abbreviated wording (codes) */
  pbs_name: string | null;
  unit: string | null;
  chapter: { code: string; name: string } | null;
  heading: TradeProductRef | null;
  first_fy: number;
  last_fy: number;
  slug: string;
  path: string;
  indexable: boolean;
  fy: number;
  fiscal_year: string;
  latest_fy: number;
  recent: { years: number; export_usd_th: number; import_usd_th: number };
  history: TradeYear[];
  partners: Record<TradeFlow, TradePartnerRow[]>;
  related: TradeProductRef[];
}

export interface TradePartnerProduct {
  code: string;
  product: string | null;
  path: string;
  heading: string | null;
  unit: string | null;
  quantity: number | null;
  value_pkr_th: number | null;
  value_usd_th: number | null;
}

export interface TradePartnerPage {
  country: string;
  slug: string;
  path: string;
  indexable: boolean;
  first_fy: number;
  last_fy: number;
  fy: number;
  fiscal_year: string;
  latest_fy: number;
  export_usd_th: number;
  import_usd_th: number;
  rank: Record<TradeFlow, number | null>;
  share_pct: Record<TradeFlow, number | null>;
  partners_ranked: Record<TradeFlow, number>;
  history: TradeYear[];
  products: Record<TradeFlow, TradePartnerProduct[]>;
}

export interface TradePagesIndex {
  latest_fy: number;
  recent_years: number;
  chapters: Record<string, string>;
  data: {
    headings: (Omit<TradeProductRef, "indexable"> & { chapter: string })[];
    products: (Omit<TradeProductRef, "indexable"> & { heading: string })[];
    partners: { country: string; path: string; first_fy: number; last_fy: number; export_usd_th: number; import_usd_th: number }[];
  };
}

// ---- URLs -------------------------------------------------------------------------------

/** An 8-digit (or 7-digit SITC) code's page from its readable name. */
export function productPath(code: string, name: string | null | undefined): string {
  const slug = slugify(name ?? "");
  return slug ? `/trade/products/${code}-${slug}` : `/trade/products/${code}`;
}

export function partnerPath(country: string): string {
  return `/trade/partners/${partnerSlug(country)}`;
}

// ---- numbers ------------------------------------------------------------------------------

export const fyLabel = (fy: number) => `${fy - 1}-${String(fy).slice(2)}`;

/** US$ thousand -> "$3.38 bn" / "$412 mn" / "$12.4 mn" / "$350 k". */
export function usdTh(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const a = Math.abs(v);
  const sign = v < 0 ? "−" : "";
  const f = (n: number, d: number) => n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  if (a >= 1_000_000) return `${sign}$${f(a / 1_000_000, 2)} bn`;
  if (a >= 100_000) return `${sign}$${f(a / 1000, 0)} mn`;
  if (a >= 1000) return `${sign}$${f(a / 1000, 1)} mn`;
  if (a >= 1) return `${sign}$${f(a, 0)} k`;
  return v === 0 ? "$0" : `${sign}< $1 k`;
}

/** The same, in words for prose: "US$3.38 billion". */
export function usdWords(v: number | null | undefined): string {
  if (v == null) return "—";
  if (v > 0 && v < 1) return "less than US$1 thousand";
  return usdTh(v)
    .replace(/^\$/, "US$")
    .replace(/ bn$/, " billion")
    .replace(/ mn$/, " million")
    .replace(/ k$/, " thousand");
}

/** Tk thousand -> "Tk 944 bn". */
export function pkrTh(v: number | null | undefined): string {
  if (v == null) return "—";
  const a = Math.abs(v);
  const f = (n: number, d: number) => n.toLocaleString("en-US", { maximumFractionDigits: d });
  if (a >= 1_000_000_000) return `Tk ${f(v / 1_000_000_000, 2)} tn`;
  if (a >= 1_000_000) return `Tk ${f(v / 1_000_000, a >= 100_000_000 ? 0 : 1)} bn`;
  if (a >= 1000) return `Tk ${f(v / 1000, 1)} mn`;
  return `Tk ${f(v, 0)} k`;
}

export const pct = (v: number | null | undefined, d = 1) =>
  v == null ? "—" : `${v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d })}%`;

export function ordinal(n: number): string {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${suffix}`;
}

export function ordinalLargest(n: number | null | undefined): string | null {
  if (!n) return null;
  return n === 1 ? "largest" : `${ordinal(n)}-largest`;
}

const UNIT_WORDS: Record<string, string> = {
  KG: "kg", MT: "tonnes", NO: "units", DOZ: "dozen", SQM: "sq m", LTR: "litres", GR: "grams", GM: "grams",
  CUBM: "cubic m", PAIR: "pairs", PRS: "pairs", CARAT: "carats", MTR: "metres", M: "metres", THNO: "thousand units",
  "TH NO": "thousand units", KWH: "kWh", MMBTU: "MMBTU",
};
export const unitWord = (u: string | null | undefined) => (u ? UNIT_WORDS[u.toUpperCase()] ?? u.toLowerCase() : "");
const UNIT_ONE: Record<string, string> = { tonnes: "tonne", units: "unit", litres: "litre", grams: "gram", pairs: "pair", carats: "carat", metres: "metre", "thousand units": "thousand units" };
export const unitOne = (u: string | null | undefined) => {
  const w = unitWord(u);
  return UNIT_ONE[w] ?? w;
};

/** "Rice basmati" -> "rice basmati"; acronyms ("LPG …", "T-shirts") keep their case. */
export function lowerFirst(name: string): string {
  return /^[A-Z][a-z]/.test(name) ? name[0]!.toLowerCase() + name.slice(1) : name;
}

/** A short form of a name for prose lists: its first two parts, within `max` characters
 *  ("Oil seeds; sesamum seeds, whether or not broken" -> "oil seeds, sesamum seeds"). */
export function shortName(name: string | null | undefined, max = 40): string {
  let s = (name ?? "").trim().replace(/;\s*/g, ", ").split(", ").slice(0, 2).join(", ");
  if (s.length > max) {
    const comma = s.lastIndexOf(",", max);
    const space = s.lastIndexOf(" ", max);
    s = comma > 10 ? s.slice(0, comma) : space > 10 ? s.slice(0, space) : s.slice(0, max);
  }
  return lowerFirst(s.replace(/[\s,;]+$/, ""));
}

/** "a, b and c" — or "a; b and c" when an item has a comma of its own. */
function listing(items: string[]): string {
  if (items.length <= 1) return items.join("");
  const sep = items.some((i) => i.includes(",")) ? "; " : ", ";
  return `${items.slice(0, -1).join(sep)} and ${items.at(-1)}`;
}

export function yearOf(history: TradeYear[], fy: number): TradeYear | null {
  return history.find((h) => h.fy === fy) ?? null;
}

/** The flow a product is mostly about, and whether the other one matters too. */
export function mainFlow(ex: number, im: number): { flow: TradeFlow; both: boolean } {
  const flow: TradeFlow = im > ex ? "import" : "export";
  const lo = Math.min(ex, im);
  return { flow, both: lo > 0 && lo >= 0.3 * Math.max(ex, im) };
}

export function change(now: number | null | undefined, before: number | null | undefined): number | null {
  return now != null && before ? ((now - before) / before) * 100 : null;
}

// ---- SEO ------------------------------------------------------------------------------------

type Faq = { q: string; a: string };

function faqLd(faq: Faq[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };
}

function crumbs(items: [string, string][]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map(([name, url], i) => ({ "@type": "ListItem", position: i + 1, name, item: url })),
  };
}

const SOURCE_NOTE =
  "From the Bangladesh Bureau of Statistics' customs record of every shipment, by product code and partner country, for each fiscal year (July to June). Values are in takas as published; the US-dollar figures use the year's average SBP exchange rate.";

/** "Bangladesh rice exports by country" — the H1, and the title before its years. */
export function productHeadline(p: TradeProductPage): string {
  const { flow, both } = mainFlow(p.recent.export_usd_th, p.recent.import_usd_th);
  const verb = both ? "exports and imports" : flow === "export" ? "exports" : "imports";
  return `Bangladesh ${lowerFirst(p.name)} ${verb} by country`;
}

export function productSeo(p: TradeProductPage) {
  const { flow } = mainFlow(p.recent.export_usd_th, p.recent.import_usd_th);
  const noun = lowerFirst(p.name);
  const title = `${productHeadline(p)}, ${p.first_fy - 1}–${p.last_fy} | BanglaDataHub`;
  const y = yearOf(p.history, p.fy);
  const fyl = `FY${p.fiscal_year}`;
  const top = (f: TradeFlow, n: number) =>
    p.partners[f].slice(0, n).map((r) => `${r.country} (${pct(r.share_pct, 0)})`);
  const ex = y?.export_usd_th ?? null;
  const im = y?.import_usd_th ?? null;
  const lead =
    flow === "export" && ex
      ? `Bangladesh exported ${usdWords(ex)} of ${noun} in ${fyl}${top("export", 3).length ? ` — top buyers ${listing(top("export", 3))}` : ""}.`
      : im
        ? `Bangladesh imported ${usdWords(im)} of ${noun} in ${fyl}${top("import", 3).length ? `, mostly from ${listing(top("import", 3))}` : ""}.`
        : `Bangladesh's trade in ${noun}.`;
  const description = `${lead} Exports and imports by partner country for every year since ${fyLabel(p.first_fy)}, from official PBS customs data.`;
  const url = `${SITE}${p.path}`;
  const faq = productFaq(p, noun, flow);
  const jsonLd: object[] = [
    {
      "@context": "https://schema.org",
      "@type": "Dataset",
      name: `Bangladesh ${noun} exports and imports by country (${p.level === "heading" ? "HS" : p.classification} ${p.code}), FY${fyLabel(p.first_fy)} to FY${fyLabel(p.last_fy)}`,
      description,
      url,
      creator: SOURCE,
      publisher: { "@id": `${SITE}/#org` },
      license: `${SITE}/terms`,
      temporalCoverage: `${p.first_fy - 1}-07-01/${p.last_fy}-06-30`,
      spatialCoverage: "Bangladesh",
      variableMeasured: [`Exports of ${noun} (US$, Rs)`, `Imports of ${noun} (US$, Rs)`],
      isAccessibleForFree: true,
      distribution: [
        {
          "@type": "DataDownload",
          encodingFormat: "application/json",
          contentUrl: `https://api.bangladatahub.com/v1/trade/product/${p.code}`,
        },
      ],
    },
    faqLd(faq),
    crumbs([
      ["Trade", `${SITE}/trade`],
      ["Products", `${SITE}/trade/products`],
      ...(p.heading ? ([[p.heading.name, `${SITE}${p.heading.path}`]] as [string, string][]) : []),
      [p.name, url],
    ]),
  ];
  return { title, description, url, faq, jsonLd, robots: p.indexable ? undefined : "noindex,follow" };
}

function productFaq(p: TradeProductPage, noun: string, flow: TradeFlow): Faq[] {
  const y = yearOf(p.history, p.fy);
  const prev = yearOf(p.history, p.fy - 1);
  const fyl = `FY${p.fiscal_year}`;
  const faq: Faq[] = [];
  const amount = (f: TradeFlow) => {
    const now = y?.[`${f}_usd_th`] ?? null;
    if (!now) return null;
    const was = prev?.[`${f}_usd_th`] ?? null;
    const ch = change(now, was);
    const qty = y?.[`${f}_quantity`];
    return `In ${fyl} Bangladesh ${f === "export" ? "exported" : "imported"} ${usdWords(now)} of ${noun} (${pkrTh(y?.[`${f}_pkr_th`])})${
      qty && p.unit ? `, ${Math.round(qty).toLocaleString("en-US")} ${unitWord(p.unit)}` : ""
    }${ch != null && was ? `, ${ch >= 0 ? "up" : "down"} ${Math.abs(ch).toFixed(0)}% from ${usdWords(was)} the year before` : ""}.`;
  };
  const order: TradeFlow[] = flow === "export" ? ["export", "import"] : ["import", "export"];
  for (const f of order) {
    const a = amount(f);
    if (a) faq.push({ q: `How much ${noun} does Bangladesh ${f}?`, a });
  }
  for (const f of order) {
    const rows = p.partners[f].slice(0, 5);
    if (!rows.length) continue;
    faq.push({
      q: f === "export" ? `Which countries buy Bangladesh's ${noun}?` : `Where does Bangladesh import ${noun} from?`,
      a: `The largest ${f === "export" ? "buyers" : "suppliers"} in ${fyl} were ${listing(
        rows.map((r) => `${r.country} (${pct(r.share_pct)} — ${usdWords(r.value_usd_th)})`),
      )}.`,
    });
  }
  faq.push({ q: "Where do these figures come from?", a: SOURCE_NOTE });
  return faq;
}

export function partnerSeo(p: TradePartnerPage) {
  const c = p.country;
  const title = `Bangladesh–${c} trade: exports and imports by product, ${p.first_fy - 1}–${p.last_fy} | BanglaDataHub`;
  const y = yearOf(p.history, p.fy);
  const fyl = `FY${p.fiscal_year}`;
  const ex = y?.export_usd_th ?? null;
  const im = y?.import_usd_th ?? null;
  const roles = [
    ordinalLargest(p.rank.export) && ex ? `its ${ordinalLargest(p.rank.export)} export market` : null,
    ordinalLargest(p.rank.import) && im ? `its ${ordinalLargest(p.rank.import)} supplier` : null,
  ].filter((x): x is string => !!x);
  const parts = [
    ex ? `exported ${usdWords(ex)} to ${c}` : null,
    im ? `imported ${usdWords(im)} from ${c}` : null,
  ].filter(Boolean);
  const topEx = p.products.export.slice(0, 3).map((r) => shortName(r.product, 32));
  const topIm = p.products.import.slice(0, 3).map((r) => shortName(r.product, 32));
  const lead = parts.length
    ? `Bangladesh ${parts.join(" and ")} in ${fyl}${roles.length ? ` — ${listing(roles)}` : ""}.`
    : `Bangladesh's trade with ${c}.`;
  const tops = [topEx.length ? `Top exports: ${listing(topEx)}.` : "", topIm.length ? `Top imports: ${listing(topIm)}.` : ""]
    .filter(Boolean)
    .join(" ");
  const description = `${lead} ${tops} Every product, every year since ${fyLabel(p.first_fy)}.`.replace(/\s+/g, " ");
  const url = `${SITE}${p.path}`;
  const faq = partnerFaq(p);
  const jsonLd: object[] = [
    {
      "@context": "https://schema.org",
      "@type": "Dataset",
      name: `Bangladesh's trade with ${c} by product, FY${fyLabel(p.first_fy)} to FY${fyLabel(p.last_fy)}`,
      description,
      url,
      creator: SOURCE,
      publisher: { "@id": `${SITE}/#org` },
      license: `${SITE}/terms`,
      temporalCoverage: `${p.first_fy - 1}-07-01/${p.last_fy}-06-30`,
      spatialCoverage: ["Bangladesh", c],
      variableMeasured: [`Bangladesh's exports to ${c} (US$, Rs)`, `Bangladesh's imports from ${c} (US$, Rs)`],
      isAccessibleForFree: true,
      distribution: [
        {
          "@type": "DataDownload",
          encodingFormat: "application/json",
          contentUrl: `https://api.bangladatahub.com/v1/trade/partner/${p.slug}`,
        },
      ],
    },
    faqLd(faq),
    crumbs([
      ["Trade", `${SITE}/trade`],
      ["Partners", `${SITE}/trade/partners`],
      [c, url],
    ]),
  ];
  return { title, description, url, faq, jsonLd, robots: p.indexable ? undefined : "noindex,follow" };
}

function partnerFaq(p: TradePartnerPage): Faq[] {
  const c = p.country;
  const y = yearOf(p.history, p.fy);
  const fyl = `FY${p.fiscal_year}`;
  const faq: Faq[] = [];
  const ex = y?.export_usd_th ?? null;
  const im = y?.import_usd_th ?? null;
  if (ex || im) {
    const bal = (ex ?? 0) - (im ?? 0);
    const ranks = [
      p.rank.export ? `${ordinal(p.rank.export)} of ${p.partners_ranked.export} export destinations` : null,
      p.rank.import ? `${ordinal(p.rank.import)} of ${p.partners_ranked.import} suppliers` : null,
    ].filter((x): x is string => !!x);
    faq.push({
      q: `How much does Bangladesh trade with ${c}?`,
      a: `In ${fyl} Bangladesh exported ${usdWords(ex ?? 0)} to ${c} and imported ${usdWords(im ?? 0)} from it — a ${
        bal >= 0 ? "surplus" : "deficit"
      } of ${usdWords(Math.abs(bal))}.${ranks.length ? ` ${c} ranked ${listing(ranks)}.` : ""}`,
    });
  }
  const list = (rows: TradePartnerProduct[]) =>
    listing(rows.slice(0, 5).map((r) => `${shortName(r.product, 48)} (${usdWords(r.value_usd_th)})`));
  if (p.products.export.length)
    faq.push({ q: `What does Bangladesh export to ${c}?`, a: `The largest exports to ${c} in ${fyl} were ${list(p.products.export)}.` });
  if (p.products.import.length)
    faq.push({ q: `What does Bangladesh import from ${c}?`, a: `The largest imports from ${c} in ${fyl} were ${list(p.products.import)}.` });
  faq.push({ q: "Where do these figures come from?", a: SOURCE_NOTE });
  return faq;
}

export const PRODUCTS_INDEX_TITLE = "Bangladesh exports and imports by product (HS codes) | BanglaDataHub";
export const PRODUCTS_INDEX_DESCRIPTION =
  "Every product Bangladesh trades, by HS heading and customs code: yearly exports and imports with every partner country since 2002-03, from official PBS customs data.";
export const PARTNERS_INDEX_TITLE = "Bangladesh's trading partners: exports and imports by country | BanglaDataHub";
export const PARTNERS_INDEX_DESCRIPTION =
  "Every country Bangladesh trades with: yearly exports and imports since 1990-91 and what is bought and sold with each, from official PBS customs data.";

export function indexJsonLd(kind: "products" | "partners", title: string, description: string): object[] {
  const url = `${SITE}/trade/${kind}`;
  return [
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: title,
      description,
      url,
      isPartOf: { "@id": `${SITE}/#website` },
    },
    crumbs([
      ["Trade", `${SITE}/trade`],
      [kind === "products" ? "Products" : "Partners", url],
    ]),
  ];
}
