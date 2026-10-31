/**
 * Wholesale (mandi) prices — Punjab and Sindh — shared types, page models and SEO.
 *
 * Pure module (no server imports): used by the /mandi routes, the server functions and the
 * crawler renderer. The API already serves readable names (`name`), the Urdu name
 * (`urdu_name`) and one crop identity across provinces (`crop`, a Punjab commodity slug):
 * a commodity page is a CROP page and lists Punjab's markets and Sindh's graded varieties
 * together. Every price on the site is Tk per kg (Punjab reports per 100 kg, Sindh per kg);
 * dozen-priced fruit stays per dozen.
 */

export type Province = "Punjab" | "Sindh";

export interface AgriMarket {
  market_id: number;
  name: string;
  slug: string;
  is_major: boolean;
  province: Province;
  region?: string | null;
  district?: string | null;
  first_date: string | null;
  last_date: string | null;
}

export interface AgriCommodity {
  commodity_id: number;
  name: string;
  urdu_name?: string | null;
  slug: string;
  /** the crop this commodity belongs to (a Punjab commodity slug, or its own slug) */
  crop?: string;
  category: string | null;
  unit: string;
  province: Province;
}

export interface AgriPrice {
  date: string;
  market: string;
  market_id: number;
  market_slug?: string;
  region?: string | null;
  commodity: string;
  commodity_id: number;
  commodity_slug?: string;
  province?: Province;
  min: number | null;
  max: number | null;
  fqp: number | null;
  fqp_per_kg?: number | null;
  quantity: number | null;
  unit: string;
}

export const MANDI_CATEGORIES = ["Vegetables", "Fruits", "Grains"] as const;
export const PROVINCES: Province[] = ["Punjab", "Sindh"];

/** Commodities people search for most — featured on the hub. */
export const POPULAR_COMMODITIES = [
  "onion", "tomato", "potato_fresh", "wheat", "garlic_local", "ginger_china",
  "green_chilli", "lemon_desi", "banana_dozen", "sugar", "rice_basmati_super_new", "masoor_pulse_local_bareek",
];

/** The market a page opens on, per province. */
export const DEFAULT_MARKET: Record<Province, string> = { Punjab: "lahore", Sindh: "sindh_karachi" };

/** "pkr_per_100kg" → "kg"; "pkr_per_dozen" → "dozen". The unit every site price is shown in. */
export function displayPer(unit: string): "kg" | "dozen" {
  return unit === "pkr_per_dozen" ? "dozen" : "kg";
}

/** A price in the site's unit: Tk per kg (from per-100-kg or per-kg), or Tk per dozen. */
export function toDisplay(value: number | null, unit: string): number | null {
  if (value == null) return null;
  if (unit === "pkr_per_100kg") return value / 100;
  return value;
}

/** "pkr_per_100kg" → "Tk per 100 kg" — the unit the source reports in (API docs, CSV). */
export function mandiUnit(unit: string): string {
  if (unit === "pkr_per_100kg") return "Tk per 100 kg";
  if (unit.startsWith("pkr_per_")) return `Tk per ${unit.slice(8).replace(/(\d+)kg/, "$1 kg")}`;
  return unit;
}

export function median(values: number[]): number | null {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid]! : (v[mid - 1]! + v[mid]!) / 2;
}

// ---- crops (one page per crop, both provinces) -----------------------------------

export interface Crop {
  slug: string;
  name: string;
  urdu: string | null;
  category: string | null;
  per: "kg" | "dozen";
  provinces: Province[];
}

/** Every crop page: Punjab commodities, plus Sindh commodities that have no Punjab twin. */
export function crops(commodities: AgriCommodity[]): Crop[] {
  const out = new Map<string, Crop>();
  const sorted = [...commodities].sort((a, b) => (a.province === b.province ? 0 : a.province === "Punjab" ? -1 : 1));
  for (const c of sorted) {
    const key = c.crop ?? c.slug;
    const have = out.get(key);
    if (have) {
      if (!have.provinces.includes(c.province)) have.provinces.push(c.province);
      have.urdu = have.urdu ?? c.urdu_name ?? null;
      continue;
    }
    out.set(key, {
      slug: key,
      name: c.name,
      urdu: c.urdu_name ?? null,
      category: c.category,
      per: displayPer(c.unit),
      provinces: [c.province],
    });
  }
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
}

// ---- shared page model (React routes, server functions and the crawler renderer) ----

export interface MarketPrice {
  market: string;
  marketSlug: string;
  province: Province;
  /** the variety / grade when it differs from the crop's name ("Onion, Grade 1") */
  variety: string | null;
  commoditySlug: string;
  major: boolean;
  date: string;
  /** Tk per kg (or per dozen) */
  price: number;
  min: number | null;
  max: number | null;
}

