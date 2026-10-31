import { MODULES, MODULE_BY_SLUG, moduleSeriesCount, toBackendModule, toFrontendModule } from "./catalog";
import { assembleProfile, districtSlug, fmtIndicator, type DistrictPayload } from "./districts";
import { changeBetween, fmtCount, fmtDate, fmtNumber, fmtValue, frequencyLabel, periodLabel, unitLabel } from "./format";
import {
  DEFAULT_MARKET,
  HUB_DESCRIPTION,
  HUB_FAQ,
  HUB_TITLE,
  MANDI_CATEGORIES,
  commoditySeo,
  crops,
  hubJsonLd,
  hubRows,
  marketRows,
  summarize,
  type AgriCommodity,
  type AgriMarket,
  type AgriPrice,
} from "./mandi";
import { getModuleContent } from "./module-content";
import { getSeriesContent } from "./series-content";
import { moduleDepth, seriesDepth } from "./series-depth";
import { composeSeriesSeo, discontinuedSince, seriesCanonical, seriesJsonLd } from "./seo";
import { resolveSeriesTitle } from "./series-title.server";
import { cardFigure, figurePeriod, hubLabel, topicFaq } from "./topic-page";
import {
  TOPICS,
  TOPICS_INDEX_DESCRIPTION,
  TOPICS_INDEX_TITLE,
  TOPIC_BY_SLUG,
  TOPIC_OF_SERIES,
  pickHeadlineRow,
  topicJsonLd,
  topicLiveIds,
  topicSeriesIds,
  topicTitle,
  topicsIndexJsonLd,
  type LiveFigure,
  type Topic,
} from "./topics";
import {
  PARTNERS_INDEX_DESCRIPTION,
  PARTNERS_INDEX_TITLE,
  PRODUCTS_INDEX_DESCRIPTION,
  PRODUCTS_INDEX_TITLE,
  fyLabel,
  indexJsonLd,
  mainFlow,
  partnerSeo,
  pct,
  pkrTh,
  productCode,
  productHeadline,
  productSeo,
  unitWord,
  usdTh,
  yearOf,
  type TradeFlow,
  type TradePagesIndex,
  type TradePartnerPage,
  type TradeProductPage,
} from "./trade";
import type { CatalogRecord, Frequency, Observation } from "./types";
import type { CrossSection } from "./cross-section";

/**
 * Lightweight crawler rendering — the free-tier Workers CPU fix.
 *
 * A cold React SSR of a /series or /data page (router + full component tree +
 * the 5,000-row series payload) blows the free plan's 10ms CPU cap, so crawlers
 * hitting the ~16k-URL sitemap got 5xx and pages didn't index. For crawler user
 * agents on a cache miss, server.ts calls this instead: plain template strings,
 * two or three small API calls (network wait isn't CPU), no React.
 *
 * Content-equivalent to the human page — same title, description, canonical,
 * JSON-LD (shared seo.ts), H1, latest value, description, use cases, metadata,
 * API snippet, related-series links and FAQ — minus the interactive chart. It is
 * not cloaking: nothing is shown to bots that people can't see. Returns null to
 * fall through to normal SSR (unknown id, API down, out-of-scope path).
 */

// Search + AI crawlers. Plain substrings, case-insensitive.
export const BOT_UA =
  /googlebot|google-inspectiontool|googleother|google-extended|adsbot-google|mediapartners-google|storebot-google|bingbot|bingpreview|msnbot|duckduckbot|yandex|baiduspider|applebot|gptbot|oai-searchbot|chatgpt-user|claudebot|claude-user|claude-searchbot|anthropic-ai|perplexitybot|perplexity-user|ccbot|amazonbot|bytespider|petalbot|seznambot|ahrefsbot|semrushbot|mj12bot|dotbot|facebookexternalhit|linkedinbot|twitterbot|slackbot|discordbot|whatsapp|telegrambot|cohere-ai|youbot|diffbot|meta-externalagent|timpibot|imagesiftbot/i;

const SERIES_PATH = /^\/series\/([^/]+)\/?$/;
const MODULE_PATH = /^\/data\/([^/]+)\/?$/;
const MANDI_HUB_PATH = /^\/mandi\/?$/;
const MANDI_PATH = /^\/mandi\/([a-z0-9_]+)\/?$/;
const DISTRICTS_PATH = /^\/districts\/?$/;
const DISTRICT_PATH = /^\/districts\/([a-z0-9-]+)\/?$/;
const TRADE_PRODUCTS_PATH = /^\/trade\/products\/?$/;
const TRADE_PRODUCT_PATH = /^\/trade\/products\/([0-9][a-z0-9-]*)\/?$/;
const TRADE_PARTNERS_PATH = /^\/trade\/partners\/?$/;
const TRADE_PARTNER_PATH = /^\/trade\/partners\/([a-z0-9-]+)\/?$/;
const TOPICS_PATH = /^\/topics\/?$/;
const TOPIC_PATH = /^\/topics\/([a-z0-9-]+)\/?$/;
const SITE = "https://bangladatahub.com";
const MODULE_PAGE_SIZE = 120; // must match getModulePage

export function isBot(userAgent: string | null): boolean {
  return !!userAgent && BOT_UA.test(userAgent);
}

export function botRenderable(pathname: string): boolean {
  return (
    SERIES_PATH.test(pathname) ||
    MODULE_PATH.test(pathname) ||
    DISTRICTS_PATH.test(pathname) ||
    DISTRICT_PATH.test(pathname) ||
    TOPICS_PATH.test(pathname) ||
    TOPIC_PATH.test(pathname)
  );
}

// ---- API (same env + timeout as client.server.ts, without the fixture fallbacks)

