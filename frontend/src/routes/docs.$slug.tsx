import { Link, createFileRoute, notFound } from "@tanstack/react-router";
import { useRef } from "react";

import {
  CopyMarkdownButton,
  DocsSidebar,
  DocsToc,
  MobileDocsMenu,
  useCodeCopy,
} from "@/components/site/docs-shell";
import { docNav, getDoc, prevNext } from "@/lib/bangladata/docs";

const SITE = "https://bangladatahub.com";

export const Route = createFileRoute("/docs/$slug")({
  loader: ({ params }) => {
    const doc = getDoc(params.slug);
    if (!doc) throw notFound();
    const { prev, next } = prevNext(doc.slug);
    return {
      doc,
      nav: docNav(),
      prev: prev ? { slug: prev.slug, title: prev.title } : null,
      next: next ? { slug: next.slug, title: next.title } : null,
    };
  },
  head: ({ params }) => {
    const doc = getDoc(params.slug);
    if (!doc) return { meta: [{ title: "Docs — BanglaDataHub" }] };
    const url = `${SITE}/docs/${doc.slug}`;
    const title = `${doc.title} — BanglaDataHub Docs`;
    return {
      meta: [
        { title },
        { name: "description", content: doc.description },
        { property: "og:title", content: title },
        { property: "og:description", content: doc.description },
        { property: "og:type", content: "article" },
      ],
      links: [
        { rel: "canonical", href: url },
        // The raw-Markdown twin — what LLM tools should read (see /docs/llms.txt).
        { rel: "alternate", type: "text/markdown", href: `${url}.md` },
      ],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "TechArticle",
            headline: doc.title,
            description: doc.description,
            url,
            articleSection: doc.section,
            inLanguage: "en",
            isPartOf: { "@type": "WebSite", name: "BanglaDataHub", url: SITE },
            publisher: { "@type": "Organization", name: "BanglaDataHub", url: SITE },
            encoding: { "@type": "MediaObject", encodingFormat: "text/markdown", contentUrl: `${url}.md` },
          }),
        },
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "Docs", item: `${SITE}/docs` },
              { "@type": "ListItem", position: 2, name: doc.section, item: `${SITE}/docs` },
              { "@type": "ListItem", position: 3, name: doc.title, item: url },
            ],
          }),
        },
      ],
    };
  },
  component: DocPage,
});

function DocPage() {
  const { doc, nav, prev, next } = Route.useLoaderData();
  const article = useRef<HTMLElement>(null);
  useCodeCopy(article, doc.slug);
  const mdHref = `/docs/${doc.slug}.md`;

  return (
    <main className="ground-paper bg-paper text-ink">
      <div className="mx-auto w-full max-w-[1320px] px-6 pb-24 pt-28 md:px-10">
        <div className="grid gap-10 lg:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[220px_minmax(0,1fr)_190px]">
          <aside className="hidden lg:block">
            <div className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto pr-2">
              <DocsSidebar nav={nav} current={doc.slug} />
            </div>
          </aside>

          <div className="min-w-0">
            <MobileDocsMenu label={`Docs · ${doc.section}`}>
              <DocsSidebar nav={nav} current={doc.slug} />
            </MobileDocsMenu>

            <nav aria-label="Breadcrumb" className="eyebrow flex flex-wrap items-center gap-2 text-ink-soft">
              <Link to="/docs" className="hover:text-seal">
                Docs
              </Link>
              <span aria-hidden="true">/</span>
              <span>{doc.section}</span>
            </nav>

            <p className="mt-4 border-l-2 border-gilt bg-paper-sunk px-3 py-2 font-mono text-[12px] leading-relaxed text-ink-soft">
              For AI agents: this page is available as raw Markdown at{" "}
              <a href={mdHref} className="text-seal underline underline-offset-2">
                {mdHref}
              </a>
              {" "}· every page in one file at{" "}
              <a href="/llms-full.txt" className="text-seal underline underline-offset-2">
                /llms-full.txt
              </a>
              {" "}· index at{" "}
              <a href="/docs/llms.txt" className="text-seal underline underline-offset-2">
                /docs/llms.txt
              </a>
            </p>

            <article ref={article} className="doc-prose mt-6" dangerouslySetInnerHTML={{ __html: doc.html }} />

            <div className="mt-12 flex flex-wrap items-center gap-3 border-t border-rule pt-6">
              <a
                href={mdHref}
                className="border border-rule px-3 py-1.5 font-mono text-[12px] text-ink-soft transition-colors hover:border-seal hover:text-seal"
              >
                View as Markdown (.md)
              </a>
              <CopyMarkdownButton href={mdHref} />
            </div>

            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {prev ? (
                <Link
                  to="/docs/$slug"
                  params={{ slug: prev.slug }}
                  className="group border border-rule p-4 transition-colors hover:border-seal"
                >
                  <span className="eyebrow text-ink-soft">← Previous</span>
                  <span className="mt-1 block font-display text-[17px] group-hover:text-seal">{prev.title}</span>
                </Link>
              ) : (
                <span />
              )}
              {next ? (
                <Link
                  to="/docs/$slug"
                  params={{ slug: next.slug }}
                  className="group border border-rule p-4 text-right transition-colors hover:border-seal"
                >
                  <span className="eyebrow text-ink-soft">Next →</span>
                  <span className="mt-1 block font-display text-[17px] group-hover:text-seal">{next.title}</span>
                </Link>
              ) : null}
            </div>
          </div>

          <aside className="hidden xl:block">
            <div className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto">
              <DocsToc toc={doc.toc} />
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
