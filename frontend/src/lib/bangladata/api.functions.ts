import { createServerFn } from "@tanstack/react-start";

/**
 * Every API read the site performs. Handlers import the server-only client
 * dynamically so the API key never enters the client graph.
 */

export const getHomeData = createServerFn({ method: "GET" }).handler(async () => {
  const api = await import("./client.server");

  const tapeSpecs: { id: string; dims?: Record<string, string> }[] = [
    { id: "fx.rate.usd" },
    { id: "inflation.cpi.national.yoy" },
    { id: "rates.call_money" },
    { id: "reserves.gross" },
    { id: "remittances.total.usd" },
    { id: "market.dse.index.dsex" },
    { id: "payments.mfs_part_1.mfs_total_account_total" },
  ];

  // The derived layer — three headline figures for the homepage strip.
  const derivedIds = ["derived.real_call_money", "derived.remittances_growth_yoy", "derived.usd_bdt_depreciation_yoy"];
  const [tape, status, plans, calendar, flagship, derived] = await Promise.all([
    Promise.all(tapeSpecs.map((s) => api.fetchLatest(s.id, s.dims))),
    api.fetchStatus(),
    api.fetchPlans(),
    api.fetchCalendar(6),
    Promise.all([
      api.fetchSeries("fx.rate.usd"),
      api.fetchSeries("inflation.cpi.national.yoy"),
      api.fetchSeries("market.dse.index.dsex"),
      api.fetchSeries("payments.mfs_part_3.cash_in_total_amount"),
    ]),
    Promise.all(derivedIds.map((id) => api.fetchLatest(id))),
  ]);

  return {
    tape: Object.fromEntries(
      tapeSpecs.map((s, i) => [s.id, tape[i] ?? null] as const),
    ),
    status,
    plans,
    calendar,
    charts: {
      "fx.rate.usd": flagship[0],
      "inflation.cpi.national.yoy": flagship[1],
      "market.dse.index.dsex": flagship[2],
      "payments.mfs_part_3.cash_in_total_amount": flagship[3],
    },
    derived: Object.fromEntries(
      derivedIds.map((id, i) => [id, derived[i]?.data?.at(-1) ?? null] as const),
    ),
    apiBase: api.publicApiBase(),
  };
});

export const getCatalog = createServerFn({ method: "GET" }).handler(async () => {
  const api = await import("./client.server");
  return api.fetchCatalog();
});

export const getSearch = createServerFn({ method: "GET" })
  .validator((input: { q: string; module?: string }) => input)
  .handler(async ({ data }) => {
    const api = await import("./client.server");
    return api.fetchSearch(data.q, data.module);
  });

// The full /search results page: up to 50 ranked hits + module facet counts
// (derived from the unfiltered result set so the counts stay stable as you filter).
export const getSearchPage = createServerFn({ method: "GET" })
  .validator((input: { q: string; module?: string | undefined }) => input)
  .handler(async ({ data }) => {
    const q = (data.q ?? "").trim();
    if (!q)
      return { q: "", module: data.module ?? null, results: [], facets: [] as { module: string; label: string; count: number }[] };
    const api = await import("./client.server");
    const { searchGroup } = await import("./search");
    const all = await api.fetchSearch(q, undefined, 50);
    // facet = a series module or an entity kind (district, trade product, …)
    const counts = new Map<string, { label: string; count: number }>();
    for (const r of all) {
      const g = searchGroup(r);
      const have = counts.get(g.key) ?? { label: g.label, count: 0 };
      have.count += 1;
      counts.set(g.key, have);
    }
    const facets = Array.from(counts, ([module, v]) => ({ module, label: v.label, count: v.count })).sort(
      (a, b) => b.count - a.count,
    );
    const results = data.module ? all.filter((r) => searchGroup(r).key === data.module) : all;
    return { q, module: data.module ?? null, results, facets };
  });

export const getPlans = createServerFn({ method: "GET" }).handler(async () => {
  const api = await import("./client.server");
  return api.fetchPlans();
});

export const getStatus = createServerFn({ method: "GET" }).handler(async () => {
  const api = await import("./client.server");
  return api.fetchStatus();
});

export const getCalendar = createServerFn({ method: "GET" }).handler(async () => {
  const api = await import("./client.server");
  return api.fetchCalendar(40);
});

const MODULE_PAGE_SIZE = 120;

