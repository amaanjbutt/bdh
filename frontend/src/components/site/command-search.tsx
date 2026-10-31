import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { getSearch } from "@/lib/bangladata/api.functions";
import { groupHits, type SearchHit } from "@/lib/bangladata/search";
import { cn } from "@/lib/utils";
import { SERIES_COUNT } from "@/lib/bangladata/counts";

const series = (id: string, module: string, title: string): SearchHit => ({
  kind: "series",
  id,
  module,
  title,
  subtitle: id,
  url: `/series/${id}`,
});

// Shown before the user types — a handful of the most-asked-for pages.
const POPULAR: SearchHit[] = [
  series("fx.rate.usd", "forex", "USD to BDT — daily reference rate"),
  series("rates.policy", "rates", "Bangladesh Bank policy repo rate"),
  series("rates.call_money", "rates", "Call-money rate"),
  series("inflation.cpi.national.yoy", "inflation", "CPI national, year on year"),
  { kind: "district", title: "Chattogram", subtitle: "District profile", url: "/districts/chattogram" },
  { kind: "district", title: "Dhaka", subtitle: "District profile", url: "/districts/dhaka" },
];

/**
 * The real navigation for the catalog, over GET /v1/search (server-ranked). The
 * query is debounced; before the user types we show a few popular series.
 */
export function CommandSearch({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [cursor, setCursor] = useState(0);
  const navigate = useNavigate();

  // Debounce so we don't fire a search on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 140);
    return () => clearTimeout(t);
  }, [query]);

  const { data: matches } = useQuery({
    queryKey: ["search", debounced],
    queryFn: () => getSearch({ data: { q: debounced } }),
    staleTime: 5 * 60 * 1000,
    enabled: open && debounced.length > 0,
  });

  const results = useMemo<SearchHit[]>(() => (!query.trim() ? POPULAR : (matches ?? [])), [query, matches]);
  const grouped = useMemo(() => groupHits(results), [results]);
  const flat = grouped.flatMap((g) => g.hits);

  useEffect(() => {
    setCursor(0);
  }, [query, open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setCursor((c) => Math.min(c + 1, flat.length - 1));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setCursor((c) => Math.max(c - 1, 0));
      }
      if (e.key === "Enter") {
        const pick = flat[cursor];
        if (pick) {
          onOpenChange(false);
          void navigate({ href: pick.url });
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, flat, cursor, navigate, onOpenChange]);

  if (!open) return null;

  return (
    <div
      className="ground-paper fixed inset-0 z-[60] bg-paper"
      role="dialog"
      aria-modal="true"
      aria-label="Search"
    >
      <div className="mx-auto flex h-full max-w-[860px] flex-col px-6 pt-10 md:pt-20">
        <div className="flex items-center gap-4 border-b border-rule pb-4">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${SERIES_COUNT} series, districts and topics…`}
            className="num w-full bg-transparent text-[20px] outline-none placeholder:text-ink-soft"
          />
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="num text-[12px] text-ink-soft transition-colors hover:text-ink"
          >
            ESC
          </button>
        </div>

        <div className="flex-1 overflow-auto py-6">
          {!query.trim() ? <p className="eyebrow mb-4">Popular</p> : null}
          {grouped.length === 0 ? (
            <p className="num text-[13px] text-ink-soft">Nothing matches that.</p>
          ) : null}
          {grouped.map((g) => (
            <div key={g.key} className="mb-6">
              <p className="eyebrow border-t border-rule pt-2">{g.label}</p>
              <ul className="mt-2">
                {g.hits.map((r) => {
                  const index = flat.indexOf(r);
                  return (
                    <li key={`${r.kind}:${r.url}`}>
                      <button
                        type="button"
                        onMouseEnter={() => setCursor(index)}
                        onClick={() => {
                          onOpenChange(false);
                          void navigate({ href: r.url });
                        }}
                        className={cn(
                          "flex w-full items-baseline justify-between gap-6 border-b border-rule/60 px-1 py-2 text-left",
                          index === cursor && "bg-seal-tint",
                        )}
                      >
                        <span className="text-[14px]">{r.title}</span>
                        <span className="num shrink-0 truncate text-[12px] text-ink-soft">
                          {r.kind === "series" ? r.id : r.subtitle}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>

        {query.trim() ? (
          <button
            type="button"
            onClick={() => {
              onOpenChange(false);
              void navigate({ to: "/coverage", search: { q: query.trim(), module: undefined } });
            }}
            className="num flex items-center justify-between border-t border-rule px-1 py-4 text-left text-[13px] text-ink-soft transition-colors hover:text-seal"
          >
            <span>
              See all results for <span className="text-ink">“{query.trim()}”</span>
            </span>
            <span aria-hidden>→</span>
          </button>
        ) : null}
      </div>
    </div>
  );
}
