import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";

import { CommandSearch } from "./command-search";
import { Logo } from "@/components/site/logo";
import { getStatus } from "@/lib/bangladata/api.functions";
import { logout } from "@/lib/bangladata/auth.functions";
import { accountEmail } from "@/lib/bangladata/dashboard.functions";
import { EXPLORERS, MODULES } from "@/lib/bangladata/catalog";
import { cn } from "@/lib/utils";
import { SERIES_COUNT } from "@/lib/bangladata/counts";

const SESSION_KEY = "bangladatahub-session";

// Pages whose first panel is dark (`<Panel ground="ink">` at the top). The server render and the
// first client paint use this, so the bar never flashes dark-on-dark before hydration.
const DARK_TOP = new Set(["/status"]);

export function Nav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // The page actually on screen: `location` moves as soon as a navigation starts, while the old
  // page stays up until the new one's loader resolves.
  const shownPath = useRouterState({ select: (s) => (s.resolvedLocation ?? s.location).pathname });
  const [scrolled, setScrolled] = useState(false);
  const [overDark, setOverDark] = useState(() => DARK_TOP.has(pathname));
  const [openMenu, setOpenMenu] = useState<null | "data" | "dev">(null);
  const [search, setSearch] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const { data: status } = useQuery({
    queryKey: ["status"],
    queryFn: () => getStatus(),
    staleTime: 60_000,
  });

  // Gate the status dot on a post-mount flag so SSR and the first client render
  // always agree (both render the "fresh" default); the real freshness is applied
  // after hydration. Without this the dot's colour depends on whether the status
  // query is resolved, which differs server↔client → a hydration mismatch.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const stale = mounted && status ? status.modules.some((m) => m.state === "stale") : false;

  // Session awareness — reflect signed-in state in the bar. Read client-side
  // after mount (and on each navigation) to avoid SSR/hydration mismatch.
  const [email, setEmail] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  useEffect(() => {
    const t = typeof window !== "undefined" ? localStorage.getItem(SESSION_KEY) : null;
    if (!t) { setEmail(null); setAuthReady(true); return; }
    void accountEmail({ data: { token: t } }).then((r) => {
      if (r.ok && r.email) setEmail(r.email);
      else { setEmail(null); try { localStorage.removeItem(SESSION_KEY); } catch { /* */ } }
      setAuthReady(true);
    });
  }, [pathname]);

  async function signOut() {
    const t = typeof window !== "undefined" ? localStorage.getItem(SESSION_KEY) : null;
    if (t) { try { await logout({ data: { token: t } }); } catch { /* */ } }
    try { localStorage.removeItem(SESSION_KEY); } catch { /* */ }
    window.location.href = "/";
  }

  // Adapt the transparent nav to the panel beneath it: sample the element just
  // below the bar and read whether it sits on a `--ink` (dark) ground, so the
  // wordmark and links stay legible over dark hero panels (e.g. /status).
  const detectGround = useCallback(() => {
    if (typeof document === "undefined") return;
    const el = document.elementFromPoint(24, 72);
    const ground = el?.closest(".ground-ink, .ground-paper");
    setOverDark(ground?.classList.contains("ground-ink") ?? false);
  }, []);

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 12);
      detectGround();
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [detectGround]);

  // Re-sample after each navigation once the new page has painted (keyed on the page on screen,
  // not the pending one, or /status's dark ground sticks to the next, light page).
  useEffect(() => {
    setOverDark(DARK_TOP.has(shownPath));
    const t = setTimeout(detectGround, 60);
    return () => clearTimeout(t);
  }, [shownPath, detectGround]);

  // Close the mobile menu on navigation.
  useEffect(() => { setMobileOpen(false); }, [pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearch(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <RouteProgress />
      <header
        className={cn(
          "fixed inset-x-0 top-0 z-50 h-16 text-ink transition-colors",
          scrolled
            ? "ground-paper border-b border-rule bg-paper"
            : overDark
              ? "ground-ink bg-transparent"
              : "ground-paper bg-transparent",
        )}
      >
        <div className="mx-auto flex h-full max-w-[1160px] items-center justify-between gap-6 px-6 md:px-10">
          <Link to="/" onMouseLeave={() => setOpenMenu(null)}>
            <Logo />
          </Link>

          <nav className="hidden items-center gap-7 text-[14px] lg:flex">
            <div
              className="relative"
              onMouseEnter={() => setOpenMenu("data")}
              onMouseLeave={() => setOpenMenu(null)}
            >
              <button
                type="button"
                className="transition-colors hover:text-seal"
                aria-expanded={openMenu === "data"}
                onClick={() => setOpenMenu((v) => (v === "data" ? null : "data"))}
              >
                Data
              </button>
              {openMenu === "data" ? (
                <div className="ground-paper absolute left-1/2 top-full w-[760px] -translate-x-1/2 border border-rule bg-paper p-6 text-ink">
                  <div className="grid grid-cols-3 gap-x-8 gap-y-4">
                    {MODULES.map((m) =>
                      m.href ? (
                        <Link
                          key={m.slug}
                          to={m.href}
                          className="group block"
                          onClick={() => setOpenMenu(null)}
                        >
                          <span className="block text-[14px] transition-colors group-hover:text-seal">
                            {m.name}
                          </span>
                          <span className="num block text-[12px] text-ink-soft">{m.cadence}</span>
                        </Link>
                      ) : (
                        <Link
                          key={m.slug}
                          to="/data/$module"
                          params={{ module: m.slug }}
                          className="group block"
                          onClick={() => setOpenMenu(null)}
                        >
                          <span className="block text-[14px] transition-colors group-hover:text-seal">
                            {m.name}
                          </span>
                          <span className="num block text-[12px] text-ink-soft">{m.cadence}</span>
                        </Link>
                      ),
                    )}
                  </div>
                  <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 border-t border-rule pt-4 text-[13px]">
                    {EXPLORERS.map((x) => (
                      <Link key={x.href} to={x.href} onClick={() => setOpenMenu(null)} className="text-ink-soft hover:text-seal">
                        {x.label}
                      </Link>
                    ))}
                    <Link to="/derived" onClick={() => setOpenMenu(null)} className="text-ink-soft hover:text-seal">
                      Derived indicators
                    </Link>
                    <Link to="/topics" onClick={() => setOpenMenu(null)} className="text-ink-soft hover:text-seal">
                      Topic hubs
                    </Link>
                    <Link to="/coverage" onClick={() => setOpenMenu(null)} className="ml-auto text-seal hover:underline">
                      Browse all {SERIES_COUNT} series →
                    </Link>
                  </div>
                </div>
              ) : null}
            </div>

            <div
              className="relative"
              onMouseEnter={() => setOpenMenu("dev")}
              onMouseLeave={() => setOpenMenu(null)}
            >
              <button
                type="button"
                className="transition-colors hover:text-seal"
                aria-expanded={openMenu === "dev"}
                onClick={() => setOpenMenu((v) => (v === "dev" ? null : "dev"))}
              >
                Developers
              </button>
              {openMenu === "dev" ? (
                <div className="ground-paper absolute left-1/2 top-full w-[300px] -translate-x-1/2 border border-rule bg-paper p-5 text-ink">
                  <div className="grid gap-4">
                    {[
                      { to: "/docs", name: "Docs & API reference", blurb: "Endpoints, auth, parameters" },
                      { to: "/coverage", name: "Data catalog", blurb: "Every series and module" },
                      { to: "/status", name: "Status & freshness", blurb: "When each source last updated" },
                    ].map((d) => (
                      <Link key={d.to} to={d.to} onClick={() => setOpenMenu(null)} className="group block">
                        <span className="block text-[14px] transition-colors group-hover:text-seal">
                          {d.name}
                        </span>
                        <span className="block text-[12px] text-ink-soft">{d.blurb}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <Link to="/topics" className="transition-colors hover:text-seal">
              Topics
            </Link>
            <Link to="/pricing" className="transition-colors hover:text-seal">
              Pricing
            </Link>
            <Link to="/status" className="flex items-center gap-2 transition-colors hover:text-seal">
              Status
              <span
                className={cn(
                  "inline-block h-1.5 w-1.5 rounded-full",
                  stale ? "bg-flag" : "bg-gilt",
                )}
                aria-hidden="true"
              />
            </Link>
          </nav>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileOpen((v) => !v)}
              className="inline-flex h-9 w-9 items-center justify-center border border-rule text-[18px] leading-none text-ink transition-colors hover:border-seal lg:hidden"
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
              aria-expanded={mobileOpen}
            >
              {mobileOpen ? "✕" : "☰"}
            </button>
            <button
              type="button"
              onClick={() => setSearch(true)}
              className="hidden items-center gap-2 border border-rule px-3 py-1.5 text-[13px] text-ink-soft transition-colors hover:border-seal hover:text-ink sm:flex"
              aria-label="Search series"
            >
              <span>Search series</span>
              <span className="num text-[11px] opacity-60">⌘K</span>
            </button>
            {!authReady ? (
              <span className="h-9 w-24" aria-hidden="true" />
            ) : email ? (
              <>
                <button
                  onClick={signOut}
                  className="hidden text-[13px] text-ink-soft transition-colors hover:text-seal md:inline"
                >
                  Sign out
                </button>
                <Link
                  to="/dashboard"
                  title={email}
                  className="flex items-center gap-2 bg-seal px-3 py-1.5 text-[14px] text-seal-contrast transition-opacity hover:opacity-90"
                >
                  <span className="grid h-5 w-5 place-items-center rounded-full bg-white/25 text-[11px] font-medium uppercase">
                    {email.charAt(0)}
                  </span>
                  <span className="hidden max-w-[150px] truncate sm:inline">{email}</span>
                  <span className="sm:hidden">Dashboard</span>
                </Link>
              </>
            ) : (
              <>
                <Link
                  to="/login"
                  className="hidden text-[14px] transition-colors hover:text-seal md:inline"
                >
                  Log in
                </Link>
                <Link
                  to="/signup"
                  className="whitespace-nowrap bg-seal px-2.5 py-2 text-[13px] text-seal-contrast transition-opacity hover:opacity-90 sm:px-3.5 sm:text-[14px]"
                >
                  Get a free key
                </Link>
              </>
            )}
          </div>
        </div>
      </header>
      {/* Mobile / tablet menu (the desktop <nav> is lg:flex, so below 1024px this
          is the only way to reach Coverage/Tools/Docs/Pricing/Status/Data). */}
      {mobileOpen ? (
        <div
          className="ground-paper fixed inset-x-0 top-16 z-40 max-h-[calc(100vh-4rem)] overflow-y-auto border-b border-rule bg-paper text-ink lg:hidden"
          onClick={() => setMobileOpen(false)}
        >
          <nav className="mx-auto flex max-w-[1160px] flex-col px-6 py-3 text-[15px]">
            <button
              type="button"
              onClick={() => { setMobileOpen(false); setSearch(true); }}
              className="flex items-center justify-between border-b border-rule py-3 text-left text-ink-soft"
            >
              <span>Search series</span>
              <span className="num text-[12px] opacity-60">⌘K</span>
            </button>
            <Link to="/topics" className="border-b border-rule py-3">Topics</Link>
            <Link to="/pricing" className="border-b border-rule py-3">Pricing</Link>
            <Link to="/status" className="flex items-center gap-2 border-b border-rule py-3">
              Status
              <span
                className={cn("inline-block h-1.5 w-1.5 rounded-full", stale ? "bg-flag" : "bg-gilt")}
                aria-hidden="true"
              />
            </Link>
            <p className="eyebrow pt-4 pb-1">Developers</p>
            <Link to="/docs" className="border-b border-rule py-2 text-ink-soft">Docs &amp; API reference</Link>
            <Link to="/coverage" className="border-b border-rule py-2 text-ink-soft">Data catalog</Link>
            <Link to="/status" className="border-b border-rule py-2 text-ink-soft">Status &amp; freshness</Link>
            <p className="eyebrow pt-4 pb-1">Data</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              {MODULES.map((m) =>
                m.href ? (
                  <Link key={m.slug} to={m.href} className="py-1.5 text-[14px] text-ink-soft">
                    {m.name}
                  </Link>
                ) : (
                  <Link
                    key={m.slug}
                    to="/data/$module"
                    params={{ module: m.slug }}
                    className="py-1.5 text-[14px] text-ink-soft"
                  >
                    {m.name}
                  </Link>
                ),
              )}
            </div>
            <div className="flex flex-col pt-1 pb-3">
              {EXPLORERS.map((x) => (
                <Link key={x.href} to={x.href} className="py-1.5 text-[14px] text-ink-soft">
                  {x.label}
                </Link>
              ))}
              <Link to="/derived" className="py-1.5 text-[14px] text-ink-soft">Derived indicators</Link>
              <Link to="/coverage" className="py-1.5 text-[14px] text-seal">Browse all {SERIES_COUNT} series →</Link>
            </div>
            {email ? (
              <button onClick={signOut} className="border-t border-rule py-3 text-left text-ink-soft">
                Sign out
              </button>
            ) : (
              <Link to="/login" className="border-t border-rule py-3">Log in</Link>
            )}
          </nav>
        </div>
      ) : null}
      <CommandSearch open={search} onOpenChange={setSearch} />
    </>
  );
}

/** A thin bar across the top while the next page's data loads: a client-side navigation shows no
 *  browser spinner, so without it a slow click looks like nothing happened. Waits a moment so
 *  instant (preloaded) navigations don't flicker. */
function RouteProgress() {
  const pending = useRouterState({ select: (s) => s.status === "pending" });
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!pending) {
      setShow(false);
      return;
    }
    const t = setTimeout(() => setShow(true), 120);
    return () => clearTimeout(t);
  }, [pending]);
  return show ? <div className="route-progress" role="progressbar" aria-label="Loading page" /> : null;
}
