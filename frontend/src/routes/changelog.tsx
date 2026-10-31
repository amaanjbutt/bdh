import { Link, createFileRoute } from "@tanstack/react-router";

import { Eyebrow, Panel, PanelHeadline, PanelInner } from "@/components/site/panel";
import { getDoc } from "@/lib/bangladata/docs";

const SITE = "https://bangladatahub.com";
const DESCRIPTION =
  "Every notable change to BanglaDataHub: new datasets, data fixes confirmed against the publisher, and API changes. Follow it by RSS.";

// The changelog is content/docs/changelog.md (also at /docs/changelog); this page gives it
// a home of its own plus an RSS feed (/changelog.xml, built by scripts/build-llms.mjs).
export const Route = createFileRoute("/changelog")({
  loader: () => {
    const doc = getDoc("changelog");
    // the page has its own headline: drop the document's <h1>
    return { html: (doc?.html ?? "").replace(/<h1[^>]*>[\s\S]*?<\/h1>\s*/, "") };
  },
  head: () => ({
    meta: [
      { title: "Changelog — BanglaDataHub" },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: "Changelog — BanglaDataHub" },
      { property: "og:description", content: DESCRIPTION },
    ],
    links: [
      { rel: "canonical", href: `${SITE}/changelog` },
      { rel: "alternate", type: "application/rss+xml", title: "BanglaDataHub changelog", href: `${SITE}/changelog.xml` },
    ],
  }),
  component: ChangelogPage,
});

function ChangelogPage() {
  const { html } = Route.useLoaderData();
  return (
    <main>
      <Panel ground="paper" full={false} className="pt-32 pb-16">
        <PanelInner>
          <Eyebrow>Changelog</Eyebrow>
          <PanelHeadline className="mt-6">What changed, and when.</PanelHeadline>
          <p className="mt-6 max-w-[56ch] text-[18px] text-ink-soft">
            New data, fixes we confirmed against the publisher, and API changes, newest first.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <a
              href="/changelog.xml"
              className="border border-rule px-3 py-1.5 font-mono text-[13px] text-ink-soft transition-colors hover:border-seal hover:text-seal"
            >
              RSS feed
            </a>
            <Link
              to="/docs/$slug"
              params={{ slug: "sources-provenance" }}
              className="border border-rule px-3 py-1.5 font-mono text-[13px] text-ink-soft transition-colors hover:border-seal hover:text-seal"
            >
              How we verify the data
            </Link>
          </div>
          <article className="doc-prose mt-10 max-w-[72ch]" dangerouslySetInnerHTML={{ __html: html }} />
        </PanelInner>
      </Panel>
    </main>
  );
}
