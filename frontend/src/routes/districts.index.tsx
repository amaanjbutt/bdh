import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { Panel, PanelHeadline, PanelInner } from "@/components/site/panel";
import { getDistrictsIndex } from "@/lib/bangladata/api.functions";
import { fmtIndicator } from "@/lib/bangladata/districts";

const indexQuery = queryOptions({
  queryKey: ["districts", "index"],
  queryFn: () => getDistrictsIndex(),
  staleTime: 3_600_000,
});

const TITLE = "Bangladesh's 64 districts: Census 2022 population and households | BanglaDataHub";
const DESCRIPTION =
  "Every district of Bangladesh: 2022 census population, households, sex ratio and household size, plus age structure, education, work, housing and connectivity.";

export const Route = createFileRoute("/districts/")({
  loader: ({ context }) => context.queryClient.ensureQueryData(indexQuery),
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
    ],
    links: [{ rel: "canonical", href: "https://bangladatahub.com/districts" }],
  }),
  component: DistrictsIndex,
});

type SortKey = "population" | "households" | "sexRatio" | "district";
const COLS: { key: SortKey; label: string; unit: "count" | "number" }[] = [
  { key: "population", label: "Population, 2022", unit: "count" },
  { key: "households", label: "Households", unit: "count" },
  { key: "sexRatio", label: "Males per 100 females", unit: "number" },
];

function DistrictsIndex() {
  const { data } = useSuspenseQuery(indexQuery);
  const [division, setDivision] = useState("All");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("population");
  const divisions = useMemo(
    () => ["All", ...Array.from(new Set(data.rows.map((r) => r.province).filter(Boolean))).sort()],
    [data.rows],
  );
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = data.rows.filter(
      (r) => (division === "All" || r.province === division) && (!needle || r.district.toLowerCase().includes(needle)),
    );
    return [...list].sort((a, b) =>
      sort === "district" ? a.district.localeCompare(b.district) : ((b[sort] as number | null) ?? -1) - ((a[sort] as number | null) ?? -1),
    );
  }, [data.rows, division, q, sort]);

  return (
    <main>
      <Panel ground="paper" full={false} className="pt-32 pb-8">
        <PanelInner>
          <nav className="eyebrow flex gap-2">
            <Link to="/coverage" className="hover:text-seal">
              Data
            </Link>
            <span>/</span>
            <Link to="/data/$module" params={{ module: "regional" }} className="hover:text-seal">
              Districts
            </Link>
          </nav>
          <PanelHeadline as="h1" className="mt-6">
            Every district of Bangladesh
          </PanelHeadline>
          <p className="mt-6 max-w-[62ch] text-[18px] text-ink-soft">
            {data.rows.length} districts from the Population and Housing Census 2022: population, households, sex
            ratio, age structure, education, work, housing, water, sanitation, fuel, religion and connectivity.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-rule pt-6">
            <div className="num flex flex-wrap gap-3 text-[13px] uppercase tracking-[0.08em]">
              {divisions.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setDivision(p)}
                  aria-pressed={division === p}
                  className={division === p ? "text-ink underline underline-offset-4" : "text-ink-soft hover:text-ink"}
                >
                  {p}
                </button>
              ))}
            </div>
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Find a district"
              aria-label="Find a district"
              className="ml-auto w-full max-w-[260px] border border-rule bg-paper px-3 py-1.5 text-[14px] text-ink placeholder:text-ink-soft"
            />
          </div>
        </PanelInner>
      </Panel>

      <Panel ground="paper" full={false} className="pb-16">
        <div className="mx-auto w-full max-w-[1160px] overflow-x-auto px-6 md:px-10">
          <table className="num w-full min-w-[760px] text-[14px]">
            <thead>
              <tr className="border-b border-rule text-left text-ink-soft">
                <th className="py-3 pr-4 font-normal">
                  <button type="button" onClick={() => setSort("district")} className={sort === "district" ? "text-ink" : ""}>
                    District
                  </button>
                </th>
                {COLS.map((c) => (
                  <th key={c.key} className="py-3 pr-4 text-right font-normal">
                    <button type="button" onClick={() => setSort(c.key)} className={sort === c.key ? "text-ink" : "hover:text-ink"}>
                      {c.label}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.province}|${r.district}`} className="border-b border-rule">
                  <td className="py-2.5 pr-4 font-sans">
                    <Link to="/districts/$district" params={{ district: r.slug }} className="hover:text-seal">
                      {r.district}
                    </Link>
                    <span className="ml-2 text-[12px] text-ink-soft">{r.province}</span>
                  </td>
                  {COLS.map((c) => (
                    <td key={c.key} className="py-2.5 pr-4 text-right">
                      {fmtIndicator(r[c.key] as number | null, c.unit)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-6 text-[13px] text-ink-soft">
            Source: Bangladesh Bureau of Statistics, Population and Housing Census 2022 district workbooks.
          </p>
        </div>
      </Panel>
    </main>
  );
}
