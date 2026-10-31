/**
 * URL slugs for pages keyed by a name, and the redirects that keep old URLs working.
 * Pure and tiny: the Worker entry (server.ts) imports it to 301 old URLs before any render.
 */

/** "JS Investments Limited" -> "js-investments" (/amcs/{slug}). */
export function amcSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b(limited|ltd|pvt|private)\b\.?/g, " ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Mandi crop slugs corrected from AMIS's spelling (backend ingestion/agri_names.py SLUG_RENAMES). */
export const RENAMED_MANDI_CROPS: Record<string, string> = {
  cocunut: "coconut",
  suger_beet: "sugar_beet",
  mango_desahri: "mango_dusehri",
  mango_chounsa: "mango_chaunsa",
  mango_anwer_ratol: "mango_anwar_ratol",
  jaman: "jamun",
};

/** Where an outdated URL now lives, or null. /amcs/{AMC name} -> /amcs/{slug};
 *  /mandi/{misspelt crop} -> /mandi/{crop}. */
export function movedPath(pathname: string): string | null {
  const amc = /^\/amcs\/([^/]+)\/?$/.exec(pathname);
  if (amc) {
    let name: string;
    try {
      name = decodeURIComponent(amc[1]!);
    } catch {
      return null;
    }
    const slug = amcSlug(name);
    return slug && slug !== amc[1] ? `/amcs/${slug}` : null;
  }
  const crop = /^\/mandi\/([^/]+)\/?$/.exec(pathname);
  if (crop && RENAMED_MANDI_CROPS[crop[1]!]) return `/mandi/${RENAMED_MANDI_CROPS[crop[1]!]}`;
  return null;
}

// ---- trade pages: /trade/products/{code}-{slug}, /trade/partners/{slug} ----------------------

/** Same rule as backend ingestion/trade_names.py `slugify` — change both together. */
export function slugify(text: string, maxLen = 60): string {
  let s = (text || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (s.length > maxLen) {
    const at = s.lastIndexOf("-", maxLen);
    s = at > 0 ? s.slice(0, at) : s.slice(0, maxLen);
  }
  return s;
}

export function partnerSlug(country: string): string {
  return slugify(country);
}

/** "1006-rice" / "10063010" -> the code; null when it isn't a heading or product code. */
export function productCode(param: string): string | null {
  const m = /^(\d{4}|\d{7,8})(?:-[a-z0-9-]*)?$/.exec(param);
  return m ? m[1]! : null;
}

/** Where an old explorer link (/trade?code=… or ?country=…) now lives. A code goes to
 *  /trade/products/{code}, which redirects to its slug (the Worker looks the slug up first). */
export function movedTradeLink(search: URLSearchParams): string | null {
  const code = (search.get("code") ?? "").trim();
  const c = /^(\d{4})\*?$/.exec(code) ?? /^(\d{7,8})$/.exec(code);
  if (c) return `/trade/products/${c[1]}`;
  const country = (search.get("country") ?? "").trim();
  if (country && !code) {
    const slug = partnerSlug(country);
    return slug && slug !== "all-countries" ? `/trade/partners/${slug}` : null;
  }
  return null;
}
