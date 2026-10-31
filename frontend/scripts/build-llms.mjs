#!/usr/bin/env node
/**
 * Generates every machine-readable docs artifact from the markdown CMS so they
 * can never drift from the site (runs as `prebuild`/`predev`):
 *
 *   public/docs/<slug>.md      raw Markdown of each docs page   (append .md to any docs URL)
 *   public/docs/llms.txt       docs index (llmstxt.org format), linking the .md files
 *   public/llms-full.txt       every docs page concatenated, for one-fetch ingestion
 *   public/llms.txt            site overview: content/llms/llms.template.txt + generated Docs
 *   public/AGENTS.md           + public/docs/AGENTS.md (content/llms/AGENTS.md)
 *   public/sitemap-docs.xml    + public/sitemap-explorers.xml + public/sitemap-topics.xml
 *
 * All text outputs are ASCII-folded: static .txt/.md are served without a
 * charset, and non-ASCII (em dashes etc.) rendered as mojibake before.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { TOPICS } from "../src/lib/bangladata/topics.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE = "https://bangladatahub.com";
const PUB = path.join(ROOT, "public");
const CONTENT = path.join(ROOT, "content");

// Section order for the docs sidebar + llms index. Keep in sync with src/lib/bangladata/docs.ts.
export const SECTIONS = ["Introduction", "API reference", "Datasets", "Use cases", "Resources"];

const FOLD = [
  [/[\u2014\u2013\u2212]/g, "-"], // em/en dash, minus
  [/[\u201C\u201D\u201E]/g, '"'],
  [/[\u2018\u2019\u201A]/g, "'"],
  [/\u2026/g, "..."],
  [/\u2192/g, "->"],
  [/\u2190/g, "<-"],
  [/\u00B7/g, "-"], // middle dot
  [/\u00D7/g, "x"],
  [/\u2248/g, "~"],
  [/\u2264/g, "<="],
  [/\u2265/g, ">="],
  [/\u2318/g, "Cmd"],
  [/\u00A0/g, " "], // non-breaking space
  [/\u{1F511}/gu, "(key required)"],
  [/[\u00E9\u00E8]/g, "e"],
];

function asciiFold(s) {
  let out = s;
  for (const [re, rep] of FOLD) out = out.replace(re, rep);
  // Anything still non-ASCII: strip diacritics, then drop.
  out = out.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  return out.replace(/[^\x00-\x7F]/g, "");
}

// ---- live headline counts -------------------------------------------------------
// One source for every "N series / N funds" in the site, docs and llms files: the API's
// /v1/status `totals`, snapshotted at build time into src/lib/bangladata/live-counts.json
// (the app imports it too). Markdown uses {{SERIES_COUNT}} / {{FUND_COUNT}} /
// {{AMC_COUNT}} / {{SECURITY_COUNT}}. Offline builds keep the last snapshot.
const COUNTS_FILE = path.join(ROOT, "src", "lib", "bangladata", "live-counts.json");
const API_BASE = (process.env.BANGLADATA_API_BASE || "https://api.bangladatahub.com").replace(/\/$/, "");
async function loadCounts() {
  let prev = {};
  try {
    prev = JSON.parse(fs.readFileSync(COUNTS_FILE, "utf8"));
  } catch {}
  try {
    const r = await fetch(`${API_BASE}/v1/status`, { signal: AbortSignal.timeout(20000) });
    const j = await r.json();
    if (!j.totals?.series) throw new Error("status has no totals");
    const counts = {
      series: j.totals.series,
      funds: j.totals.funds,
      amcs: j.totals.amcs,
      securities: j.totals.securities,
      // per-module series counts for {{MODULE_COUNT:<module>}} in docs prose
      modules: Object.fromEntries(j.modules.map((m) => [m.module, m.series_count])),
      observations: j.modules.reduce((a, m) => a + Number(m.observation_count || 0), 0),
      generated_at: new Date().toISOString().slice(0, 10),
    };
    fs.writeFileSync(COUNTS_FILE, JSON.stringify(counts, null, 2) + "\n", "utf8");
    return counts;
  } catch (e) {
    console.warn(`build-llms: live counts unavailable (${e}); keeping ${COUNTS_FILE}`);
    return prev;
  }
}
const COUNTS = await loadCounts();
const fmtN = (n) => Number(n).toLocaleString("en-US");
// The Google Sheets script (public/integrations/BanglaDataHub.gs) is embedded in the
// spreadsheets doc via {{SHEETS_SCRIPT}} so the docs can never drift from the download.
const SHEETS_SCRIPT = fs.readFileSync(path.join(PUB, "integrations", "BanglaDataHub.gs"), "utf8").trimEnd();
export function fillCounts(s) {
  return s
    .replaceAll("{{SHEETS_SCRIPT}}", SHEETS_SCRIPT)
    .replaceAll("{{SERIES_COUNT}}", fmtN(COUNTS.series))
    .replaceAll("{{FUND_COUNT}}", fmtN(COUNTS.funds))
    .replaceAll("{{AMC_COUNT}}", fmtN(COUNTS.amcs))
    .replaceAll("{{SECURITY_COUNT}}", fmtN(COUNTS.securities))
    .replace(/\{\{MODULE_COUNT:([a-z-]+)\}\}/g, (_, m) => {
      if (COUNTS.modules?.[m] == null) throw new Error(`build-llms: no live count for module ${m}`);
      return fmtN(COUNTS.modules[m]);
    });
}

function parseFrontmatter(raw) {
  const m = raw.replace(/\r\n/g, "\n").match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  const meta = {};
  let body = raw;
  if (m) {
    body = m[2];
    for (const line of m[1].split("\n")) {
      const i = line.indexOf(":");
      if (i === -1) continue;
      meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
  }
  return { meta, body: body.trim() + "\n" };
}

function readDir(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => ({ slug: f.replace(/\.md$/, ""), ...parseFrontmatter(fillCounts(fs.readFileSync(path.join(dir, f), "utf8"))) }));
}

/** Make site-relative links absolute; point docs links at their .md twin (LLM-friendly). */
function absolutizeLinks(md) {
  return md.replace(/\]\((\/[^)\s]*)\)/g, (_, href) => {
    const m = href.match(/^\/docs\/([a-z0-9-]+)(#[^)]*)?$/);
    if (m) return `](${SITE}/docs/${m[1]}.md${m[2] ?? ""})`;
    return `](${SITE}${href})`;
  });
}

