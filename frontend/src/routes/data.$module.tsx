import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { Link, createFileRoute, notFound, redirect } from "@tanstack/react-router";

import { Chart } from "@/components/site/chart";
import { Figure } from "@/components/site/figure";
import { Eyebrow, Panel, PanelHeadline, PanelInner } from "@/components/site/panel";
import { getModulePage } from "@/lib/bangladata/api.functions";
import { EXPLORERS, MODULE_BY_SLUG, RETIRED_MODULES, moduleSeriesCount, toFrontendModule } from "@/lib/bangladata/catalog";
import { fmtCount, fmtDate, fmtValue, frequencyLabel, unitLabel } from "@/lib/bangladata/format";
import { getModuleContent } from "@/lib/bangladata/module-content";
import { moduleDepth } from "@/lib/bangladata/series-depth";

const moduleQuery = (slug: string, page: number) =>
  queryOptions({
    queryKey: ["module", slug, page],
    queryFn: () => getModulePage({ data: { module: slug, page } }),
    staleTime: 60_000,
  });

export const Route = createFileRoute("/data/$module")({
  // Page 1 stays out of the URL: a filled-in `page: 1` made the router 307 /data/x ->
  // /data/x?page=1, while the sitemap and canonical name /data/x.
  validateSearch: (search: Record<string, unknown>): { page?: number } => {
    const page = Math.floor(Number(search["page"]));
    return page > 1 ? { page } : {};
  },
  loaderDeps: ({ search }) => ({ page: search.page ?? 1 }),
  loader: async ({ context, params, deps }) => {
    // Mutual funds live in dedicated tables, not the series catalog — they have a
    // purpose-built screener. Redirect the legacy /data/funds path there.
    // Modules with a dedicated page (market, regional) redirect there.
    const retired = RETIRED_MODULES[params.module];
    if (retired) throw redirect({ to: "/data/$module", params: { module: retired }, search: {}, statusCode: 301 });
    const dedicated = MODULE_BY_SLUG[params.module]?.href;
    if (dedicated) throw redirect({ href: dedicated });
    // API module names (prices, alternate, fixed-income, public-finance) → the page.
    const alias = toFrontendModule(params.module);
    if (alias !== params.module && MODULE_BY_SLUG[alias])
      throw redirect({ to: "/data/$module", params: { module: alias }, search: deps.page > 1 ? { page: deps.page } : {}, statusCode: 301 });
    if (!MODULE_BY_SLUG[params.module]) throw notFound();
    return context.queryClient.ensureQueryData(moduleQuery(params.module, deps.page));
  },
  head: ({ params, loaderData }) => {
    const m = MODULE_BY_SLUG[params.module];
    const page = loaderData?.page ?? 1;
    const total = loaderData?.total ?? 0;
    const pageSize = loaderData?.pageSize ?? 120;
    const lastPage = Math.max(1, Math.ceil(total / pageSize));
    const base = `https://bangladatahub.com/data/${params.module}`;
    const title = m
      ? `${m.name} data — BanglaDataHub API${page > 1 ? ` — page ${page}` : ""}`
      : "Data module — BanglaDataHub";
    const description = m
      ? `${m.line} ${m.cadence} updates from ${m.source}, available as JSON or CSV through the BanglaDataHub API.`
      : "Browse a BanglaDataHub data module.";
    const links: { rel: string; href: string }[] = [
      { rel: "canonical", href: page > 1 ? `${base}?page=${page}` : base },
    ];
    if (page > 1) links.push({ rel: "prev", href: page === 2 ? base : `${base}?page=${page - 1}` });
    if (page < lastPage) links.push({ rel: "next", href: `${base}?page=${page + 1}` });
    const scripts = m
      ? [
          {
            type: "application/ld+json",
            children: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "CollectionPage",
              name: title,
              description,
              url: `https://bangladatahub.com/data/${params.module}`,
              isPartOf: { "@id": "https://bangladatahub.com/#website" },
              about: { "@type": "Thing", name: m.name },
            }),
          },
          {
            type: "application/ld+json",
            children: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "BreadcrumbList",
              itemListElement: [
                { "@type": "ListItem", position: 1, name: "Data", item: "https://bangladatahub.com/coverage" },
                { "@type": "ListItem", position: 2, name: m.name, item: `https://bangladatahub.com/data/${params.module}` },
              ],
            }),
          },
        ]
      : [];
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
      ],
      links,
      scripts,
    };
  },
  component: ModulePage,
});