export const getModulePage = createServerFn({ method: "GET" })
  .validator((input: { module: string; page?: number }) => input)
  .handler(async ({ data }) => {
    const api = await import("./client.server");
    const page = Math.max(1, data.page ?? 1);
    // Paginated, canonical-only listing so EVERY series in a module is reachable
    // by an internal link (crawlers page through the whole tail), and the
    // label-duplicate twins are skipped.
    const { data: series, count } = await api.fetchCatalogPage({
      module: data.module,
      limit: MODULE_PAGE_SIZE,
      offset: (page - 1) * MODULE_PAGE_SIZE,
      canonicalOnly: true,
    });
    // The featured chart + latest-value grid are the page-1 landing only.
    const preferred: Record<string, string[]> = {
      inflation: ["inflation.cpi.national.yoy", "inflation.cpi.food.yoy", "inflation.cpi.non_food.yoy", "inflation.cpi.national"],
      forex: ["fx.rate.usd", "fx.rate.eur", "fx.rate.gbp", "fx.rate.usd.history"],
      rates: ["rates.call_money", "rates.bank", "rates.deposit", "rates.lending", "rates.tbond.10y"],
      monetary: ["monetary.m2", "monetary.m1", "monetary.currency_outside_banks"],
      external: ["reserves.gross", "remittances.total.usd", "external.exports", "external.imports"],
      real: ["gdp.current.market_price", "gdp.constant.market_price", "gdp.growth.constant"],
      payments: ["payments.mfs_part_1.mfs_total_account_total", "payments.mfs_part_3.cash_in_total_amount", "payments.mfs_part_3.cash_out_total_amount"],
      market: ["market.dse.index.dsex", "market.dse.turnover", "market.dse.market_cap.total"],
      regional: ["regional.census.population", "regional.census.households", "regional.census.sex_ratio"],
      fiscal: ["fiscal.nbr.total"],
      commodities: ["commodities.gold", "commodities.brent", "commodities.dubai_crude"],
      agri: ["agri.production.aus_rice_production_in_000_metric_tons"],
      social: ["inflation.cpi.national.12m_avg"],
    };
    const byId = new Map(series.map((s) => [s.id, s]));
    const picks = (preferred[data.module] ?? []).filter((id) => byId.has(id));
    const feature = picks[0] ? byId.get(picks[0])! : series[0];
    const featured = page === 1 && feature ? await api.fetchSeries(feature.id) : null;
    const latest =
      page === 1
        ? await Promise.all(
            (picks.length ? picks : series.slice(0, 8).map((s) => s.id))
              .slice(0, 8)
              .map(async (id) => [id, await api.fetchLatest(id)] as const),
          )
        : [];
    return {
      series,
      featured,
      latest: Object.fromEntries(latest),
      apiBase: api.publicApiBase(),
      page,
      pageSize: MODULE_PAGE_SIZE,
      total: count,
    };
  });

/** A series with several dims groups (BIBOR bid/offer, SPI prices by city) must be charted
 *  one group at a time — interleaving them draws a zig-zag and a bogus "change". Default to
 *  the conventional one (offer, national) or the first value. */
function defaultDims(dimensions?: Record<string, string[]>): Record<string, string> | undefined {
  if (!dimensions) return undefined;
  const out: Record<string, string> = {};
  for (const [k, vals] of Object.entries(dimensions)) {
    if (!vals || vals.length < 2) continue;
    out[k] = ["offer", "national", "total", "sell"].find((p) => vals.includes(p)) ?? [...vals].sort()[0]!;
  }
  return Object.keys(out).length ? out : undefined;
}

export const getSeriesPage = createServerFn({ method: "GET" })
  .validator(
    (input: {
      id: string;
      dims?: Record<string, string> | undefined;
      transform?: string | undefined;
    }) => input,
  )
  .handler(async ({ data }) => {
    const api = await import("./client.server");
    const { downsample } = await import("./format");
    const fetched = await api.fetchCatalogRecord(data.id);
    if (!fetched) return null;
    const { resolveSeriesTitle } = await import("./series-title.server");
    const record = { ...fetched, seo_title: resolveSeriesTitle(fetched) };
    const { TOPIC_BY_SLUG, TOPIC_OF_SERIES } = await import("./topics");
    const topicSlug = TOPIC_OF_SERIES[data.id];
    const topicHub = topicSlug ? { slug: topicSlug, h1: TOPIC_BY_SLUG[topicSlug]!.h1 } : null;
    // One value per district / plant at a date: show the latest date as a ranked table.
    const { ascendingCross, buildCrossSection, headlineDims, isCrossSectional } = await import("./cross-section");
    const cross = isCrossSectional(record) && !data.dims && !data.transform;
    const headline = cross ? headlineDims(record.dimensions) : undefined;
    const crossSection = cross
      ? buildCrossSection(await api.fetchLatestRows(data.id, headline), headline ?? {}, 25, ascendingCross(data.id))
      : null;
    const dims = data.dims ?? (cross ? headline : defaultDims(record.dimensions));
    // (a cross-section only needs the meta and a few recent rows from the history call)
    const full = await api.fetchSeries(data.id, { dims, transform: data.transform, ...(crossSection ? { limit: 300 } : {}) });
    // Related series: prefer true topic siblings (same id prefix, e.g. bop.*,
    // remittances.*, fx.*) so the internal-link graph threads through each
    // dataset cluster — that is how crawlers reach the long tail of series to
    // series instead of relying on the sitemap alone. Top up with same-module
    // series, dedupe, cap at 12.
    const topic = data.id.split(".")[0];
    const [siblingsRaw, moduleRaw, revised] = await Promise.all([
      api.fetchCatalog({ q: topic, limit: 40 }),
      api.fetchCatalog({ module: record.module, limit: 40 }),
      data.transform ? Promise.resolve([]) : api.fetchRevisions(data.id, { dims }),
    ]);
    const siblings = siblingsRaw.filter(
      (r) => r.id !== data.id && r.id.split(".")[0] === topic,
    );
    const seen = new Set<string>([data.id]);
    const related = [...siblings, ...moduleRaw]
      .filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)))
      .slice(0, 12);

    // Public page = free preview, not a data dump. The full history to 1972 is
    // NEVER shipped to the browser: the public/free chart gets only the recent
    // window — with REAL values, so the graph is genuinely useful for the free
    // tier and the public — while full history + CSV + bulk come through the API
    // with the caller's own key (plan-gated server-side). Because deep history
    // isn't in the payload, a signed-in free user can't read it off the chart.
    const PREVIEW_MONTHS = 12;
    const total = full?.data.length ?? 0;
    const tail = full ? full.data.slice(-8) : [];
    let windowData = full ? full.data : [];
    if (full && full.data.length) {
      const last = new Date(full.data[full.data.length - 1]!.date);
      const cutoff = new Date(last);
      cutoff.setMonth(cutoff.getMonth() - PREVIEW_MONTHS);
      const iso = cutoff.toISOString().slice(0, 10);
      const recent = full.data.filter((d) => d.date >= iso);
      // Sparse series (few points in the window) fall back to the last ~30 so the
      // line still draws.
      windowData = recent.length >= 8 ? recent : full.data.slice(-Math.min(30, full.data.length));
    }
    const series = full ? { ...full, data: downsample(windowData, 240) } : null;
    return {
      record,
      topic: topicHub,
      series,
      tail,
      total,
      related,
      crossSection,
      dims: dims ?? null,
      // Points checked against the publisher and confirmed as published, with a caveat
      // (e.g. a likely unit slip at source) — newest first.
      notes: (full?.meta?.notes ?? []).slice().sort((a, b) => (a.date < b.date ? 1 : -1)),
      // Revision history teaser: how many points moved since first print, and the
      // latest few (first print vs today). Full history + ?vintage= are Pro.
      revisions: revised.length
        ? {
            count: revised.length,
            capped: revised.length >= 200,
            earliestFirstSeen: revised.map((r) => r.first_seen).filter(Boolean).sort()[0] ?? null,
            // the most material revisions (first print vs today), not rounding-level ones
            recent: revised
              .map((r) => ({
                date: r.date,
                first: r.first_print,
                current: r.value,
                pct: r.first_print && r.value != null ? (r.value / r.first_print - 1) * 100 : null,
                times: r.revisions.length,
                sources: Array.from(new Set(r.revisions.map((x) => x.source))),
              }))
              .filter((r) => r.pct != null && Math.abs(r.pct) >= 0.1)
              .sort((a, b) => Math.abs(b.pct!) - Math.abs(a.pct!))
              .slice(0, 6),
          }
        : null,
      apiBase: api.publicApiBase(),
      previewMonths: PREVIEW_MONTHS,
    };
  });

