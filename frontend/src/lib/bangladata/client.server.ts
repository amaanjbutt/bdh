import {
  CALENDAR,
  CATALOG,
  CATALOG_BY_ID,
  COMMODITY_CITIES,
  COMMODITY_ITEMS,
  MODULE_BY_SLUG,
  PLANS,
  toBackendModule,
  toFrontendModule,
} from "./catalog";
import { getRequest } from "@tanstack/react-start/server";
import { buildSeries, buildStatus } from "./fixtures";
import type { AgriCommodity, AgriMarket, AgriPrice } from "./mandi";
import type { SearchHit } from "./search";
import type {
  CalendarEntry,
  CatalogRecord,
  FundExpense,
  FundNav,
  FundPayout,
  FundRecord,
  FundReturns,
  DebtTrade,
  Plan,
  SecurityPrice,
  SecurityRecord,
  SeriesResponse,
  StatusResponse,
} from "./types";

/**
 * The only module that talks to the BanglaDataHub API.
 *
 * BANGLADATA_API_BASE and BANGLADATA_API_KEY are read inside each function, never at
 * module scope, and never reach the browser — every caller goes through a
 * server function. Until the base URL is configured, each read resolves from
 * the local fixtures, which are shaped exactly like the documented responses.
 */

function base(): string | null {
  const value = process.env['BANGLADATA_API_BASE'];
  return value && value.length > 0 ? value.replace(/\/$/, "") : null;
}

type ApiBinding = { fetch: (request: Request) => Promise<Response> };

/** Service binding to the API Worker. Worker-to-worker fetches on the same
 *  workers.dev zone are blocked (Cloudflare 1042), so the site calls the API
 *  through this binding instead of a public hostname. */
function apiBinding(): ApiBinding | undefined {
  return (globalThis as { __BDH_ENV?: { API?: ApiBinding } }).__BDH_ENV?.API;
}

async function apiFetch(path: string, init: RequestInit): Promise<Response> {
  const bound = apiBinding();
  if (bound) {
    return bound.fetch(new Request(`https://api.internal${path}`, init));
  }
  const root = base();
  if (!root) throw new Error("API base is not configured");
  return fetch(`${root}${path}`, init);
}

/**
 * The bangladatahub.com page this server call is rendering, sent as `X-BanglaData-Page` so
 * the API's request log can attribute the site's own traffic per page. During SSR the
 * incoming request IS the page; a server-function call (client-side navigation) comes
 * from the page in its Referer. Paths only — never query strings.
 */
function currentPage(): string | null {
  try {
    const req = getRequest();
    const url = new URL(req.url);
    if (!url.pathname.startsWith("/_serverFn")) return url.pathname;
    const ref = req.headers.get("referer");
    return ref ? new URL(ref).pathname : null;
  } catch {
    return null; // outside a request (build scripts)
  }
}

