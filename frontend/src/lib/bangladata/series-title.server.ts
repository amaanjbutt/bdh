import { shortTitle } from "./series-title";
import { SERIES_TITLE_DEDUPE } from "./series-title-dedupe";
import { SERIES_TITLES } from "./series-titles";

/** A series' title core: hand-written → deduplicated → shortened (see series-title.ts).
 *  Server-only so the two maps never ship to the browser. */
export function resolveSeriesTitle(r: { id: string; name: string }): string {
  return SERIES_TITLES[r.id] ?? SERIES_TITLE_DEDUPE[r.id] ?? shortTitle(r.name || r.id);
}