async function api<T>(path: string, keyed: boolean): Promise<T | null> {
  const root = (process.env["BANGLADATA_API_BASE"] || "").replace(/\/$/, "");
  if (!root) return null;
  const headers: Record<string, string> = { accept: "application/json" };
  if (keyed) {
    const key = process.env["BANGLADATA_API_KEY"];
    if (!key) return null;
    headers["X-API-Key"] = key;
  }
  try {
    const res = await fetch(`${root}${path}`, { headers, signal: AbortSignal.timeout(6000) });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

// ---- HTML helpers

export function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// JSON-LD inside <script>: escape "<" so a value can never close the tag.
function ld(o: object): string {
  return `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, "\\u003c")}</script>`;
}

const NAV = [
  ["/", "BanglaDataHub"],
  ["/coverage", "Data catalog"],
  ["/topics", "Topics"],
  ["/mandi", "Mandi rates"],
  ["/trade", "Trade by product"],
  ["/districts", "Districts"],
  ["/energy", "Energy"],
  ["/funds", "Mutual funds"],
  ["/tools", "Tools"],
  ["/docs", "Docs & API reference"],
  ["/guides", "API guides"],
  ["/blog", "Blog"],
  ["/pricing", "Pricing"],
  ["/status", "Status"],
] as const;

function page(opts: {
  title: string;
  description: string;
  canonical: string;
  robots?: string | undefined;
  links?: { rel: string; href: string }[];
  jsonLd: object[];
  body: string;
}): string {
  const extraLinks = (opts.links ?? []).map((l) => `<link rel="${esc(l.rel)}" href="${esc(l.href)}">`).join("");
  const nav = NAV.map(([href, label]) => `<a href="${href}">${esc(label)}</a>`).join(" · ");
  const modules = MODULES.map((m) => `<a href="${esc(m.href ?? `/data/${m.slug}`)}">${esc(m.name)}</a>`).join(" · ");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(opts.title)}</title>
<meta name="description" content="${esc(opts.description)}">
${opts.robots ? `<meta name="robots" content="${esc(opts.robots)}">` : ""}
<link rel="canonical" href="${esc(opts.canonical)}">${extraLinks}
<meta property="og:title" content="${esc(opts.title)}">
<meta property="og:description" content="${esc(opts.description)}">
<meta property="og:type" content="website"><meta property="og:url" content="${esc(opts.canonical)}">
<meta property="og:image" content="${SITE}/og-image.png">
<link rel="icon" href="/favicon.ico">
${opts.jsonLd.map(ld).join("\n")}
<style>body{font:16px/1.6 system-ui,sans-serif;max-width:960px;margin:0 auto;padding:16px;color:#101418;background:#fbfbf9}a{color:#14503c}table{border-collapse:collapse}td,th{border-bottom:1px solid #dedfd8;padding:4px 12px 4px 0;text-align:left}code,pre{font-family:ui-monospace,monospace}pre{background:#f2f3ef;padding:12px;overflow:auto}</style>
</head><body>
<header><nav>${nav}</nav></header>
<main>${opts.body}</main>
<footer><p>Data modules: ${modules}</p>
<p><a href="/about">About</a> · <a href="/docs/sources-provenance">Sources &amp; provenance</a> · <a href="/amcs">Asset managers</a> · <a href="/securities">Debt securities</a> · <a href="/terms">Terms</a> · <a href="/privacy">Privacy</a></p>
<p>BanglaDataHub — Bangladesh's official economic data (BB, BBS, PTA, BSEC, PSO, ISMO, NEPRA and the agriculture departments of Punjab and Sindh) through one API.</p></footer>
</body></html>`;
}

function list(items: string[]): string {
  return `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`;
}

// ---- /series/{id}

type ApiObs = { date: string; value: number | string | null; dims?: Record<string, string> };
type ApiNote = { date: string; dims?: Record<string, string>; note: string };
type ApiSeries = {
  meta?: { unit?: string; frequency?: string; last_updated?: string; notes?: ApiNote[] | null };
  data?: ApiObs[];
};

export async function renderSeriesForBot(id: string): Promise<string | null> {
  const enc = encodeURIComponent(id);
  const topic = id.split(".")[0] ?? id;
  const [record, recent, siblings] = await Promise.all([
    api<CatalogRecord>(`/v1/catalog/${enc}`, false),
    api<ApiSeries>(`/v1/series/${enc}?limit=8&sort=desc`, true),
    api<{ data?: CatalogRecord[] }>(`/v1/catalog?q=${encodeURIComponent(topic)}&limit=40`, false),
  ]);
  if (!record || !record.id) return null;
  record.seo_title = resolveSeriesTitle(record);
  const { ascendingCross, buildCrossSection, headlineDims, isCrossSectional } = await import("./cross-section");
  let cross: CrossSection | null = null;
  if (isCrossSectional(record)) {
    const headline = headlineDims(record.dimensions);
    const q = headline ? `?dims=${encodeURIComponent(Object.entries(headline).map(([k, v]) => `${k}:${v}`).join(","))}` : "";
    const rows = await api<{ data?: ApiObs[] }>(`/v1/series/${enc}/latest${q}`, true);
    cross = buildCrossSection(rows?.data ?? [], headline ?? {}, 25, ascendingCross(record.id));
  }
  const modRaw = await api<{ data?: CatalogRecord[] }>(
    `/v1/catalog?module=${encodeURIComponent(toBackendModule(record.module))}&limit=40`,
    false,
  );
  return seriesHtml(record, recent, [...(siblings?.data ?? []), ...(modRaw?.data ?? [])], cross);
}

/** A cross-sectional series' latest values by area / plant (as on the React page). */
function crossHtml(cross: CrossSection, unit: string, id: string): string {
  const f = Object.entries(cross.filters).map(([k, v]) => `${k}: ${v}`).join(", ");
  return `<h2>Latest values · ${esc(fmtDate(cross.date))}${f ? ` (${esc(f)})` : ""}</h2><table><thead><tr><th>${esc(cross.rowLabel)}</th><th>${esc(unitLabel(unit))}</th></tr></thead><tbody>${cross.rows
    .map((r) => `<tr><td>${esc(r.label)}</td><td>${esc(fmtValue(r.value, unit))}</td></tr>`)
    .join("")}</tbody></table><p>${cross.omitted ? `${cross.omitted} more rows (smaller districts, tehsils and other breakdowns) — ` : ""}every row via <code>/v1/series/${esc(id)}?dims=…</code> with a <a href="/signup">free key</a>.</p>`;
}

/** The "Notes on this data" box (values confirmed as published but unusual), as on the React page. */
function notesHtml(notes: ApiNote[] | null | undefined): string {
  if (!notes?.length) return "";
  const items = notes.slice(0, 8).map((n) => {
    const dims = Object.values(n.dims ?? {});
    return `<li><strong>${esc(fmtDate(n.date))}</strong>${dims.length ? ` (${esc(dims.join(", "))})` : ""}: ${esc(n.note)}</li>`;
  });
  return `<h2>Notes on the figures</h2><p>Every value is shown exactly as the publisher prints it. Where one looks unusual, we have checked it with the source (<a href="/docs/sources-provenance">how figures are checked</a>).</p><ul>${items.join("")}</ul>`;
}

/** Pure: build the crawler HTML for a series from already-fetched API data. */
export function seriesHtml(
  record: CatalogRecord,
  recent: ApiSeries | null,
  relatedPool: CatalogRecord[],
  cross: CrossSection | null = null,
): string {
  const seo = composeSeriesSeo(record);
  const { canonicalId, isDupe } = seriesCanonical(record, record.id);
  const unit = recent?.meta?.unit || record.unit;
  const freq = (recent?.meta?.frequency || record.frequency) as Frequency;
  const tail: Observation[] = (recent?.data ?? [])
    .filter((d) => d.value !== null && d.value !== "")
    .map((d) => ({ date: d.date, value: Number(d.value) }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  const last = tail[tail.length - 1];
  const change = changeBetween(tail);
  const modSlug = toFrontendModule(record.module);
  const mod = MODULE_BY_SLUG[modSlug];
  const content = getSeriesContent(record.id);
  const depth = seriesDepth(record);
  const useCases = content?.useCases.length ? content.useCases : depth.useCases;
  const personas = content?.personas.length ? content.personas : depth.personas;
  const ended = cross ? null : discontinuedSince(record.last_date, record.frequency); // census/NEPRA: annual releases
  const topicSlug = TOPIC_OF_SERIES[record.id];

  const topic = record.id.split(".")[0];
  const seen = new Set<string>([record.id]);
  const related = [
    ...relatedPool.filter((r) => r.id.split(".")[0] === topic),
    ...relatedPool,
  ]
    .filter((r) => r && r.id && (seen.has(r.id) ? false : (seen.add(r.id), true)))
    .slice(0, 12);

  const figures = [
    last
      ? `<p><strong>Latest · ${esc(periodLabel(last.date, freq))}:</strong> ${esc(fmtValue(last.value, unit))} <span>(${esc(unitLabel(unit))})</span>${
          recent?.meta?.last_updated ? ` — updated ${esc(fmtDate(recent.meta.last_updated))}` : ""
        }</p>`
      : "",
    change
      ? `<p><strong>Change on period:</strong> ${change.abs >= 0 ? "+" : ""}${esc(fmtValue(change.abs, unit))} (${change.pct >= 0 ? "+" : ""}${esc(fmtNumber(change.pct, 2))}%)</p>`
      : "",
  ].join("");

  const recentTable = tail.length
    ? `<h2>Recent observations</h2><table><thead><tr><th>Date</th><th>Value</th></tr></thead><tbody>${tail
        .slice()
        .reverse()
        .map((d) => `<tr><td>${esc(fmtDate(d.date))}</td><td>${esc(fmtValue(d.value, unit))}</td></tr>`)
        .join("")}</tbody></table>
<p>${record.first_date ? `Full history back to ${esc(fmtDate(record.first_date))}` : "Full history"}, CSV export and API access start with a <a href="/signup">free key</a>.</p>`
    : "";

  const meta: [string, string][] = [
    ["Series ID", record.id],
    ["Source", record.derived ? "BanglaDataHub (derived from official series)" : record.source],
    ["Unit", unitLabel(record.unit)],
    ["Frequency", frequencyLabel(record.frequency)],
    ["First observation", fmtDate(record.first_date)],
    ["Last observation", fmtDate(record.last_date)],
    ["Tier", record.tier],
  ];

  const body = `
<nav aria-label="Breadcrumb"><a href="/coverage">Data</a> / <a href="/data/${esc(modSlug)}">${esc(mod?.name ?? record.module)}</a></nav>
<h1>${esc(record.name)}</h1>
<p>${esc(record.description)}</p>
${topicSlug ? `<p>Topic: <a href="/topics/${esc(topicSlug)}">${esc(TOPIC_BY_SLUG[topicSlug]?.h1 ?? topicSlug)}</a></p>` : ""}
${record.derived ? `<p><strong>Derived · BanglaDataHub method.</strong> Computed by BanglaDataHub from official series with a published formula (<a href="/docs/data-derived">how the derived layer works</a>). ${esc(record.derived.method)} Inputs: ${Array.from(new Set(record.derived.inputs)).map((s) => (/^[a-z0-9_.-]+$/.test(s) ? `<a href="/series/${esc(s)}"><code>${esc(s)}</code></a>` : `<code>${esc(s)}</code>`)).join(", ")}.</p>` : ""}
${ended ? `<p><strong>Ended ${esc(ended)}.</strong> The publisher stopped this exact series, usually when it moved to a new base year or table. For current figures, see the related series below or search the <a href="/coverage">catalog</a>.</p>` : ""}
${cross ? crossHtml(cross, unit, record.id) : figures}
${notesHtml(recent?.meta?.notes)}
${cross ? "" : recentTable}
<h2>About this series</h2>
${content ? content.html : `<p>${esc(record.description)}</p>`}
<h3>Use cases</h3>${list(useCases)}
<h3>Who uses this</h3>${list(personas)}
<h2>Metadata</h2>
<table><tbody>${meta.map(([k, v]) => `<tr><th scope="row">${esc(k)}</th><td>${esc(v)}</td></tr>`).join("")}</tbody></table>
<h2>Fetch it</h2>
<pre><code>curl -H "X-API-Key: bd_live_xxx" \\
  "https://api.bangladatahub.com/v1/series/${esc(record.id)}"</code></pre>
<p>JSON by default; add <code>?format=csv</code> for CSV, <code>from</code>/<code>to</code> to filter dates, or <code>transform=yoy|mom|pct_change|3ma|index</code> for server-side transforms. See the <a href="/docs/api-series">series endpoint docs</a> and <a href="/pricing">pricing</a>.</p>
${related.length ? `<h2>Related series</h2><ul>${related.map((r) => `<li><a href="/series/${esc(r.id)}">${esc(r.name)}</a> <code>${esc(r.id)}</code></li>`).join("")}</ul>` : ""}
<h2>FAQ</h2>
${depth.faq.map((f) => `<h3>${esc(f.q)}</h3><p>${esc(f.a)}</p>`).join("")}`;

  return page({
    title: seo.title,
    description: seo.description,
    canonical: `${SITE}/series/${canonicalId}`,
    robots: isDupe ? "noindex,follow" : undefined,
    jsonLd: seriesJsonLd(record),
    body,
  });
}

// ---- /data/{module}

export async function renderModuleForBot(slug: string, pageNum: number): Promise<string | null> {
  const m = MODULE_BY_SLUG[slug];
  if (!m || slug === "funds" || slug === "securities") return null; // SSR redirects those
  const backend = toBackendModule(slug);
  const res = await api<{ data?: CatalogRecord[]; pagination?: { count?: number } }>(
    `/v1/catalog?module=${encodeURIComponent(backend)}&limit=${MODULE_PAGE_SIZE}&offset=${
      (pageNum - 1) * MODULE_PAGE_SIZE
    }&canonical_only=true`,
    false,
  );
  if (!res?.data) return null;
  return moduleHtml(slug, pageNum, res.data, res.pagination?.count ?? res.data.length);
}

/** Pure: crawler HTML for a module listing page. Mirrors data.$module.tsx head(). */
export function moduleHtml(slug: string, pageNum: number, series: CatalogRecord[], total: number): string {
  const m = MODULE_BY_SLUG[slug]!;
  const lastPage = Math.max(1, Math.ceil(total / MODULE_PAGE_SIZE));
  const base = `${SITE}/data/${slug}`;
  const title = `${m.name} data — BanglaDataHub API${pageNum > 1 ? ` — page ${pageNum}` : ""}`;
  const description = `${m.line} ${m.cadence} updates from ${m.source}, available as JSON or CSV through the BanglaDataHub API.`;
  const links: { rel: string; href: string }[] = [];
  if (pageNum > 1) links.push({ rel: "prev", href: pageNum === 2 ? base : `${base}?page=${pageNum - 1}` });
  if (pageNum < lastPage) links.push({ rel: "next", href: `${base}?page=${pageNum + 1}` });
  const guide = getModuleContent(slug);
  const depth = moduleDepth(slug, m.name);
  const useCases = guide?.useCases.length ? guide.useCases : depth.useCases;
  const personas = guide?.personas.length ? guide.personas : depth.personas;
  const seriesCount = moduleSeriesCount(slug) ?? total;

  const rows = series
    .map(
      (s) =>
        `<tr><td><a href="/series/${esc(s.id)}">${esc(s.name)}</a></td><td><code>${esc(s.id)}</code></td><td>${esc(
          frequencyLabel(s.frequency),
        )}</td><td>${esc(unitLabel(s.unit))}</td><td>${esc(fmtDate(s.last_date))}</td></tr>`,
    )
    .join("");
  const pager = [
    pageNum > 1 ? `<a href="${pageNum === 2 ? `/data/${slug}` : `/data/${slug}?page=${pageNum - 1}`}" rel="prev">← Previous</a>` : "",
    `Page ${pageNum} of ${lastPage}`,
    pageNum < lastPage ? `<a href="/data/${slug}?page=${pageNum + 1}" rel="next">Next →</a>` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  const body = `
<nav aria-label="Breadcrumb"><a href="/coverage">Data</a> / ${esc(m.name)}</nav>
<p>${esc(m.source)}</p>
<h1>${esc(m.name)}</h1>
<p>${esc(m.line)}</p>
<p>${esc(m.cadence)} · ${esc(m.depth)} · ${esc(fmtCount(seriesCount))} series</p>
${pageNum === 1 && guide ? guide.html : ""}
<h2>Use cases</h2>${list(useCases)}
<h2>Who uses this</h2>${list(personas)}
<h2>Series${pageNum > 1 ? ` — page ${pageNum}` : ""}</h2>
<table><thead><tr><th>Series</th><th>ID</th><th>Frequency</th><th>Unit</th><th>Last observation</th></tr></thead><tbody>${rows}</tbody></table>
<p>${pager}</p>
<p>Query any of these with <code>GET /v1/series/{id}</code> — see the <a href="/docs">docs</a>, browse the <a href="/coverage">full catalog</a>, or <a href="/signup">get a free key</a>.</p>`;

  return page({
    title,
    description,
    canonical: pageNum > 1 ? `${base}?page=${pageNum}` : base,
    links,
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: title,
        description,
        url: base,
        isPartOf: { "@id": `${SITE}/#website` },
        about: { "@type": "Thing", name: m.name },
      },
      {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Data", item: `${SITE}/coverage` },
          { "@type": "ListItem", position: 2, name: m.name, item: base },
        ],
      },
    ],
    body,
  });
}