// A topic hub (/topics/{slug}): the latest value of its headline series (and of every series
// its FAQ quotes) plus the page title of every series it links to — titles resolve here so the
// title maps stay server-side.
export const getTopicPage = createServerFn({ method: "GET" })
  .validator((input: { slug: string }) => input)
  .handler(async ({ data }) => {
    const { TOPIC_BY_SLUG, topicLiveIds, topicSeriesIds } = await import("./topics");
    const topic = TOPIC_BY_SLUG[data.slug];
    if (!topic) return null;
    const api = await import("./client.server");
    const { resolveSeriesTitle } = await import("./series-title.server");
    const live = await Promise.all(topicLiveIds(topic).map(async (id) => [id, await api.fetchHeadline(id)] as const));
    return {
      slug: topic.slug,
      live: Object.fromEntries(live),
      titles: Object.fromEntries(topicSeriesIds(topic).map((id) => [id, resolveSeriesTitle({ id, name: id })])),
    };
  });

// Tier-aware chart data. A signed-in caller sees as much history on the graph as
// their PLAN allows (Free 1y, Developer 10y, Pro/Business full) — matching the
// backend history_floor. Resolves the plan from the session, clamps the window to
// it (leak-proof: a lower tier never receives more than its years in the payload),
// and returns which range buttons to unlock. Returns null for an unauthenticated
// caller, so the page keeps the SSR free/1-year gated chart.
export const getSeriesForPlan = createServerFn({ method: "GET" })
  .validator((input: { seriesId: string; token: string }) => input)
  .handler(async ({ data }) => {
    const api = await import("./client.server");
    const { downsample } = await import("./format");
    const account = await api.sessionFetch<{ plan?: string }>("/v1/account", data.token);
    if (account.status !== 200 || !account.data) return null;
    const plan = String(account.data.plan ?? "free");
    const years = plan === "developer" ? 10 : plan === "pro" || plan === "business" ? null : 1;
    let from: string | undefined;
    if (years !== null) {
      const d = new Date();
      d.setFullYear(d.getFullYear() - years);
      from = d.toISOString().slice(0, 10);
    }
    const record = await api.fetchCatalogRecord(data.seriesId);
    const planDims = defaultDims(record?.dimensions);
    const s = await api.fetchSeries(data.seriesId, { ...(from ? { from } : {}), ...(planDims ? { dims: planDims } : {}) });
    const unlocked =
      plan === "developer"
        ? ["1Y", "5Y", "10Y"]
        : plan === "pro" || plan === "business"
          ? ["1Y", "5Y", "10Y", "Max"]
          : ["1Y"];
    return { data: downsample(s?.data ?? [], 400), plan, unlocked };
  });

export const getFundsPage = createServerFn({ method: "GET" }).handler(async () => {
  const api = await import("./client.server");
  // The fund list (a few hundred) is small enough to ship once and filter/sort in the browser, which
  // makes the screener instant. Facets are derived from the full set.
  const funds = await api.fetchFunds({ limit: 1000 });
  const amcs = Array.from(new Set(funds.map((f) => f.amc).filter(Boolean))).sort();
  const categories = Array.from(
    new Set(funds.map((f) => f.category).filter(Boolean) as string[]),
  ).sort();
  return { funds, amcs, categories, apiBase: api.publicApiBase() };
});

