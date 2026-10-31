import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";

import { Eyebrow, Panel, PanelHeadline, PanelInner } from "@/components/site/panel";
import { getStatus } from "@/lib/bangladata/api.functions";
import { fmtCompact, fmtCount, fmtDate } from "@/lib/bangladata/format";
import { cn } from "@/lib/utils";

const statusQuery = queryOptions({
  queryKey: ["status"],
  queryFn: () => getStatus(),
  staleTime: 60_000,
});

export const Route = createFileRoute("/status")({
  loader: ({ context }) => context.queryClient.ensureQueryData(statusQuery),
  head: () => ({
    meta: [
      { title: "Status — BanglaDataHub data freshness" },
      {
        name: "description",
        content:
          "Live freshness for every BanglaDataHub module: last update, release cadence, series and record counts, and whether each source is current.",
      },
      { property: "og:title", content: "BanglaDataHub status" },
      { property: "og:description", content: "Last update and freshness for every data module." },
    ],
  }),
  component: Status,
});

const STATE_META: Record<string, { dot: string; label: string; text: string }> = {
  fresh: { dot: "bg-seal", label: "Current", text: "text-seal" },
  // Healthy pipeline, but the source hasn't published the next period yet (e.g. a
  // quarterly release still pending) — up to date with what exists, not "behind".
  current: { dot: "bg-seal", label: "Awaiting release", text: "text-seal" },
  delayed: { dot: "bg-gilt", label: "Delayed", text: "text-gilt" },
  stale: { dot: "bg-flag", label: "Behind", text: "text-flag" },
};

function StateBadge({ state }: { state: string }) {
  const m = STATE_META[state] ?? STATE_META.stale!;
  return (
    <span className="inline-flex items-center gap-2">
      <span className={cn("h-2 w-2 rounded-full", m.dot)} />
      <span className={cn("text-[13px] uppercase tracking-[0.06em]", m.text)}>{m.label}</span>
    </span>
  );
}

function ageLabel(days: number | null | undefined): string {
  if (days == null) return "—";
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 45) return `${days}d ago`;
  const mo = Math.round(days / 30.4);
  return `${mo}mo ago`;
}

function Status() {
  const { data } = useSuspenseQuery(statusQuery);
  const mods = data.modules as unknown as Array<{
    module: string; name: string; last_run: string; series: number; observations: number;
    frequency?: string; age_days?: number | null; state: string;
  }>;
  // "Up to date" = fresh, or the source simply hasn't published its next release
  // ("Awaiting release"). Delayed/stale are counted separately so the headline can't
  // read "all good" while a row below says Delayed.
  const fresh = mods.filter((m) => m.state === "fresh" || m.state === "current").length;
  const behind = mods.length - fresh;
  const dsets = ((data as unknown as {
    datasets?: Array<{ key: string; name: string; entities: number; records: number; last_date: string | null; frequency: string; age_days: number | null; state: string }>;
  }).datasets) ?? [];

  return (
    <main>
      <Panel ground="ink" full={false} className="pt-32 pb-16">
        <PanelInner>
          <Eyebrow>Status</Eyebrow>
          <PanelHeadline className="mt-6">Every module, and when it last updated.</PanelHeadline>
          <div className="num mt-12 grid grid-cols-2 border-t border-rule md:grid-cols-4">
            {[
              { v: fmtCompact(data.series), l: "Series tracked" },
              { v: fmtCompact(data.observations), l: "Observations" },
              {
                v: `${fresh}/${mods.length}`,
                l: behind ? `Modules up to date · ${behind} delayed` : "Modules up to date",
              },
              { v: fmtDate(data.last_ingestion), l: "Latest update" },
            ].map((s) => (
              <div key={s.l} className="border-b border-rule px-2 py-8 md:border-l md:first:border-l-0">
                <p className="text-[28px] leading-none md:text-[34px]">{s.v}</p>
                <p className="eyebrow mt-3">{s.l}</p>
              </div>
            ))}
          </div>
        </PanelInner>
      </Panel>

      <Panel ground="ink" full={false} className="pb-24">
        <PanelInner>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-t border-rule text-left">
              <thead className="eyebrow">
                <tr>
                  <th className="py-3">Module</th>
                  <th className="py-3">Last updated</th>
                  <th className="py-3">Cadence</th>
                  <th className="py-3 text-right">Series</th>
                  <th className="py-3 text-right">Records</th>
                  <th className="py-3 pl-8">Freshness</th>
                </tr>
              </thead>
              <tbody className="num text-[13px]">
                {mods.map((m) => (
                  <tr key={m.module} className="border-t border-rule">
                    <td className="py-3 pr-4 font-sans text-[14px]">
                      <Link to="/data/$module" params={{ module: m.module }} className="transition-colors hover:text-seal">
                        {m.name}
                      </Link>
                    </td>
                    <td className="py-3 pr-4 text-ink-soft">
                      {fmtDate(m.last_run)} <span className="opacity-60">· {ageLabel(m.age_days)}</span>
                    </td>
                    <td className="py-3 pr-4 capitalize text-ink-soft">{m.frequency || "—"}</td>
                    <td className="py-3 pr-4 text-right">{fmtCount(m.series)}</td>
                    <td className="py-3 pr-4 text-right">{fmtCompact(m.observations)}</td>
                    <td className="py-3 pl-8"><StateBadge state={m.state} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {dsets.length > 0 && (
            <div className="mt-14">
              <p className="eyebrow mb-4">Dedicated datasets</p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] border-t border-rule text-left">
                  <thead className="eyebrow">
                    <tr>
                      <th className="py-3">Dataset</th>
                      <th className="py-3">Last updated</th>
                      <th className="py-3">Cadence</th>
                      <th className="py-3 text-right">Instruments</th>
                      <th className="py-3 text-right">Records</th>
                      <th className="py-3 pl-8">Freshness</th>
                    </tr>
                  </thead>
                  <tbody className="num text-[13px]">
                    {dsets.map((d) => (
                      <tr key={d.key} className="border-t border-rule">
                        <td className="py-3 pr-4 font-sans text-[14px]">{d.name}</td>
                        <td className="py-3 pr-4 text-ink-soft">
                          {d.last_date ? fmtDate(d.last_date) : "—"} <span className="opacity-60">· {ageLabel(d.age_days)}</span>
                        </td>
                        <td className="py-3 pr-4 capitalize text-ink-soft">{d.frequency || "—"}</td>
                        <td className="py-3 pr-4 text-right">{fmtCount(d.entities)}</td>
                        <td className="py-3 pr-4 text-right">{fmtCompact(d.records)}</td>
                        <td className="py-3 pl-8"><StateBadge state={d.state} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <p className="mt-8 max-w-[70ch] text-[13px] text-ink-soft">
            “Current” means the latest observation is within the module’s normal release cadence.
            “Behind” flags a source that’s overdue — most often a government release that hasn’t
            posted yet, or an upstream ingestion delay we’re working through.
          </p>
        </PanelInner>
      </Panel>
    </main>
  );
}
