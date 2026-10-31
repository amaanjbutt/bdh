import { marked } from "marked";

/**
 * Optional hand-written depth for a series, keyed by its id. The series
 * pages are generated from the catalog; this is where a flagship gets the
 * Capital-Stake-style depth — an editorial paragraph, concrete use cases, and
 * the personas who reach for it. Drop a `content/series/<series_id>.md`:
 *
 *   ---
 *   use_cases:
 *     - Track the taka's long-run trend for a macro model
 *     - Index a contract to the monthly average
 *   personas:
 *     - Macro researcher
 *     - Treasury / FX desk
 *   ---
 *   Prose about what the series measures and how to read it…
 */

export interface SeriesContent {
  html: string;
  useCases: string[];
  personas: string[];
}

const files = import.meta.glob("../../../content/series/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

function parseFrontmatter(raw: string): { meta: Record<string, string[]>; body: string } {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { meta: {}, body: raw };
  const meta: Record<string, string[]> = {};
  let currentKey: string | null = null;
  for (const line of (m[1] ?? "").split("\n")) {
    const listItem = line.match(/^\s*-\s+(.*)$/);
    if (listItem && currentKey) {
      (meta[currentKey] ??= []).push((listItem[1] ?? "").trim());
      continue;
    }
    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (kv) {
      currentKey = kv[1] ?? "";
      const v = (kv[2] ?? "").trim();
      meta[currentKey] = v ? [v] : [];
    }
  }
  return { meta, body: m[2] ?? "" };
}

const BY_ID: Record<string, SeriesContent> = {};
for (const [path, raw] of Object.entries(files)) {
  const id = path.split("/").pop()!.replace(/\.md$/, "");
  const { meta, body } = parseFrontmatter(raw);
  BY_ID[id] = {
    html: marked.parse(body) as string,
    useCases: meta.use_cases ?? [],
    personas: meta.personas ?? [],
  };
}

export function getSeriesContent(id: string): SeriesContent | null {
  return BY_ID[id] ?? null;
}