export const getFundPage = createServerFn({ method: "GET" })
  .validator((input: { fundId: number }) => input)
  .handler(async ({ data }) => {
    const api = await import("./client.server");
    const { downsample } = await import("./format");
    const fund = await api.fetchFund(data.fundId);
    if (!fund) return null;
    const [navFull, returns, payouts, expenses, portfolio, analytics] = await Promise.all([
      api.fetchFundNav(data.fundId),
      api.fetchFundReturns(data.fundId),
      api.fetchFundPayouts(data.fundId),
      api.fetchFundExpenses(data.fundId),
      api.fetchFundPortfolio(data.fundId),
      api.fetchFundAnalytics(data.fundId),
    ]);
    // Public page = SEO magnet: the chart shows the shape (downsampled), the full
    // NAV history + CSV live behind a key via the API.
    const navTotal = navFull.length;
    const navChart = downsample(navFull, 200);
    return {
      fund: fund.fund,
      latestNav: fund.latest_nav,
      navChart,
      navTotal,
      returns: returns[0] ?? null,
      payouts,
      expenses: expenses[0] ?? null,
      portfolio,
      analytics,
      apiBase: api.publicApiBase(),
    };
  });

// Official CPI year-on-year inflation, stitched oldest→newest. YoY rates are
// base-year independent, so chaining annual-average inflation across the (rebased)
// segments yields one continuous price-level index back to 1965 — deeper than any
// single index series, which only starts in 2017.
const CPI_YOY_SERIES = [
  "industry.year_year", // 1964–1973
  "industry.year_year_2", // 1974–1982
  "industry.year_year_3", // 1982–1985
  "industry.year_year_4", // 1985–1994
  "industry.year_year_5", // 1995–2001
  "industry.general_cpi_inflation_measure_year_year", // 2001–2008
  "industry.general_cpi_inflation_measure_year_year_2", // 2008–2020
  "inflation.national_cpi_inflation_measure_year_year", // 2016–present
];

export const getInflationTool = createServerFn({ method: "GET" }).handler(async () => {
  const api = await import("./client.server");
  const all = await Promise.all(
    CPI_YOY_SERIES.map((id) => api.fetchSeries(id, { limit: 5000 })),
  );

  // Annual-average YoY inflation per calendar year; later (newer) series win overlaps.
  const infl = new Map<number, number>();
  for (const s of all) {
    if (!s) continue;
    const byYear = new Map<number, number[]>();
    for (const o of s.data) {
      const y = Number(o.date.slice(0, 4));
      (byYear.get(y) ?? byYear.set(y, []).get(y)!).push(o.value);
    }
    for (const [y, vals] of byYear) infl.set(y, vals.reduce((a, b) => a + b, 0) / vals.length);
  }
  if (infl.size === 0) return { years: [], lastUpdated: null, apiBase: api.publicApiBase() };

  const lo = Math.min(...infl.keys());
  const hi = Math.max(...infl.keys());
  // Segment boundaries leave a few interior years with no YoY (first 12 months of a
  // rebased series are null) — interpolate them linearly from known neighbours.
  for (let y = lo + 1; y < hi; y++) {
    if (infl.has(y)) continue;
    let p = y - 1;
    while (p > lo && !infl.has(p)) p--;
    let n = y + 1;
    while (n < hi && !infl.has(n)) n++;
    if (infl.has(p) && infl.has(n)) {
      const pv = infl.get(p)!;
      const nv = infl.get(n)!;
      infl.set(y, pv + ((nv - pv) * (y - p)) / (n - p));
    }
  }

  // Chain YoY rates into a price-level index, base 100 at the first year.
  const years: { year: number; cpi: number }[] = [{ year: lo, cpi: 100 }];
  let level = 100;
  for (let y = lo + 1; y <= hi; y++) {
    const rate = infl.get(y) ?? 0;
    level *= 1 + rate / 100;
    years.push({ year: y, cpi: level });
  }

  const modern = all[all.length - 1];
  return {
    years,
    lastUpdated: modern?.meta.last_updated ?? modern?.data.at(-1)?.date ?? null,
    apiBase: api.publicApiBase(),
  };
});

export const getUsdPkrTool = createServerFn({ method: "GET" }).handler(async () => {
  const api = await import("./client.server");
  const { downsample } = await import("./format");
  const series = await api.fetchSeries("fx.rate.usd", { limit: 5000 });
  const data = series?.data ?? [];
  // Per-calendar-year average rate for the converter.
  const byYear = new Map<number, number[]>();
  for (const o of data) {
    const y = Number(o.date.slice(0, 4));
    (byYear.get(y) ?? byYear.set(y, []).get(y)!).push(o.value);
  }
  const years = Array.from(byYear.entries())
    .map(([year, v]) => ({ year, rate: v.reduce((a, b) => a + b, 0) / v.length }))
    .sort((a, b) => a.year - b.year);
  return {
    years,
    chart: downsample(data, 220),
    latest: data.at(-1) ?? null,
    lastUpdated: series?.meta.last_updated ?? data.at(-1)?.date ?? null,
    apiBase: api.publicApiBase(),
  };
});

export const getCostOfLivingTool = createServerFn({ method: "GET" }).handler(async () => {
  const api = await import("./client.server");
  const { downsample } = await import("./format");
  // Discover the 18 per-city index series (cost_of_living.<city>).
  const recs = (await api.fetchCatalog({ q: "cost of living", limit: 50 })).filter((r) =>
    r.id.startsWith("cost_of_living."),
  );
  const cities = await Promise.all(
    recs.map(async (rec) => {
      const s = await api.fetchSeries(rec.id, { limit: 300 });
      const data = s?.data ?? [];
      const latest = data.at(-1) ?? null;
      return {
        id: rec.id,
        city: rec.name.replace(/^Cost of Living Index — /, ""),
        latest: latest?.value ?? null,
        // The index is rebased to 100 at the base week, so (latest − 100) is the
        // % rise in essential-goods prices for that city since the base.
        changePct: latest ? Number((latest.value - 100).toFixed(1)) : null,
        chart: downsample(data, 120),
      };
    }),
  );
  cities.sort((a, b) => (b.latest ?? 0) - (a.latest ?? 0));
  const national = cities.find((c) => c.id === "cost_of_living.national") ?? null;
  const base = cities[0]?.chart[0]?.date ?? null;
  const lastUpdated = cities[0]?.chart.at(-1)?.date ?? null;
  return { cities, national, base, lastUpdated, apiBase: api.publicApiBase() };
});

