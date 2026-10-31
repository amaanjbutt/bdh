import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";

import { Chart } from "@/components/site/chart";
import { Eyebrow, Panel, PanelHeadline, PanelInner } from "@/components/site/panel";
import { getHomeData } from "@/lib/bangladata/api.functions";
import { MODULES } from "@/lib/bangladata/catalog";
import { SERIES_COUNT } from "@/lib/bangladata/counts";
import { fmtCompact, fmtCount, fmtDate, fmtNumber } from "@/lib/bangladata/format";
import type { SeriesResponse } from "@/lib/bangladata/types";

const homeQuery = queryOptions({
  queryKey: ["home"],
  queryFn: () => getHomeData(),
  staleTime: 60_000,
});

const FAQ = [
  { q: "How current is the data?", a: "It depends on the series: the USD/BDT reference rate and DSE prices are daily, CPI and reserves are monthly, GDP is annual, and Census 2022 is a one-off. Every series page shows its cadence and last update." },
  { q: "How far back does it go?", a: "USD/BDT to 1972, CPI to 1973, GDP to 1972, and digital payments to 2020. Each series page states its first observation." },
  { q: "Where does it come from?", a: "Official public releases from Bangladesh Bank, the Bangladesh Bureau of Statistics, NBR, the Export Promotion Bureau and the Dhaka Stock Exchange. Every figure links back to its publisher." },
  { q: "What happens when a number is revised?", a: "We store the prior value in observation_revisions and keep it available through ?vintage=YYYY-MM-DD on paid plans." },
  { q: "How does the free tier work?", a: "500 API calls every month, every dataset, one year of history. Paid plans add deeper history, vintages, webhooks and display rights." },
];

export const Route = createFileRoute("/")({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(homeQuery);
  },
  head: () => ({
    meta: [
      { title: "BanglaDataHub — Bangladesh's economic & financial data API" },
      { name: "description", content: "One REST API for Bangladesh: exchange rates from 1972, inflation, interest rates, money, trade, remittances, digital payments, DSE market data and Census 2022 districts." },
    ],
  }),
  component: Home,
});

type Tape = Record<string, SeriesResponse | null>;
type Home = Awaited<ReturnType<typeof getHomeData>>;

function last(tape: Tape, id: string) {
  return tape[id]?.data?.at(-1) ?? null;
}

function latestValue(series: SeriesResponse | null | undefined) {
  return series?.data?.at(-1) ?? null;
}