export interface CommoditySummary {
  markets: number;
  median: number | null;
  low: MarketPrice | null;
  high: MarketPrice | null;
  asOf: string | null;
}

/** /v1/agri/latest rows for one crop → readable rows in Rs/kg, dearest first. */
export function marketRows(latest: AgriPrice[], markets: AgriMarket[], cropName: string): MarketPrice[] {
  const byId = new Map(markets.map((x) => [x.market_id, x]));
  return latest
    .filter((r) => r.fqp != null)
    .map((r) => {
      const mk = byId.get(r.market_id);
      const province = (r.province ?? mk?.province ?? "Punjab") as Province;
      return {
        market: mk?.name ?? r.market,
        marketSlug: mk?.slug ?? r.market_slug ?? String(r.market_id),
        province,
        variety: r.commodity && r.commodity.toLowerCase() !== cropName.toLowerCase() ? r.commodity : null,
        commoditySlug: r.commodity_slug ?? String(r.commodity_id),
        major: !!mk?.is_major,
        date: r.date,
        price: toDisplay(r.fqp, r.unit) as number,
        min: toDisplay(r.min, r.unit),
        max: toDisplay(r.max, r.unit),
      };
    })
    .sort((a, b) => b.price - a.price);
}

/** Headline figures: markets that reported within a week of the latest report; the
 *  cheapest/dearest call-outs skip one-off outliers (a stray 52 beside a 155 median is
 *  usually a quality grade or a typo) — tables still list every market. */
export function summarize(rows: MarketPrice[]): CommoditySummary {
  const asOf = rows.map((r) => r.date).sort().at(-1) ?? null;
  const weekAgo = asOf ? new Date(Date.parse(asOf) - 7 * 86_400_000).toISOString().slice(0, 10) : "";
  const current = rows.filter((r) => r.date >= weekAgo);
  const med = median(current.map((r) => r.price));
  const typical = med != null ? current.filter((r) => r.price >= med * 0.5 && r.price <= med * 2) : [];
  return {
    markets: new Set(current.map((r) => r.marketSlug)).size,
    median: med,
    low: typical.at(-1) ?? null,
    high: typical[0] ?? null,
    asOf,
  };
}

export interface HubRow {
  /** crop page the row links to */
  slug: string;
  name: string;
  urdu: string | null;
  category: string | null;
  per: "kg" | "dozen";
  date: string;
  price: number | null;
  min: number | null;
  max: number | null;
}