function write(rel, content) {
  const p = path.join(PUB, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, "utf8");
}

// ---- load content -----------------------------------------------------------
const docs = readDir(path.join(CONTENT, "docs"))
  .map((d) => ({
    ...d,
    title: d.meta.title || d.slug,
    description: d.meta.description || "",
    section: d.meta.section || "Resources",
    order: Number(d.meta.order) || 999,
  }))
  .sort((a, b) => SECTIONS.indexOf(a.section) - SECTIONS.indexOf(b.section) || a.order - b.order);

const posts = [];

const unknown = docs.filter((d) => !SECTIONS.includes(d.section));
if (unknown.length) throw new Error(`docs with unknown section: ${unknown.map((d) => d.slug).join(", ")}`);

// ---- per-page raw markdown ---------------------------------------------------
function docMarkdown(d) {
  return asciiFold(
    absolutizeLinks(d.body) +
      `\n---\nSource: ${SITE}/docs/${d.slug} - BanglaDataHub docs index: ${SITE}/docs/llms.txt\n`,
  );
}

// Clear stale generated pages first (a renamed/deleted doc must not linger).
for (const dir of ["docs", "blog"]) {
  const p = path.join(PUB, dir);
  if (fs.existsSync(p)) for (const f of fs.readdirSync(p)) if (f.endsWith(".md") && f !== "AGENTS.md") fs.unlinkSync(path.join(p, f));
}
for (const d of docs) write(`docs/${d.slug}.md`, docMarkdown(d));
for (const p of posts)
  write(
    `blog/${p.slug}.md`,
    asciiFold(absolutizeLinks(p.body) + `\n---\nPublished ${p.date} - ${SITE}/blog/${p.slug}\n`),
  );

