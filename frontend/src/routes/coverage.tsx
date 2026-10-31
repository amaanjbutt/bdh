import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { Eyebrow, Panel, PanelHeadline, PanelInner } from "@/components/site/panel";
import { getSearchPage, getStatus } from "@/lib/bangladata/api.functions";
import { MODULES } from "@/lib/bangladata/catalog";
import { fmtCompact, fmtCount, frequencyLabel, unitLabel } from "@/lib/bangladata/format";
import { SERIES_COUNT } from "@/lib/bangladata/counts";
import { searchGroup } from "@/lib/bangladata/search";
import type { Frequency } from "@/lib/bangladata/types";

const statusQuery = queryOptions({
  queryKey: ["status"],
  queryFn: () => getStatus(),
  staleTime: 60_000,
});

const searchQuery = (q: string, module?: string) =>
  queryOptions({
    queryKey: ["search-page", q, module ?? ""],
    queryFn: () => getSearchPage({ data: { q, module } }),
    staleTime: 60_000,
  });

export const Route = createFileRoute("/coverage")({
  validateSearch: (s: Record<string, unknown>): { q?: string; module?: string } => ({
    ...(typeof s.q === "string" && s.q ? { q: s.q } : {}),
    ...(typeof s.module === "string" && s.module ? { module: s.module } : {}),
  }),
  loaderDeps: ({ search }) => ({ q: search.q ?? "", module: search.module }),
  loader: async ({ context, deps }) => {
    await context.queryClient.ensureQueryData(statusQuery);
    if (deps.q) await context.queryClient.ensureQueryData(searchQuery(deps.q, deps.module));
  },
  head: ({ match }) => {
    const q = (match.search as { q?: string } | undefined)?.q;
    const title = q
      ? `Search: ${q} — Bangladeshi economic data | BanglaDataHub`
      : `Catalog — search & browse ${SERIES_COUNT} Bangladeshi economic series | BanglaDataHub`;
    const description = q
      ? `Series matching "${q}" across BanglaDataHub's catalog of official Bangladeshi economic and financial data.`
      : `Search and browse all ${SERIES_COUNT} official Bangladeshi economic and financial series - exchange rates from 1972, inflation, interest rates, money and credit, trade, remittances, digital payments, DSE market data and Census 2022 districts.`;
    // A DataCatalog entity ties every live series (grouped into one Dataset per module)
    // to one crawlable catalog, published by the Organization — the entity search
    // engines and LLMs use to answer "what data does BanglaDataHub have?".
    const catalogSchema = {
      "@context": "https://schema.org",
      "@type": "DataCatalog",
      "@id": "https://bangladatahub.com/coverage#catalog",
      name: "BanglaDataHub — Bangladesh economic & financial data catalog",
      url: "https://bangladatahub.com/coverage",
      description:
        `${SERIES_COUNT} official Bangladeshi economic and financial time series - exchange rates, inflation, interest rates, money and credit, balance of payments, trade, remittances, fiscal receipts, digital payments, DSE market data and district and census data - from 1972 to today, as JSON or CSV.`,
      publisher: { "@id": "https://bangladatahub.com/#org" },
      provider: { "@id": "https://bangladatahub.com/#org" },
      spatialCoverage: { "@type": "Place", name: "Bangladesh" },
      temporalCoverage: "1972/..",
      isAccessibleForFree: true,
      dataset: MODULES.map((m) => ({
        "@type": "Dataset",
        name: `Bangladesh ${m.name}`,
        // Google Dataset requires a description (50–5000 chars), creator and license.
        description:
          `Official Bangladesh ${m.name.toLowerCase()} data — time series served as JSON or CSV via the ` +
          `BanglaDataHub API, sourced and normalized from official public releases (${m.source}).`,
        url: `https://bangladatahub.com${m.href ?? `/data/${m.slug}`}`,
        spatialCoverage: { "@type": "Place", name: "Bangladesh" },
        creator: { "@type": "Organization", name: "BanglaDataHub" },
        publisher: { "@id": "https://bangladatahub.com/#org" },
        license: "https://bangladatahub.com/terms",
      })),
    };
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
      ],
      scripts: [
        { type: "application/ld+json", children: JSON.stringify(catalogSchema) },
      ],
    };
  },
  component: Coverage,
});