function Home() {
  const data = useSuspenseQuery(homeQuery).data as Home;
  const tape = (data.tape ?? {}) as Tape;
  const fx = last(tape, "fx.rate.usd");
  const cpi = last(tape, "inflation.cpi.national.yoy");
  const call = last(tape, "rates.call_money");
  const reserves = last(tape, "reserves.gross");
  const remit = last(tape, "remittances.total.usd");
  const dsex = last(tape, "market.dse.index.dsex");
  const mfs = last(tape, "payments.mfs_part_1.mfs_total_account_total");
  const fxSeries = data.charts["fx.rate.usd"] as SeriesResponse | null;
  const cpiSeries = data.charts["inflation.cpi.national.yoy"] as SeriesResponse | null;
  const dseSeries = data.charts["market.dse.index.dsex"] as SeriesResponse | null;
  const mfsSeries = data.charts["payments.mfs_part_3.cash_in_total_amount"] as SeriesResponse | null;

  return (
    <main>
      <section className="border-b border-rule bg-paper">
        <div className="mx-auto max-w-6xl px-4 py-16 md:py-24">
          <Eyebrow>Bangladesh economic & financial data</Eyebrow>
          <h1 className="mt-4 max-w-4xl font-display text-[44px] leading-[1.02] tracking-tight text-ink md:text-[72px]">
            One API for Bangladesh's entire economy.
          </h1>
          <p className="mt-6 max-w-2xl text-[16px] leading-relaxed text-ink-soft">
            Exchange rates from 1972, inflation, interest rates, money and credit, remittances,
            trade, digital payments, the Dhaka Stock Exchange and every district's Census 2022
            profile. {SERIES_COUNT} official series, one key, JSON or CSV.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/signup" className="rounded bg-seal px-5 py-3 text-sm font-semibold text-paper">Get a free key</Link>
            <Link to="/coverage" className="rounded border border-ink px-5 py-3 text-sm font-semibold text-ink">Explore the data</Link>
          </div>
          <p className="mt-4 text-xs text-ink-soft">500 free API calls every month. No card.</p>
        </div>
      </section>

      <section className="border-b border-rule">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-px bg-rule px-4 py-0 md:grid-cols-4">
          <Stat label="Live USD/BDT" value={fx ? fmtNumber(fx.value, 2) : "—"} sub={fx ? fmtDate(fx.date) : "loading"} />
          <Stat label="CPI inflation YoY" value={cpi ? `${fmtNumber(cpi.value, 2)}%` : "—"} sub={cpi ? fmtDate(cpi.date) : "loading"} />
          <Stat label="Series" value={SERIES_COUNT} sub="official, labelled" />
          <Stat label="Observations" value={data.status ? fmtCompact(data.status.observations) : "—"} sub="in our store" />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12">
        <div className="grid gap-4 md:grid-cols-3">
          <Mini label="Call money" value={call ? `${fmtNumber(call.value, 2)}%` : "—"} sub={call ? fmtDate(call.date) : ""} />
          <Mini label="Gross reserves" value={reserves ? `US$ ${fmtNumber(reserves.value / 1000, 1)} bn` : "—"} sub={reserves ? fmtDate(reserves.date) : ""} />
          <Mini label="Remittances" value={remit ? `US$ ${fmtNumber(remit.value, 0)} mn` : "—"} sub={remit ? fmtDate(remit.date) : ""} />
        </div>
      </section>

      <section className="border-y border-rule bg-ink text-paper">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <Eyebrow>One endpoint</Eyebrow>
          <h2 className="mt-3 font-display text-[30px] leading-tight md:text-[42px]">Ask for any series by id.</h2>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-paper/70">
            The same clean JSON — or CSV — for the 1972 exchange rate and last week's remittance
            print. Filter by date, dimension or district.
          </p>
          <pre className="mt-6 overflow-x-auto rounded border border-paper/20 bg-black/30 p-5 text-[12px] leading-relaxed text-paper/90">
{`curl -H "X-API-Key: bd_live_..." \\
  "https://api.bangladatahub.com/v1/series/inflation.cpi.national.yoy/latest"

{
  "success": true,
  "series": "inflation.cpi.national.yoy",
  "meta": {"name": "CPI inflation (national, YoY)", "unit": "percent", "frequency": "monthly"},
  "data": [{"date": "2026-09-01", "value": 8.34}]
}`}
          </pre>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <Eyebrow>Featured</Eyebrow>
            <h2 className="mt-2 font-display text-[30px] leading-tight md:text-[40px]">Four windows into the economy</h2>
          </div>
          <Link to="/coverage" className="text-sm font-semibold text-seal">All series →</Link>
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <ChartCard title="USD/BDT reference rate" series={fxSeries} unit="bdt" />
          <ChartCard title="CPI inflation (YoY)" series={cpiSeries} unit="percent" />
          <ChartCard title="DSEX broad index" series={dseSeries} unit="index" />
          <ChartCard title="MFS cash-in value" series={mfsSeries} unit="bdt_mn" />
        </div>
      </section>

      <section className="border-t border-rule bg-paper">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <Eyebrow>The catalog</Eyebrow>
          <h2 className="mt-2 font-display text-[30px] leading-tight md:text-[40px]">Every part of the record</h2>
          <div className="mt-8 grid gap-px bg-rule sm:grid-cols-2 lg:grid-cols-3">
            {MODULES.map((m) => (
              <Link key={m.slug} to={m.href ?? "/data/$module"} params={m.href ? undefined : { module: m.slug }} className="block bg-paper p-5 transition-colors hover:bg-paper-2">
                <p className="text-[11px] uppercase tracking-[0.16em] text-seal">{m.source}</p>
                <h3 className="mt-2 font-display text-[20px] leading-tight text-ink">{m.name}</h3>
                <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">{m.line}</p>
                <p className="mt-3 text-xs text-ink-soft">{m.cadence} · {m.depth}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14">
        <div className="grid gap-4 md:grid-cols-3">
          <Panel>
            <PanelInner>
              <Eyebrow>Districts</Eyebrow>
              <h3 className="mt-2 font-display text-[22px]">Census 2022, district by district</h3>
              <p className="mt-2 text-sm text-ink-soft">Population, households, sex ratio and age structure for all 64 districts.</p>
              <Link to="/districts" className="mt-4 inline-block text-sm font-semibold text-seal">Open district explorer →</Link>
            </PanelInner>
          </Panel>
          <Panel>
            <PanelInner>
              <Eyebrow>Market</Eyebrow>
              <h3 className="mt-2 font-display text-[22px]">DSEX, turnover and every scrip</h3>
              <p className="mt-2 text-sm text-ink-soft">Daily index levels and the close of every listed instrument.</p>
              <Link to="/market" className="mt-4 inline-block text-sm font-semibold text-seal">Open the market →</Link>
            </PanelInner>
          </Panel>
          <Panel>
            <PanelInner>
              <Eyebrow>Derived layer</Eyebrow>
              <h3 className="mt-2 font-display text-[22px]">The arithmetic, labelled</h3>
              <p className="mt-2 text-sm text-ink-soft">Real call-money rate, remittance growth and BDT depreciation — formula on every record.</p>
              <Link to="/derived" className="mt-4 inline-block text-sm font-semibold text-seal">See derived series →</Link>
            </PanelInner>
          </Panel>
        </div>
      </section>

      <section className="border-t border-rule bg-paper-2">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <Eyebrow>Pricing</Eyebrow>
          <h2 className="mt-2 font-display text-[30px] leading-tight md:text-[40px]">Start free. Scale when you ship.</h2>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {(data.plans ?? []).map((p) => (
              <div key={p.id} className="border border-rule bg-paper p-5">
                <p className="text-xs uppercase tracking-[0.16em] text-ink-soft">{p.name}</p>
                <p className="mt-2 font-display text-[28px]">${p.price_monthly}<span className="text-sm text-ink-soft">/mo</span></p>
                <p className="mt-1 text-xs text-ink-soft">{p.for_who}</p>
                <p className="mt-3 text-xs text-ink-soft">{p.history} of history</p>
                <Link to="/pricing" className="mt-4 block rounded border border-ink px-3 py-2 text-center text-xs font-semibold text-ink">See plan</Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14">
        <Eyebrow>Questions</Eyebrow>
        <div className="mt-6 grid gap-6 md:grid-cols-2">
          {FAQ.map((f) => (
            <div key={f.q}>
              <h3 className="font-display text-[18px] text-ink">{f.q}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">{f.a}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="bg-paper px-4 py-6">
      <p className="text-[10px] uppercase tracking-[0.18em] text-ink-soft">{label}</p>
      <p className="mt-2 font-display text-[28px] tabular-nums text-ink">{value}</p>
      <p className="mt-1 text-[11px] text-ink-soft">{sub}</p>
    </div>
  );
}

function Mini({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="border border-rule bg-paper p-4">
      <p className="text-[10px] uppercase tracking-[0.16em] text-ink-soft">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
      <p className="text-[11px] text-ink-soft">{sub}</p>
    </div>
  );
}

function ChartCard({ title, series, unit }: { title: string; series: SeriesResponse | null; unit: string }) {
  if (!series?.data?.length) {
    return (
      <Panel>
        <PanelInner>
          <PanelHeadline><h3 className="font-display text-[20px]">{title}</h3></PanelHeadline>
          <p className="mt-4 text-sm text-ink-soft">No data yet.</p>
        </PanelInner>
      </Panel>
    );
  }
  return (
    <Panel>
      <PanelInner>
        <PanelHeadline>
          <h3 className="font-display text-[20px]">{title}</h3>
          <p className="text-xs text-ink-soft">{series.meta?.source} · {series.meta?.frequency}</p>
        </PanelHeadline>
        <Chart
          seriesId={series.series}
          data={series.data}
          frequency={series.meta.frequency}
          unit={unit}
          apiBase={"https://api.bangladatahub.com"}
          height={280}
        />
      </PanelInner>
    </Panel>
  );
}

