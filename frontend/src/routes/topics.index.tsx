import { Link, createFileRoute } from "@tanstack/react-router";

import { Panel, PanelHeadline, PanelInner } from "@/components/site/panel";
import { TOPICS, TOPICS_INDEX_DESCRIPTION, TOPICS_INDEX_TITLE, topicsIndexJsonLd } from "@/lib/bangladata/topics";

export const Route = createFileRoute("/topics/")({
  head: () => ({
    meta: [
      { title: TOPICS_INDEX_TITLE },
      { name: "description", content: TOPICS_INDEX_DESCRIPTION },
      { property: "og:title", content: TOPICS_INDEX_TITLE },
      { property: "og:description", content: TOPICS_INDEX_DESCRIPTION },
    ],
    links: [{ rel: "canonical", href: "https://bangladatahub.com/topics" }],
    scripts: topicsIndexJsonLd().map((o) => ({ type: "application/ld+json", children: JSON.stringify(o) })),
  }),
  component: TopicsIndex,
});

function TopicsIndex() {
  return (
    <main>
      <Panel ground="paper" full={false} className="pt-32 pb-10">
        <PanelInner>
          <p className="eyebrow">Topics</p>
          <PanelHeadline as="h1" className="mt-6">
            Bangladesh's economy, topic by topic
          </PanelHeadline>
          <p className="mt-6 max-w-[62ch] text-[18px] text-ink-soft">
            The questions people ask about Bangladesh's economy, each answered with the latest official figures and every
            series behind them.
          </p>
        </PanelInner>
      </Panel>
      <Panel ground="paper" full={false} className="pb-16">
        <PanelInner>
          <ul className="grid gap-x-10 gap-y-6 border-t border-rule pt-6 md:grid-cols-2">
            {TOPICS.map((t) => (
              <li key={t.slug}>
                <Link to="/topics/$topic" params={{ topic: t.slug }} className="group block">
                  <span className="text-[18px] font-medium group-hover:text-seal">{t.h1}</span>
                  <span className="mt-1 block text-[14px] text-ink-soft">{t.summary}</span>
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-12 max-w-[70ch] text-[14px] text-ink-soft">
            Looking for something else? Browse the{" "}
            <Link to="/coverage" className="text-seal underline underline-offset-2">
              full data catalog
            </Link>{" "}
            or{" "}
            <Link to="/search" className="text-seal underline underline-offset-2">
              search every series
            </Link>
            .
          </p>
        </PanelInner>
      </Panel>
    </main>
  );
}