// ---- /mandi and /mandi/{crop} (wholesale prices, Punjab + Sindh, Rs/kg)

const rs = (n: number | null) => (n == null ? "—" : `Tk ${fmtNumber(n, n < 100 ? 1 : 0)}`);
const range = (min: number | null, max: number | null) =>
  min != null && max != null ? `${esc(fmtNumber(min, 0))}–${esc(fmtNumber(max, 0))}` : "—";

async function renderMandiHubForBot(): Promise<string | null> {
  const [markets, commodities, latest] = await Promise.all([
    api<{ data: AgriMarket[] }>(`/v1/agri/markets`, false),
    api<{ data: AgriCommodity[] }>(`/v1/agri/commodities`, false),
    api<{ data: AgriPrice[] }>(`/v1/agri/latest?market=${DEFAULT_MARKET.Punjab}`, true),
  ]);
  if (!markets?.data?.length || !commodities?.data?.length) return null;
  const all = crops(commodities.data);
  const rows = hubRows(latest?.data ?? [], commodities.data);
  const table = rows.length
    ? `<table><thead><tr><th>Commodity</th><th>Tk per kg</th><th>Day's range</th><th>Date</th></tr></thead><tbody>${rows
        .map(
          (r) =>
            `<tr><td><a href="/mandi/${esc(r.slug)}">${esc(r.name)}</a></td><td>${esc(rs(r.price))}${
              r.per === "dozen" ? " per dozen" : ""
            }</td><td>${range(r.min, r.max)}</td><td>${esc(fmtDate(r.date))}</td></tr>`,
        )
        .join("")}</tbody></table>`
    : "";
  const byCat = MANDI_CATEGORIES.map((cat) => {
    const items = all.filter((c) => c.category === cat);
    return `<h3>${esc(cat)}</h3><p>${items.map((i) => `<a href="/mandi/${esc(i.slug)}">${esc(i.name)}</a>`).join(" · ")}</p>`;
  }).join("");
  const byProvince = (p: string) => markets.data.filter((m) => m.province === p).map((m) => esc(m.name)).join(", ");
  const body = `<nav aria-label="Breadcrumb"><a href="/coverage">Data</a> / Wholesale prices</nav>
<h1>Mandi rates today</h1>
<p>Official daily wholesale prices for vegetables, fruits and grains in Punjab and Sindh, in takas per kg — ${esc(
    markets.data.length,
  )} markets, ${esc(all.length)} commodities, daily since 2007.</p>
<h2>Chattogram — latest wholesale prices</h2>${table}
<h2>Every commodity</h2>${byCat}
<h2>Markets</h2><p><strong>Punjab:</strong> ${byProvince("Punjab")}</p><p><strong>Sindh:</strong> ${byProvince("Sindh")}</p>
<h2>Fetch it</h2><pre><code>curl -H "X-API-Key: bd_live_xxx" "https://api.bangladatahub.com/v1/agri/latest?market=lahore"
curl -H "X-API-Key: bd_live_xxx" "https://api.bangladatahub.com/v1/agri/latest?crop=onion"</code></pre>
<p><a href="/docs/api-agri">API reference</a> · <a href="/docs/data-agri-prices">About the dataset</a></p>
<h2>Questions</h2>${HUB_FAQ.map((f) => `<h3>${esc(f.q)}</h3><p>${esc(f.a)}</p>`).join("")}`;
  return page({ title: HUB_TITLE, description: HUB_DESCRIPTION, canonical: `${SITE}/mandi`, jsonLd: hubJsonLd(), body });
}

