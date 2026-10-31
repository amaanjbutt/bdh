import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";

import { Eyebrow, Panel, PanelHeadline, PanelInner } from "@/components/site/panel";
import { getCalendar } from "@/lib/bangladata/api.functions";
import { fmtDate } from "@/lib/bangladata/format";

const calendarQuery = queryOptions({
  queryKey: ["calendar", "page"],
  queryFn: () => getCalendar(),
  staleTime: 60 * 60 * 1000,
});

export const Route = createFileRoute("/calendar")({
  loader: ({ context }) => context.queryClient.ensureQueryData(calendarQuery),
  head: () => ({
    meta: [
      { title: "Release calendar — BanglaDataHub" },
      {
        name: "description",
        content:
          "When Bangladesh's economic indicators publish next — inflation, reserves, trade, remittances and more. Scheduled and searchable.",
      },
    ],
  }),
  component: CalendarPage,
});

function CalendarPage() {
  const { data: events } = useSuspenseQuery(calendarQuery);
  return (
    <main>
      <Panel ground="paper" full={false} className="pt-32 pb-16">
        <PanelInner>
          <Eyebrow>What's next</Eyebrow>
          <PanelHeadline className="mt-6">Know when the number lands.</PanelHeadline>
          <p className="mt-6 max-w-[52ch] text-[18px] text-ink-soft">
            Every scheduled Bangladeshi statistical release, with the series it updates. Point a
            webhook at any of them and we'll call you the moment it's in.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <a
              href="https://api.bangladatahub.com/v1/calendar.ics"
              className="border border-rule px-3 py-1.5 font-mono text-[13px] text-ink-soft transition-colors hover:border-seal hover:text-seal"
            >
              Subscribe (.ics)
            </a>
            <span className="text-[13px] text-ink-soft">
              Add the link to Google Calendar, Outlook or Apple Calendar; it refreshes on its own.
            </span>
          </div>

          <ul className="num mt-10 border-t border-rule text-[14px]">
            {events.map((c) => (
              <li
                key={`${c.date}-${c.indicator}`}
                className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-rule py-4"
              >
                <span className="w-[104px] shrink-0 text-ink-soft">{fmtDate(c.date)}</span>
                <span className="flex-1 font-sans text-[15px]">
                  {c.series_id ? (
                    <Link
                      to="/series/$seriesId"
                      params={{ seriesId: c.series_id }}
                      className="transition-colors hover:text-seal"
                    >
                      {c.indicator}
                    </Link>
                  ) : (
                    c.indicator
                  )}
                </span>
                <span className="text-[12px] text-ink-soft">{c.source}</span>
              </li>
            ))}
          </ul>
        </PanelInner>
      </Panel>
    </main>
  );
}