/** /mandi: every commodity's latest price in one market, Rs/kg. */
export function hubRows(latest: AgriPrice[], commodities: AgriCommodity[]): HubRow[] {
  const byId = new Map(commodities.map((c) => [c.commodity_id, c]));
  return latest
    .map((r) => {
      const c = byId.get(r.commodity_id);
      return {
        slug: c?.crop ?? c?.slug ?? String(r.commodity_id),
        name: r.commodity,
        urdu: c?.urdu_name ?? null,
        category: c?.category ?? null,
        per: displayPer(r.unit),
        date: r.date,
        price: toDisplay(r.fqp, r.unit),
        min: toDisplay(r.min, r.unit),
        max: toDisplay(r.max, r.unit),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ---- SEO ------------------------------------------------------------------------------

const SITE = "https://bangladatahub.com";
const SOURCE_ORGS = [
  { "@type": "Organization", name: "Directorate of Agriculture (Economics & Marketing), Punjab" },
  { "@type": "Organization", name: "Sindh Agriculture Department" },
];
const fmt0 = (n: number) => Math.round(n).toLocaleString("en-US");
const fmtD = (iso: string | null) =>
  iso
    ? new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      })
    : "";

export const HUB_TITLE = "Mandi rates today — Bangladesh wholesale prices | BanglaDataHub";
export const HUB_DESCRIPTION =
  "Today's wholesale (mandi) prices for vegetables, fruits and grains in Lahore, Karachi, Faisalabad, Multan, Hyderabad, Sukkur and every reporting market in Punjab and Sindh — official daily rates in takas per kg, free, with an API.";

export const HUB_FAQ = [
  {
    q: "Where do these mandi rates come from?",
    a: "From the provincial agriculture departments: each market committee in Punjab and Sindh reports the day's wholesale prices. Punjab's daily history goes back to May 2007; Sindh's starts in August 2026.",
  },
  {
    q: "What price is shown?",
    a: "The representative wholesale price of average-quality produce that day (Punjab calls it the fair-quality price), in takas per kg — bananas and some citrus per dozen. Sindh reports separate grades, which are listed as varieties.",
  },
  {
    q: "How is a wholesale price different from the retail price?",
    a: "Mandi rates are what traders pay at the wholesale market, before transport, the retailer's margin and wastage. Shop prices are higher. For weekly retail prices of essentials in 17 cities, see the commodity prices module.",
  },
  {
    q: "Can I get the data through an API?",
    a: "Yes. /v1/agri/latest returns today's prices for a market, a commodity or a whole crop across both provinces, and /v1/agri/prices the daily history as JSON or CSV. The market and commodity lists are public; prices need a free API key.",
  },
];

function faqLd(faq: { q: string; a: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };
}

export function hubJsonLd(): object[] {
  return [
    {
      "@context": "https://schema.org",
      "@type": "Dataset",
      name: "Bangladesh wholesale (mandi) prices — Punjab and Sindh daily rates",
      description: HUB_DESCRIPTION,
      url: `${SITE}/mandi`,
      creator: SOURCE_ORGS,
      publisher: { "@id": `${SITE}/#org` },
      license: `${SITE}/terms`,
      temporalCoverage: "2007-05-07/..",
      spatialCoverage: "Punjab and Sindh, Bangladesh",
      isAccessibleForFree: true,
      distribution: [
        {
          "@type": "DataDownload",
          encodingFormat: "text/csv",
          contentUrl: "https://api.bangladatahub.com/v1/agri/prices?commodity=onion&format=csv",
        },
      ],
    },
    faqLd(HUB_FAQ),
  ];
}

const where = (provinces: Province[]) => (provinces.length > 1 ? "Punjab and Sindh" : provinces[0] ?? "Punjab");

export function commodityFaq(c: Crop, s: CommoditySummary): { q: string; a: string }[] {
  const lower = c.name.toLowerCase();
  const since = c.provinces.includes("Punjab") ? "2007" : "August 2026";
  const out = [
    {
      q: `What is the wholesale price of ${lower} in Bangladesh today?`,
      a:
        s.median != null
          ? `On the latest reports (${fmtD(s.asOf)}), the median wholesale price of ${lower} across ${s.markets} ${
              s.markets === 1 ? "market" : "markets"
            } in ${where(c.provinces)} was Tk ${fmt0(s.median)} per ${c.per}.`
          : `No market has reported a ${lower} price in the last 30 days — it may be out of season.`,
    },
  ];
  if (s.low && s.high && s.markets > 1)
    out.push({
      q: `Which market has the cheapest ${lower}?`,
      a: `Among markets reporting this week, ${s.low.market} had the lowest price (Tk ${fmt0(s.low.price)} per ${c.per}) and ${s.high.market} the highest (Tk ${fmt0(s.high.price)}).`,
    });
  out.push(
    {
      q: `How far back does the ${lower} price history go?`,
      a: `Daily ${lower} prices go back to ${since} in the markets that trade it. This page charts the last year; the full daily history is available through the BanglaDataHub API.`,
    },
    {
      q: "Where does this data come from?",
      a: "From the agriculture departments of Punjab and Sindh, whose market committees report each day's wholesale price of average-quality produce.",
    },
  );
  return out;
}

export function commoditySeo(c: Crop, s: CommoditySummary) {
  const title = `${c.name} wholesale price in Bangladesh today — mandi rates | BanglaDataHub`;
  const price = s.median != null ? ` Median Tk ${fmt0(s.median)}/${c.per} on ${fmtD(s.asOf)}.` : "";
  const description = `${c.name} mandi rates today in every market in ${where(c.provinces)} that trades it, in takas per ${c.per}, with a year of daily prices — official data.${price}`;
  const url = `${SITE}/mandi/${c.slug}`;
  const faq = commodityFaq(c, s);
  const jsonLd: object[] = [
    {
      "@context": "https://schema.org",
      "@type": "Dataset",
      name: `${c.name} wholesale prices in Bangladesh (daily, ${where(c.provinces)})`,
      description,
      url,
      creator: c.provinces.map((p) => SOURCE_ORGS[p === "Punjab" ? 0 : 1]),
      publisher: { "@id": `${SITE}/#org` },
      license: `${SITE}/terms`,
      temporalCoverage: `${c.provinces.includes("Punjab") ? "2007-05-07" : "2026-08-17"}/..`,
      spatialCoverage: `${where(c.provinces)}, Bangladesh`,
      variableMeasured: `${c.name} wholesale price (Tk per ${c.per})`,
      isAccessibleForFree: true,
      distribution: [
        {
          "@type": "DataDownload",
          encodingFormat: "text/csv",
          contentUrl: `https://api.bangladatahub.com/v1/agri/prices?commodity=${c.slug}&format=csv`,
        },
      ],
    },
    faqLd(faq),
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Mandi rates", item: `${SITE}/mandi` },
        { "@type": "ListItem", position: 2, name: c.name, item: url },
      ],
    },
  ];
  return { title, description, url, faq, jsonLd };
}