export const getFundScreenerTool = createServerFn({ method: "GET" }).handler(async () => {
  const api = await import("./client.server");
  // One aggregate call returns every fund with returns/TER — small enough to
  // ship once and filter/sort in the browser, which makes the screener instant.
  const funds = await api.fetchFundScreener();
  const amcs = Array.from(new Set(funds.map((f) => f.amc).filter(Boolean) as string[])).sort();
  const categories = Array.from(
    new Set(funds.map((f) => f.category).filter(Boolean) as string[]),
  ).sort();
  const lastUpdated =
    funds
      .map((f) => f.returns?.as_of)
      .filter(Boolean)
      .sort()
      .at(-1) ?? null;
  return { funds, amcs, categories, lastUpdated, apiBase: api.publicApiBase() };
});

export const getAmcsPage = createServerFn({ method: "GET" }).handler(async () => {
  const api = await import("./client.server");
  const amcs = await api.fetchAmcs();
  return { amcs, apiBase: api.publicApiBase() };
});

export const getAmcPage = createServerFn({ method: "GET" })
  .validator((input: { amc: string }) => input)
  .handler(async ({ data }) => {
    const api = await import("./client.server");
    const { amcSlug } = await import("./slugs");
    // The URL carries a slug (/amcs/js-investments); old links carry the full name.
    const want = data.amc.trim().toLowerCase();
    const hit = (await api.fetchAmcs()).find((a) => amcSlug(a.amc) === want || a.amc.toLowerCase() === want);
    if (!hit) return null;
    const amc = await api.fetchAmc(hit.amc);
    if (!amc) return null;
    return { amc, slug: amcSlug(hit.amc), apiBase: api.publicApiBase() };
  });

export const getGuidesIndex = createServerFn({ method: "GET" }).handler(async () => {
  const api = await import("./client.server");
  const { GUIDE_MODULES, GUIDE_FAMILIES, isGuideRecord, guideTitle, DATASET_GUIDES } = await import("./guides");
  const lists = await Promise.all([
    ...GUIDE_MODULES.map((m) => api.fetchCatalog({ module: m, limit: 5000 })),
    // families living in very large modules: fetched by id prefix, not the whole module
    ...GUIDE_FAMILIES.map((f) => api.fetchCatalog({ module: f.module, q: f.q, limit: 500 })),
  ]);
  const series = lists
    .flat()
    .filter(isGuideRecord)
    .map((r) => ({ id: r.id, title: guideTitle(r.name), module: r.module }));
  const datasets = DATASET_GUIDES.map((g) => ({ id: g.slug, title: g.h1, module: g.module }));
  const guides = [...datasets, ...series].sort((a, b) => a.title.localeCompare(b.title));
  return { guides, apiBase: api.publicApiBase() };
});

export const getGuidePage = createServerFn({ method: "GET" })
  .validator((input: { id: string }) => input)
  .handler(async ({ data }) => {
    const api = await import("./client.server");
    const { isGuideRecord, getDatasetGuide, seriesGuideView } = await import("./guides");
    // Dataset guides (funds/securities/auctions/AMCs/trade) are hand-written.
    const ds = getDatasetGuide(data.id);
    if (ds) return { guide: ds, apiBase: api.publicApiBase() };
    // Otherwise it's a catalog series — build the guide from its live record.
    const rec = await api.fetchCatalogRecord(data.id);
    if (!rec || !isGuideRecord(rec)) return null;
    const from = rec.last_date
      ? new Date(new Date(rec.last_date).getTime() - 400 * 864e5).toISOString().slice(0, 10)
      : undefined;
    const series = await api.fetchSeries(rec.id, from ? { from } : undefined);
    const points = series?.data ?? [];
    const last = points.length ? points[points.length - 1] : undefined;
    const latest =
      last && last.value != null ? { date: last.date, value: Number(last.value) } : null;
    return { guide: seriesGuideView(rec, latest), apiBase: api.publicApiBase() };
  });

export const getSecuritiesPage = createServerFn({ method: "GET" }).handler(async () => {
  const api = await import("./client.server");
  const securities = await api.fetchSecurities({ limit: 2000 });
  return { securities, apiBase: api.publicApiBase() };
});

export const getDebtTradesPage = createServerFn({ method: "GET" }).handler(async () => {
  const api = await import("./client.server");
  const trades = await api.fetchDebtTrades({ limit: 400 });
  return { trades, apiBase: api.publicApiBase() };
});

export const getSecurityPage = createServerFn({ method: "GET" })
  .validator((input: { code: string }) => input)
  .handler(async ({ data }) => {
    const api = await import("./client.server");
    const { downsample } = await import("./format");
    const [security, prices] = await Promise.all([
      api.fetchSecurity(data.code),
      api.fetchSecurityPrices(data.code),
    ]);
    // 404 only if neither metadata nor any price row exists.
    if (!security && prices.length === 0) return null;
    return {
      code: data.code,
      security,
      priceChart: downsample(prices, 200),
      priceTotal: prices.length,
      latestPrice: prices.at(-1) ?? null,
      apiBase: api.publicApiBase(),
    };
  });

export const getCommoditySeries = createServerFn({ method: "GET" })
  .validator((input: { id: string; city: string }) => input)
  .handler(async ({ data }) => {
    const api = await import("./client.server");
    return api.fetchSeries(data.id, { dims: { city: data.city } });
  });

