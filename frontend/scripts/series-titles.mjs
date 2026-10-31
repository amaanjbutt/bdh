#!/usr/bin/env node
/**
 * Keeps every /series page title unique (2026-10-26). Run by hand after a names refresh
 * (scripts/refresh_easydata_metadata.py, disambiguate_series_names.py) or a batch of new
 * series, then commit the result:
 *
 *   cd frontend && npm run seo:titles              # live catalog from the public API
 *   cd frontend && npm run seo:titles -- --check   # report only, exit 1 on a collision
 *
 * It runs the site's own title code (src/lib/bangladata/series-title.ts, under Node's type
 * stripping) over every live, canonical series. Hand-written titles (series-titles.ts) win;
 * where two shortened titles come out the same, it keeps the words that tell them apart
 * ("Textile loans, Weaving of… Cotton — working capital") or, failing that, adds the
 * frequency / years / BB table / unit, and writes those few to series-title-dedupe.ts.
 * Label-duplicate twins are skipped (they canonicalize to their original and are noindex).
 * Also checks that every series a topic hub (topics.ts) lists is live and hand-titled.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { TITLE_CAP, compactName, cut, shortTitle } from "../src/lib/bangladata/series-title.ts";
import { SERIES_TITLES } from "../src/lib/bangladata/series-titles.ts";
import { TOPICS, topicLiveIds, topicSeriesIds } from "../src/lib/bangladata/topics.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "src", "lib", "bangladata", "series-title-dedupe.ts");
const check = process.argv.includes("--check");
const fromArg = process.argv.indexOf("--from");

async function catalog() {
  if (fromArg > 0) return JSON.parse(fs.readFileSync(process.argv[fromArg + 1], "utf8"));
  const rows = [];
  for (let offset = 0; ; offset += 5000) {
    const r = await fetch(`https://api.bangladatahub.com/v1/catalog?limit=5000&offset=${offset}`, {
      signal: AbortSignal.timeout(60000),
    });
    if (!r.ok) throw new Error(`catalog ${r.status}`);
    const page = (await r.json()).data ?? [];
    rows.push(...page);
    if (page.length < 5000) break;
  }
  if (rows.length < 10000) throw new Error(`only ${rows.length} catalog rows`);
  return rows;
}

const key = (s) => s.toLowerCase().replace(/\s+/g, " ").trim();
const FREQ = { daily: "daily", weekly: "weekly", monthly: "monthly", quarterly: "quarterly", half_yearly: "half-yearly", annual: "annual" };
const UNIT = { usd_th: "US$ th", usd_mn: "US$ mn", usd_bn: "US$ bn", pkr_th: "Rs th", pkr_mn: "Rs mn", pkr_bn: "Rs bn", pkr_tn: "Rs tn", percent: "%", index: "index", count: "count" };

function years(r) {
  const y0 = (r.first_date || "").slice(0, 4);
  const y1 = (r.last_date || "").slice(0, 4);
  if (!y0) return "";
  const current = r.last_date && Date.now() - new Date(r.last_date).getTime() < 550 * 86_400_000;
  return current ? `${y0}–` : y0 === y1 ? y0 : `${y0}–${y1}`;
}

// The BB table a series comes from, as the catalog description names it.
const table = (r) => ((r.description || "").match(/State Bank of Bangladesh[’']s “([^”]+)”/) || [])[1] || "";

/** Render chosen word positions in order, with "…" where words were skipped. */
const CONNECTOR = /^(—|-|–|&|and|or|of|to|in|on|by|for|from|the|with|at|as|a|an)$/i;
function render(words, picked) {
  // a connector ("—", "&", "of") next to a skipped stretch says nothing: drop it
  const idx = [...picked]
    .sort((a, b) => a - b)
    .filter((i) => !CONNECTOR.test(words[i]) || (picked.has(i - 1) && picked.has(i + 1)) || (i === 0 && picked.has(1)));
  let out = "";
  idx.forEach((i, n) => {
    const gap = n > 0 && i !== idx[n - 1] + 1;
    out += n === 0 ? (i > 0 ? "…" : "") + words[i] : (gap ? "… " : " ") + words[i];
  });
  return out.replace(/[,;:]…/g, "…");
}

/** Titles for one collision group that keep the words its members differ in: every word not
 *  shared by the whole group, then as many leading and closing words as fit. */
function byDifference(group) {
  const ws = group.map((r) => compactName(r.name).split(" "));
  const bags = ws.map((w) => {
    const m = new Map();
    for (const x of w) m.set(x, (m.get(x) ?? 0) + 1);
    return m;
  });
  return ws.map((w, gi) => {
    const seen = new Map();
    const must = new Set();
    w.forEach((x, i) => {
      const k = (seen.get(x) ?? 0) + 1;
      seen.set(x, k);
      if (bags.some((b, j) => j !== gi && (b.get(x) ?? 0) < k)) must.add(i);
    });
    if (!must.size) return null;
    if (w.join(" ").length <= TITLE_CAP) return w.join(" ");
    const picked = new Set(must);
    if (render(w, picked).length > TITLE_CAP) return null;
    // fill: the opening words first (they say what the series is), then the closing ones
    const order = [...w.keys()].flatMap((i) => [i, w.length - 1 - i]).filter((i, n, a) => a.indexOf(i) === n);
    for (const i of order) {
      if (picked.has(i)) continue;
      picked.add(i);
      if (render(w, picked).length > TITLE_CAP) picked.delete(i);
    }
    return tidy(render(w, picked));
  });
}

