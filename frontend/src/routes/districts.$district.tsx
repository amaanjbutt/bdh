import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { Link, createFileRoute, notFound } from "@tanstack/react-router";

import { Eyebrow, Panel, PanelHeadline, PanelInner } from "@/components/site/panel";
import { getDistrictProfile } from "@/lib/bangladata/api.functions";
import { fmtIndicator } from "@/lib/bangladata/districts";

const profileQuery = (slug: string) =>
  queryOptions({
    queryKey: ["districts", "profile", slug],
    queryFn: () => getDistrictProfile({ data: { slug } }),
    staleTime: 3_600_000,
  });

export const Route = createFileRoute("/districts/$district")({
  loader: async ({ context, params }) => {
    const data = await context.queryClient.ensureQueryData(profileQuery(params.district));
    if (!data) throw notFound();
    return data;
  },
  head: ({ params, loaderData }) => {
    const name = loaderData?.name ?? params.district;
    const pop = loaderData?.sections
      .find((s) => s.key === "headline")
      ?.rows.find((r) => r.id === "regional.census.population")?.value;
    const title = `${name} district — population, households and living conditions | BanglaDataHub`;
    const description = `${name} (${loaderData?.province ?? "Bangladesh"}) in the 2022 Census${
      pop ? `: ${Math.round(pop).toLocaleString("en-US")} people` : ""
    }, plus age structure, education, work, housing, water, sanitation, fuel, religion and connectivity.`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
      ],
      links: [{ rel: "canonical", href: `https://bangladatahub.com/districts/${params.district}` }],
    };
  },
  component: DistrictProfile,
});

function DistrictProfile() {
  const params = Route.useParams();
  const { data } = useSuspenseQuery(profileQuery(params.district));
  if (!data) return null;
  const headline = data.sections.find((s) => s.key === "headline");
  const rest = data.sections.filter((s) => s.key !== "headline");

  return (
    <main>
      <Panel ground="paper" full={false} className="pt-32 pb-8">
        <PanelInner>
          <nav className="eyebrow flex gap-2">
            <Link to="/districts" className="hover:text-seal">
              Districts
            </Link>
            <span>/</span>
            <span>{data.province}</span>
          </nav>
          <PanelHeadline as="h1" className="mt-6">
            {data.name}
          </PanelHeadline>
          <p className="mt-6 max-w-[62ch] text-[18px] text-ink-soft">
            {data.name} district, {data.province} division. Population and Housing Census 2022, published by
            the Bangladesh Bureau of Statistics.
          </p>
        </PanelInner>
      </Panel>

      {headline ? (
        <Panel ground="paper" full={false} className="pb-10">
          <PanelInner>
            <Eyebrow>{headline.title}</Eyebrow>
            <div className="mt-6 grid gap-px border border-rule bg-rule sm:grid-cols-2 lg:grid-cols-3">
              {headline.rows.map((r) => (
                <div key={r.id} className="bg-paper p-5">
                  <p className="text-[13px] text-ink-soft">{r.label}</p>
                  <p className="num mt-2 font-display text-[28px] leading-none text-ink">
                    {fmtIndicator(r.value, r.unit)}
                  </p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[13px] text-ink-soft">{headline.note}</p>
          </PanelInner>
        </Panel>
      ) : null}

      {rest.map((section) => (
        <Panel key={section.key} ground="paper" full={false} className="pb-12">
          <PanelInner>
            <Eyebrow>{section.title}</Eyebrow>
            <div className="mt-4 overflow-x-auto">
              <table className="num w-full min-w-[560px] text-[14px]">
                <thead>
                  <tr className="border-b border-rule text-left text-ink-soft">
                    <th className="py-2 pr-4 font-normal">Indicator</th>
                    <th className="py-2 pr-4 text-right font-normal">Value</th>
                    <th className="py-2 font-normal">Share</th>
                  </tr>
                </thead>
                <tbody>
                  {section.rows.map((r) => (
                    <tr key={r.id} className="border-b border-rule">
                      <td className="py-2.5 pr-4 font-sans">
                        <Link to="/series/$seriesId" params={{ seriesId: r.id }} className="hover:text-seal">
                          {r.label}
                        </Link>
                      </td>
                      <td className="py-2.5 pr-4 text-right">{fmtIndicator(r.value, r.unit)}</td>
                      <td className="py-2.5">
                        {r.share == null ? (
                          <span className="text-ink-soft">—</span>
                        ) : (
                          <span className="flex items-center gap-3">
                            <span className="h-1.5 w-full max-w-[160px] bg-rule">
                              <span
                                className="block h-full bg-seal"
                                style={{ width: `${Math.max(0, Math.min(100, r.share))}%` }}
                              />
                            </span>
                            <span className="w-14 text-right text-ink-soft">{r.share.toFixed(1)}%</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-[13px] text-ink-soft">{section.note}</p>
          </PanelInner>
        </Panel>
      ))}
    </main>
  );
}
