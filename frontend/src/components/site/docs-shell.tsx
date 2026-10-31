import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";

import type { TocEntry } from "@/lib/bangladata/markdown";
import { cn } from "@/lib/utils";

export type DocNavGroup = { section: string; items: { slug: string; title: string }[] };

/** Grouped docs navigation with a client-side filter (titles only; cheap). */
export function DocsSidebar({ nav, current }: { nav: DocNavGroup[]; current?: string }) {
  const [q, setQ] = useState("");
  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return nav;
    return nav
      .map((g) => ({ ...g, items: g.items.filter((i) => i.title.toLowerCase().includes(needle) || i.slug.includes(needle)) }))
      .filter((g) => g.items.length);
  }, [nav, q]);

  return (
    <nav aria-label="Documentation" className="text-[14px]">
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Filter docs…"
        aria-label="Filter docs"
        className="mb-5 w-full border border-rule bg-paper px-3 py-2 font-mono text-[12px] outline-none placeholder:text-ink-soft focus:border-seal"
      />
      {groups.map((g) => (
        <div key={g.section} className="mb-6">
          <p className="eyebrow mb-2 text-ink-soft">{g.section}</p>
          <ul className="space-y-0.5 border-l border-rule">
            {g.items.map((i) => {
              const active = i.slug === current;
              return (
                <li key={i.slug}>
                  <Link
                    to="/docs/$slug"
                    params={{ slug: i.slug }}
                    className={cn(
                      "-ml-px block border-l py-1 pl-3 transition-colors",
                      active ? "border-seal text-seal" : "border-transparent text-ink-soft hover:text-ink",
                    )}
                    aria-current={active ? "page" : undefined}
                  >
                    {i.title}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      {groups.length === 0 ? <p className="text-ink-soft">No page matches “{q}”.</p> : null}
    </nav>
  );
}

/** "On this page" with the section currently in view highlighted. */
export function DocsToc({ toc }: { toc: TocEntry[] }) {
  const [active, setActive] = useState<string | null>(toc[0]?.id ?? null);
  useEffect(() => {
    if (!toc.length || typeof IntersectionObserver === "undefined") return;
    const els = toc.map((t) => document.getElementById(t.id)).filter(Boolean) as HTMLElement[];
    const obs = new IntersectionObserver(
      (entries) => {
        const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (vis[0]) setActive(vis[0].target.id);
      },
      { rootMargin: "-80px 0px -70% 0px" },
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [toc]);
  if (toc.length < 2) return null;
  return (
    <nav aria-label="On this page" className="text-[13px]">
      <p className="eyebrow mb-3 text-ink-soft">On this page</p>
      <ul className="space-y-1.5">
        {toc.map((t) => (
          <li key={t.id} className={t.depth === 3 ? "pl-3" : undefined}>
            <a
              href={`#${t.id}`}
              className={cn("block leading-snug transition-colors", active === t.id ? "text-seal" : "text-ink-soft hover:text-ink")}
            >
              {t.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Adds a "Copy" button to every <pre> inside the rendered markdown (after hydration). */
export function useCodeCopy(ref: RefObject<HTMLElement | null>, key: string) {
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const buttons: HTMLButtonElement[] = [];
    root.querySelectorAll("pre").forEach((pre) => {
      if (pre.querySelector(".code-copy")) return;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "code-copy";
      btn.textContent = "Copy";
      btn.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(pre.querySelector("code")?.textContent ?? pre.textContent ?? "");
          btn.textContent = "Copied";
          setTimeout(() => (btn.textContent = "Copy"), 1500);
        } catch {
          btn.textContent = "Press Ctrl+C";
        }
      });
      pre.appendChild(btn);
      buttons.push(btn);
    });
    return () => buttons.forEach((b) => b.remove());
  }, [ref, key]);
}

/** Copies the page's raw Markdown twin (/docs/<slug>.md) — handy for pasting into an LLM. */
export function CopyMarkdownButton({ href }: { href: string }) {
  const [label, setLabel] = useState("Copy page as Markdown");
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          const text = await (await fetch(href)).text();
          await navigator.clipboard.writeText(text);
          setLabel("Copied");
        } catch {
          setLabel("Couldn’t copy — open the .md");
        }
        setTimeout(() => setLabel("Copy page as Markdown"), 1800);
      }}
      className="border border-rule px-3 py-1.5 font-mono text-[12px] text-ink-soft transition-colors hover:border-seal hover:text-seal"
    >
      {label}
    </button>
  );
}

/** Mobile/tablet: the sidebar collapses into a disclosure above the article. */
export function MobileDocsMenu({ children, label }: { children: ReactNode; label: string }) {
  const ref = useRef<HTMLDetailsElement>(null);
  return (
    <details ref={ref} className="mb-8 border border-rule lg:hidden">
      <summary className="cursor-pointer px-4 py-3 font-mono text-[12px] uppercase tracking-[0.1em] text-ink-soft">
        {label}
      </summary>
      <div className="border-t border-rule px-4 py-4">{children}</div>
    </details>
  );
}
