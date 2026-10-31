import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { type ReactNode } from "react";

import appCss from "../styles.css?url";
import { Nav } from "@/components/site/nav";
import { Footer } from "@/components/site/footer";
import { SERIES_COUNT } from "@/lib/bangladata/counts";

function NotFoundComponent() {
  return (
    <main className="ground-paper flex min-h-screen items-center bg-paper px-6">
      <div className="mx-auto w-full max-w-[720px] py-32">
        <p className="eyebrow">404</p>
        <h1 className="mt-4 font-display text-[44px] leading-tight text-ink md:text-[64px]">Page not found</h1>
        <p className="mt-4 max-w-[52ch] text-[17px] text-ink-soft">
          That page doesn't exist or has moved. Search the catalog, or start from one of these.
        </p>
        <div className="mt-8 flex flex-wrap gap-2">
          {[
            ["/coverage", "Search the catalog"],
            ["/market", "DSE market"],
            ["/districts", "District profiles"],
            ["/topics", "Topic hubs"],
            ["/docs", "Docs"],
          ].map(([href, label]) => (
            <a
              key={href}
              href={href}
              className="border border-rule px-3 py-1.5 text-[14px] text-ink transition-colors hover:border-seal hover:text-seal"
            >
              {label}
            </a>
          ))}
        </div>
        <Link to="/" className="mt-10 inline-block bg-seal px-4 py-2 text-[14px] text-seal-contrast hover:opacity-90">
          Go to the homepage
        </Link>
      </div>
    </main>
  );
}

function ErrorComponent({ error, reset }: { error: unknown; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  return (
    <main className="ground-paper flex min-h-screen items-center bg-paper px-6">
      <div className="mx-auto w-full max-w-[720px] py-32">
        <p className="eyebrow">Error</p>
        <h1 className="mt-4 font-display text-[40px] leading-tight text-ink md:text-[56px]">This page didn't load</h1>
        <p className="mt-4 max-w-[52ch] text-[17px] text-ink-soft">
          Something went wrong on our side. Try again in a moment, or go back to the homepage.
        </p>
        <div className="mt-8 flex flex-wrap gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="bg-seal px-4 py-2 text-[14px] text-seal-contrast hover:opacity-90"
          >
            Try again
          </button>
          <a href="/" className="border border-rule px-4 py-2 text-[14px] text-ink hover:border-seal hover:text-seal">
            Homepage
          </a>
        </div>
      </div>
    </main>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "BanglaDataHub — Bangladesh's economic data, in one API" },
      {
        name: "description",
        content:
          "Official Bangladeshi economic data — exchange rates from 1972, inflation, interest rates, money, trade, remittances, digital payments, DSE market data and Census 2022 districts — through one self-serve REST API.",
      },
      { name: "author", content: "BanglaDataHub" },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "BanglaDataHub" },
      { property: "og:image", content: "https://bangladatahub.com/og-image.png" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: "https://bangladatahub.com/og-image.png" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&family=Instrument+Sans:wght@400;500;600&display=swap",
      },
      { rel: "icon", href: "/favicon.ico", sizes: "any" },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "Organization",
              "@id": "https://bangladatahub.com/#org",
              name: "BanglaDataHub",
              alternateName: "Bangladesh Data Hub",
              url: "https://bangladatahub.com",
              logo: "https://bangladatahub.com/icon-512.png",
              description:
                `A self-serve REST API for Bangladeshi financial and economic data — ${SERIES_COUNT} official time series from Bangladesh Bank, the Bangladesh Bureau of Statistics, NBR, the Export Promotion Bureau and the Dhaka Stock Exchange, served as JSON or CSV.`,
              areaServed: { "@type": "Country", name: "Bangladesh" },
              knowsAbout: [
                "Bangladesh economy",
                "Bangladesh exchange rates",
                "Bangladesh inflation (CPI)",
                "Bangladesh interest rates",
                "Bangladesh money supply",
                "Bangladesh balance of payments",
                "Bangladesh remittances",
                "Bangladesh digital payments",
                "Bangladesh macroeconomics",
                "Bangladesh trade",
                "Dhaka Stock Exchange",
                "Bangladesh district and census data",
              ],
            },
            {
              "@type": "WebSite",
              "@id": "https://bangladatahub.com/#website",
              name: "BanglaDataHub",
              url: "https://bangladatahub.com",
              description:
                `One API for Bangladesh's entire economy — ${SERIES_COUNT} official series from 1972 to today.`,
              inLanguage: "en",
              publisher: { "@id": "https://bangladatahub.com/#org" },
              potentialAction: {
                "@type": "SearchAction",
                target: {
                  "@type": "EntryPoint",
                  urlTemplate: "https://bangladatahub.com/coverage?q={search_term_string}",
                },
                "query-input": "required name=search_term_string",
              },
            },
            {
              "@type": "SoftwareApplication",
              "@id": "https://bangladatahub.com/#api",
              name: "BanglaDataHub API",
              applicationCategory: "DeveloperApplication",
              operatingSystem: "Any (REST API)",
              url: "https://bangladatahub.com",
              publisher: { "@id": "https://bangladatahub.com/#org" },
              description:
                `REST API for ${SERIES_COUNT} official Bangladeshi economic and financial time series — exchange rates, inflation, interest rates, money and credit, external trade, remittances, fiscal receipts, digital payments, DSE market data and district statistics — as JSON or CSV.`,
              featureList: [
                `${SERIES_COUNT} official Bangladeshi economic time series`,
                "Exchange rates and macro history from 1972",
                "JSON and CSV output",
                "Server-side transforms: YoY, MoM, % change, index, moving average",
                "Revision vintages (point-in-time data)",
                "Webhooks on series updates",
                "DSE market explorer with 600+ listed instruments",
                "Census 2022 profiles for all 64 districts",
                "Site-wide search across series, districts and topics",
              ],
              offers: [
                { "@type": "Offer", name: "Free", price: "0", priceCurrency: "USD" },
                { "@type": "Offer", name: "Developer", price: "19", priceCurrency: "USD" },
                { "@type": "Offer", name: "Pro", price: "49", priceCurrency: "USD" },
                { "@type": "Offer", name: "Business", price: "199", priceCurrency: "USD" },
              ],
            },
          ],
        }),
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <Nav />
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
      <Footer />
    </QueryClientProvider>
  );
}