const tidy = (s) => s.replace(/…(\s*…)+/g, "…").replace(/\s+…/g, "…");

/** Last resort: the title plus the first metadata qualifier that sets this series apart. */
function byQualifier(base, r, group) {
  const ladders = [
    (x) => FREQ[x.frequency] || x.frequency,
    years,
    (x) => table(x),
    (x) => UNIT[x.unit] || x.unit,
    (x) => `${FREQ[x.frequency] || x.frequency}, ${years(x)}`,
    (x) => ((x.source_url || "").match(/\.([A-Z0-9]+)\/data$/) || [])[1] && `BB ${(x.source_url || "").match(/\.([A-Z0-9]+)\/data$/)[1]}`,
  ];
  for (const q of ladders) {
    const v = q(r);
    if (v && group.every((o) => o.id === r.id || q(o) !== v)) return tidy(`${cut(base, TITLE_CAP - v.length - 3)} (${v})`);
  }
  const v = r.id.split(".").pop();
  return tidy(`${cut(base, TITLE_CAP - v.length - 3)} (${v})`);
}

const rows = await catalog();
const live = rows.filter((r) => r.id && !(r.canonical_id && r.canonical_id !== r.id));
const ids = new Set(rows.map((r) => r.id));

const problems = [];
for (const [id, t] of Object.entries(SERIES_TITLES)) {
  if (!ids.has(id)) problems.push(`curated title for unknown series ${id}`);
  if (t.length > TITLE_CAP + 5) problems.push(`curated title over ${TITLE_CAP + 5} chars: ${id} "${t}"`);
}

// every series a topic hub lists must be live, canonical and hand-titled (the hub links show the title)
const liveIds = new Set(live.map((r) => r.id));
for (const t of TOPICS) {
  for (const id of new Set([...topicSeriesIds(t), ...topicLiveIds(t)])) {
    if (!liveIds.has(id)) problems.push(`topic ${t.slug} lists ${id}, not a live canonical series`);
    else if (!SERIES_TITLES[id]) problems.push(`topic ${t.slug} lists ${id} without a hand-written title`);
  }
}

const title = new Map(live.map((r) => [r.id, SERIES_TITLES[r.id] ?? shortTitle(r.name || r.id)]));
const groupsOf = () => {
  const by = new Map();
  for (const r of live) {
    const k = key(title.get(r.id));
    by.set(k, [...(by.get(k) ?? []), r]);
  }
  return [...by.values()].filter((g) => g.length > 1);
};

const dedupe = {};
const firstGroups = groupsOf();
for (const g of firstGroups) {
  const curated = g.filter((r) => SERIES_TITLES[r.id]);
  if (curated.length > 1) problems.push(`curated titles collide: ${curated.map((r) => r.id).join(", ")}`);
  const auto = g.filter((r) => !SERIES_TITLES[r.id]);
  const diff = byDifference(auto);
  auto.forEach((r, i) => {
    if (diff[i]) title.set(r.id, (dedupe[r.id] = diff[i]));
  });
}
// whatever still collides (an empty difference, or a clash with another title): qualifiers
for (let pass = 0; pass < 3; pass++) {
  const left = groupsOf();
  if (!left.length) break;
  for (const g of left) {
    const auto = g.filter((r) => !SERIES_TITLES[r.id]);
    const others = auto.length === g.length ? auto.slice(1) : auto; // one keeps the plain title
    for (const r of others) title.set(r.id, (dedupe[r.id] = byQualifier(title.get(r.id), r, auto)));
  }
}
const still = groupsOf();
for (const g of still) problems.push(`still colliding: "${title.get(g[0].id)}" — ${g.map((r) => r.id).join(", ")}`);

const lengths = live.map((r) => title.get(r.id).length);
console.log(
  `series-titles: ${live.length} live series, ${Object.keys(SERIES_TITLES).length} hand-written, ` +
    `${firstGroups.length} collision groups -> ${Object.keys(dedupe).length} deduplicated titles, ` +
    `longest ${Math.max(...lengths)} chars, ${still.length} unresolved`,
);
for (const p of problems) console.warn(`  ! ${p}`);

if (!check) {
  const body = Object.keys(dedupe)
    .sort()
    .map((id) => `  ${JSON.stringify(id)}: ${JSON.stringify(dedupe[id])},`)
    .join("\n");
  fs.writeFileSync(
    OUT,
    `// Generated by scripts/series-titles.mjs (npm run seo:titles) — do not edit by hand.\n` +
      `// Series whose shortened title would collide with another's, with the words that tell them apart.\n` +
      `export const SERIES_TITLE_DEDUPE: Record<string, string> = {\n${body}\n};\n`,
  );
  console.log(`series-titles: wrote ${path.relative(ROOT, OUT)}`);
}
process.exit(problems.length && check ? 1 : 0);