async function call<T>(path: string, keyed: boolean): Promise<T | null> {
  const root = base();
  if (!root && !apiBinding()) return null;

  const headers: Record<string, string> = { accept: "application/json" };
  const page = currentPage();
  if (page) headers["X-BanglaData-Page"] = page.slice(0, 200);
  if (keyed) {
    const key = process.env['BANGLADATA_API_KEY'];
    if (!key) return null;
    headers["X-API-Key"] = key;
  }

  // Hard timeout: never let a slow/hung API stall the SSR — the Worker would
  // then time out and Cloudflare surfaces a 5xx/522. On abort we return null and
  // the page renders from fixtures / degrades gracefully.
  const attempt = async (): Promise<Response> =>
    apiFetch(path, { headers, signal: AbortSignal.timeout(6000) });

  try {
    let res = await attempt();
    if (res.status === 429) {
      const wait = Number(res.headers.get("retry-after") ?? "1");
      await new Promise((r) => setTimeout(r, Math.min(wait, 5) * 1000));
      res = await attempt();
    }
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

// Friendly module slugs ↔ API slugs: one shared map in catalog.ts.

/**
 * Call the API with the *user's* own key (for the dashboard). The key transits
 * our server function but is never persisted. Returns status so the caller can
 * distinguish 401 (bad key) from other failures.
 */
export async function keyedFetch<T>(
  path: string,
  key: string,
  init?: { method?: string; body?: unknown },
): Promise<{ ok: boolean; status: number; data: T | null }> {
  const root = base();
  if (!root && !apiBinding()) return { ok: false, status: 0, data: null };
  const headers: Record<string, string> = { accept: "application/json", "X-API-Key": key };
  if (init?.body !== undefined) headers["content-type"] = "application/json";
  try {
    const res = await apiFetch(path, {
      method: init?.method ?? "GET",
      headers,
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
    let data: T | null = null;
    try {
      data = (await res.json()) as T;
    } catch {
      data = null;
    }
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: null };
  }
}

export function apiConfigured(): boolean {
  return base() !== null;
}

/**
 * POST JSON to a public backend endpoint (the /auth/* flow). Returns the parsed
 * body plus a human-readable error message pulled from the API envelope.
 */
export async function publicPost<T = Record<string, unknown>>(
  path: string,
  body: unknown,
): Promise<{ ok: boolean; status: number; data: T | null; error?: string }> {
  const root = base();
  if (!root && !apiBinding()) return { ok: false, status: 0, data: null, error: "Service unavailable." };
  try {
    const res = await apiFetch(path, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
    });
    const parsed = (await res.json().catch(() => null)) as
      | (T & { error?: { message?: string } })
      | null;
    if (res.ok) return { ok: true, status: res.status, data: parsed as T };
    return {
      ok: false,
      status: res.status,
      data: null,
      error: parsed?.error?.message ?? "Something went wrong. Please try again.",
    };
  } catch {
    return { ok: false, status: 0, data: null, error: "Could not reach the server." };
  }
}

/**
 * GET a public backend endpoint (e.g. the one-time key claim). Returns the parsed
 * body plus status so the caller can tell 404 (no/expired token) from success.
 */
export async function publicGet<T = Record<string, unknown>>(
  path: string,
): Promise<{ ok: boolean; status: number; data: T | null; error?: string }> {
  const root = base();
  if (!root && !apiBinding()) return { ok: false, status: 0, data: null, error: "Service unavailable." };
  try {
    const res = await apiFetch(path, { headers: { accept: "application/json" } });
    const parsed = (await res.json().catch(() => null)) as
      | (T & { error?: { message?: string } })
      | null;
    if (res.ok) return { ok: true, status: res.status, data: parsed as T };
    return {
      ok: false,
      status: res.status,
      data: null,
      error: parsed?.error?.message ?? "Something went wrong.",
    };
  } catch {
    return { ok: false, status: 0, data: null, error: "Could not reach the server." };
  }
}

/**
 * Call the API authenticated by a dashboard **session token** (from login).
 * Mirrors keyedFetch but sends X-Session-Token instead of X-API-Key.
 */
export async function sessionFetch<T>(
  path: string,
  token: string,
  init?: { method?: string; body?: unknown },
): Promise<{ ok: boolean; status: number; data: T | null }> {
  const root = base();
  if (!root && !apiBinding()) return { ok: false, status: 0, data: null };
  const headers: Record<string, string> = {
    accept: "application/json",
    "X-Session-Token": token,
  };
  if (init?.body !== undefined) headers["content-type"] = "application/json";
  try {
    const res = await apiFetch(path, {
      method: init?.method ?? "GET",
      headers,
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
    let data: T | null = null;
    try {
      data = (await res.json()) as T;
    } catch {
      data = null;
    }
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: null };
  }
}

export async function fetchCatalog(params?: {
  module?: string;
  q?: string;
  source?: string;
  limit?: number;
}): Promise<CatalogRecord[]> {
  const search = new URLSearchParams();
  if (params?.module) search.set("module", toBackendModule(params.module));
  if (params?.q) search.set("q", params.q);
  if (params?.source) search.set("source", params.source);
  if (params?.limit) search.set("limit", String(params.limit));
  const qs = search.toString();

  // The API filters by module and q server-side, so live rows come back ready to
  // use (they carry backend module slugs). Fixtures carry the friendly slugs, so
  // they are filtered here against the original param.
  const live = await call<{ data: CatalogRecord[] }>(`/v1/catalog${qs ? `?${qs}` : ""}`, false);
  if (live?.data) return live.data;

  return CATALOG.filter((r) => {
    if (params?.module && r.module !== params.module) return false;
    if (params?.q) {
      const q = params.q.toLowerCase();
      return r.id.toLowerCase().includes(q) || r.name.toLowerCase().includes(q);
    }
    return true;
  });
}

/** Like fetchCatalog but returns the total count too (for pagination) and
 *  supports offset + canonical_only (hub listings skip label-duplicates). */
export async function fetchCatalogPage(params: {
  module?: string;
  q?: string;
  limit?: number;
  offset?: number;
  canonicalOnly?: boolean;
}): Promise<{ data: CatalogRecord[]; count: number }> {
  const search = new URLSearchParams();
  if (params.module) search.set("module", toBackendModule(params.module));
  if (params.q) search.set("q", params.q);
  if (params.limit) search.set("limit", String(params.limit));
  if (params.offset) search.set("offset", String(params.offset));
  if (params.canonicalOnly) search.set("canonical_only", "true");
  const qs = search.toString();
  const live = await call<{ data: CatalogRecord[]; pagination?: { count: number } }>(
    `/v1/catalog${qs ? `?${qs}` : ""}`,
    false,
  );
  if (live?.data) return { data: live.data, count: live.pagination?.count ?? live.data.length };
  const all = CATALOG.filter((r) => !params.module || r.module === params.module);
  const off = params.offset ?? 0;
  return { data: all.slice(off, off + (params.limit ?? 60)), count: all.length };
}

export async function fetchSearch(q: string, module?: string, limit = 25): Promise<SearchHit[]> {
  if (!q.trim()) return [];
  const search = new URLSearchParams({ q: q.trim(), limit: String(limit), kinds: module ? "series" : "all" });
  if (module) search.set("module", toBackendModule(module));
  const live = await call<{ data: (SearchHit & { module?: string; name?: string })[] }>(
    `/v1/search?${search.toString()}`,
    false,
  );
  if (live?.data) {
    return live.data.map((r): SearchHit => {
      const kind = r.kind ?? "series";
      if (kind !== "series") return r;
      const id = r.id ?? "";
      return {
        ...r,
        kind: "series" as const,
        title: r.title ?? r.name ?? id,
        subtitle: r.subtitle ?? id,
        url: r.url ?? `/series/${id}`,
        ...(r.module ? { module: toFrontendModule(r.module) } : {}),
      } as SearchHit;
    });
  }

  // Fixture fallback: filter the local catalog with the same fields the API ranks.
  const needle = q.trim().toLowerCase();
  return CATALOG.filter(
    (r) => r.id.toLowerCase().includes(needle) || r.name.toLowerCase().includes(needle),
  )
    .slice(0, limit)
    .map((r) => ({
      kind: "series" as const,
      title: r.name,
      subtitle: r.id,
      url: `/series/${r.id}`,
      id: r.id,
      module: r.module,
      unit: r.unit,
      frequency: r.frequency,
    }));
}

export async function fetchCatalogRecord(id: string): Promise<CatalogRecord | null> {
  // GET /v1/catalog/{id} returns the record directly (not wrapped in {data}).
  const live = await call<CatalogRecord>(`/v1/catalog/${encodeURIComponent(id)}`, false);
  return live ?? CATALOG_BY_ID[id] ?? null;
}

export async function fetchSeries(
  id: string,
  options?: {
    from?: string;
    limit?: number;
    dims?: Record<string, string> | undefined;
    transform?: string | undefined;
  },
): Promise<SeriesResponse | null> {
  // Newest first, then reversed: the API caps a page at 5,000 rows, and an ascending
  // pull of a long daily series (BIBOR since 2005, both sides ≈ 11,000 rows) stopped in
  // 2014 — series pages showed a 2014 "latest". Page backwards with `to` until the
  // history (or the caller's `limit`) is covered.
  const PAGE = 5000;
  const want = options?.limit ?? 20_000;
  const base = new URLSearchParams();
  if (options?.from) base.set("from", options.from);
  base.set("sort", "desc");
  // Server-side transform (yoy|mom|pct_change|3ma|index) — computed on the full
  // series by the API before we downsample, so the shape stays correct.
  if (options?.transform) base.set("transform", options.transform);
  if (options?.dims) {
    base.set(
      "dims",
      Object.entries(options.dims)
        .map(([k, v]) => `${k}:${v}`)
        .join(","),
    );
  }

  let live: SeriesResponse | null = null;
  const rows: SeriesResponse["data"] = [];
  const seen = new Set<string>();
  const notes = new Map<string, NonNullable<SeriesResponse["meta"]["notes"]>[number]>();
  let to: string | undefined;
  for (let page = 0; page < 6 && rows.length < want; page++) {
    const search = new URLSearchParams(base);
    const size = Math.min(PAGE, want - rows.length + (to ? 50 : 0));
    search.set("limit", String(size));
    if (to) search.set("to", to);
    const res = await call<SeriesResponse>(`/v1/series/${encodeURIComponent(id)}?${search}`, true);
    if (!res) break;
    live = live ?? res;
    // notes come per page (only for that page's points) — keep every page's
    for (const n of res.meta?.notes ?? []) notes.set(`${n.date}|${JSON.stringify(n.dims ?? {})}`, n);
    let added = 0;
    for (const d of res.data) {
      const key = `${d.date}|${JSON.stringify((d as { dims?: unknown }).dims ?? {})}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push(d);
      added++;
    }
    if (res.data.length < size || !added) break;
    // next page ends at this page's oldest date (inclusive — other dims of that date
    // may not have fit); duplicates are dropped above
    to = res.data[res.data.length - 1]!.date;
  }
  const result = live
    ? { ...live, meta: { ...live.meta, notes: notes.size ? [...notes.values()] : null }, data: rows }
    : buildSeries(id, options?.dims);
  if (!result) return null;

  // Normalize: API observations carry a dims field and may serialize value as a
  // string; the chart wants { date, value:number } in ascending date order.
  let data = result.data
    .map((d) => ({ date: d.date, value: d.value === null ? null : Number(d.value) }))
    .filter((d): d is { date: string; value: number } => d.value !== null)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  if (options?.from) data = data.filter((d) => d.date >= options.from!);
  if (options?.limit && data.length > options.limit) data = data.slice(-options.limit);

  return { ...result, data };
}

/** Every row at a series' latest date, dims kept (for cross-sectional series: one row
 * per district / plant). `dims` filters to the headline values (e.g. locality:total). */
export async function fetchLatestRows(
  id: string,
  dims?: Record<string, string> | undefined,
): Promise<{ date: string; value: number | string | null; dims?: Record<string, string> }[]> {
  const q = dims ? `?dims=${encodeURIComponent(Object.entries(dims).map(([k, v]) => `${k}:${v}`).join(","))}` : "";
  const live = await call<{ data?: { date: string; value: number | string | null; dims?: Record<string, string> }[] }>(
    `/v1/series/${encodeURIComponent(id)}/latest${q}`,
    true,
  );
  return live?.data ?? [];
}

/** A series' latest point with its unit and frequency, for headline figures (topic hubs). Where
 *  the latest date has several rows (BIBOR bid/offer, a national total and its parts) it takes
 *  the headline row — offer, national, total, sell — as the series page does. */
export async function fetchHeadline(
  id: string,
): Promise<{ date: string; value: number; unit: string; frequency: string } | null> {
  const live = await call<{
    meta?: { unit?: string; frequency?: string };
    data?: { date: string; value: number | string | null; dims?: Record<string, string> }[];
  }>(`/v1/series/${encodeURIComponent(id)}/latest`, true);
  const { pickHeadlineRow } = await import("./topics");
  const pick = pickHeadlineRow(live?.data ?? []);
  if (!pick || !live?.meta) return null;
  return { date: pick.date, value: Number(pick.value), unit: live.meta.unit ?? "", frequency: live.meta.frequency ?? "" };
}

export async function fetchLatest(
  id: string,
  dims?: Record<string, string> | undefined,
): Promise<SeriesResponse | null> {
  // Without dimensions, use the dedicated /latest endpoint — cheap and cacheable
  // rather than pulling a whole history to read the last point. With dimensions
  // we derive from the filtered series so the requested dim is honoured.
  if (!dims) {
    const live = await call<SeriesResponse>(`/v1/series/${encodeURIComponent(id)}/latest`, true);
    if (live?.data?.length) {
      return { ...live, data: live.data.map((d) => ({ date: d.date, value: Number(d.value) })) };
    }
  }
  if (dims) {
    // Newest two points for this dims group (for the change readout). Not via
    // fetchSeries: that pulls ascending with a 5,000-row page, so a daily series since
    // 2005 (BIBOR) stopped in 2023 and the homepage showed a 20% "latest" BIBOR.
    const q = new URLSearchParams({
      sort: "desc",
      limit: "2",
      dims: Object.entries(dims).map(([k, v]) => `${k}:${v}`).join(","),
    });
    const live = await call<SeriesResponse>(`/v1/series/${encodeURIComponent(id)}?${q}`, true);
    if (live?.data?.length) {
      const pts = live.data.map((d) => ({ date: d.date, value: Number(d.value) })).reverse();
      return { ...live, data: pts };
    }
  }
  const full = await fetchSeries(id, { dims });
  if (!full || full.data.length === 0) return null;
  const last = full.data[full.data.length - 1];
  const prev = full.data[full.data.length - 2];
  return { ...full, data: prev ? [prev, last!] : [last!] };
}

interface BackendStatusModule {
  module: string;
  last_date: string | null;
  series_count: number;
  observation_count: number;
  frequency?: string | null;
  age_days?: number | null;
  state?: "fresh" | "delayed" | "stale";
}

type BackendOps = { p95_ms: number | null; availability_pct: number | null; requests_24h: number };

interface BackendDataset {
  dataset: string;
  records: number;
  entities: number;
  last_date: string | null;
  frequency?: string;
  age_days?: number | null;
  state?: "fresh" | "delayed" | "stale";
}
const DATASET_NAMES: Record<string, string> = {
  funds: "Mutual Funds (NAVs)",
  securities: "Debt Securities",
  trade: "External Trade",
  auctions: "Auctions",
  agri: "Wholesale (Mandi) Prices",
};

export async function fetchStatus(): Promise<StatusResponse> {
  const live = await call<{ modules: BackendStatusModule[]; datasets?: BackendDataset[]; ops?: BackendOps; totals?: { series?: number } }>("/v1/status", false);
  if (!live?.modules) return buildStatus();

  const fallback = buildStatus();
  const fbByModule = Object.fromEntries(fallback.modules.map((m) => [m.module, m]));
  const now = Date.now();

  const modules = live.modules
    .map((m) => {
      const slug = toFrontendModule(m.module);
      const def = MODULE_BY_SLUG[slug];
      const shell = fbByModule[slug];
      const last = m.last_date;
      return {
        module: slug,
        name: def?.name ?? shell?.name ?? slug,
        // Real values straight from the API — no synthesized freshness/history.
        last_run: last ? `${last}T00:00:00Z` : (shell?.last_run ?? new Date(now).toISOString()),
        next_expected: "",
        frequency: m.frequency ?? "",
        age_days: m.age_days ?? null,
        state: (m.state ?? "stale") as "fresh" | "current" | "delayed" | "stale",
        series: Number(m.series_count),
        observations: Number(m.observation_count),
        history: [] as number[],
      };
    })
    // Only surface modules the site knows how to present.
    .filter((m) => MODULE_BY_SLUG[m.module]);

  const datasets = (live.datasets ?? []).map((d) => ({
    key: d.dataset,
    name: DATASET_NAMES[d.dataset] ?? d.dataset,
    entities: Number(d.entities ?? 0),
    records: Number(d.records ?? 0),
    last_date: d.last_date ? `${d.last_date}T00:00:00Z` : null,
    frequency: d.frequency ?? "",
    age_days: d.age_days ?? null,
    state: (d.state ?? "stale") as "fresh" | "delayed" | "stale",
  }));

  // Newest data point anywhere — dedicated datasets included (mandi prices land daily).
  const lastDates = [...live.modules, ...(live.datasets ?? [])].map((m) => m.last_date).filter(Boolean) as string[];
  return {
    // Real ops metrics from the API (null until there's traffic to measure).
    availability_pct: live.ops?.availability_pct ?? null,
    p95_ms: live.ops?.p95_ms ?? null,
    requests_24h: live.ops?.requests_24h ?? 0,
    // Totals cover EVERY module (the table above only shows the 10 the site presents;
    // summing those undercounted the catalog — 16,579 vs 16,906 active series).
    observations: live.modules.reduce((a, m) => a + Number(m.observation_count), 0),
    series: live.totals?.series ?? live.modules.reduce((a, m) => a + Number(m.series_count), 0),
    last_ingestion: lastDates.length
      ? `${lastDates.sort().at(-1)}T00:00:00Z`
      : fallback.last_ingestion,
    modules,
    datasets,
  } as StatusResponse;
}

interface BackendPlan {
  plan: string;
  price_usd_month: number;
  requests_per_day: number;
  requests_per_min: number;
  free_credits: number | null;
  history: string;
  funds_and_alternate: boolean;
  for?: string;
  usage_rights?: "internal" | "display";
  vintages?: boolean;
  webhooks?: number | null;
  sla?: boolean;
}

export async function fetchPlans(): Promise<Plan[]> {
  const live = await call<{ plans: BackendPlan[] }>("/v1/plans", false);
  if (!live?.plans?.length) return PLANS;

  // The API is the source of truth for prices and limits; the fixture carries the
  // marketing rows the API doesn't model (webhooks, bulk, vintages, support, cta).
  const shellById = Object.fromEntries(PLANS.map((p) => [p.id, p]));
  return live.plans.map((lp) => {
    const shell = shellById[lp.plan];
    return {
      ...(shell ?? ({} as Plan)),
      id: lp.plan,
      name: shell?.name ?? lp.plan.charAt(0).toUpperCase() + lp.plan.slice(1),
      price_monthly: lp.price_usd_month,
      requests_day: lp.requests_per_day,
      requests_min: lp.requests_per_min,
      free_credits: lp.free_credits ?? shell?.free_credits ?? null,
      history: shell?.history ?? lp.history,
      core_modules: shell?.core_modules ?? true,
      funds_alternate: lp.funds_and_alternate,
      for_who: lp.for ?? shell?.for_who,
      usage_rights: lp.usage_rights ?? shell?.usage_rights,
      vintages: lp.vintages ?? shell?.vintages ?? false,
      sla: lp.sla ?? shell?.sla ?? false,
      webhooks:
        lp.webhooks === undefined ? shell?.webhooks ?? "—"
        : lp.webhooks === null ? "Unlimited"
        : lp.webhooks === 0 ? "—"
        : String(lp.webhooks),
    };
  });
}

export async function fetchCalendar(next?: number): Promise<CalendarEntry[]> {
  const live = await call<{ data: CalendarEntry[] }>(
    `/v1/calendar${next ? `?next=${next}` : ""}`,
    false,
  );
  const rows = live?.data ?? CALENDAR;
  return next ? rows.slice(0, next) : rows;
}

export async function fetchCommodityEnums(): Promise<{
  items: { id: string; name: string }[];
  cities: string[];
}> {
  const items = await call<{ data: { id: string; name: string }[] }>(
    "/v1/commodities/items",
    false,
  );
  const cities = await call<{ data: string[] }>("/v1/commodities/cities", false);
  return { items: items?.data ?? COMMODITY_ITEMS, cities: cities?.data ?? COMMODITY_CITIES };
}

/** The public request URL shown in the API drawer and used by CSV links. */
export function publicApiBase(): string {
  return process.env['BANGLADATA_PUBLIC_API_BASE'] ?? "https://api.bangladatahub.com";
}

// ---- Mutual funds ----------------------------------------------------------
// The fund endpoints are keyed, so these fetch server-side with the SSR key
// (same model as series pages). Without a configured API base they resolve to
// empty results — there are no fund fixtures — so the pages degrade gracefully.

export async function fetchFunds(params?: {
  amc?: string;
  category?: string;
  sector?: string;
  q?: string;
  limit?: number;
}): Promise<FundRecord[]> {
  const search = new URLSearchParams();
  if (params?.amc) search.set("amc", params.amc);
  if (params?.category) search.set("category", params.category);
  if (params?.sector) search.set("sector", params.sector);
  if (params?.q) search.set("q", params.q);
  search.set("limit", String(params?.limit ?? 1000));
  const live = await call<{ data: FundRecord[] }>(`/v1/funds?${search.toString()}`, true);
  return live?.data ?? [];
}

export async function fetchFund(fundId: number): Promise<
  { fund: FundRecord; latest_nav: FundNav | null } | null
> {
  const live = await call<{ fund: FundRecord; latest_nav: FundNav | null }>(
    `/v1/funds/${fundId}`,
    true,
  );
  return live ?? null;
}

export async function fetchFundNav(fundId: number): Promise<FundNav[]> {
  const live = await call<{ data: FundNav[] }>(
    `/v1/funds/${fundId}/nav?sort=asc&limit=5000`,
    true,
  );
  const rows = live?.data ?? [];
  return rows
    .map((r) => ({ ...r, nav: r.nav === null ? null : Number(r.nav) }))
    .filter((r): r is FundNav => r.nav !== null)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

export async function fetchFundReturns(fundId: number): Promise<FundReturns[]> {
  const live = await call<{ data: FundReturns[] }>(
    `/v1/funds/${fundId}/returns?sort=desc&limit=1`,
    true,
  );
  return live?.data ?? [];
}

export async function fetchFundPayouts(fundId: number): Promise<FundPayout[]> {
  const live = await call<{ data: FundPayout[] }>(
    `/v1/funds/${fundId}/payouts?limit=50`,
    true,
  );
  return live?.data ?? [];
}

export async function fetchFundExpenses(fundId: number): Promise<FundExpense[]> {
  const live = await call<{ data: FundExpense[] }>(
    `/v1/funds/${fundId}/expenses?limit=1`,
    true,
  );
  return live?.data ?? [];
}

export async function fetchFundPortfolio(
  fundId: number,
): Promise<{ as_of: string | null; data: { asset_class: string; percent: number | null }[] }> {
  const live = await call<{
    as_of: string | null;
    data: { asset_class: string; percent: number | null }[];
  }>(`/v1/funds/${fundId}/portfolio`, true);
  return { as_of: live?.as_of ?? null, data: live?.data ?? [] };
}

export interface FundAnalytics {
  trailing_returns: Record<string, number | null>;
  annualized_returns: Record<string, number | null>;
  cagr_since_inception: number | null;
  volatility_annualized: number | null;
  max_drawdown: number | null;
  first_date: string | null;
  last_date: string | null;
  observations: number;
}

export async function fetchFundAnalytics(fundId: number): Promise<FundAnalytics | null> {
  const live = await call<FundAnalytics>(`/v1/funds/${fundId}/analytics`, true);
  return live ?? null;
}

export interface ScreenerFund {
  fund_id: number;
  name: string;
  amc: string | null;
  category: string | null;
  sector: string | null;
  rating: string | null;
  benchmark: string | null;
  nav: { date: string; value: number | null } | null;
  returns: { as_of: string; ytd: number | null; m3: number | null; y1: number | null } | null;
  ter_ytd: number | null;
  ter_as_of: string | null;
}

// One cheap aggregate call for the whole ranked screener (no per-fund fan-out).
export async function fetchFundScreener(): Promise<ScreenerFund[]> {
  const live = await call<{ data: ScreenerFund[] }>(`/v1/funds/screener`, true);
  return live?.data ?? [];
}

// ---- AMCs (asset-management companies) -------------------------------------

export interface AmcSummary {
  amc: string;
  fund_count: number;
  avg_ter_ytd: number | null;
  oldest_inception: string | null;
  categories: string[];
}

export interface AmcProfile extends AmcSummary {
  rating_distribution: Record<string, number>;
  funds: { fund_id: number; name: string; category: string | null; inception_date: string | null }[];
}

export async function fetchAmcs(): Promise<AmcSummary[]> {
  const live = await call<{ data: AmcSummary[] }>(`/v1/amcs`, true);
  return live?.data ?? [];
}

export async function fetchAmc(amc: string): Promise<AmcProfile | null> {
  const live = await call<AmcProfile>(`/v1/amcs/${encodeURIComponent(amc)}`, true);
  return live && (live as { success?: boolean }).success !== false ? live : null;
}

// ---- Debt securities -------------------------------------------------------
// Encode a security code for a URL path, preserving the slashes in corporate
// TFC codes (e.g. ABPL/SUK/220817) as real path separators while escaping the
// rest. The backend prices route accepts the code as a {code:path} segment.
function encodeSecurityCode(code: string): string {
  return code.split("/").map(encodeURIComponent).join("/");
}

export async function fetchSecurities(params?: {
  type?: string;
  q?: string;
  limit?: number;
}): Promise<SecurityRecord[]> {
  const search = new URLSearchParams();
  if (params?.type) search.set("type", params.type);
  if (params?.q) search.set("q", params.q);
  search.set("limit", String(params?.limit ?? 1000));
  const live = await call<{ data: SecurityRecord[] }>(`/v1/securities?${search.toString()}`, true);
  return live?.data ?? [];
}

/** Find one security's metadata by exact code (via the q= search). */
export async function fetchSecurity(code: string): Promise<SecurityRecord | null> {
  const rows = await fetchSecurities({ q: code, limit: 50 });
  return rows.find((r) => r.code === code) ?? null;
}

export async function fetchDebtTrades(params?: {
  issue?: string;
  limit?: number;
}): Promise<DebtTrade[]> {
  const search = new URLSearchParams();
  if (params?.issue) search.set("issue", params.issue);
  search.set("limit", String(params?.limit ?? 300));
  const live = await call<{ data: DebtTrade[] }>(`/v1/securities/trades?${search.toString()}`, true);
  return live?.data ?? [];
}

export async function fetchSecurityPrices(code: string): Promise<SecurityPrice[]> {
  const live = await call<{ data: SecurityPrice[] }>(
    `/v1/securities/${encodeSecurityCode(code)}/prices?sort=asc&limit=5000`,
    true,
  );
  const rows = live?.data ?? [];
  return rows
    .map((r) => ({ ...r, price: r.price === null ? null : Number(r.price) }))
    .filter((r): r is SecurityPrice => r.price !== null)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

// ---- Wholesale (mandi) prices — Punjab + Sindh ----------------------------------

/** Every market in both provinces (readable names, province, region). */
export async function fetchAgriMarkets(): Promise<AgriMarket[]> {
  const live = await call<{ data: AgriMarket[] }>(`/v1/agri/markets`, false);
  return live?.data ?? [];
}

/** Every commodity in both provinces, with its crop (the Punjab commodity of the same crop). */
export async function fetchAgriCommodities(): Promise<AgriCommodity[]> {
  const live = await call<{ data: AgriCommodity[] }>(`/v1/agri/commodities`, false);
  return live?.data ?? [];
}

/** Latest price per (commodity, market) in the last 30 days — a commodity, a market, a crop
 *  (every province's varieties of it), or a combination. */
export async function fetchAgriLatest(params: { commodity?: string; market?: string; crop?: string }): Promise<AgriPrice[]> {
  const search = new URLSearchParams();
  if (params.commodity) search.set("commodity", params.commodity);
  if (params.market) search.set("market", params.market);
  if (params.crop) search.set("crop", params.crop);
  const live = await call<{ data: AgriPrice[] }>(`/v1/agri/latest?${search}`, true);
  return live?.data ?? [];
}

/** Daily prices for one commodity in one market, oldest first. */
export async function fetchAgriPrices(params: {
  commodity: string;
  market: string;
  from?: string;
  limit?: number;
}): Promise<AgriPrice[]> {
  const search = new URLSearchParams({
    commodity: params.commodity,
    market: params.market,
    sort: "asc",
    limit: String(params.limit ?? 1000),
  });
  if (params.from) search.set("from", params.from);
  const live = await call<{ data: AgriPrice[] }>(`/v1/agri/prices?${search}`, true);
  return live?.data ?? [];
}

// ---- Revision history (vintages) ------------------------------------------------

export interface RevisionPoint {
  date: string;
  dims: Record<string, string>;
  value: number | null;
  first_print: number | null;
  first_seen: string | null;
  revisions: { value: number | null; until: string; source: string }[];
}

/** Points whose value changed since first print, newest first (Pro endpoint — read with
 *  the site key; pages show a short teaser). */
export async function fetchRevisions(
  id: string,
  options?: { dims?: Record<string, string> | undefined; limit?: number },
): Promise<RevisionPoint[]> {
  const search = new URLSearchParams({ changed_only: "true", sort: "desc", limit: String(options?.limit ?? 200) });
  if (options?.dims)
    search.set("dims", Object.entries(options.dims).map(([k, v]) => `${k}:${v}`).join(","));
  const live = await call<{ data: RevisionPoint[] }>(`/v1/series/${encodeURIComponent(id)}/revisions?${search}`, true);
  return live?.data ?? [];
}

// ---- Trade by product x partner country (/v1/trade/hs …) -------------------------------------

export interface TradeRow {
  fy: number;
  fiscal_year: string;
  code?: string;
  /** readable name: official HS/SITC text, or BBS's wording spelled out */
  product?: string;
  /** BBS's original abbreviated text */
  product_raw?: string;
  /** the official parent heading (HS 6-digit / SITC 5-digit) */
  hs_heading?: string | null;
  country?: string;
  unit?: string | null;
  quantity?: number | null;
  value_pkr_th: number | null;
  value_usd_th: number | null;
  share_pct?: number | null;
}

type TradeFlow = "export" | "import";

export interface TradeProduct {
  code: string;
  classification: string;
  /** readable name (official text where the code is the official item) */
  name: string;
  short_name: string | null;
  hs_heading: string | null;
  /** BBS's original abbreviated text */
  description: string;
  unit: string | null;
  first_fy: number;
  last_fy: number;
}

export async function fetchTradeProducts(q: string, limit = 20) {
  const res = await call<{ data?: TradeProduct[] }>(
    `/v1/trade/products?q=${encodeURIComponent(q)}&limit=${limit}`,
    false,
  );
  return res?.data ?? [];
}

export async function fetchTradeCountries(flow: TradeFlow) {
  const res = await call<{ data?: { country: string; first_fy: number; last_fy: number }[] }>(
    `/v1/trade/countries?flow=${flow}`,
    false,
  );
  return res?.data ?? [];
}

/** Products ranked for a year (country "All countries" = the product totals). */
export async function fetchTradeTopProducts(flow: TradeFlow, fy: number, country = "All countries", limit = 25) {
  const res = await call<{ data?: TradeRow[] }>(
    `/v1/trade/partner-products?flow=${flow}&fy=${fy}&country=${encodeURIComponent(country)}&limit=${limit}`,
    true,
  );
  return res?.data ?? [];
}

export async function fetchTradePartners(flow: TradeFlow, fy: number, code?: string, limit = 25) {
  const c = code ? `&code=${encodeURIComponent(code)}` : "";
  const res = await call<{ data?: TradeRow[] }>(`/v1/trade/partners?flow=${flow}&fy=${fy}${c}&limit=${limit}`, true);
  return res?.data ?? [];
}

/** A product's yearly totals (all partners). */
export async function fetchTradeProductHistory(flow: TradeFlow, code: string) {
  const res = await call<{ data?: TradeRow[] }>(
    `/v1/trade/hs?flow=${flow}&code=${encodeURIComponent(code)}&country=${encodeURIComponent("All countries")}&limit=200`,
    true,
  );
  return (res?.data ?? []).slice().sort((a, b) => a.fy - b.fy);
}

/** Raw rows of a series, dims kept (one page, newest first). For place profiles that need
 * several breakdowns of one series at once. */
export async function fetchSeriesRows(
  id: string,
  dims?: Record<string, string>,
  limit = 2000,
): Promise<{ date: string; value: number; dims: Record<string, string> }[]> {
  const q = new URLSearchParams({ limit: String(limit), sort: "desc" });
  if (dims && Object.keys(dims).length)
    q.set("dims", Object.entries(dims).map(([k, v]) => `${k}:${v}`).join(","));
  const res = await call<{ data?: { date: string; value: number | string | null; dims?: Record<string, string> }[] }>(
    `/v1/series/${encodeURIComponent(id)}?${q}`,
    true,
  );
  return (res?.data ?? [])
    .filter((r) => r.value !== null && r.value !== "")
    .map((r) => ({ date: r.date, value: Number(r.value), dims: r.dims ?? {} }));
}

export async function fetchRegionalDistricts() {
  const res = await call<{ data?: { province: string; district: string; population: number | null; households: number | null; sex_ratio: number | null }[] }>(
    "/v1/regional/districts",
    false,
  );
  return res?.data ?? [];
}

export async function fetchRegionalDistrict(name: string) {
  const res = await call<{ data?: import("./districts").DistrictPayload }>(
    `/v1/regional/district/${encodeURIComponent(name)}`,
    true,
  );
  return res?.data ?? null;
}


/** One product heading or code, everything its page shows (one call). */
export async function fetchTradeProductPage(code: string, fy?: number) {
  const res = await call<{ data?: import("./trade").TradeProductPage }>(
    `/v1/trade/product/${encodeURIComponent(code)}${fy ? `?fy=${fy}` : ""}`,
    true,
  );
  return res?.data ?? null;
}

/** One partner, everything its page shows (one call). */
export async function fetchTradePartnerPage(slug: string, fy?: number) {
  const res = await call<{ data?: import("./trade").TradePartnerPage }>(
    `/v1/trade/partner/${encodeURIComponent(slug)}${fy ? `?fy=${fy}` : ""}`,
    true,
  );
  return res?.data ?? null;
}

/** The products and partners with an indexable page (public). */
export async function fetchTradePages() {
  return call<import("./trade").TradePagesIndex>("/v1/trade/pages", false);
}

// ---- DSE market (2026-10-31) ----------------------------------------------

export type MarketOverviewResponse = {
  success: boolean;
  indices: { code: string; date: string; value: number | null; change: number | null; change_pct: number | null }[];
  session: {
    date: string | null; turnover_mn: number | null; volume: number | null; trades: number | null;
    advances: number | null; declines: number | null; unchanged: number | null;
    market_cap_total_mn: number | null;
  };
} | null;

export type MarketSecuritiesResponse = {
  success: boolean;
  data: {
    code: string; name: string | null; sector: string | null; board: string | null;
    category: string | null; asset_type: string | null; date: string | null;
    ltp: number | null; ycp: number | null; close: number | null;
    volume: number | null; value_mn: number | null; trades: number | null;
    change_pct: number | null;
  }[];
  count: number;
} | null;

export async function fetchMarketOverview(): Promise<MarketOverviewResponse> {
  return call<MarketOverviewResponse>("/v1/market/overview", false);
}

export async function fetchMarketSecurities(params?: { q?: string; sector?: string; limit?: number }): Promise<MarketSecuritiesResponse> {
  const qs = new URLSearchParams();
  if (params?.q) qs.set("q", params.q);
  if (params?.sector) qs.set("sector", params.sector);
  qs.set("limit", String(params?.limit ?? 1000));
  return call<MarketSecuritiesResponse>(`/v1/market/securities?${qs.toString()}`, true);
}
