import { fillCounts } from "./counts";
import { Marked, type Tokens } from "marked";

/**
 * Shared markdown renderer for the docs + blog CMS. Adds stable heading ids
 * (so every section is linkable and the "On this page" TOC can target it),
 * collects that TOC, marks blockquotes as callouts, and wraps tables so wide
 * reference tables scroll on phones instead of breaking the layout.
 */

export interface TocEntry {
  id: string;
  text: string;
  depth: 2 | 3;
}

export interface RenderedMarkdown {
  html: string;
  toc: TocEntry[];
  words: number;
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/<[^>]+>/g, "")
    .replace(/&[a-z]+;/g, "")
    .replace(/[`*_~]/g, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function plain(text: string): string {
  return text
    .replace(/`/g, "")
    .replace(/\*\*/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/\s+·\s+(public|🔑.*)$/i, "")
    .trim();
}

export function renderMarkdown(body: string): RenderedMarkdown {
  const toc: TocEntry[] = [];
  const seen = new Map<string, number>();
  const marked = new Marked();
  marked.use({
    renderer: {
      heading(this: { parser: { parseInline: (t: Tokens.Generic[]) => string } }, token: Tokens.Heading) {
        const inner = this.parser.parseInline(token.tokens);
        let id = slugify(token.text) || "section";
        const n = seen.get(id) ?? 0;
        seen.set(id, n + 1);
        if (n) id = `${id}-${n}`;
        if (token.depth === 2 || token.depth === 3) {
          toc.push({ id, text: plain(token.text), depth: token.depth as 2 | 3 });
        }
        if (token.depth === 1) return `<h1 id="${id}">${inner}</h1>\n`;
        return `<h${token.depth} id="${id}"><a class="heading-anchor" href="#${id}" aria-hidden="true" tabindex="-1">#</a>${inner}</h${token.depth}>\n`;
      },
    },
  });
  let html = marked.parse(body, { async: false }) as string;
  html = html
    .replace(/<blockquote>/g, '<blockquote class="callout">')
    .replace(/<table>/g, '<div class="table-wrap"><table>')
    .replace(/<\/table>/g, "</table></div>");
  const words = body.replace(/```[\s\S]*?```/g, " ").split(/\s+/).filter(Boolean).length;
  return { html, toc, words };
}

export function parseFrontmatter(raw: string): { meta: Record<string, string>; body: string } {
  const m = fillCounts(raw).replace(/\r\n/g, "\n").match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { meta: {}, body: fillCounts(raw) };
  const meta: Record<string, string> = {};
  for (const line of (m[1] ?? "").split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    meta[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return { meta, body: m[2] ?? "" };
}