async function renderMandiCommodityForBot(slug: string): Promise<string | null> {
  const [markets, commodities] = await Promise.all([
    api<{ data: AgriMarket[] }>(`/v1/agri/markets`, false),
    api<{ data: AgriCommodity[] }>(`/v1/agri/commodities`, false),
  ]);
  if (!markets?.data?.length || !commodities?.data?.length) return null;
  const all = crops(commodities.data);
  const own = commodities.data.find((x) => x.slug === slug);
  const c = all.find((x) => x.slug === slug) ?? all.find((x) => x.slug === own?.crop);
  if (!c) return null;
  const latest = await api<{ data: AgriPrice[] }>(`/v1/agri/latest?crop=${encodeURIComponent(c.slug)}`, true);
  if (!latest) return null;
  const rows = marketRows(latest.data ?? [], markets.data, c.name);
  const stats = summarize(rows);
  const seo = commoditySeo(c, stats);
  const lower = c.name.toLowerCase();
  const where = c.provinces.length > 1 ? "Punjab and Sindh" : c.provinces[0] ?? "Punjab";
  const figures =
    stats.median != null
      ? `<p>Median wholesale price: <strong>${esc(rs(stats.median))} per ${c.per}</strong> across ${esc(
          stats.markets,
        )} markets (latest report ${esc(fmtDate(stats.asOf))}).${
          stats.low && stats.high && stats.markets > 1
            ? ` Cheapest: ${esc(stats.low.market)} (${esc(rs(stats.low.price))}); dearest: ${esc(stats.high.market)} (${esc(
                rs(stats.high.price),
              )}).`
            : ""
        }</p>`
      : `<p>No market has reported a price in the last 30 days — ${esc(lower)} may be out of season.</p>`;
  const table = rows.length
    ? `<table><thead><tr><th>Market</th><th>Province</th><th>Rs/${c.per}</th><th>Day's range</th><th>Date</th></tr></thead><tbody>${rows
        .map(
          (r) =>
            `<tr><td>${esc(r.market)}${r.variety ? ` — ${esc(r.variety)}` : ""}</td><td>${esc(r.province)}</td><td>${esc(
              rs(r.price),
            )}</td><td>${range(r.min, r.max)}</td><td>${esc(fmtDate(r.date))}</td></tr>`,
        )
        .join("")}</tbody></table>`
    : "";
  const related = all
    .filter((x) => x.category === c.category && x.slug !== c.slug)
    .slice(0, 24)
    .map((x) => `<a href="/mandi/${esc(x.slug)}">${esc(x.name)}</a>`)
    .join(" · ");
  const body = `<nav aria-label="Breadcrumb"><a href="/mandi">Mandi rates</a> / ${esc(c.category ?? "Commodity")}</nav>
<h1>${esc(c.name)} wholesale price today</h1>${c.urdu ? `<p lang="ur">${esc(c.urdu)}</p>` : ""}
<p>Daily mandi rates for ${esc(lower)} in every market in ${esc(where)} that trades it, in takas per ${c.per}.</p>
${figures}
<h2>Today's price in every market</h2>${table}
<h2>Fetch it</h2><pre><code>curl -H "X-API-Key: bd_live_xxx" "https://api.bangladatahub.com/v1/agri/latest?crop=${esc(c.slug)}"</code></pre>
<p><a href="/docs/api-agri">API reference</a></p>
<h2>Questions</h2>${seo.faq.map((f) => `<h3>${esc(f.q)}</h3><p>${esc(f.a)}</p>`).join("")}
${related ? `<h2>More ${esc((c.category ?? "commodities").toLowerCase())}</h2><p>${related}</p>` : ""}
<p><a href="/mandi">All mandi rates</a></p>`;
  return page({ title: seo.title, description: seo.description, canonical: seo.url, jsonLd: seo.jsonLd, body });
}

