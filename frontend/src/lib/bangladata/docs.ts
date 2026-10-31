import { parseFrontmatter, renderMarkdown, type TocEntry } from "./markdown";

/**
 * Markdown-as-CMS: docs live as .md files in /content/docs with frontmatter
 * (title, description, section, order). They are bundled at build time, so
 * adding a page is just adding a file. `scripts/build-llms.mjs` generates the
 * raw /docs/<slug>.md twins, llms.txt, llms-full.txt and AGENTS.md from the
 * same files (keep SECTIONS in sync with it).
 */

export const SECTIONS = ["Introduction", "API reference", "Datasets", "Use cases", "Resources"] as const;
export type Section = (typeof SECTIONS)[number];

export interface Doc {
  slug: string;
  title: string;
  description: string;
  section: Section;
  order: number;
  html: string;
  toc: TocEntry[];
}

const files = import.meta.glob("../../../content/docs/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

function parse(path: string, raw: string): Doc {
  const slug = path.split("/").pop()!.replace(/\.md$/, "");
  const { meta, body } = parseFrontmatter(raw);
  const section = (SECTIONS as readonly string[]).includes(meta.section ?? "")
    ? (meta.section as Section)
    : "Resources";
  const { html, toc } = renderMarkdown(body);
  return {
    slug,
    title: meta.title || slug,
    description: meta.description || "",
    section,
    order: Number(meta.order) || 999,
    html,
    toc,
  };
}

const DOCS: Doc[] = Object.entries(files)
  .map(([path, raw]) => parse(path, raw))
  .sort((a, b) => SECTIONS.indexOf(a.section) - SECTIONS.indexOf(b.section) || a.order - b.order);

export function listDocs(): Doc[] {
  return DOCS;
}

export function getDoc(slug: string): Doc | null {
  return DOCS.find((d) => d.slug === slug) ?? null;
}

/** Sidebar/nav data: lightweight (no html) grouped by section, in reading order. */
export function docNav(): { section: Section; items: { slug: string; title: string }[] }[] {
  return SECTIONS.map((section) => ({
    section,
    items: DOCS.filter((d) => d.section === section).map((d) => ({ slug: d.slug, title: d.title })),
  })).filter((g) => g.items.length > 0);
}

export function prevNext(slug: string): { prev: Doc | null; next: Doc | null } {
  const i = DOCS.findIndex((d) => d.slug === slug);
  return { prev: (i > 0 ? DOCS[i - 1] : null) ?? null, next: (i >= 0 ? DOCS[i + 1] : null) ?? null };
}
