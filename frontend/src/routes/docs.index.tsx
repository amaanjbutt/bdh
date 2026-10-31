import { Link, createFileRoute } from "@tanstack/react-router";

import { Eyebrow, Panel, PanelHeadline, PanelInner } from "@/components/site/panel";
import { SECTIONS, listDocs } from "@/lib/bangladata/docs";
import { SERIES_COUNT } from "@/lib/bangladata/counts";

const SITE = "https://bangladatahub.com";
const TITLE = "Docs — BanglaDataHub API for Bangladesh economic data";
const DESCRIPTION =
  "BanglaDataHub API documentation: getting started, authentication, a reference page for every endpoint, and a guide to every dataset — exchange rates, inflation, rates, funds, payments and more. Every page is also available as raw Markdown.";

const SECTION_BLURB: Record<string, string> = {
  Introduction: "From zero to your first call: keys, the data model, errors and plans.",
  "API reference": "Every endpoint, with parameters, response schemas and real examples.",
  Datasets: "What exists: each dataset with real, callable series ids.",
  "Use cases": "Workflows for fintech teams and macro researchers.",
  Resources: "Changelog.",
};

export const Route = createFileRoute("/docs/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
    ],
    links: [
      { rel: "canonical", href: `${SITE}/docs` },
      { rel: "alternate", type: "text/plain", href: `${SITE}/docs/llms.txt` },
    ],
  }),
  component: DocsIndex,
});

function DocsIndex() {
  const docs = listDocs();
  return (
    <main>
      <Panel ground="paper" full={false} className="pt-32 pb-12">
        <PanelInner>
          <Eyebrow>Docs</Eyebrow>
          <PanelHeadline className="mt-6">Documentation</PanelHeadline>
          <p className="mt-6 max-w-[60ch] text-[18px] text-ink-soft">
            One REST API for Bangladesh&rsquo;s official economic and financial data. Start with the
            quick start, look up any endpoint, or find the dataset you need.
          </p>

          <div className="mt-8 border border-rule bg-paper-sunk p-4 font-mono text-[13px] leading-relaxed">
            <p className="text-ink-soft"># your first call</p>
            <p className="break-all">
              curl -H &quot;X-API-Key: bd_live_xxx&quot;
              &quot;https://api.bangladatahub.com/v1/series/fx.rate.usd/latest&quot;
            </p>
          </div>

          <p className="mt-6 font-mono text-[12px] text-ink-soft">
            For AI agents: every page is available as raw Markdown — append <code>.md</code> to its URL. Index at{" "}
            <a href="/docs/llms.txt" className="text-seal underline underline-offset-2">/docs/llms.txt</a>, all pages in
            one file at{" "}
            <a href="/llms-full.txt" className="text-seal underline underline-offset-2">/llms-full.txt</a>, guidance at{" "}
            <a href="/AGENTS.md" className="text-seal underline underline-offset-2">/AGENTS.md</a>.
          </p>
        </PanelInner>
      </Panel>

      <Panel ground="paper" full={false} className="pb-24">
        <PanelInner>
          <div className="grid gap-10 md:grid-cols-2">
            {SECTIONS.map((section) => {
              const items = docs.filter((d) => d.section === section);
              if (!items.length) return null;
              return (
                <section key={section} className="border-t border-rule pt-6">
                  <h2 className="font-display text-[24px]">{section}</h2>
                  <p className="mt-1 text-[15px] text-ink-soft">{SECTION_BLURB[section]}</p>
                  <ul className="mt-4 space-y-2">
                    {items.map((d) => (
                      <li key={d.slug}>
                        <Link
                          to="/docs/$slug"
                          params={{ slug: d.slug }}
                          className="group flex items-baseline justify-between gap-4"
                        >
                          <span className="transition-colors group-hover:text-seal">{d.title}</span>
                          <span className="font-mono text-[11px] text-ink-soft opacity-0 transition-opacity group-hover:opacity-100">
                            →
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>

          <div className="mt-14 grid gap-4 border-t border-rule pt-8 sm:grid-cols-3">
            <Link to="/docs" className="group border border-rule p-5 transition-colors hover:border-seal">
              <span className="eyebrow text-ink-soft">Recipes</span>
              <span className="mt-2 block font-display text-[19px] group-hover:text-seal">API guides</span>
              <span className="mt-1 block text-[14px] text-ink-soft">Copy-paste code for every major dataset.</span>
            </Link>
            <Link to="/coverage" className="group border border-rule p-5 transition-colors hover:border-seal">
              <span className="eyebrow text-ink-soft">Catalog</span>
              <span className="mt-2 block font-display text-[19px] group-hover:text-seal">Browse all series</span>
              <span className="mt-1 block text-[14px] text-ink-soft">Search {SERIES_COUNT} series by name or id.</span>
            </Link>
            <Link to="/status" className="group border border-rule p-5 transition-colors hover:border-seal">
              <span className="eyebrow text-ink-soft">Freshness</span>
              <span className="mt-2 block font-display text-[19px] group-hover:text-seal">Status</span>
              <span className="mt-1 block text-[14px] text-ink-soft">How current every module is, live.</span>
            </Link>
          </div>
        </PanelInner>
      </Panel>
    </main>
  );
}