// ---- /districts and /districts/{slug} (one API call each, via /v1/regional/*)

type DistrictSummary = {
  province: string;
  district: string;
  population: number | null;
  households?: number | null;
  sex_ratio?: number | null;
};

async function districtIndex(): Promise<DistrictSummary[]> {
  const res = await api<{ data?: DistrictSummary[] }>("/v1/regional/districts", false);
  return res?.data ?? [];
}

async function renderDistrictsIndexForBot(): Promise<string | null> {
  const rows = await districtIndex();
  if (!rows.length) return null;
  const body = `<nav aria-label="Breadcrumb"><a href="/coverage">Data</a> / <a href="/data/regional">Districts</a></nav>
<h1>Every district of Bangladesh</h1>
<p>${esc(rows.length)} districts from the Population and Housing Census 2022, with population, households, sex ratio and a full district profile.</p>
<table><thead><tr><th>District</th><th>Division</th><th>Population, 2022</th><th>Households</th></tr></thead><tbody>${rows
    .map(
      (r) =>
        `<tr><td><a href="/districts/${esc(districtSlug(r.district))}">${esc(r.district)}</a></td><td>${esc(
          r.province,
        )}</td><td>${esc(fmtIndicator(r.population, "count"))}</td><td>${esc(fmtIndicator(r.households ?? null, "count"))}</td></tr>`,
    )
    .join("")}</tbody></table>
<p>Source: Bangladesh Bureau of Statistics. <a href="/docs/data-regional">About the data</a></p>`;
  return page({
    title: "Bangladesh's 64 districts: Census 2022 population and households | BanglaDataHub",
    description:
      "Every district of Bangladesh: 2022 census population, households and sex ratio, plus age structure, education, work, housing and connectivity.",
    canonical: `${SITE}/districts`,
    jsonLd: [],
    body,
  });
}

async function renderDistrictForBot(slug: string): Promise<string | null> {
  const hit = (await districtIndex()).find((r) => districtSlug(r.district) === slug);
  if (!hit) return null;
  const res = await api<{ data?: DistrictPayload }>(`/v1/regional/district/${encodeURIComponent(hit.district)}`, true);
  if (!res?.data) return null;
  const p = assembleProfile(res.data);
  const sections = p.sections
    .map(
      (s) => `<h2>${esc(s.title)}</h2><table><thead><tr><th>Indicator</th><th>Value</th><th>Share</th></tr></thead><tbody>${s.rows
        .map(
          (r) =>
            `<tr><td><a href="/series/${esc(r.id)}">${esc(r.label)}</a></td><td>${esc(
              fmtIndicator(r.value, r.unit),
            )}</td><td>${r.share == null ? "" : `${r.share.toFixed(1)}%`}</td></tr>`,
        )
        .join("")}</tbody></table><p>${esc(s.note)}</p>`,
    )
    .join("");
  const pop = hit.population;
  const title = `${p.name} district — population, households and living conditions | BanglaDataHub`;
  const description = `${p.name} (${p.province}) in the 2022 Census${
    pop ? `: ${fmtIndicator(pop, "count")} people` : ""
  }, plus age structure, education, work, housing, water, sanitation, fuel, religion and connectivity.`;
  const body = `<nav aria-label="Breadcrumb"><a href="/districts">Districts</a> / ${esc(p.province)}</nav>
<h1>${esc(p.name)}</h1>
<p>${esc(p.name)} district, ${esc(p.province)} division${pop ? ` — ${esc(fmtIndicator(pop, "count"))} people in the 2022 Census` : ""}.</p>
${sections}
<p>Source: Bangladesh Bureau of Statistics. <a href="/docs/data-regional">About the data</a> · <a href="/districts">All districts</a></p>`;
  return page({ title, description, canonical: `${SITE}/districts/${slug}`, jsonLd: [], body });
}

// ---- /trade/products[/{code}-{slug}] and /trade/partners[/{slug}] (one API call each)

/** Crawler HTML, or a redirect when the URL isn't the page's own (bare code, old slug). */
export type BotResult = string | { redirect: string } | null;

