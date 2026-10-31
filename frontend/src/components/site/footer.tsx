import { Link } from "@tanstack/react-router";

import { EXPLORERS, MODULES } from "@/lib/bangladata/catalog";
import { TOPICS } from "@/lib/bangladata/topics";

export function Footer() {
  return (
    <footer className="ground-paper border-t border-rule bg-paper text-ink">
      <div className="mx-auto grid max-w-[1160px] gap-10 px-6 py-14 md:grid-cols-4 md:px-10">
        <div>
          <p className="eyebrow border-t border-rule pt-3">Data</p>
          <ul className="mt-3 space-y-1.5 text-[14px]">
            {MODULES.filter((m) => m.slug !== "social" && m.slug !== "regional").map((m) => (
              <li key={m.slug}>
                {m.href ? (
                  <Link to={m.href} className="text-ink-soft transition-colors hover:text-seal">
                    {m.name}
                  </Link>
                ) : (
                  <Link
                    to="/data/$module"
                    params={{ module: m.slug }}
                    className="text-ink-soft transition-colors hover:text-seal"
                  >
                    {m.name}
                  </Link>
                )}
              </li>
            ))}
            {EXPLORERS.map((x) => (
              <li key={x.href}>
                <Link to={x.href} className="text-ink-soft transition-colors hover:text-seal">
                  {x.label}
                </Link>
              </li>
            ))}
            <li>
              <Link to="/derived" className="text-ink-soft transition-colors hover:text-seal">
                Derived indicators
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <p className="eyebrow border-t border-rule pt-3">Topics</p>
          <ul className="mt-3 space-y-1.5 text-[14px]">
            {TOPICS.map((t) => (
              <li key={t.slug}>
                <Link
                  to="/topics/$topic"
                  params={{ topic: t.slug }}
                  className="text-ink-soft transition-colors hover:text-seal"
                >
                  {t.h1}
                </Link>
              </li>
            ))}
            <li>
              <Link to="/topics" className="text-ink-soft transition-colors hover:text-seal">
                All topics
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <p className="eyebrow border-t border-rule pt-3">Developers</p>
          <ul className="mt-3 space-y-1.5 text-[14px] text-ink-soft">
            <li>
              <Link to="/docs" className="transition-colors hover:text-seal">
                Docs &amp; API reference
              </Link>
            </li>
            <li>
              <Link to="/coverage" className="transition-colors hover:text-seal">
                Browse all series
              </Link>
            </li>
            <li>
              <Link to="/topics" className="transition-colors hover:text-seal">
                Topic hubs
              </Link>
            </li>
            <li>
              <Link to="/status" className="transition-colors hover:text-seal">
                Status
              </Link>
            </li>
            <li>
              <Link to="/pricing" className="transition-colors hover:text-seal">
                Pricing
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <p className="eyebrow border-t border-rule pt-3">Company</p>
          <ul className="mt-3 space-y-1.5 text-[14px] text-ink-soft">
            <li>
              <Link to="/about" className="transition-colors hover:text-seal">
                About
              </Link>
            </li>
            <li>
              <Link to="/calendar" className="transition-colors hover:text-seal">
                Release calendar
              </Link>
            </li>
            <li>
              <Link to="/changelog" className="transition-colors hover:text-seal">
                Changelog
              </Link>
            </li>
            <li>
              <a href="mailto:hello@bangladatahub.com" className="transition-colors hover:text-seal">
                Contact
              </a>
            </li>
            <li>
              <Link to="/terms" className="transition-colors hover:text-seal">
                Terms
              </Link>
            </li>
            <li>
              <Link to="/privacy" className="transition-colors hover:text-seal">
                Privacy
              </Link>
            </li>
            <li>
              <Link to="/refund" className="transition-colors hover:text-seal">
                Refunds
              </Link>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-rule">
        <div className="mx-auto flex max-w-[1160px] flex-wrap items-center justify-between gap-3 px-6 py-5 text-[12px] text-ink-soft md:px-10">
          <p>All of Bangladesh's economy, in one API — from 1972 to this week.</p>
          <p className="num">BanglaDataHub · bangladatahub.com</p>
        </div>
      </div>
    </footer>
  );
}
