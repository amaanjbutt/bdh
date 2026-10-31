import sheetsScript from "../../../public/integrations/BanglaDataHub.gs?raw";
import counts from "./live-counts.json";

/**
 * The ONE set of headline counts used across the site (2026-10-04). The copy had
 * drifted — 16,579 / 22,900 / 23,000+ series and 540 / 590 / 600 funds on different
 * pages — which is exactly what a buyer of "clean, consistent data" notices.
 *
 * live-counts.json is regenerated from the API's /v1/status `totals` on every build
 * (scripts/build-llms.mjs). Pages that already fetch /v1/status at runtime use the
 * live figure; everything static (meta tags, nav, prose) uses this snapshot.
 */
export const LIVE_COUNTS = counts as {
  series: number;
  funds: number;
  amcs: number;
  securities: number;
  observations: number;
  modules?: Record<string, number>;
  generated_at: string;
};

const fmt = (n: number) => Number(n).toLocaleString("en-US");

/** "16,906" — active series. */
export const SERIES_COUNT = fmt(LIVE_COUNTS.series);
/** Funds that reported a NAV in the last 30 days (live count). */
export const FUND_COUNT = fmt(LIVE_COUNTS.funds);
export const AMC_COUNT = fmt(LIVE_COUNTS.amcs);
export const SECURITY_COUNT = fmt(LIVE_COUNTS.securities);

/** Fill {{SERIES_COUNT}}-style tokens in markdown content (docs, blog). The build
 *  script does the same for the generated .md / llms files. */
export function fillCounts(s: string): string {
  return s
    .replaceAll("{{SHEETS_SCRIPT}}", sheetsScript.trimEnd())
    .replaceAll("{{SERIES_COUNT}}", SERIES_COUNT)
    .replaceAll("{{FUND_COUNT}}", FUND_COUNT)
    .replaceAll("{{AMC_COUNT}}", AMC_COUNT)
    .replaceAll("{{SECURITY_COUNT}}", SECURITY_COUNT)
    .replace(/\{\{MODULE_COUNT:([a-z-]+)\}\}/g, (_, m: string) =>
      LIVE_COUNTS.modules?.[m] != null ? fmt(LIVE_COUNTS.modules[m]) : "many");
}