// ---- docs/llms.txt -------------------------------------------------------------
const bySection = SECTIONS.map((s) => [s, docs.filter((d) => d.section === s)]).filter(([, l]) => l.length);
const docsIndex = [
  "# BanglaDataHub Documentation",
  "",
  "> BanglaDataHub is the self-serve REST API for Bangladesh's official economic and financial data - {{SERIES_COUNT}} live series from 1972 to today (exchange rates, inflation, interest rates and yield curves, balance of payments, reserves, remittances, money and banking, GDP, public finance, debt, digital payments, telecom) plus {{FUND_COUNT}} mutual funds, debt securities, auctions and trade, sourced from BB, BBS, PTA and BSEC. Base URL https://api.bangladatahub.com, auth via the `X-API-Key` header, 500 free API calls every month. Append `.md` to any docs URL for that page as raw Markdown, or fetch every page at once at https://bangladatahub.com/llms-full.txt (one file, raw Markdown)",
  "",
  ...bySection.flatMap(([s, list]) => [
    `## ${s}`,
    "",
    ...list.map((d) => `- [${d.title}](${SITE}/docs/${d.slug}.md): ${d.description}`),
    "",
  ]),
  "## For AI Agents & LLMs",
  "",
  `- [AGENTS.md](${SITE}/AGENTS.md): How AI agents should read and use these docs.`,
  `- [llms.txt](${SITE}/docs/llms.txt): This index of every docs page, linking each page's raw Markdown.`,
  `- [llms-full.txt](${SITE}/llms-full.txt): Every documentation page concatenated as raw Markdown, in one file.`,
  `- [Site overview](${SITE}/llms.txt): What BanglaDataHub is, one-line answers, blog and tools.`,
  "",
  "## Optional",
  "",
  `- [Website](${SITE})`,
  `- [Browse the catalog](${SITE}/coverage)`,
  `- [Status](${SITE}/status)`,
  `- [Pricing](${SITE}/pricing)`,
  "",
].join("\n");
write("docs/llms.txt", asciiFold(fillCounts(docsIndex)));

// ---- llms-full.txt ---------------------------------------------------------------
const full = [
  "# BanglaDataHub - full documentation",
  "",
  "> Every BanglaDataHub docs page as raw Markdown, in reading order. Index: https://bangladatahub.com/docs/llms.txt - Site overview: https://bangladatahub.com/llms.txt",
  "",
  ...docs.map((d) => `\n\n<!-- ${SITE}/docs/${d.slug} (${d.section}) -->\n\n` + absolutizeLinks(d.body)),
  "",
].join("\n");
write("llms-full.txt", asciiFold(full));

// ---- llms.txt (site overview) ---------------------------------------------------
const tpl = fillCounts(fs.readFileSync(path.join(CONTENT, "llms", "llms.template.txt"), "utf8"));
const docsSection = [
  "## Docs",
  "",
  ...bySection.flatMap(([s, list]) => [
    `### ${s}`,
    "",
    ...list.map((d) => `- [${d.title}](${SITE}/docs/${d.slug}.md): ${d.description}`),
    "",
  ]),
].join("\n");
const blogSection = "";
write("llms.txt", asciiFold(tpl.replace("{{DOCS}}", docsSection).replace("{{BLOG}}", blogSection)));

// ---- AGENTS.md ----------------------------------------------------------------------
const agents = asciiFold(fillCounts(fs.readFileSync(path.join(CONTENT, "llms", "AGENTS.md"), "utf8")));
write("AGENTS.md", agents);
write("docs/AGENTS.md", agents);

// ---- sitemaps ---------------------------------------------------------------------
const today = new Date().toISOString().slice(0, 10);
const urlset = (urls) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  urls.map(([loc, lastmod]) => `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </url>`).join("\n") +
  `\n</urlset>\n`;
