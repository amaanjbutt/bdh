import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { Link, createFileRoute, notFound } from "@tanstack/react-router";

import { Figure } from "@/components/site/figure";
import { Eyebrow, Panel, PanelHeadline, PanelInner } from "@/components/site/panel";
import { getTopicPage } from "@/lib/bangladata/api.functions";
import { cardFigure, figurePeriod, hubLabel, topicFaq } from "@/lib/bangladata/topic-page";
import { TOPIC_BY_SLUG, topicJsonLd, topicTitle, type LiveFigure } from "@/lib/bangladata/topics";

const topicQuery = (slug: string) =>
  queryOptions({
    queryKey: ["topic", slug],
    queryFn: () => getTopicPage({ data: { slug } }),
    staleTime: 300_000,
  });

export const Route = createFileRoute("/topics/$topic")({
  loader: async ({ context, params }) => {
    if (!TOPIC_BY_SLUG[params.topic]) throw notFound();
    return context.queryClient.ensureQueryData(topicQuery(params.topic));
  },
  head: ({ params, loaderData }) => {
    const t = TOPIC_BY_SLUG[params.topic];
    if (!t) return { meta: [{ title: "Topic — BanglaDataHub" }] };
    const live = (loaderData?.live ?? {}) as Record<string, LiveFigure | null>;
    const title = topicTitle(t);
    return {
      meta: [
        { title },
        { name: "description", content: t.description },
        { property: "og:title", content: title },
        { property: "og:description", content: t.description },
      ],
      links: [{ rel: "canonical", href: `https://bangladatahub.com/topics/${t.slug}` }],
      scripts: topicJsonLd(t, loaderData?.titles ?? {}, topicFaq(t, live)).map((o) => ({
        type: "application/ld+json",
        children: JSON.stringify(o),
      })),
    };
  },
  component: TopicPage,
});

function TopicPage() {
  const { topic: slug } = Route.useParams();
  const { data } = useSuspenseQuery(topicQuery(slug));
  const t = TOPIC_BY_SLUG[slug];
  if (!t) return null;
  const live = (data?.live ?? {}) as Record<string, LiveFigure | null>;
  const titles = data?.titles ?? {};
  const faq = topicFaq(t, live);
  const label = (id: string) => hubLabel(titles[id] ?? id);

  return (
    <main>
      <Panel ground="paper" full={false} className="pt-32 pb-10">
        <PanelInner>
          <nav className="eyebrow flex gap-2">
            <Link to="/topics" className="hover:text-seal">
              Topics
            </Link>
            <span>/</span>
            <span>{t.h1}</span>
          </nav>
          <PanelHeadline as="h1" className="mt-6 text-[32px] md:text-[52px]">
            {t.h1}
          </PanelHeadline>
          <p className="mt-5 max-w-[62ch] text-[18px] text-ink-soft">{t.summary}</p>
          <div
            className={`mt-10 grid gap-x-10 gap-y-8 border-t border-rule pt-6 sm:grid-cols-2 lg:grid-cols-3 ${
              t.key.some((id) => live[id]) ? "" : "hidden"
            }`}
          >
            {t.key.map((id) => {
              const f = live[id];
              if (!f) return null;
              const c = cardFigure(f);
              return (
                <Figure
                  key={id}
                  label={label(id)}
                  value={c.value}
                  suffix={c.unit === "%" ? "%" : ` ${c.unit}`}
                  sub={figurePeriod(f)}
                  seriesId={id}
                  hideId
                  size="sm"
                />
              );
            })}
          </div>
        </PanelInner>
      </Panel>

      <Panel ground="paper" full={false} className="pb-12">
        <PanelInner>
          <div className="max-w-[70ch] space-y-4 text-[16px] leading-relaxed">
            {t.intro.map((p) => (
              <p key={p.slice(0, 40)}>{p}</p>
            ))}
          </div>
          {t.links?.length ? (
            <p className="mt-6 text-[14px] text-ink-soft">
              See also:{" "}
              {t.links.map((l, i) => (
                <span key={l.href}>
                  {i ? " · " : ""}
                  <a href={l.href} className="text-seal underline underline-offset-2">
                    {l.label}
                  </a>
                </span>
              ))}
            </p>
          ) : null}
        </PanelInner>
      </Panel>

      {t.sections.map((s) => (
        <Panel key={s.heading} ground="paper" full={false} className="pb-10">
          <PanelInner>
            <Eyebrow>{s.heading}</Eyebrow>
            {s.blurb ? <p className="mt-3 max-w-[70ch] text-[14px] text-ink-soft">{s.blurb}</p> : null}
            <ul className="mt-4 grid gap-x-10 gap-y-2 text-[15px] md:grid-cols-2">
              {s.ids.map((id) => (
                <li key={id}>
                  <Link to="/series/$seriesId" params={{ seriesId: id }} className="hover:text-seal">
                    {label(id)}
                  </Link>
                </li>
              ))}
            </ul>
          </PanelInner>
        </Panel>
      ))}

      <Panel ground="paper" full={false} className="py-12">
        <PanelInner>
          {faq.length ? (
            <>
              <Eyebrow>Questions</Eyebrow>
              <div className="mt-6 divide-y divide-rule border-t border-rule">
                {faq.map((f) => (
                  <div key={f.q} className="py-5">
                    <h2 className="text-[16px] font-medium">{f.q}</h2>
                    <p className="mt-2 max-w-[70ch] text-[15px] text-ink-soft">{f.a}</p>
                  </div>
                ))}
              </div>
            </>
          ) : null}
          <div className="mt-12">
            <Eyebrow>Related topics</Eyebrow>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {t.related.map((r) => (
              <Link
                key={r}
                to="/topics/$topic"
                params={{ topic: r }}
                className="border border-rule px-3 py-1.5 text-[14px] transition-colors hover:border-seal hover:text-seal"
              >
                {TOPIC_BY_SLUG[r]?.h1 ?? r}
              </Link>
            ))}
          </div>
          <p className="mt-10 max-w-[70ch] text-[14px] text-ink-soft">
            Every series here is official data from its publisher, updated as it is released, with the full history as
            JSON or CSV through the BanglaDataHub API.{" "}
            <Link to="/signup" className="text-seal underline underline-offset-2">
              Get a free key
            </Link>{" "}
            or read the{" "}
            <Link to="/docs/$slug" params={{ slug: "api-series" }} className="text-seal underline underline-offset-2">
              series endpoint docs
            </Link>
            .
          </p>
        </PanelInner>
      </Panel>
    </main>
  );
}
