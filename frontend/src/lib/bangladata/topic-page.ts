import { fmtValue, periodLabel, unitLabel } from "./format";
import { fillFaq, type LiveFigure, type Topic, type TopicFaq } from "./topics";
import type { Frequency } from "./types";

/**
 * Formatting for the topic hubs, shared by routes/topics.$topic.tsx and bot-render.ts so
 * people and crawlers read the same figures and FAQ answers.
 */

const scaled = (unit: string) => /_(th|mn|bn|tn)$/.test(unit);

/** A figure inside a sentence: money with its currency ("US$ 131.21 bn", "Tk 5.20 tn"), anything
 *  else as the bare number (the FAQ text supplies "%", "Rs" or "months"). */
export function sentenceValue(f: LiveFigure): string {
  const v = fmtValue(f.value, f.unit);
  if (!scaled(f.unit)) return v;
  return f.unit.startsWith("usd") ? `US$ ${v}` : f.unit.startsWith("bdt") ? `Tk ${v}` : v;
}

export function figurePeriod(f: LiveFigure): string {
  return periodLabel(f.date, f.frequency as Frequency);
}

/** A headline card: the value and its unit label, as on the series pages. */
export function cardFigure(f: LiveFigure): { value: string; unit: string } {
  return { value: fmtValue(f.value, f.unit), unit: unitLabel(f.unit) };
}

/** A series title as a hub link or figure label: the hub is all Bangladesh and shows units on the
 *  figure, so "Bangladesh public external debt (US$ mn) — quarterly" reads "Public external debt —
 *  quarterly". */
export function hubLabel(title: string): string {
  const s = title
    .replace(/\s*\((?:US\$|Rs) [^)]*\)/g, "")
    .replace(/^Bangladesh (?!'s)/, "")
    .replace(/\s+/g, " ")
    .trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** The topic's FAQ with its {{value:…}} / {{period:…}} tokens filled from live figures. */
export function topicFaq(t: Topic, live: Record<string, LiveFigure | null>): TopicFaq[] {
  const figures = live as Record<string, LiveFigure | undefined>;
  return t.faq.map((f) => ({ ...f, a: fillFaq(f.a, figures) }));
}