function ModulePage() {
  const { module: slug } = Route.useParams();
  const { page = 1 } = Route.useSearch();
  const { data } = useSuspenseQuery(moduleQuery(slug, page));
  const lastPage = Math.max(1, Math.ceil((data.total ?? 0) / (data.pageSize ?? 120)));
  const m = MODULE_BY_SLUG[slug]!;
  const guide = getModuleContent(slug);
  const depth = moduleDepth(slug, m.name);
  const useCases = guide?.useCases.length ? guide.useCases : depth.useCases;
  const personas = guide?.personas.length ? guide.personas : depth.personas;

  // At-a-glance stats, computed from the live catalog for this module.
  const seriesCount = moduleSeriesCount(slug) ?? data.total ?? data.series.length;
  const sources = Array.from(new Set(data.series.map((s) => s.source).filter(Boolean)));
  const freqs = Array.from(new Set(data.series.map((s) => frequencyLabel(s.frequency)).filter(Boolean)));
  const dates = data.series.flatMap((s) => [s.first_date, s.last_date].filter(Boolean));
  const earliest = dates.length ? dates.reduce((a, b) => (a < b ? a : b)) : null;
  const latest = dates.length ? dates.reduce((a, b) => (a > b ? a : b)) : null;
  // Live "key indicators" — the first series with a resolvable latest value.
  const keyIndicators = data.series
    .map((s) => {
      const l = data.latest[s.id];
      const point = l?.data?.length ? l.data[l.data.length - 1] : undefined;
      return point ? { s, point } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .slice(0, 4);

  return (
    <main>
      <Panel ground="paper" full={false} className="pt-32 pb-12">
        <PanelInner>
          <Eyebrow>{m.source}</Eyebrow>
          <PanelHeadline className="mt-6">{m.name}</PanelHeadline>
          <p className="mt-6 max-w-[52ch] text-[18px] text-ink-soft">{m.line}</p>
          <p className="num mt-4 text-[13px] text-ink-soft">
            {m.cadence} · {m.depth}
          </p>
          {EXPLORERS.filter((x) => x.module === slug).map((x) => (
            <Link
              key={x.href}
              to={x.href}
              className="mt-6 inline-flex items-baseline gap-3 border border-rule px-4 py-3 text-[15px] hover:border-ink"
            >
              <span className="text-ink">{x.label} →</span>
              <span className="text-[13px] text-ink-soft">{x.line}</span>
            </Link>
          ))}

          <div className="mt-10 flex flex-wrap gap-x-12 gap-y-6 border-t border-rule pt-8">
            <Figure label="Series" value={fmtCount(seriesCount)} size="md" />
            {earliest && latest ? (
              <Figure label="Coverage" value={`${fmtDate(earliest)} – ${fmtDate(latest)}`} size="md" />
            ) : null}
            <Figure label="Cadence" value={freqs.slice(0, 3).join(" · ") || m.cadence} size="md" />
            <Figure label="Sources" value={sources.join(" · ") || m.source} size="md" />
          </div>
        </PanelInner>
      </Panel>

      {keyIndicators.length > 0 ? (
        <Panel ground="paper" full={false} className="pb-12">
          <PanelInner>
            <Eyebrow>Key indicators · latest</Eyebrow>
            <div className="mt-6 grid grid-cols-2 gap-x-8 gap-y-6 border-t border-rule pt-6 md:grid-cols-4">
              {keyIndicators.map(({ s, point }) => (
                <Link key={s.id} to="/series/$seriesId" params={{ seriesId: s.id }} className="group">
                  <p className="text-[13px] text-ink-soft transition-colors group-hover:text-seal">
                    {s.name}
                  </p>
                  <p className="num mt-1 text-[24px] font-medium">{fmtValue(point.value, s.unit)}</p>
                  <p className="num text-[12px] text-ink-soft">
                    {unitLabel(s.unit)} · {fmtDate(point.date)}
                  </p>
                </Link>
              ))}
            </div>
          </PanelInner>
        </Panel>
      ) : null}

      {data.featured ? (
        <Panel ground="ink" full={false} className="py-14">
          <PanelInner>
            <Eyebrow>Featured series</Eyebrow>
            <h2 className="mt-4 font-display text-[26px]">{data.featured.meta.name}</h2>
          </PanelInner>
          <div className="mx-auto mt-6 w-full max-w-[1160px] px-6 md:px-10">
            <Chart
              seriesId={data.featured.series}
              data={data.featured.data}
              frequency={data.featured.meta.frequency}
              unit={data.featured.meta.unit}
              apiBase={data.apiBase}
              ground="ink"
              height={320}
            />
          </div>
        </Panel>
      ) : null}

      <Panel ground="paper" full={false} className="py-14">
        <PanelInner>
          <Eyebrow>About this module</Eyebrow>
          {guide ? (
            <div
              className="doc-prose mt-4 text-[16px]"
              dangerouslySetInnerHTML={{ __html: guide.html }}
            />
          ) : (
            <p className="mt-4 max-w-[70ch] text-[16px] leading-[1.7]">{m.line}.</p>
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

      <Panel ground="paper" full={false} className="py-16">
        <PanelInner>
          <Eyebrow>All series</Eyebrow>
          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[760px] border-t border-rule text-left">
              <thead className="eyebrow">
                <tr>
                  <th className="py-3">Series</th>
                  <th className="py-3">ID</th>
                  <th className="py-3">Unit</th>
                  <th className="py-3">Frequency</th>
                  <th className="py-3">Range</th>
                  <th className="py-3 text-right">Latest</th>
                </tr>
              </thead>
              <tbody className="num text-[13px]">
                {data.series.map((s) => {
                  const l = data.latest[s.id];
                  const point = l?.data?.length ? l.data[l.data.length - 1] : undefined;
                  return (
                    <tr key={s.id} className="border-t border-rule">
                      <td className="py-3 pr-4 font-sans text-[14px]">
                        <Link
                          to="/series/$seriesId"
                          params={{ seriesId: s.id }}
                          className="transition-colors hover:text-seal"
                        >
                          {s.name}
                        </Link>
                      </td>
                      <td className="py-3 pr-4 text-ink-soft">{s.id}</td>
                      <td className="py-3 pr-4 text-ink-soft">{unitLabel(s.unit)}</td>
                      <td className="py-3 pr-4 text-ink-soft">{frequencyLabel(s.frequency)}</td>
                      <td className="py-3 pr-4 text-ink-soft">
                        {fmtDate(s.first_date)} – {fmtDate(s.last_date)}
                      </td>
                      <td className="py-3 text-right">
                        {point ? fmtValue(point.value, s.unit) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {lastPage > 1 ? (
            <nav className="num mt-8 flex items-center justify-between border-t border-rule pt-5 text-[13px]">
              {page > 1 ? (
                <Link
                  to="/data/$module"
                  params={{ module: slug }}
                  search={page > 2 ? { page: page - 1 } : {}}
                  className="text-ink-soft transition-colors hover:text-seal"
                >
                  ← Previous
                </Link>
              ) : (
                <span className="text-ink-soft/40">← Previous</span>
              )}
              <span className="text-ink-soft">
                Page {page} of {lastPage} · {fmtCount(data.total ?? 0)} series
              </span>
              {page < lastPage ? (
                <Link
                  to="/data/$module"
                  params={{ module: slug }}
                  search={{ page: page + 1 }}
                  className="text-ink-soft transition-colors hover:text-seal"
                >
                  Next →
                </Link>
              ) : (
                <span className="text-ink-soft/40">Next →</span>
              )}
            </nav>
          ) : null}
        </PanelInner>
      </Panel>
    </main>
  );
}