const fyQuery = (fy: number | null) => (fy ? `?fy=${fy}` : "");
const flowName = (f: TradeFlow) => (f === "export" ? "Exports" : "Imports");
const faqHtml = (faq: { q: string; a: string }[]) => faq.map((f) => `<h3>${esc(f.q)}</h3><p>${esc(f.a)}</p>`).join("");
const CURL = (path: string) => `<pre><code>curl -H "X-API-Key: bd_live_xxx" "https://api.bangladatahub.com${esc(path)}"</code></pre>`;

function productYears(history: TradeProductPage["history"], qtyUnit: string): string {
  const head = `<tr><th>Fiscal year</th><th>Exports, US$</th><th>Exports, Rs</th>${qtyUnit ? `<th>Exported, ${esc(qtyUnit)}</th>` : ""}<th>Imports, US$</th><th>Imports, Rs</th>${
    qtyUnit ? `<th>Imported, ${esc(qtyUnit)}</th>` : ""
  }</tr>`;
  const qty = (v: number | null | undefined) => `<td>${v ? esc(Math.round(v).toLocaleString("en-US")) : "—"}</td>`;
  const pkr = (v: number | null) => `<td>${v ? esc(pkrTh(v)) : "—"}</td>`;
  const rows = history
    .slice()
    .reverse()
    .map(
      (h) =>
        `<tr><td>${esc(h.fiscal_year)}</td><td>${esc(usdTh(h.export_usd_th))}</td>${pkr(h.export_pkr_th)}${qtyUnit ? qty(h.export_quantity) : ""}<td>${esc(
          usdTh(h.import_usd_th),
        )}</td>${pkr(h.import_pkr_th)}${qtyUnit ? qty(h.import_quantity) : ""}</tr>`,
    )
    .join("");
  return `<table><thead>${head}</thead><tbody>${rows}</tbody></table>`;
}

async function renderTradeProductForBot(param: string, fy: number | null): Promise<BotResult> {
  const code = productCode(param);
  if (!code) return null;
  const res = await api<{ data?: TradeProductPage }>(`/v1/trade/product/${code}${fyQuery(fy)}`, true);
  const p = res?.data;
  if (!p) return null;
  if (p.slug !== param) return { redirect: `/trade/products/${p.slug}${fyQuery(fy)}` };
  const seo = productSeo(p);
  const { flow: main } = mainFlow(p.recent.export_usd_th, p.recent.import_usd_th);
  const flows: TradeFlow[] = main === "export" ? ["export", "import"] : ["import", "export"];
  const y = yearOf(p.history, p.fy);
  const fyl = `FY${p.fiscal_year}`;
  const unit = p.level === "code" ? unitWord(p.unit) : "";
  const figures = flows
    .filter((f) => y?.[`${f}_usd_th`])
    .map((f) => `<p><strong>${flowName(f)}, ${esc(fyl)}:</strong> ${esc(usdTh(y?.[`${f}_usd_th`]))} (${esc(pkrTh(y?.[`${f}_pkr_th`]))})</p>`)
    .join("");
  const partnerTables = flows
    .filter((f) => p.partners[f].length)
    .map(
      (f) =>
        `<h2>${f === "export" ? "Where Bangladesh sells it" : "Where Bangladesh buys it"}, ${esc(fyl)}</h2><table><thead><tr><th>Country</th><th>US$</th><th>Share</th></tr></thead><tbody>${p.partners[
          f
        ]
          .map((r) => `<tr><td><a href="${esc(r.path)}">${esc(r.country)}</a></td><td>${esc(usdTh(r.value_usd_th))}</td><td>${esc(pct(r.share_pct))}</td></tr>`)
          .join("")}</tbody></table>`,
    )
    .join("");
  const related = p.related.length
    ? `<h2>${p.level === "heading" ? "Products in this heading" : "Related products"}</h2><table><thead><tr><th>Product</th><th>Exports a year</th><th>Imports a year</th></tr></thead><tbody>${p.related
        .map(
          (r) =>
            `<tr><td><a href="${esc(r.path)}">${esc(r.name)}</a> <code>${esc(r.code)}</code></td><td>${esc(usdTh(r.export_usd_th))}</td><td>${esc(
              usdTh(r.import_usd_th),
            )}</td></tr>`,
        )
        .join("")}</tbody></table><p>Average a year over the last ${esc(p.recent.years)} fiscal years.</p>`
    : "";
  const about = [
    p.official_name && p.official_name !== p.name ? `<p><strong>Official HS text:</strong> ${esc(p.official_name)}</p>` : "",
    p.hs6_heading && p.hs6_heading !== p.name
      ? `<p><strong>${p.classification === "SITC" ? "SITC Rev. 3 heading" : "HS 6-digit heading"}:</strong> ${esc(p.hs6_heading)}</p>`
      : "",
    p.pbs_name ? `<p><strong>BBS's wording:</strong> ${esc(p.pbs_name)}</p>` : "",
  ].join("");
  const crumbs = [
    `<a href="/trade">Trade</a>`,
    `<a href="/trade/products">Products</a>`,
    p.chapter ? `<a href="/trade/products#ch${esc(p.chapter.code)}">${esc(p.chapter.name)}</a>` : "",
    p.heading ? `<a href="${esc(p.heading.path)}">${esc(p.heading.name)}</a>` : "",
  ].filter(Boolean);
  const intro =
    p.level === "heading"
      ? `HS heading ${esc(p.code)}: ${esc(p.official_name ?? p.name)}. Every customs code in the heading added up, with every partner country, each fiscal year since ${esc(
          fyLabel(p.first_fy),
        )}.`
      : `${p.classification === "HS" ? "Bangladesh Customs Tariff code" : "SITC-based code"} ${esc(p.code)}: ${esc(p.name)}${
          p.unit ? `, quantities in ${esc(unitWord(p.unit))}` : ""
        }. Exports and imports with every partner country, each fiscal year from ${esc(fyLabel(p.first_fy))} to ${esc(fyLabel(p.last_fy))}.`;
  const body = `<nav aria-label="Breadcrumb">${crumbs.join(" / ")}</nav>
<h1>${esc(productHeadline(p))}</h1>
<p>${intro}</p>
${figures}
<p>Source: Bangladesh Bureau of Statistics · US$ at each year's average exchange rate</p>
${partnerTables}
<h2>Every year</h2>${productYears(p.history, unit)}
${p.heading ? `<p>Part of HS heading ${esc(p.heading.code)}: <a href="${esc(p.heading.path)}">${esc(p.heading.name)}</a> — every code in it added up.</p>` : ""}
${related}
<h2>Questions</h2>${faqHtml(seo.faq)}
<h2>About the product</h2>${about}
${CURL(`/v1/trade/product/${p.code}`)}
<p><a href="/docs/api-trade">Trade API</a> · <a href="/docs/data-trade">About the data</a> · <a href="/trade">Trade explorer</a></p>`;
  return page({ title: seo.title, description: seo.description, canonical: seo.url, robots: seo.robots, jsonLd: seo.jsonLd, body });
}

