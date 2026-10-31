import { MODULE_BY_SLUG, toFrontendModule } from "./catalog";
import { fmtDate, frequencyLabel } from "./format";
import { seriesDepth } from "./series-depth";
import { brandTitle, shortTitle } from "./series-title";
import type { CatalogRecord, Frequency } from "./types";

/**
 * Series-page SEO, shared by the React route (`series.$seriesId.tsx` head()) and
 * the lightweight crawler renderer (`bot-render.ts`), so both emit the same
 * title, description and JSON-LD. Pure: no React, no fetching.
 */

// Keyword-rich, human module labels for titles/descriptions/schema. Covers both
// the frontend slugs and the raw API module names (in case a record isn't
// normalized) so every series page gets specific entity context
// instead of a bare leaf name like "Nigeria".
export const MODULE_SEO: Record<string, string> = {
  forex: "Exchange Rates",
  inflation: "Inflation & Prices",
  prices: "Inflation & Prices",
  commodities: "Commodity Prices",
  payments: "Digital Payments",
  alternate: "Digital Payments & Alternate Data",
  rates: "Interest Rates & Yields",
  "fixed-income": "Interest Rates & Yields",
  funds: "Mutual Funds",
  securities: "Debt Securities",
  external: "Balance of Payments & Trade",
  monetary: "Money & Banking",
  real: "Real Economy",
  fiscal: "Public Finance",
  "public-finance": "Public Finance",
  debt: "Debt & Savings",
  social: "Population & Society",
  economic: "Economy",
  energy: "Energy & Fuel",
  regional: "Districts",
};

export type SeoRecord = {
  id: string;
  name: string;
  description?: string;
  module: string;
  frequency: string;
  first_date?: string | null;
  source: string;
  /** Title core resolved on the server (series-title.server.ts); absent → shortTitle(name). */
  seo_title?: string | null;
};

/** Compose SEO metadata for a series. The <title> is short and query-shaped
 *  (series-title.ts: a hand-written title, or the name with the BB boilerplate
 *  dropped, ≤ 60 chars); the full official name and the dataset context move to the
 *  meta description, which leads with them. */
export function composeSeriesSeo(r: SeoRecord) {
  const name = (r.name || r.id).replace(/\s+/g, " ").trim();
  const desc = (r.description || "").replace(/\s+/g, " ").trim();
  const modProper = MODULE_SEO[r.module] || MODULE_BY_SLUG[r.module]?.name || "Economic Data";
  const modLower = modProper.toLowerCase();
  const alnum = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const subject = (r.seo_title || shortTitle(name)).trim();
  const title = brandTitle(subject);
  // Lead with the official name unless the publisher's description already says it.
  let lead = !desc ? name : alnum(desc).includes(alnum(name)) ? desc : `${name}: ${desc}`;
  if (lead.length > 240) lead = `${lead.slice(0, 239).replace(/\s+\S*$/, "")}…`;
  const description = `${lead.replace(/[.\s]+$/, "")} — a Bangladesh ${modLower} time series (${frequencyLabel(
    r.frequency as Frequency,
  )}${r.first_date ? `, ${fmtDate(r.first_date)}–present` : ""}) from ${r.source}. Chart, latest value and the full history as JSON or CSV via the BanglaDataHub API.`;
  const keywords = Array.from(
    new Set(
      [
        subject,
        name,
        `Bangladesh ${modLower}`,
        "Bangladesh economic data",
        "Bangladesh data API",
        r.id,
        `${modProper} API`,
        "JSON",
        "CSV",
      ].filter((k): k is string => !!k && k.length > 1),
    ),
  );
  return { title, description, subject, keywords };
}

// A series is "discontinued" once it is far past its normal release lag — e.g. a
// monthly series with nothing for 13+ months. ~2,600 active BB series are genuine
// history (old base years, retired tables, census rounds); say so plainly rather than
// let a 2010 value read as current.
const DISCONTINUED_AFTER_DAYS: Record<string, number> = {
  daily: 90, weekly: 120, fortnightly: 400, monthly: 400, quarterly: 550, half_yearly: 900, annual: 1100, irregular: 1825,
};

export function discontinuedSince(lastDate: string | null | undefined, frequency: string): string | null {
  if (!lastDate) return null;
  const limit = DISCONTINUED_AFTER_DAYS[(frequency || "").toLowerCase()] ?? 1100;
  const ageDays = (Date.now() - new Date(lastDate).getTime()) / 86_400_000;
  return ageDays > limit ? lastDate.slice(0, 4) : null;
}

/** Canonical id + whether this page is a label-duplicate twin (noindex,follow). */
export function seriesCanonical(r: CatalogRecord | undefined, id: string) {
  const canonicalId = (r && r.canonical_id) || id;
  const isDupe = !!(r && r.canonical_id && r.canonical_id !== id);
  return { canonicalId, isDupe };
}

/** The three JSON-LD objects every series page carries: Dataset, FAQPage, BreadcrumbList. */
export function seriesJsonLd(r: CatalogRecord): object[] {
  const seo = composeSeriesSeo(r);
  // Google Dataset requires description length 50–5000. The raw catalog
  // description is sometimes shorter (a 46-char yield-curve leaf) or very long
  // (merged vintages) — fall back to the composed SEO description and hard-cap.
  const rawDesc = (r.description || "").trim();
  let datasetDescription = rawDesc.length >= 50 && rawDesc.length <= 5000 ? rawDesc : seo.description;
  if (datasetDescription.length > 5000) datasetDescription = datasetDescription.slice(0, 4997) + "…";
  const modSlug = toFrontendModule(r.module);
  const modName = MODULE_BY_SLUG[modSlug]?.name ?? r.module;
  return [
    {
      "@context": "https://schema.org",
      "@type": "Dataset",
      name: seo.subject,
      alternateName: r.name,
      description: datasetDescription,
      identifier: r.id,
      keywords: seo.keywords,
      url: `https://bangladatahub.com/series/${r.id}`,
      temporalCoverage: r.first_date && r.last_date ? `${r.first_date}/${r.last_date}` : undefined,
      datePublished: r.first_date || undefined,
      dateModified: r.last_date || undefined,
      spatialCoverage: { "@type": "Place", name: "Bangladesh" },
      variableMeasured: r.name,
      measurementTechnique: "Official published statistics",
      creator: { "@type": "Organization", name: r.source || "BanglaDataHub" },
      publisher: { "@id": "https://bangladatahub.com/#org" },
      license: "https://bangladatahub.com/terms",
      includedInDataCatalog: {
        "@type": "DataCatalog",
        name: "BanglaDataHub",
        url: "https://bangladatahub.com/coverage",
      },
      isAccessibleForFree: r.tier === "free",
      distribution: [
        {
          "@type": "DataDownload",
          encodingFormat: "application/json",
          contentUrl: `https://api.bangladatahub.com/v1/series/${r.id}`,
        },
        {
          "@type": "DataDownload",
          encodingFormat: "text/csv",
          contentUrl: `https://api.bangladatahub.com/v1/series/${r.id}?format=csv`,
        },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: seriesDepth(r).faq.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Data", item: "https://bangladatahub.com/coverage" },
        { "@type": "ListItem", position: 2, name: modName, item: `https://bangladatahub.com/data/${modSlug}` },
        { "@type": "ListItem", position: 3, name: r.name, item: `https://bangladatahub.com/series/${r.id}` },
      ],
    },
  ];
}
