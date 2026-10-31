import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { Panel, PanelHeadline, PanelInner } from "@/components/site/panel";
import { getMarketOverview, getMarketSecurities } from "@/lib/bangladata/api.functions";
import { fmtCount, fmtDate, fmtNumber } from "@/lib/bangladata/format";

type IndexRow = { code: string; date: string; value: number | null; change: number | null; change_pct: number | null };
type Session = {
  date: string | null; turnover_mn: number | null; volume: number | null; trades: number | null;
  advances: number | null; declines: number | null; unchanged: number | null;
  market_cap_total_mn: number | null;
};
type Overview = { success: true; indices: IndexRow[]; session: Session } | null;
type Security = {
  code: string; name: string | null; sector: string | null; board: string | null;
  category: string | null; asset_type: string | null; date: string | null;
  ltp: number | null; ycp: number | null; close: number | null;
  volume: number | null; value_mn: number | null; trades: number | null;
  change_pct: number | null;
};
type Securities = { success: true; data: Security[]; count: number } | null;

const overviewQuery = queryOptions({
  queryKey: ["market-overview"],
  queryFn: () => getMarketOverview() as Promise<Overview>,
  staleTime: 60_000,
});
const securitiesQuery = (q: string) =>
  queryOptions({
    queryKey: ["market-securities", q],
    queryFn: () => getMarketSecurities({ data: { q, limit: 200 } }) as Promise<Securities>,
    staleTime: 60_000,
  });

export const Route = createFileRoute("/market")({
  validateSearch: (s: Record<string, unknown>): { q?: string } => ({
    ...(typeof s.q === "string" && s.q ? { q: s.q } : {}),
  }),
  loaderDeps: ({ search }) => ({ q: search.q ?? "" }),
  loader: async ({ context, deps }) => {
    await context.queryClient.ensureQueryData(overviewQuery);
    await context.queryClient.ensureQueryData(securitiesQuery(deps.q));
  },
  head: () => ({
    meta: [
      { title: "Dhaka Stock Exchange — DSEX, turnover & listed instruments | BanglaDataHub" },
      { name: "description", content: "DSEX, DS30 and DSES indices, turnover, market capitalisation and daily prices for every listed instrument on the Dhaka Stock Exchange." },
    ],
  }),
  component: MarketPage,
});

function MarketPage() {
  const { q } = Route.useSearch();
  const [search, setSearch] = useState(q ?? "");
  const overview = useSuspenseQuery(overviewQuery).data;
  const securities = useSuspenseQuery(securitiesQuery(q ?? "")).data;
  const idx = overview?.indices ?? [];
  const session = overview?.session;

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <div className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Dhaka Stock Exchange</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">The market, in one place</h1>
        <p className="mt-3 max-w-2xl text-sm text-slate-600">
          DSEX, DS30 and DSES, session turnover and the daily close of every listed instrument.
          The table is sorted by traded value; use the search box to filter by code or company name.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {idx.map((i) => (
          <Panel key={i.code}>
            <PanelInner>
              <p className="text-xs uppercase tracking-wider text-slate-500">{i.code}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{fmtNumber(i.value ?? 0, 2)}</p>
              <p className={`text-sm tabular-nums ${i.change_pct && i.change_pct < 0 ? "text-red-600" : "text-emerald-700"}`}>
                {i.change_pct != null ? `${i.change_pct > 0 ? "+" : ""}${i.change_pct.toFixed(2)}%` : "—"}
              </p>
              <p className="mt-1 text-xs text-slate-400">{i.date}</p>
            </PanelInner>
          </Panel>
        ))}
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-4">
        <Stat label="Turnover" value={session?.turnover_mn != null ? `${fmtNumber(session.turnover_mn, 1)} mn` : "—"} />
        <Stat label="Volume" value={session?.volume != null ? fmtCount(session.volume) : "—"} />
        <Stat label="Trades" value={session?.trades != null ? fmtCount(session.trades) : "—"} />
        <Stat label="Market cap" value={session?.market_cap_total_mn != null ? `${fmtNumber(session.market_cap_total_mn / 1000, 1)} bn` : "—"} />
      </div>

      <Panel className="mt-8">
        <PanelHeadline>
          <h2 className="text-lg font-semibold">Listed instruments</h2>
          <p className="text-xs text-slate-500">{securities?.data?.filter((r) => (r.ltp ?? 0) > 0).length ?? 0} traded instruments · last session</p>
        </PanelHeadline>
        <PanelInner className="p-0">
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-4 py-3">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter by code or name…"
              className="h-9 w-64 rounded border border-slate-300 px-3 text-sm outline-none focus:border-emerald-600"
            />
            <a
              href={`?q=${encodeURIComponent(search)}`}
              className="h-9 rounded bg-emerald-700 px-3 py-2 text-sm font-medium text-white"
            >
              Search
            </a>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-2">Code</th>
                  <th className="px-4 py-2">Name</th>
                  <th className="px-4 py-2">Sector</th>
                  <th className="px-4 py-2 text-right">LTP</th>
                  <th className="px-4 py-2 text-right">Change</th>
                  <th className="px-4 py-2 text-right">Volume</th>
                  <th className="px-4 py-2 text-right">Value (mn)</th>
                  <th className="px-4 py-2 text-right">Trades</th>
                  <th className="px-4 py-2">Date</th>
                </tr>
              </thead>
              <tbody>
                {(securities?.data ?? []).filter((r) => (r.ltp ?? 0) > 0).map((r) => (
                  <tr key={r.code} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-2 font-mono text-xs font-semibold">{r.code}</td>
                    <td className="max-w-[22rem] truncate px-4 py-2">{r.name ?? "—"}</td>
                    <td className="px-4 py-2 text-slate-500">{r.sector ?? "—"}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{fmtNumber(r.ltp ?? 0, 2)}</td>
                    <td className={`px-4 py-2 text-right tabular-nums ${r.change_pct && r.change_pct < 0 ? "text-red-600" : "text-emerald-700"}`}>
                      {r.change_pct != null ? `${r.change_pct > 0 ? "+" : ""}${r.change_pct.toFixed(2)}%` : "—"}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{fmtCount(r.volume ?? 0)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{fmtNumber(r.value_mn ?? 0, 3)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{fmtCount(r.trades ?? 0)}</td>
                    <td className="px-4 py-2 text-slate-500">{r.date ? fmtDate(r.date) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </PanelInner>
      </Panel>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Panel>
      <PanelInner>
        <p className="text-xs uppercase tracking-wider text-slate-500">{label}</p>
        <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
      </PanelInner>
    </Panel>
  );
}