async function renderTradePartnerForBot(slug: string, fy: number | null): Promise<BotResult> {
  const res = await api<{ data?: TradePartnerPage }>(`/v1/trade/partner/${encodeURIComponent(slug)}${fyQuery(fy)}`, true);
  const p = res?.data;
  if (!p) return null;
  if (p.slug !== slug) return { redirect: `/trade/partners/${p.slug}${fyQuery(fy)}` };
  const seo = partnerSeo(p);
  const c = p.country;
  const y = yearOf(p.history, p.fy);
  const fyl = `FY${p.fiscal_year}`;
  const flows = ["export", "import"] as const;
  const figures = flows
    .filter((f) => y?.[`${f}_usd_th`])
    .map(
      (f) =>
        `<p><strong>${f === "export" ? `Exports to ${esc(c)}` : `Imports from ${esc(c)}`}, ${esc(fyl)}:</strong> ${esc(usdTh(y?.[`${f}_usd_th`]))} (${esc(
          pkrTh(y?.[`${f}_pkr_th`]),
        )})${p.share_pct[f] != null ? ` — ${esc(pct(p.share_pct[f]))} of all ${f}s` : ""}</p>`,
    )
    .join("");
  const products = flows
    .filter((f) => p.products[f].length)
    .map(
      (f) =>
        `<h2>${f === "export" ? `What Bangladesh sells to ${esc(c)}` : `What Bangladesh buys from ${esc(c)}`}, ${esc(
          fyl,
        )}</h2><table><thead><tr><th>Product</th><th>US$</th></tr></thead><tbody>${p.products[f]
          .map((r) => `<tr><td><a href="${esc(r.path)}">${esc(r.product ?? r.code)}</a> <code>${esc(r.code)}</code></td><td>${esc(usdTh(r.value_usd_th))}</td></tr>`)
          .join("")}</tbody></table>`,
    )
    .join("");
  const pkr = (v: number | null) => `<td>${v ? esc(pkrTh(v)) : "—"}</td>`;
  const years = `<table><thead><tr><th>Fiscal year</th><th>Exports, US$</th><th>Exports, Rs</th><th>Imports, US$</th><th>Imports, Rs</th><th>Balance, US$</th></tr></thead><tbody>${p.history
    .slice()
    .reverse()
    .map(
      (h) =>
        `<tr><td>${esc(h.fiscal_year)}</td><td>${esc(usdTh(h.export_usd_th))}</td>${pkr(h.export_pkr_th)}<td>${esc(usdTh(h.import_usd_th))}</td>${pkr(
          h.import_pkr_th,
        )}<td>${esc(usdTh((h.export_usd_th ?? 0) - (h.import_usd_th ?? 0)))}</td></tr>`,
    )
    .join("")}</tbody></table>`;
  const body = `<nav aria-label="Breadcrumb"><a href="/trade">Trade</a> / <a href="/trade/partners">Partners</a></nav>
<h1>Bangladesh's trade with ${esc(c)}</h1>
<p>What Bangladesh sells to ${esc(c)} and buys from it, product by product, each fiscal year from ${esc(fyLabel(p.first_fy))} to ${esc(fyLabel(p.last_fy))}.</p>
${figures}
<p>Source: Bangladesh Bureau of Statistics · US$ at each year's average exchange rate</p>
${products}
<h2>Every year</h2>${years}
<h2>Questions</h2>${faqHtml(seo.faq)}
<h2>Fetch it</h2>${CURL(`/v1/trade/partner/${p.slug}`)}
<p><a href="/docs/api-trade">Trade API</a> · <a href="/docs/data-trade">About the data</a> · <a href="/trade/partners">Every partner</a></p>`;
  return page({ title: seo.title, description: seo.description, canonical: seo.url, robots: seo.robots, jsonLd: seo.jsonLd, body });
}

const recentYears = (d: TradePagesIndex) => `FY${fyLabel(d.latest_fy - d.recent_years + 1)} to FY${fyLabel(d.latest_fy)}`;

async function renderTradeProductsIndexForBot(): Promise<BotResult> {
  const d = await api<TradePagesIndex>("/v1/trade/pages", false);
  if (!d?.data?.headings?.length) return null;
  const row = (r: { path: string; name: string; code: string; export_usd_th: number; import_usd_th: number }) =>
    `<tr><td><a href="${esc(r.path)}">${esc(r.name)}</a> <code>${esc(r.code)}</code></td><td>${esc(usdTh(r.export_usd_th))}</td><td>${esc(usdTh(r.import_usd_th))}</td></tr>`;
  const table = (rows: string) => `<table><thead><tr><th>Product</th><th>Exports</th><th>Imports</th></tr></thead><tbody>${rows}</tbody></table>`;
  const chapters = Object.entries(d.chapters)
    .map(([code, name]) => {
      const items = d.data.headings.filter((h) => h.chapter === code).sort((a, b) => a.code.localeCompare(b.code));
      return items.length
        ? `<h3 id="ch${esc(code)}">${esc(code)} ${esc(name)}</h3><p>${items.map((h) => `<a href="${esc(h.path)}">${esc(h.name)}</a>`).join(" · ")}</p>`
        : "";
    })
    .join("");
  const body = `<nav aria-label="Breadcrumb"><a href="/trade">Trade</a> / Products</nav>
<h1>Every product Bangladesh trades</h1>
<p>Bangladesh's exports and imports by HS heading and customs code, each with every partner country and every fiscal year since 2002-03. Values are a year's average over ${esc(
    recentYears(d),
  )}.</p>
<h2>Most-traded headings</h2>${table(d.data.headings.slice(0, 30).map(row).join(""))}
<h2>Most-traded product codes</h2>${table(d.data.products.slice(0, 30).map(row).join(""))}
<h2>Every heading, by chapter</h2>${chapters}
<p>Source: Bangladesh Bureau of Statistics. Every product code and partner is also in the <a href="/trade">trade explorer</a> and the <a href="/docs/api-trade">trade API</a>.</p>`;
  return page({
    title: PRODUCTS_INDEX_TITLE,
    description: PRODUCTS_INDEX_DESCRIPTION,
    canonical: `${SITE}/trade/products`,
    jsonLd: indexJsonLd("products", PRODUCTS_INDEX_TITLE, PRODUCTS_INDEX_DESCRIPTION),
    body,
  });
}