// ---- Wholesale (mandi) prices — Punjab + Sindh --------------------------------------

type ProvinceFilter = "all" | "punjab" | "sindh";

/** /mandi hub: every commodity's latest wholesale price (Rs/kg) in one market. */
export const getMandiHub = createServerFn({ method: "GET" })
  .validator((input: { market?: string; province?: ProvinceFilter }) => input)
  .handler(async ({ data }) => {
    const api = await import("./client.server");
    const m = await import("./mandi");
    const [markets, commodities] = await Promise.all([api.fetchAgriMarkets(), api.fetchAgriCommodities()]);
    const province = data.province ?? "all";
    const inScope = markets.filter((x) => province === "all" || x.province.toLowerCase() === province);
    const fallback = province === "sindh" ? m.DEFAULT_MARKET.Sindh : m.DEFAULT_MARKET.Punjab;
    const wanted = (data.market || fallback).toLowerCase();
    const market =
      inScope.find((x) => x.slug === wanted) ?? inScope.find((x) => x.slug === fallback) ?? inScope[0] ?? null;
    const latest = market ? await api.fetchAgriLatest({ market: market.slug }) : [];
    const rows = m.hubRows(latest, commodities);
    const asOf = rows.map((r) => r.date).sort().at(-1) ?? null;
    const counts = Object.fromEntries(
      m.PROVINCES.map((p) => [p, markets.filter((x) => x.province === p).length]),
    ) as Record<"Punjab" | "Sindh", number>;
    return {
      province,
      market: market
        ? { slug: market.slug, name: market.name, province: market.province, first_date: market.first_date }
        : null,
      markets: inScope.map((x) => ({
        slug: x.slug,
        name: x.name,
        is_major: x.is_major,
        province: x.province,
        region: x.region ?? x.province,
      })),
      counts,
      crops: m.crops(commodities),
      rows,
      asOf,
      apiBase: api.publicApiBase(),
    };
  });

/** /mandi/{crop}: latest price in every market of both provinces + a year of daily prices in one market. */
export const getMandiCommodity = createServerFn({ method: "GET" })
  .validator((input: { slug: string; market?: string }) => input)
  .handler(async ({ data }) => {
    const api = await import("./client.server");
    const m = await import("./mandi");
    const commodities = await api.fetchAgriCommodities();
    const all = m.crops(commodities);
    const own = commodities.find((c) => c.slug === data.slug);
    // a Sindh variety slug resolves to its crop's page
    const crop = all.find((c) => c.slug === data.slug) ?? all.find((c) => c.slug === own?.crop) ?? null;
    if (!crop) return null;
    const [markets, latest] = await Promise.all([api.fetchAgriMarkets(), api.fetchAgriLatest({ crop: crop.slug })]);
    const rows = m.marketRows(latest, markets, crop.name);
    // Chart one market: the requested one if it trades this crop, else Chattogram, else Dhaka,
    // else the major market with the most recent price.
    const wanted = (data.market || "").toLowerCase();
    const chartRow =
      rows.find((r) => r.marketSlug === wanted) ??
      rows.find((r) => r.marketSlug === m.DEFAULT_MARKET.Punjab) ??
      rows.find((r) => r.marketSlug === m.DEFAULT_MARKET.Sindh) ??
      rows.find((r) => r.major) ??
      rows[0] ??
      null;
    // Public window = 1 year, like every other public chart (full history is keyed).
    const from = new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10);
    const history = chartRow
      ? await api.fetchAgriPrices({ commodity: chartRow.commoditySlug, market: chartRow.marketSlug, from, limit: 400 })
      : [];
    const chart = history
      .filter((p) => p.fqp != null)
      .map((p) => ({ date: p.date, value: m.toDisplay(p.fqp, p.unit) as number }));
    const related = all
      .filter((c) => c.category === crop.category && c.slug !== crop.slug)
      .slice(0, 24)
      .map((c) => ({ slug: c.slug, name: c.name }));
    return {
      commodity: crop,
      rows,
      stats: m.summarize(rows),
      chartMarket: chartRow
        ? { slug: chartRow.marketSlug, name: chartRow.market, commodity: chartRow.commoditySlug, variety: chartRow.variety }
        : null,
      chart,
      related,
      apiBase: api.publicApiBase(),
    };
  });

// ---- BIBOR & policy-rate tracker -------------------------------------------------

export const getKiborTracker = createServerFn({ method: "GET" }).handler(async () => {
  const api = await import("./client.server");
  const { downsample } = await import("./format");
  const since = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const last = (s: Awaited<ReturnType<typeof api.fetchSeries>> | undefined) => s?.data?.at(-1) ?? null;
  // A recent window per series: an ascending full pull of a daily series since 2005
  // would stop at the 5,000-row page and miss today.
  const TENORS = ["1w", "2w", "1m", "3m", "6m", "9m", "1y"];
  const tenors = await Promise.all(
    TENORS.map(async (t) => {
      const [bid, offer] = await Promise.all(
        ["bid", "offer"].map((side) => api.fetchSeries(`rates.kibor.${t}`, { dims: { side }, from: since(150) })),
      );
      const b = last(bid);
      const o = last(offer);
      return { tenor: t, id: `rates.kibor.${t}`, bid: b?.value ?? null, offer: o?.value ?? null, date: o?.date ?? b?.date ?? null };
    }),
  );
  const point = async (id: string, days = 400) => last(await api.fetchSeries(id, { from: since(days) }));
  // rates.policy records each decision (dated from when it took effect); the month-end
  // history series is the fallback.
  const [policyChange, policyHist, floor, ceiling, repo, spreadNow, realKibor, realPolicy] = await Promise.all([
    point("rates.policy", 4000),
    point("rates.policy.history", 400),
    point("rates.policy.floor", 4000),
    point("rates.policy.ceiling", 4000),
    point("rates.repo.overnight", 60),
    point("rates.spread.kibor_3m_policy", 60),
    point("rates.real.kibor_3m", 400),
    point("rates.real.policy", 400),
  ]);
  const [kibor3m, spread, realHistory] = await Promise.all([
    api.fetchSeries("rates.kibor.3m", { dims: { side: "offer" }, from: since(366) }),
    api.fetchSeries("rates.spread.kibor_3m_policy", { from: since(366) }),
    api.fetchSeries("rates.real.policy", { from: "1965-01-01" }),
  ]);
  return {
    tenors,
    policy: policyChange ?? policyHist,
    corridor: { floor, ceiling },
    repo,
    spreadNow,
    realKibor,
    realPolicy,
    charts: {
      kibor3m: downsample(kibor3m?.data ?? [], 260),
      spread: downsample(spread?.data ?? [], 260),
      realPolicy: downsample(realHistory?.data ?? [], 400),
    },
    apiBase: api.publicApiBase(),
  };
});

