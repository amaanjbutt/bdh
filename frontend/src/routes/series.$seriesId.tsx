import { queryOptions, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { Link, createFileRoute, notFound } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { Chart } from "@/components/site/chart";
import { CodeTabs } from "@/components/site/code-tabs";
import { Figure } from "@/components/site/figure";
import { Eyebrow, Panel, PanelHeadline, PanelInner } from "@/components/site/panel";
import { getSeriesForPlan, getSeriesPage } from "@/lib/bangladata/api.functions";
import { accountEmail } from "@/lib/bangladata/dashboard.functions";
import { CATALOG_BY_ID, MODULE_BY_SLUG, toFrontendModule } from "@/lib/bangladata/catalog";
import { getSeriesContent } from "@/lib/bangladata/series-content";
import { seriesDepth } from "@/lib/bangladata/series-depth";
import type { CrossSection } from "@/lib/bangladata/cross-section";
import { composeSeriesSeo, discontinuedSince, seriesCanonical, seriesJsonLd } from "@/lib/bangladata/seo";
import {
  changeBetween,
  fmtCount,
  fmtDate,
  fmtNumber,
  fmtValue,
  frequencyLabel,
  periodLabel,
  unitLabel,
} from "@/lib/bangladata/format";

const SESSION_KEY = "bangladatahub-session";

const seriesQuery = (id: string) =>
  queryOptions({
    queryKey: ["series", id],
    queryFn: () => getSeriesPage({ data: { id } }),
    staleTime: 60_000,
  });

// Server-side transforms, offered only where they make sense for the series'
// release cadence (the API 422s an ill-fitting transform — e.g. MoM on a daily
// series — so we never surface those buttons).
const TRANSFORM_OPTIONS: { key: string | undefined; label: string; freqs?: string[] }[] = [
  { key: undefined, label: "Level" },
  { key: "yoy", label: "YoY %", freqs: ["daily", "weekly", "monthly", "quarterly"] },
  { key: "mom", label: "MoM %", freqs: ["monthly"] },
  { key: "pct_change", label: "Δ %" },
  { key: "index", label: "Index=100" },
  { key: "3ma", label: "3-pt avg" },
];

function transformOptionsFor(frequency: string) {
  const freq = (frequency || "").toLowerCase();
  return TRANSFORM_OPTIONS.filter((t) => !t.freqs || t.freqs.includes(freq));
}

export const Route = createFileRoute("/series/$seriesId")({
  loader: async ({ context, params }) => {
    const data = await context.queryClient.ensureQueryData(seriesQuery(params.seriesId));
    if (!data) throw notFound();
    return data;
  },
  head: ({ params, loaderData }) => {
    // Prefer the live record from the loader; fall back to the fixture catalog so
    // metadata works before the API is wired. Title/description/JSON-LD come from
    // the shared seo.ts so the crawler renderer (bot-render.ts) emits the same.
    const r = loaderData?.record ?? CATALOG_BY_ID[params.seriesId];
    const seo = r ? composeSeriesSeo(r) : null;
    const title = seo ? seo.title : "Series — BanglaDataHub";
    const description = seo ? seo.description : "A Bangladeshi economic time series on BanglaDataHub.";
    const scripts = r
      ? seriesJsonLd(r).map((o) => ({ type: "application/ld+json", children: JSON.stringify(o) }))
      : [];
    // Label-duplicate pages (identical name + description as another series)
    // point their canonical at the original and drop out of the index, so the
    // ~1,140 twins stop competing with each other for the same query.
    const { canonicalId, isDupe } = seriesCanonical(r, params.seriesId);
    return {
      meta: [
        { title },
        { name: "description", content: description },
        ...(isDupe ? [{ name: "robots", content: "noindex,follow" }] : []),
        { property: "og:title", content: title },
        { property: "og:description", content: description },
      ],
      links: [{ rel: "canonical", href: `https://bangladatahub.com/series/${canonicalId}` }],
      scripts,
    };
  },
  component: SeriesPage,
});

function SeriesPage() {
  const { seriesId } = Route.useParams();
  const { data } = useSuspenseQuery(seriesQuery(seriesId));
  // Transform state + fetch live above the early returns so hook order is stable.
  const [transform, setTransform] = useState<string | undefined>(undefined);
  const transformed = useQuery({
    queryKey: ["series", seriesId, "transform", transform],
    queryFn: () => getSeriesPage({ data: { id: seriesId, transform } }),
    enabled: !!transform,
    staleTime: 60_000,
  });
  // Session awareness — a signed-in visitor already has a key, so we drop the
  // teaser lock and the "get a key" nag. Checked client-side after mount (the
  // token lives in localStorage), so SSR/first render is the gated state.
  const [authed, setAuthed] = useState(false);
  // Tier-aware chart: a signed-in caller sees the history their plan allows (Free
  // 1y / Developer 10y / Pro+ full). Fetched client-side; SSR stays the free chart.
  const [planChart, setPlanChart] = useState<
    { data: { date: string; value: number }[]; gated: boolean; unlocked: string[]; plan: string } | null
  >(null);
  useEffect(() => {
    const t = typeof window !== "undefined" ? localStorage.getItem(SESSION_KEY) : null;
    if (!t) { setAuthed(false); setPlanChart(null); return; }
    void accountEmail({ data: { token: t } }).then((r) => setAuthed(!!(r.ok && r.email)));
    void getSeriesForPlan({ data: { seriesId, token: t } })
      .then((r) => {
        if (!r) return;
        const full = r.plan === "pro" || r.plan === "business";
        setPlanChart({ data: r.data, gated: !full, unlocked: r.unlocked, plan: r.plan });
      })
      .catch(() => {});
  }, [seriesId]);
  if (!data) return null;

  const { record, related, apiBase, tail, total, previewMonths } = data;
  const cross = data.crossSection ?? null;
  const shownDims = data.dims ?? undefined;
  const previewYears = Math.max(1, Math.round((previewMonths ?? 24) / 12));
  const baseSeries = data.series;
  if (!baseSeries) return null;
  // Use the transformed series (computed on full history server-side) when a
  // transform is active and loaded; otherwise the raw level.
  const series = (transform && transformed.data?.series) || baseSeries;
  const transformOptions = transformOptionsFor(baseSeries.meta.frequency);
  // Chart data respects the caller's plan (via planChart) on the level view; when a
  // transform is active it uses the transformed (free-window) series and stays gated.
  const usingTransform = !!(transform && transformed.data?.series);
  const chartData = usingTransform ? series.data : planChart?.data ?? baseSeries.data;
  const chartGated = usingTransform ? true : planChart ? planChart.gated : true;
  const chartUnlocked = usingTransform ? ["1Y"] : planChart?.unlocked ?? ["1Y"];
  const last = tail[tail.length - 1];
  const change = changeBetween(tail);
  // Summary statistics over the series shown (min/max/average + coverage span).
  const _vals = series.data.map((d) => d.value).filter((v): v is number => typeof v === "number");
  const stats = _vals.length
    ? {
        min: Math.min(..._vals),
        max: Math.max(..._vals),
        avg: _vals.reduce((a, b) => a + b, 0) / _vals.length,
        first: series.data[0]?.date ?? null,
        latest: series.data[series.data.length - 1]?.date ?? null,
      }
    : null;
  const modSlug = toFrontendModule(record.module);
  const mod = MODULE_BY_SLUG[modSlug];
  const content = getSeriesContent(record.id);
  const depth = seriesDepth(record);
  const endedOn = discontinuedSince(record.last_date, record.frequency);
  const useCases = content?.useCases.length ? content.useCases : depth.useCases;
  const personas = content?.personas.length ? content.personas : depth.personas;

  return (
    <main>
      <Panel ground="paper" full={false} className="pt-32 pb-10">
        <PanelInner>
          <nav className="eyebrow flex gap-2">
            <Link to="/coverage" className="hover:text-seal">
              Data
            </Link>
            <span>/</span>
            <Link
              to="/data/$module"
              params={{ module: modSlug }}
              className="hover:text-seal"
            >
              {mod?.name ?? record.module}
            </Link>
          </nav>
          <PanelHeadline as="h1" className="mt-6 text-[32px] md:text-[52px]">{record.name}</PanelHeadline>
          <p className="mt-5 max-w-[58ch] text-[17px] text-ink-soft">{record.description}</p>
          {data.topic ? (
            <p className="mt-3 text-[14px] text-ink-soft">
              Topic:{" "}
              <Link to="/topics/$topic" params={{ topic: data.topic.slug }} className="text-seal underline underline-offset-2">
                {data.topic.h1}
              </Link>
            </p>
          ) : null}
          {record.derived || data.notes?.length || (!cross && endedOn) ? (
            <div className="num mt-5 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.08em]">
              {!cross && endedOn ? (
                <a href="#about" className="border border-rule px-2 py-1 text-ink-soft hover:border-ink hover:text-ink">
                  Ended {endedOn}
                </a>
              ) : null}
              {record.derived ? (
                <a href="#about" className="border border-rule px-2 py-1 text-ink-soft hover:border-ink hover:text-ink">
                  Derived
                </a>
              ) : null}
              {data.notes?.length ? (
                <a href="#about" className="border border-rule px-2 py-1 text-ink-soft hover:border-ink hover:text-ink">
                  {data.notes.length} {data.notes.length === 1 ? "note" : "notes"} on the figures
                </a>
              ) : null}
            </div>
          ) : null}

          <div className={`mt-10 flex flex-wrap gap-x-12 gap-y-6 border-t border-rule pt-6 ${cross ? "hidden" : ""}`}>
            {last ? (
              <Figure
                label={`Latest · ${periodLabel(last.date, series.meta.frequency)}`}
                value={fmtValue(last.value, series.meta.unit)}
                sub={unitLabel(series.meta.unit)}
                seriesId={record.id}
                updated={series.meta.last_updated}
                size="lg"
              />
            ) : null}
            {change ? (
              <Figure
                label="Change on period"
                value={`${change.abs >= 0 ? "+" : ""}${fmtValue(change.abs, series.meta.unit)}`}
                sub={`${change.pct >= 0 ? "+" : ""}${fmtNumber(change.pct, 2)}%`}
                seriesId={record.id}
                updated={series.meta.last_updated}
                size="lg"
              />
            ) : null}
          </div>
        </PanelInner>
      </Panel>

      <Panel ground="paper" full={false} className="pb-12">
        <div className="mx-auto w-full max-w-[1160px] px-6 md:px-10">
          {cross ? <CrossSectionTable cross={cross} unit={series.meta.unit} seriesId={record.id} /> : null}
          {!cross && transformOptions.length > 1 ? (
            <div
              className="num mb-4 flex flex-wrap items-center gap-4 text-[12px] text-ink-soft"
              role="group"
              aria-label="Transform the series"
            >
              <span className="eyebrow">Transform</span>
              {transformOptions.map((t) => {
                const on = (transform ?? undefined) === t.key;
                return (
                  <button
                    key={t.label}
                    type="button"
                    onClick={() => setTransform(t.key)}
                    aria-pressed={on}
                    className={`px-1 uppercase tracking-[0.08em] transition-colors hover:text-ink ${
                      on ? "text-ink underline underline-offset-4" : ""
                    }`}
                  >
                    {t.label}
                  </button>
                );
              })}
              {transformed.isFetching ? <span className="text-ink-soft">computing…</span> : null}
            </div>
          ) : null}
          {!cross ? (
          <Chart
            seriesId={series.series}
            data={chartData}
            frequency={series.meta.frequency}
            unit={series.meta.unit}
            apiBase={apiBase}
            ground="paper"
            height={380}
            showTable={false}
            gated={chartGated}
            unlockedRanges={chartUnlocked}
            authed={authed}
            historyFrom={record.first_date ?? undefined}
            dims={shownDims}
          />
          ) : null}
          {!cross && shownDims ? (
            <p className="num mt-2 text-[12px] text-ink-soft">
              Showing {Object.entries(shownDims).map(([k, v]) => `${k}: ${v}`).join(", ")} — other values via{" "}
              <code>?dims=</code> in the API.
            </p>
          ) : null}
          {/* The chart shows the shape; the values are the product. Signed-in
              visitors already have a key, so we point them at the API/dashboard
              instead of nagging them to sign up. */}
          <div className="mt-6 flex flex-wrap items-baseline justify-between gap-4 border-t border-rule pt-5">
            <p className="text-[15px] text-ink-soft">
              {cross ? (
                <>
                  Every area and breakdown, as JSON or CSV, through the API —{" "}
                  {authed ? "query it with your key." : "start with a free key."}
                </>
              ) : planChart && !planChart.gated ? (
                <>
                  Full history shown.{" "}
                  <span className="num text-ink">{fmtCount(total)}</span> observations back to{" "}
                  {record.first_date ? fmtDate(record.first_date) : "1972"} — export as CSV or query
                  any range via the API with your key.
                </>
              ) : planChart?.plan === "developer" ? (
                <>
                  Showing 10 years on your Developer plan.{" "}
                  <span className="num text-ink">{fmtCount(total)}</span> observations back to{" "}
                  {record.first_date ? fmtDate(record.first_date) : "1972"} — full history to 1972 is
                  on Pro.
                </>
              ) : (
                <>
                  Showing the last {previewYears} {previewYears === 1 ? "year" : "years"} — real
                  values, free.{" "}
                  <span className="num text-ink">{fmtCount(total)}</span> observations back to{" "}
                  {record.first_date ? fmtDate(record.first_date) : "1972"}.{" "}
                  {authed
                    ? "More history is included on higher plans; query it via the API with your key."
                    : "Full history, CSV and API access start with a free key."}
                </>
              )}
            </p>
            <Link
              to={planChart && !planChart.gated ? "/dashboard" : authed ? "/pricing" : "/signup"}
              className="bg-seal px-4 py-2.5 text-[14px] text-seal-contrast transition-opacity hover:opacity-90"
            >
              {planChart && !planChart.gated ? "Your API keys" : authed ? "See plans" : "Get a free key"}
            </Link>
          </div>
        </div>
      </Panel>

      {stats && !cross && (
        <Panel ground="paper" full={false} className="pb-12">
          <PanelInner>
            <Eyebrow>At a glance</Eyebrow>
            <div className="mt-6 grid grid-cols-2 gap-px border border-rule bg-rule md:grid-cols-4">
              {[
                { l: "Recent avg", v: fmtValue(stats.avg, series.meta.unit) },
                { l: "Recent low", v: fmtValue(stats.min, series.meta.unit) },
                { l: "Recent high", v: fmtValue(stats.max, series.meta.unit) },
                {
                  l: "Coverage",
                  v:
                    record.first_date && record.last_date
                      ? `${record.first_date.slice(0, 4)}–${record.last_date.slice(0, 4)}`
                      : "—",
                },
              ].map((s) => (
                <div key={s.l} className="bg-paper px-5 py-6">
                  <p className="num text-[26px] leading-none">{s.v}</p>
                  <p className="eyebrow mt-2">{s.l}</p>
                </div>
              ))}
            </div>
            <p className="num mt-4 text-[13px] text-ink-soft">
              {unitLabel(series.meta.unit)} · {fmtCount(total)} observations · {series.meta.frequency}
            </p>
          </PanelInner>
        </Panel>
      )}

      {data.revisions ? (
        <Panel ground="paper" full={false} className="pb-14">
          <PanelInner>
            <Eyebrow>Revision history</Eyebrow>
            <p className="mt-4 max-w-[64ch] text-[16px] text-ink-soft">
              <span className="num text-ink">
                {fmtCount(data.revisions.count)}
                {data.revisions.capped ? "+" : ""}
              </span>{" "}
              {data.revisions.count === 1 ? "point has" : "points have"} been revised since first print
              {data.revisions.earliestFirstSeen ? (
                <>
                  {" "}
                  — first prints recorded back to{" "}
                  <span className="num text-ink">{data.revisions.earliestFirstSeen.slice(0, 4)}</span>
                </>
              ) : null}
              . BanglaDataHub keeps every print, so a model can be rebuilt with the numbers as they stood on any date.
            </p>
            {data.revisions.recent.length ? (
            <div className="mt-6 overflow-x-auto">
              <p className="eyebrow mb-2">Largest revisions</p>
              <table className="num w-full min-w-[560px] text-[14px]">
                <thead>
                  <tr className="border-b border-rule text-left text-ink-soft">
                    <th className="py-3 pr-4 font-normal">Period</th>
                    <th className="py-3 pr-4 text-right font-normal">First print</th>
                    <th className="py-3 pr-4 text-right font-normal">Today</th>
                    <th className="py-3 pr-4 text-right font-normal">Change</th>
                    <th className="py-3 pr-4 text-right font-normal">Revisions</th>
                    <th className="hidden py-3 font-normal md:table-cell">Recorded from</th>
                  </tr>
                </thead>
                <tbody>
                  {data.revisions.recent.map((r) => (
                    <tr key={r.date} className="border-b border-rule">
                      <td className="py-2.5 pr-4">{periodLabel(r.date, record.frequency)}</td>
                      <td className="py-2.5 pr-4 text-right text-ink-soft">{fmtValue(r.first, record.unit)}</td>
                      <td className="py-2.5 pr-4 text-right">{fmtValue(r.current, record.unit)}</td>
                      <td className="py-2.5 pr-4 text-right text-seal">
                        {r.pct != null ? `${r.pct > 0 ? "+" : ""}${fmtNumber(r.pct, Math.abs(r.pct) < 1 ? 2 : 1)}%` : "—"}
                      </td>
                      <td className="py-2.5 pr-4 text-right">{r.times}</td>
                      <td className="hidden py-2.5 font-sans text-[13px] text-ink-soft md:table-cell">
                        {r.sources.join(" · ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            ) : null}
            <p className="mt-4 text-[14px] text-ink-soft">
              The full print-by-print history (<code className="num">/revisions</code>) and any series as of a past
              date (<code className="num">?vintage=YYYY-MM-DD</code>) are on the Pro plan —{" "}
              <Link to="/docs/$slug" params={{ slug: "api-vintages" }} className="text-seal hover:underline">
                how revision vintages work
              </Link>
              .
            </p>
          </PanelInner>
        </Panel>
      ) : null}

      <Panel ground="paper" full={false} className="pb-14">
        <PanelInner>
          <div id="about" className="scroll-mt-28" />
          <Eyebrow>About this series</Eyebrow>
          {record.derived || data.notes?.length || (!cross && endedOn) ? (
            <dl className="mt-5 max-w-[68ch] space-y-5 border-b border-rule pb-6 text-[15px] text-ink-soft">
              {!cross && endedOn ? (
                <div>
                  <dt className="eyebrow">Ended {endedOn}</dt>
                  <dd className="mt-1">
                    The publisher stopped this exact series, usually when it moved to a new base year or table.
                    For current figures, see the related series below or{" "}
                    <Link to="/coverage" search={{ q: (record.name.split(" — ")[0] ?? record.name).slice(0, 40) }} className="text-seal underline underline-offset-2">
                      search the catalog
                    </Link>
                    .
                  </dd>
                </div>
              ) : null}
              {record.derived ? (
                <div>
                  <dt className="eyebrow">Derived by BanglaDataHub</dt>
                  <dd className="mt-1">
                    Calculated from official series with a published formula; no publisher prints this figure
                    itself.{" "}
                    <Link to="/docs/$slug" params={{ slug: "data-derived" }} className="text-seal underline underline-offset-2">
                      How derived series work
                    </Link>
                  </dd>
                  <dd className="mt-2">{record.derived.method}</dd>
                  {record.derived.inputs.length ? (
                    <dd className="mt-2">
                      Inputs:{" "}
                      {Array.from(new Set(record.derived.inputs)).map((sid, i) => (
                        <span key={sid}>
                          {i ? ", " : ""}
                          {/^[a-z0-9_.-]+$/.test(sid) ? (
                            <Link to="/series/$seriesId" params={{ seriesId: sid }} className="num text-seal underline underline-offset-2">
                              {sid}
                            </Link>
                          ) : (
                            <span className="num">{sid}</span>
                          )}
                        </span>
                      ))}
                    </dd>
                  ) : null}
                </div>
              ) : null}
              {data.notes?.length ? (
                <div>
                  <dt className="eyebrow">Notes on the figures</dt>
                  <dd className="mt-1">
                    Every value is shown exactly as the publisher prints it. Where one looks unusual, we have checked
                    it with the source; the notes say what we found.{" "}
                    <Link to="/docs/$slug" params={{ slug: "sources-provenance" }} className="text-seal underline underline-offset-2">
                      How figures are checked
                    </Link>
                  </dd>
                  <dd>
                    <ul className="mt-2 space-y-1 break-words">
                      {data.notes.slice(0, 8).map((n) => (
                        <li key={`${n.date}|${JSON.stringify(n.dims)}`}>
                          <span className="num text-ink">{fmtDate(n.date)}</span>
                          {Object.keys(n.dims ?? {}).length ? (
                            <span className="num"> ({Object.values(n.dims).join(", ")})</span>
                          ) : null}
                          : {n.note}
                        </li>
                      ))}
                    </ul>
                    {data.notes.length > 8 ? (
                      <p className="mt-1">
                        …and {data.notes.length - 8} more in the API response (<code className="num">meta.notes</code>).
                      </p>
                    ) : null}
                  </dd>
                </div>
              ) : null}
            </dl>
          ) : null}
          {content ? (
            <div
              className="doc-prose mt-4 text-[16px]"
              dangerouslySetInnerHTML={{ __html: content.html }}
            />
          ) : (
            <p className="mt-4 max-w-[70ch] text-[16px] leading-[1.7]">{record.description}</p>
          )}
          <div className="mt-10 grid gap-10 border-t border-rule pt-8 md:grid-cols-2">
            <div>
              <Eyebrow>Use cases</Eyebrow>
              <ul className="mt-4 space-y-2 text-[15px]">
                {useCases.map((u) => (
                  <li key={u} className="border-b border-rule pb-2">
                    {u}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <Eyebrow>Who uses this</Eyebrow>
              <ul className="mt-4 flex flex-wrap gap-2">
                {personas.map((p) => (
                  <li key={p} className="border border-rule px-3 py-1.5 text-[13px] text-ink-soft">
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </PanelInner>
      </Panel>

      <Panel ground="ink" full={false} className="py-16">
        <PanelInner>
          <div className="grid gap-12 lg:grid-cols-2">
            <div>
              <Eyebrow>Metadata</Eyebrow>
              <dl className="num mt-4 border-t border-rule text-[13px]">
                {[
                  ["Series ID", record.id],
                  ["Source", record.derived ? "BanglaDataHub (derived from official series)" : record.source],
                  ["Unit", unitLabel(record.unit)],
                  ["Frequency", frequencyLabel(record.frequency)],
                  ["First observation", fmtDate(record.first_date)],
                  ["Last observation", fmtDate(record.last_date)],
                  ["Tier", record.tier],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-6 border-b border-rule py-2.5">
                    <dt className="font-sans text-[14px] text-ink-soft">{k}</dt>
                    <dd className="text-right">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <div>
              <Eyebrow>Fetch it</Eyebrow>
              <div className="mt-4">
                <CodeTabs
                  snippets={[
                    {
                      label: "curl",
                      code: `curl -H "X-API-Key: bd_live_xxx" \\\n  "${apiBase}/v1/series/${record.id}"`,
                    },
                    {
                      label: "Python",
                      code: `from bangladata import Client\n\nc = Client("bd_live_xxx")\ndf = c.series("${record.id}").to_pandas()`,
                    },
                    {
                      label: "JavaScript",
                      code: `const res = await fetch(\n  "${apiBase}/v1/series/${record.id}",\n  { headers: { "X-API-Key": "bd_live_xxx" } },\n);`,
                    },
                  ]}
                />
              </div>
            </div>
          </div>
        </PanelInner>
      </Panel>

      {related.length > 0 ? (
        <Panel ground="paper" full={false} className="py-16">
          <PanelInner>
            <Eyebrow>Related series</Eyebrow>
            <ul className="mt-4 border-t border-rule">
              {related.map((r) => (
                <li key={r.id}>
                  <Link
                    to="/series/$seriesId"
                    params={{ seriesId: r.id }}
                    className="flex items-baseline justify-between gap-6 border-b border-rule py-3 transition-colors hover:text-seal"
                  >
                    <span className="text-[15px]">{r.name}</span>
                    <span className="num text-[12px] text-ink-soft">{r.id}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </PanelInner>
        </Panel>
      ) : null}

      <section className="ground-paper bg-paper py-16 text-ink">
        <div className="mx-auto max-w-[720px] px-6">
          <Eyebrow>FAQ</Eyebrow>
          <div className="mt-6 border-t border-rule">
            {depth.faq.map((f) => (
              <details key={f.q} className="border-b border-rule py-4">
                <summary className="cursor-pointer text-[16px]">{f.q}</summary>
                <p className="mt-3 text-[15px] text-ink-soft">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}


/** Latest values by province / district / plant for a cross-sectional series. */
function CrossSectionTable({ cross, unit, seriesId }: { cross: CrossSection; unit: string; seriesId: string }) {
  const filters = Object.entries(cross.filters);
  return (
    <div>
      <p className="eyebrow">
        {fmtDate(cross.date)}
        {filters.length ? ` · ${filters.map(([k, v]) => `${k}: ${v}`).join(" · ")}` : ""}
      </p>
      <div className="mt-4 overflow-x-auto">
        <table className="num w-full min-w-[420px] text-[14px]">
          <thead>
            <tr className="border-b border-rule text-left text-ink-soft">
              <th className="py-3 pr-4 font-normal">{cross.rowLabel}</th>
              <th className="py-3 text-right font-normal">{unitLabel(unit)}</th>
            </tr>
          </thead>
          <tbody>
            {cross.rows.map((r) => (
              <tr key={`${r.level}|${r.label}`} className="border-b border-rule">
                <td className={`py-2.5 pr-4 font-sans ${r.level === "national" || r.level === "province" ? "text-ink" : "text-ink-soft"}`}>
                  {r.label}
                </td>
                <td className="py-2.5 text-right text-ink">{fmtValue(r.value, unit)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="num mt-3 text-[12px] text-ink-soft">
        {cross.omitted ? `${fmtCount(cross.omitted)} more rows (smaller districts, tehsils and other breakdowns) — ` : ""}
        every row and dimension via <code>/v1/series/{seriesId}?dims=…</code> in the API.
      </p>
    </div>
  );
}
