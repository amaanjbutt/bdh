/**
 * The <title> of a /series page. Official names are often long and repetitive, so:
 *
 *   1. SERIES_TITLES (series-titles.ts) may provide a hand-written, query-shaped title.
 *   2. shortTitle() (this file) keeps a name that fits, prefixes "Bangladesh" when it
 *      does not already say where the series is about, and otherwise cuts at a word
 *      boundary so the title stays within ~60 characters.
 *
 * series-title.server.ts applies the map then shortTitle() on the server, so the maps
 * stay out of the browser bundle. The full official name moves to the meta
 * description. Series ids never change.
 */

export const TITLE_CAP = 60;
const BRAND = " | BanglaDataHub";

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

/** Cut at a word boundary so `s` is at most `max` chars, with "…" when anything went. */
export function cut(s: string, max: number): string {
  if (s.length <= max) return s;
  const head = s.slice(0, Math.max(1, max - 1)).replace(/[\s,;:(\-/&]+\S*$/, "");
  return `${(head || s.slice(0, max - 1)).replace(/[\s,;:\-/&]+$/, "")}…`;
}

/** The name with light boilerplate compression, uncut. Pure. */
export function compactName(rawName: string): string {
  return clean(rawName)
    .replace(/\s*\(BB series [A-Z0-9]+\)/gi, "")
    .replace(/\s*\((?:In|in) '000'? (?:Metric )?Tons?\)/g, " ('000 tonnes)")
    .replace(/\s*\((?:In|in) '000'? Acres?\)/g, " ('000 acres)");
}

/** The deterministic short title core for a series name (no brand). Pure. */
export function shortTitle(rawName: string): string {
  const name = compactName(rawName || "");
  const fits = (s: string) => s.length <= TITLE_CAP;
  if (fits(name)) return /\bBangladesh\b/i.test(name) || /^Census 2022\b/i.test(name) ? name : `Bangladesh ${name}`;
  if (!/\bBangladesh\b/i.test(name) && fits(`Bangladesh ${name}`)) return `Bangladesh ${name}`;
  return cut(name, TITLE_CAP);
}

/** The full <title> for a title core: the brand goes on when it still fits. */
export function brandTitle(core: string): string {
  return core.length + BRAND.length <= TITLE_CAP ? `${core}${BRAND}` : core;
}