// ---- Derived layer hub -------------------------------------------------------------

export const getDerivedHub = createServerFn({ method: "GET" }).handler(async () => {
  const api = await import("./client.server");
  const recs = (await api.fetchCatalog({ source: "BanglaDataHub", limit: 200 })).filter((r) => r.source === "BanglaDataHub");
  const latest = await Promise.all(
    recs.map(async (r) => {
      const l = await api.fetchLatest(r.id);
      const p = l?.data?.at(-1);
      return [r.id, p ? { date: p.date, value: p.value } : null] as const;
    }),
  );
  const byId = Object.fromEntries(latest);
  const group = (id: string): string =>
    id === "derived.real_call_money" ? "Interest rates" :
    id === "derived.real_m2_growth" ? "Money & prices" : "External & FX";
  const series = recs
    .map((r) => ({
      id: r.id,
      name: r.name,
      unit: r.unit,
      frequency: r.frequency,
      first_date: r.first_date,
      last_date: r.last_date,
      method: r.derived?.method ?? r.description ?? "",
      inputs: r.derived?.inputs ?? [],
      version: r.derived?.version ?? 1,
      group: group(r.id),
      latest: byId[r.id] ?? null,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  return { series };
});

// ---- Grocery basket tool ------------------------------------------------------------

/** The derived prices.grocery_basket.* series (one per SPI city + national) plus the
 *  national item prices now and a year ago, so the page can re-price a custom basket. */
export const getGroceryBasketTool = createServerFn({ method: "GET" }).handler(async () => {
  const api = await import("./client.server");
  const { downsample } = await import("./format");
  const { BASKET } = await import("./grocery");
  const recs = (await api.fetchCatalog({ source: "BanglaDataHub", limit: 200 })).filter((r) =>
    r.id.startsWith("prices.grocery_basket."),
  );
  const cities = await Promise.all(
    recs.map(async (rec) => {
      const s = await api.fetchSeries(rec.id, { from: "2023-07-01", limit: 400 });
      const data = s?.data ?? [];
      const latest = data.at(-1) ?? null;
      // the week closest to 52 weeks before the latest
      const target = latest ? Date.parse(latest.date) - 364 * 86_400_000 : 0;
      const yearAgo = latest
        ? data.reduce<(typeof data)[number] | null>(
            (best, p) => (!best || Math.abs(Date.parse(p.date) - target) < Math.abs(Date.parse(best.date) - target) ? p : best),
            null,
          )
        : null;
      return {
        id: rec.id,
        city: rec.name.replace(/^Monthly grocery basket cost — /, ""),
        latest,
        yearAgo: yearAgo && Math.abs(Date.parse(yearAgo.date) - target) <= 7 * 86_400_000 ? yearAgo : null,
        chart: downsample(data, 140),
      };
    }),
  );
  cities.sort((a, b) => (b.latest?.value ?? 0) - (a.latest?.value ?? 0));
  const from = new Date(Date.now() - 400 * 86_400_000).toISOString().slice(0, 10);
  const items = await Promise.all(
    BASKET.map(async (b) => {
      const s = await api.fetchSeries(b.id, { dims: { city: "national" }, from });
      const data = s?.data ?? [];
      const now = data.at(-1) ?? null;
      const target = now ? Date.parse(now.date) - 364 * 86_400_000 : 0;
      const then = now
        ? data.find((p) => Math.abs(Date.parse(p.date) - target) <= 3 * 86_400_000) ?? null
        : null;
      return { ...b, now, then };
    }),
  );
  return { cities, items, apiBase: api.publicApiBase() };
});

/** /trade: Bangladesh's exports and imports for a year — the totals, top products and top partners.
 *  Each product and partner has its own page (getTradeProductPage / getTradePartnerPage). */
export const getTradeExplorer = createServerFn({ method: "GET" })
  .validator((input: { flow: "export" | "import"; fy: number }) => input)
  .handler(async ({ data }) => {
    const api = await import("./client.server");
    const { flow, fy } = data;
    const usdMn = (r: { value_usd_th: number | null }) => (r.value_usd_th == null ? null : r.value_usd_th / 1000);
    const rows = (xs: Awaited<ReturnType<typeof api.fetchTradePartners>>) =>
      xs.map((r) => ({ ...r, usd_mn: usdMn(r) }));
    const [countries, history, partners, products] = await Promise.all([
      api.fetchTradeCountries(flow),
      api.fetchTradeProductHistory(flow, "TOTAL"),
      api.fetchTradePartners(flow, fy, undefined, 25),
      api.fetchTradeTopProducts(flow, fy, "All countries", 25),
    ]);
    return {
      flow,
      fy,
      countries: countries.filter((c) => c.last_fy >= 2003).map((c) => c.country),
      history: history.map((r) => ({ date: `${r.fy}-06-30`, value: usdMn(r) ?? 0, fy: r.fy })).filter((r) => r.value),
      partners: rows(partners),
      products: rows(products),
      apiBase: api.publicApiBase(),
    };
  });

export const searchTradeProducts = createServerFn({ method: "GET" })
  .validator((input: { q: string }) => input)
  .handler(async ({ data }) => {
    const api = await import("./client.server");
    if (data.q.trim().length < 2) return [];
    return api.fetchTradeProducts(data.q.trim(), 12);
  });

/** /trade/products/{code}-{slug}: one product heading or code (one API call). */
export const getTradeProductPage = createServerFn({ method: "GET" })
  .validator((input: { code: string; fy?: number | undefined }) => input)
  .handler(async ({ data }) => {
    const api = await import("./client.server");
    const page = await api.fetchTradeProductPage(data.code, data.fy);
    return page ? { ...page, apiBase: api.publicApiBase() } : null;
  });

/** /trade/partners/{slug}: one partner (one API call). */
export const getTradePartnerPage = createServerFn({ method: "GET" })
  .validator((input: { slug: string; fy?: number | undefined }) => input)
  .handler(async ({ data }) => {
    const api = await import("./client.server");
    const page = await api.fetchTradePartnerPage(data.slug, data.fy);
    return page ? { ...page, apiBase: api.publicApiBase() } : null;
  });

/** /trade/products and /trade/partners: every page, with recent trade (one public call). */
export const getTradePagesIndex = createServerFn({ method: "GET" }).handler(async () => {
  const api = await import("./client.server");
  return api.fetchTradePages();
});

const latestOnly = <T extends { date: string }>(xs: T[]): T[] => {
  const d = xs.reduce((m, r) => (r.date > m ? r.date : m), "");
  return xs.filter((r) => r.date === d);
};

/** /energy: pump prices, the wholesale power price, the grid's fuel mix, the merit order and plants. */
export const getEnergyDashboard = createServerFn({ method: "GET" }).handler(async () => {
  const api = await import("./client.server");
  const rows = (xs: Awaited<ReturnType<typeof api.fetchLatestRows>>) =>
    xs.map((r) => ({ date: r.date, value: Number(r.value), dims: r.dims ?? {} })).filter((r) => !Number.isNaN(r.value));
  const [petrol, diesel, price, mix, demand, merit, plants, discos] = await Promise.all([
    api.fetchSeries("energy.fuel.petrol", { from: "2016-01-01" }),
    api.fetchSeries("energy.fuel.diesel", { from: "2016-01-01" }),
    api.fetchSeries("energy.power.marginal_price.daily", { limit: 900 }),
    api.fetchLatestRows("energy.power.generation_mix"),
    api.fetchLatestRows("energy.power.demand"),
    api.fetchLatestRows("energy.power.merit_order.specific_cost"),
    api.fetchLatestRows("energy.generation.plant"),
    api.fetchLatestRows("energy.power.disco_consumption"),
  ]);
  // latest rows are per plant: keep only those on the newest order
  const allMerit = rows(merit);
  const meritDate = allMerit.reduce((d, r) => (r.date > d ? r.date : d), "");
  const meritRows = allMerit.filter((r) => r.date === meritDate).sort((a, b) => a.value - b.value);
  return {
    petrol: petrol?.data ?? [],
    diesel: diesel?.data ?? [],
    price: price?.data ?? [],
    mix: latestOnly(rows(mix)).sort((a, b) => b.value - a.value),
    demand: latestOnly(rows(demand)),
    merit: meritRows,
    plants: latestOnly(rows(plants)).sort((a, b) => b.value - a.value).slice(0, 15),
    discos: latestOnly(rows(discos)).sort((a, b) => b.value - a.value),
    apiBase: api.publicApiBase(),
  };
});

/** /districts: every district with its headline census and survey figures (one API call). */
export const getDistrictsIndex = createServerFn({ method: "GET" }).handler(async () => {
  const api = await import("./client.server");
  const D = await import("./districts");
  const rows = (await api.fetchRegionalDistricts()).map((r) => ({
    province: r.province,
    district: r.district,
    slug: D.districtSlug(r.district),
    population: r.population ?? 0,
    households: r.households,
    sexRatio: r.sex_ratio,
  }));
  return { rows };
});

/** /districts/{slug}: one district's census history, survey indicators, economy and farms (two calls). */
export const getDistrictProfile = createServerFn({ method: "GET" })
  .validator((input: { slug: string }) => input)
  .handler(async ({ data }) => {
    const api = await import("./client.server");
    const D = await import("./districts");
    const hit = (await api.fetchRegionalDistricts()).find((r) => D.districtSlug(r.district) === data.slug);
    if (!hit) return null;
    const payload = await api.fetchRegionalDistrict(hit.district);
    if (!payload) return null;
    return { ...D.assembleProfile(payload), apiBase: api.publicApiBase() };
  });

// ---- DSE market -----------------------------------------------------------

export const getMarketOverview = createServerFn({ method: "GET" }).handler(async () => {
  const api = await import("./client.server");
  return api.fetchMarketOverview();
});

export const getMarketSecurities = createServerFn({ method: "GET" })
  .validator((input: { q?: string; sector?: string; limit?: number }) => input)
  .handler(async ({ data }) => {
    const api = await import("./client.server");
    return api.fetchMarketSecurities(data);
  });
