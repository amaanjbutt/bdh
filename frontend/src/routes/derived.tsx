import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";

import { Eyebrow, Panel, PanelHeadline, PanelInner } from "@/components/site/panel";
import { getDerivedHub } from "@/lib/bangladata/api.functions";
import { fmtDate, fmtValue, frequencyLabel } from "@/lib/bangladata/format";
import type { Frequency } from "@/lib/bangladata/types";

const hubQuery = () =>
  queryOptions({
    queryKey: ["derived", "hub"],
    queryFn: () => getDerivedHub(),
    staleTime: 3_600_000,
  });

const TITLE = "Derived indicators — real rates, money growth, remittances and BDT | BanglaDataHub";
const DESCRIPTION =
  "Indicators no Bangladeshi publisher prints, computed from official Bangladesh Bank and BBS series with a published formula: the real call-money rate, real broad-money growth, 12-month remittance growth and BDT depreciation against the US dollar.";

const GROUPS = ["Interest rates", "Money & prices", "External & FX"];

export const Route = createFileRoute("/derived")({
  loader: ({ context }) => context.queryClient.ensureQueryData(hubQuery()),
  head: ({ loaderData }) => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
    ],
    links: [{ rel: "canonical", href: "https://bangladatahub.com/derived" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: "BanglaDataHub derived indicators",
          description: DESCRIPTION,
          url: "https://bangladatahub.com/derived",
          isPartOf: { "@id": "https://bangladatahub.com/#website" },
          mainEntity: {
            "@type": "ItemList",
            itemListElement: (loaderData?.series ?? []).map((s, i) => ({
              "@type": "ListItem",
              position: i + 1,
              name: s.name,
              url: `https://bangladatahub.com/series/${s.id}`,
            })),
          },
        }),
      },
    ],
  }),
  component: DerivedHub,
});

function DerivedHub() {
  const { data } = useSuspenseQuery(hubQuery());

  return (
    <main>
      <Panel ground="paper" full={false} className="pt-32 pb-10">
        <PanelInner>
          <nav className="eyebrow flex gap-2">
            <Link to="/coverage" className="hover:text-seal">
              Data
            </Link>
            <span>/</span>
            <span>Derived</span>
          </nav>
          <PanelHeadline as="h1" className="mt-6">
            Derived indicators
          </PanelHeadline>
          <p className="mt-6 max-w-[62ch] text-[18px] text-ink-soft">
            Numbers no publisher prints, computed from the official series already in the catalog. Each one is
            labelled <span className="num text-ink">source: BanglaDataHub</span>, carries its formula and inputs on every
            API record, and is recomputed whenever an input is revised. The official layer is never modelled.
          </p>
          <p className="mt-4 text-[15px] text-ink-soft">
            Method notes:{" "}
            <Link to="/docs/$slug" params={{ slug: "data-derived" }} className="text-seal hover:underline">
              Derived indicators documentation
            </Link>{" "}
            · list them in the API with <code className="num">/v1/catalog?source=BanglaDataHub</code>
          </p>
        </PanelInner>
      </Panel>

      {GROUPS.map((g) => {
        const rows = data.series.filter((s) => s.group === g);
        if (!rows.length) return null;
        return (
          <Panel key={g} ground="paper" full={false} className="pb-10">
            <PanelInner>
              <Eyebrow>{g}</Eyebrow>
              <div className="mt-2 divide-y divide-rule">
                {rows.map((s) => (
                  <div key={s.id} className="grid gap-3 py-6 md:grid-cols-[1fr_200px]">
                    <div>
                      <Link
                        to="/series/$seriesId"
                        params={{ seriesId: s.id }}
                        className="font-display text-[19px] transition-colors hover:text-seal"
                      >
                        {s.name}
                      </Link>
                      <p className="mt-2 max-w-[78ch] text-[14px] text-ink-soft">{s.method}</p>
                      {s.inputs.length ? (
                        <p className="num mt-2 text-[12px] text-ink-soft">
                          Inputs:{" "}
                          {s.inputs.map((i, n) => {
                            const id = i.split("|")[0]!;
                            const linkable = /^[a-z0-9_.-]+$/.test(id) && id.includes(".");
                            return (
                              <span key={`${i}-${n}`}>
                                {n ? ", " : ""}
                                {linkable ? (
                                  <Link to="/series/$seriesId" params={{ seriesId: id }} className="hover:text-seal">
                                    {i}
                                  </Link>
                                ) : (
                                  i
                                )}
                              </span>
                            );
                          })}
                        </p>
                      ) : null}
                    </div>
                    <div className="md:text-right">
                      <p className="num text-[22px]">{s.latest ? fmtValue(s.latest.value, s.unit) : "—"}</p>
                      <p className="num text-[12px] text-ink-soft">
                        {s.latest ? fmtDate(s.latest.date) : ""} · {frequencyLabel(s.frequency as Frequency)}
                        {s.first_date ? ` · since ${s.first_date.slice(0, 4)}` : ""}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </PanelInner>
          </Panel>
        );
      })}
    </main>
  );
}
