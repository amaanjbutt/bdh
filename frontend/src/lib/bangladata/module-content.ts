import { marked } from "marked";

/**
 * Tier-2 depth: an optional hand-written guide per module, keyed by slug. Drop a
 * `content/modules/<slug>.md` with frontmatter (use_cases, personas) + prose to
 * give a module page an editorial "About this module" section and example
 * workflows. Falls back to generated depth (series-depth.moduleDepth) otherwise.
 */

export interface ModuleContent {
  html: string;
  useCases: string[];
  personas: string[];
}

const files = import.meta.glob("../../../content/modules/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

function parse(raw: string): { meta: Record<string, string[]>; body: string } {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { meta: {}, body: raw };
  const meta: Record<string, string[]> = {};
  let key: string | null = null;
  for (const line of (m[1] ?? "").split("\n")) {
    const item = line.match(/^\s*-\s+(.*)$/);
    if (item && key) {
      (meta[key] ??= []).push((item[1] ?? "").trim());
      continue;
    }
    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (kv) {
      key = kv[1] ?? "";
      const v = (kv[2] ?? "").trim();
      meta[key] = v ? [v] : [];
    }
  }
  return { meta, body: m[2] ?? "" };
}

const BY_SLUG: Record<string, ModuleContent> = {};
for (const [path, raw] of Object.entries(files)) {
  const slug = path.split("/").pop()!.replace(/\.md$/, "");
  const { meta, body } = parse(raw);
  BY_SLUG[slug] = {
    html: marked.parse(body) as string,
    useCases: meta.use_cases ?? [],
    personas: meta.personas ?? [],
  };
}

export function getModuleContent(slug: string): ModuleContent | null {
  return BY_SLUG[slug] ?? null;
}