async function renderTradePartnersIndexForBot(): Promise<BotResult> {
  const d = await api<TradePagesIndex>("/v1/trade/pages", false);
  if (!d?.data?.partners?.length) return null;
  const rows = d.data.partners
    .map(
      (p) =>
        `<tr><td><a href="${esc(p.path)}">${esc(p.country)}</a></td><td>${esc(usdTh(p.export_usd_th))}</td><td>${esc(usdTh(p.import_usd_th))}</td><td>${esc(
          usdTh(p.export_usd_th - p.import_usd_th),
        )}</td><td>${esc(p.first_fy - 1)}–${esc(String(p.last_fy).slice(2))}</td></tr>`,
    )
    .join("");
  const body = `<nav aria-label="Breadcrumb"><a href="/trade">Trade</a> / Partners</nav>
<h1>Bangladesh's trading partners</h1>
<p>Every country Bangladesh trades with: what it sells there and buys from there, product by product, each fiscal year since 1990-91. Ranked by trade, a year's average over ${esc(
    recentYears(d),
  )}.</p>
<h2>${esc(d.data.partners.length)} partners</h2>
<table><thead><tr><th>Country</th><th>Exports to</th><th>Imports from</th><th>Balance</th><th>Years</th></tr></thead><tbody>${rows}</tbody></table>
<p>Source: Bangladesh Bureau of Statistics. Places that changed keep their own names (the UAE's emirates were listed separately until 2013). See also <a href="/trade/products">every product</a> and the <a href="/trade">trade explorer</a>.</p>`;
  return page({
    title: PARTNERS_INDEX_TITLE,
    description: PARTNERS_INDEX_DESCRIPTION,
    canonical: `${SITE}/trade/partners`,
    jsonLd: indexJsonLd("partners", PARTNERS_INDEX_TITLE, PARTNERS_INDEX_DESCRIPTION),
    body,
  });
}

/** A product code's own page (the Worker's one-hop redirect for old /trade?code= links). */
export async function productPagePath(code: string): Promise<string | null> {
  const res = await api<{ data?: { path?: string } }>(`/v1/trade/product/${encodeURIComponent(code)}`, true);
  return res?.data?.path ?? null;
}

// ---- entry point used by server.ts

/** Crawler HTML for an in-scope URL, a redirect, or null to fall through to full SSR. */
// ---- /topics, /topics/{slug}

export async function renderTopicForBot(slug: string): Promise<string | null> {
  const t = TOPIC_BY_SLUG[slug];
  if (!t) return null;
  const live = await Promise.all(
    topicLiveIds(t).map(async (id) => {
      const r = await api<{ meta?: { unit?: string; frequency?: string }; data?: ApiObs[] }>(
        `/v1/series/${encodeURIComponent(id)}/latest`,
        true,
      );
      const p = pickHeadlineRow(r?.data ?? []);
      const fig: LiveFigure | null =
        p && r?.meta ? { value: Number(p.value), date: p.date, unit: r.meta.unit ?? "", frequency: r.meta.frequency ?? "" } : null;
      return [id, fig] as const;
    }),
  );
  const titles = Object.fromEntries(topicSeriesIds(t).map((id) => [id, resolveSeriesTitle({ id, name: id })]));
  return topicHtml(t, Object.fromEntries(live), titles);
}

/** Pure: crawler HTML for a topic hub. Mirrors routes/topics.$topic.tsx. */
export function topicHtml(t: Topic, live: Record<string, LiveFigure | null>, titles: Record<string, string>): string {
  const faq = topicFaq(t, live);
  const label = (id: string) => hubLabel(titles[id] ?? id);
  const figures = t.key
    .map((id) => {
      const f = live[id];
      if (!f) return "";
      const c = cardFigure(f);
      return `<li><a href="/series/${esc(id)}">${esc(label(id))}</a>: <strong>${esc(c.value)}${c.unit === "%" ? "%" : ` ${esc(c.unit)}`}</strong> (${esc(figurePeriod(f))})</li>`;
    })
    .join("");
  const sections = t.sections
    .map(
      (s) =>
        `<h2>${esc(s.heading)}</h2>${s.blurb ? `<p>${esc(s.blurb)}</p>` : ""}<ul>${s.ids
          .map((id) => `<li><a href="/series/${esc(id)}">${esc(label(id))}</a></li>`)
          .join("")}</ul>`,
    )
    .join("\n");
  const body = `
<nav aria-label="Breadcrumb"><a href="/topics">Topics</a> / ${esc(t.h1)}</nav>
<h1>${esc(t.h1)}</h1>
<p>${esc(t.summary)}</p>
${figures ? `<h2>Latest figures</h2><ul>${figures}</ul>` : ""}
${t.intro.map((p) => `<p>${esc(p)}</p>`).join("")}
${t.links?.length ? `<p>See also: ${t.links.map((l) => `<a href="${esc(l.href)}">${esc(l.label)}</a>`).join(" · ")}</p>` : ""}
${sections}
${faq.length ? `<h2>Questions</h2>${faq.map((f) => `<h3>${esc(f.q)}</h3><p>${esc(f.a)}</p>`).join("")}` : ""}
<h2>Related topics</h2><ul>${t.related.map((r) => `<li><a href="/topics/${esc(r)}">${esc(TOPIC_BY_SLUG[r]?.h1 ?? r)}</a></li>`).join("")}</ul>
<p>Every series here is official data from its publisher, updated as it is released, with the full history as JSON or CSV through the BanglaDataHub API. <a href="/signup">Get a free key</a> or read the <a href="/docs/api-series">series endpoint docs</a>.</p>`;
  return page({
    title: topicTitle(t),
    description: t.description,
    canonical: `${SITE}/topics/${t.slug}`,
    jsonLd: topicJsonLd(t, titles, faq),
    body,
  });
}

/** Pure: crawler HTML for /topics. Mirrors routes/topics.index.tsx. */
export function topicsIndexHtml(): string {
  const body = `
<p>Topics</p>
<h1>Bangladesh's economy, topic by topic</h1>
<p>The questions people ask about Bangladesh's economy, each answered with the latest official figures and every series behind them.</p>
<ul>${TOPICS.map((t) => `<li><a href="/topics/${esc(t.slug)}">${esc(t.h1)}</a> — ${esc(t.summary)}</li>`).join("")}</ul>
<p>Looking for something else? Browse the <a href="/coverage">full data catalog</a> or <a href="/search">search every series</a>.</p>`;
  return page({
    title: TOPICS_INDEX_TITLE,
    description: TOPICS_INDEX_DESCRIPTION,
    canonical: `${SITE}/topics`,
    jsonLd: topicsIndexJsonLd(),
    body,
  });
}

export async function renderForBot(url: URL): Promise<BotResult> {
  const s = url.pathname.match(SERIES_PATH);
  if (s) {
    let id: string;
    try {
      id = decodeURIComponent(s[1]!);
    } catch {
      return null;
    }
    return renderSeriesForBot(id);
  }
  if (DISTRICTS_PATH.test(url.pathname)) return renderDistrictsIndexForBot();
  const dd = url.pathname.match(DISTRICT_PATH);
  if (dd) return renderDistrictForBot(dd[1]!);
  if (TOPICS_PATH.test(url.pathname)) return topicsIndexHtml();
  const tt = url.pathname.match(TOPIC_PATH);
  if (tt) return renderTopicForBot(tt[1]!);
  const m = url.pathname.match(MODULE_PATH);
  if (m) {
    const pageNum = Math.max(1, Math.floor(Number(url.searchParams.get("page"))) || 1);
    return renderModuleForBot(m[1]!, pageNum);
  }
  return null;
}