function Coverage() {
  const { q = "", module } = Route.useSearch();
  const { data } = useSuspenseQuery(statusQuery);
  const navigate = useNavigate();
  const [input, setInput] = useState(q);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    void navigate({ to: "/coverage", search: { q: input.trim() || undefined, module: undefined } });
  }

  return (
    <main>
      <Panel ground="paper" full={false} className="pt-32 pb-12">
        <PanelInner>
          <Eyebrow>Catalog</Eyebrow>
          <PanelHeadline className="mt-6">Search & browse the catalog.</PanelHeadline>
          <p className="num mt-6 text-[14px] text-ink-soft">
            {fmtCount(data.series)} series · {fmtCompact(data.observations)} observations ·{" "}
            {MODULES.filter((m) => !m.href).length} modules
          </p>
          <form onSubmit={submit} className="mt-8 flex max-w-[640px] gap-3">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={`Search ${SERIES_COUNT} series — inflation, USD/BDT, remittances, MFS, DSE…`}
              className="num flex-1 border border-rule bg-paper px-4 py-3 text-[16px] outline-none focus:border-seal"
            />
            <button
              type="submit"
              className="bg-seal px-6 py-3 text-[15px] text-seal-contrast transition-opacity hover:opacity-90"
            >
              Search
            </button>
          </form>
        </PanelInner>
      </Panel>

      {q ? <SearchResults q={q} module={module} /> : null}

      <Panel ground="paper" full={false} className="pb-24">
        <PanelInner>
          <Eyebrow>{q ? "Or browse by module" : "Browse by module"}</Eyebrow>
          <div className="mt-6 grid grid-cols-1 border-t border-rule md:grid-cols-2">
            {MODULES.map((m) => {
              const s = data.modules.find((x) => x.module === m.slug);
              const cardClass =
                "group border-b border-rule px-5 py-8 first:pl-0 md:[&:nth-child(even)]:border-l";
              const body = (
                <>
                  <h2 className="font-display text-[24px] transition-colors group-hover:text-seal">
                    {m.name}
                  </h2>
                  <p className="mt-2 max-w-[46ch] text-[15px] text-ink-soft">{m.line}</p>
                  <dl className="num mt-5 grid grid-cols-3 gap-4 text-[12px]">
                    <div>
                      <dt className="eyebrow">{m.href ? "Depth" : "Series"}</dt>
                      <dd className="mt-1">{m.href ? m.depth : s ? fmtCount(s.series) : "—"}</dd>
                    </div>
                    <div>
                      <dt className="eyebrow">Cadence</dt>
                      <dd className="mt-1">{m.cadence}</dd>
                    </div>
                    <div>
                      <dt className="eyebrow">{m.href ? "Explore" : "Depth"}</dt>
                      <dd className="mt-1">{m.href ? "View" : m.depth}</dd>
                    </div>
                  </dl>
                  <p className="eyebrow mt-4">Source · {m.source}</p>
                </>
              );
              return m.href ? (
                <Link key={m.slug} to={m.href} className={cardClass}>
                  {body}
                </Link>
              ) : (
                <Link key={m.slug} to="/data/$module" params={{ module: m.slug }} className={cardClass}>
                  {body}
                </Link>
              );
            })}
          </div>
        </PanelInner>
      </Panel>
    </main>
  );
}

function SearchResults({ q, module }: { q: string; module?: string }) {
  const { data } = useSuspenseQuery(searchQuery(q, module));
  return (
    <Panel ground="paper" full={false} className="pb-12">
      <PanelInner>
        {data.results.length === 0 && data.facets.length === 0 ? (
          <p className="border-t border-rule pt-8 text-[16px] text-ink-soft">
            Nothing matches <span className="text-ink">“{q}”</span>. Try a broader term, or browse
            by module below.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 border-t border-rule pt-6">
              <span className="eyebrow mr-1">
                {data.results.length} result{data.results.length === 1 ? "" : "s"} for “{q}”
              </span>
              <Link
                to="/coverage"
                search={{ q, module: undefined }}
                className={`num border px-3 py-1 text-[12px] uppercase tracking-wide transition-colors ${
                  !module ? "border-seal bg-seal text-seal-contrast" : "border-rule text-ink-soft hover:border-seal"
                }`}
              >
                All
              </Link>
              {data.facets.map((f) => (
                <Link
                  key={f.module}
                  to="/coverage"
                  search={{ q, module: f.module }}
                  className={`num border px-3 py-1 text-[12px] uppercase tracking-wide transition-colors ${
                    module === f.module
                      ? "border-seal bg-seal text-seal-contrast"
                      : "border-rule text-ink-soft hover:border-seal"
                  }`}
                >
                  {f.label} · {f.count}
                </Link>
              ))}
            </div>
            <ul className="mt-6 divide-y divide-rule border-t border-rule">
              {data.results.map((r) => (
                <li key={`${r.kind}:${r.url}`}>
                  <a
                    href={r.url}
                    className="group flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-4"
                  >
                    <span className="min-w-0">
                      <span className="text-[16px] transition-colors group-hover:text-seal">{r.title}</span>
                      {r.kind === "series" ? (
                        <span className="num ml-3 text-[12px] text-ink-soft">{r.id}</span>
                      ) : null}
                    </span>
                    <span className="num shrink-0 text-[12px] text-ink-soft">
                      {r.kind === "series"
                        ? `${searchGroup(r).label} · ${unitLabel(r.unit ?? "")} · ${frequencyLabel((r.frequency ?? "") as Frequency)}`
                        : r.subtitle}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </>
        )}
      </PanelInner>
    </Panel>
  );
}
