import { parseFrontmatter, renderMarkdown, type TocEntry } from "./markdown";

/**
 * Markdown-as-CMS for the blog: posts live as .md files in /content/blog with
 * frontmatter (title, description, date, tags, optional updated). Bundled at
 * build time (same model as docs.ts), so adding a post is just adding a file.
 * `scripts/build-llms.mjs` lists every post in /llms.txt and emits a raw
 * /blog/<slug>.md twin. Editorial / comparison content lives here, never on
 * the landing page.
 */

export interface Post {
  slug: string;
  title: string;
  description: string;
  date: string; // ISO YYYY-MM-DD
  updated: string;
  tags: string[];
  featured: boolean;
  html: string;
  toc: { id: string; text: string; depth: 2 | 3 }[];
  readingMinutes: number;
}

const files = import.meta.glob("../../../content/blog/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

function parse(path: string, raw: string): Post {
  const slug = path.split("/").pop()!.replace(/\.md$/, "");
  const { meta, body } = parseFrontmatter(raw);
  // The page renders the title itself — drop the body's leading "# Title".
  const content = body.replace(/^\s*#\s+[^\n]*\n/, "");
  const { html, toc, words } = renderMarkdown(content);
  const tags = (meta.tags || "")
    .replace(/^\[|\]$/g, "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  return {
    slug,
    title: meta.title || slug,
    description: meta.description || "",
    date: meta.date || "",
    updated: meta.updated || meta.date || "",
    tags,
    featured: meta.featured === "true",
    html,
    toc: toc as TocEntry[] as Post["toc"],
    readingMinutes: Math.max(1, Math.round(words / 220)),
  };
}

const POSTS: Post[] = Object.entries(files)
  .map(([path, raw]) => parse(path, raw))
  .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.title.localeCompare(b.title)));

export function listPosts(): Post[] {
  return POSTS;
}

export function getPost(slug: string): Post | null {
  return POSTS.find((p) => p.slug === slug) ?? null;
}

/** Tags with post counts, most-used first. */
export function listTags(): { tag: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const p of POSTS) for (const t of p.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([tag, count]) => ({ tag, count }));
}

/** Related posts: most shared tags first, then newest. */
export function relatedPosts(slug: string, n = 3): Post[] {
  const post = getPost(slug);
  if (!post) return [];
  return POSTS.filter((p) => p.slug !== slug)
    .map((p) => ({ p, shared: p.tags.filter((t) => post.tags.includes(t)).length }))
    .sort((a, b) => b.shared - a.shared || (a.p.date < b.p.date ? 1 : -1))
    .slice(0, n)
    .map((x) => x.p);
}