write("sitemap-docs.xml", urlset([[`${SITE}/docs`, today], ...docs.map((d) => [`${SITE}/docs/${d.slug}`, today])]));
// /districts + one profile per Census 2022 district (the list changes only with a new
// census, so it lives here rather than behind the keyed series API).
{
  const DISTRICTS = [
    "Barguna", "Barishal", "Bhola", "Jhalokathi", "Patuakhali", "Pirojpur",
    "Bandarban", "Brahmanbaria", "Chandpur", "Chattogram", "Cumilla", "Cox's Bazar", "Feni",
    "Khagrachhari", "Lakshmipur", "Noakhali", "Rangamati",
    "Dhaka", "Faridpur", "Gazipur", "Gopalganj", "Kishoreganj", "Madaripur", "Manikganj",
    "Munshiganj", "Narayanganj", "Narsingdi", "Rajbari", "Shariatpur", "Tangail",
    "Bagerhat", "Chuadanga", "Jashore", "Jhenaidah", "Khulna", "Kushtia", "Magura",
    "Meherpur", "Narail", "Satkhira",
    "Jamalpur", "Mymensingh", "Netrakona", "Sherpur",
    "Bogura", "Chapainawabganj", "Joypurhat", "Naogaon", "Natore", "Pabna", "Rajshahi",
    "Sirajganj",
    "Dinajpur", "Gaibandha", "Kurigram", "Lalmonirhat", "Nilphamari", "Panchagarh",
    "Rangpur", "Thakurgaon",
    "Habiganj", "Moulvibazar", "Sunamganj", "Sylhet",
  ];
  const slug = (n) => n.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  write(
    "sitemap-explorers.xml",
    urlset([
      [`${SITE}/districts`, today],
      [`${SITE}/market`, today],
      [`${SITE}/derived`, today],
      ...DISTRICTS.map((d) => [`${SITE}/districts/${slug(d)}`, today]),
    ]),
  );
}

// /topics + one hub per topic (src/lib/bangladata/topics.ts).
write("sitemap-topics.xml", urlset([[`${SITE}/topics`, today], ...TOPICS.map((t) => [`${SITE}/topics/${t.slug}`, today])]));

// Sitemap index: only files this build (or ops/seo/gen_sitemap.sh) actually writes.
write(
  "sitemap.xml",
  `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    ["sitemap-core.xml", "sitemap-series.xml", "sitemap-docs.xml", "sitemap-explorers.xml", "sitemap-topics.xml"]
      .map((f) => `  <sitemap>\n    <loc>${SITE}/${f}</loc>\n  </sitemap>`)
      .join("\n") +
    `\n</sitemapindex>\n`,
);

// /changelog.xml — an RSS feed of the changelog, one item per dated section of
// content/docs/changelog.md ("## 2026-10-16" → its bullets). The page is /changelog.
{
  const cl = docs.find((d) => d.slug === "changelog");
  const xml = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const plain = (t) => t.replace(/\*\*(.+?)\*\*/g, "$1").replace(/`([^`]+)`/g, "$1").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
  const items = [];
  for (const part of (cl?.body ?? "").split(/^## /m).slice(1)) {
    const [head, ...rest] = part.split("\n");
    const date = head.trim();
    if (!/^\d{4}-\d{2}(-\d{2})?$/.test(date)) continue;
    const bullets = rest.join("\n").split(/^- /m).map((b) => plain(b.trim())).filter(Boolean);
    const first = bullets[0] ?? "";
    const title = (first.match(/^([^.]{8,110}?)\./) || [null, first.slice(0, 100)])[1];
    const iso = date.length === 7 ? `${date}-01` : date;
    items.push(
      `<item><title>${xml(`${date}: ${title}`)}</title><link>${SITE}/changelog#${date}</link>` +
        `<guid isPermaLink="false">bangladatahub-changelog-${date}</guid><pubDate>${new Date(`${iso}T09:00:00Z`).toUTCString()}</pubDate>` +
        `<description>${xml(bullets.map((b) => `• ${b}`).join("\n"))}</description></item>`,
    );
  }
  write(
    "changelog.xml",
    `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel>` +
      `<title>BanglaDataHub changelog</title><link>${SITE}/changelog</link>` +
      `<atom:link href="${SITE}/changelog.xml" rel="self" type="application/rss+xml"/>` +
      `<description>New data, fixes and API changes at BanglaDataHub.</description><language>en</language>\n` +
      `${items.join("\n")}\n</channel></rss>\n`,
  );
}

console.log(`build-llms: ${docs.length} docs, ${posts.length} posts -> .md, llms.txt, llms-full.txt, AGENTS.md, sitemaps`);
