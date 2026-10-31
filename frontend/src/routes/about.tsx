import { Link, createFileRoute } from "@tanstack/react-router";

import { Eyebrow, Panel, PanelHeadline, PanelInner } from "@/components/site/panel";
import { SERIES_COUNT } from "@/lib/bangladata/counts";

const TITLE = "About BanglaDataHub — the API for Bangladesh's economic data";
const DESCRIPTION =
  "BanglaDataHub is a self-serve REST API for Bangladesh's official economic data — exchange rates, inflation, interest rates, money, trade, remittances, digital payments, DSE market data and Census 2022 districts, from 1972 to today.";

const COVERAGE: { area: string; detail: string }[] = [
  {
    area: "Macroeconomy",
    detail:
      "GDP at current and constant prices, growth and per-capita income; national, food and non-food CPI with point-to-point and 12-month-average inflation; money supply (M1/M2), currency outside banks and private-sector credit; foreign-exchange reserves and workers' remittances.",
  },
  {
    area: "Exchange rates",
    detail:
      "The daily Bangladesh Bank USD/BDT reference rate and major crosses (EUR, GBP, JPY, CNY, INR, SGD, CAD, AUD), plus the annual USD/BDT history from 1972 to 2024.",
  },
  {
    area: "Interest rates & yields",
    detail:
      "Policy repo, Standing Lending Facility and Standing Deposit Facility rates; the bank rate and weighted-average call-money rate; scheduled-bank deposit and lending rates and the spread; T-bill and T-bond cut-off yields from Bangladesh Bank auctions.",
  },
  {
    area: "Trade & external",
    detail:
      "Monthly exports, imports, the goods and services trade balance, reserves and remittances from Bangladesh Bank, plus product-level export receipts from the Export Promotion Bureau.",
  },
  {
    area: "Public finance",
    detail:
      "NBR tax revenue: customs duty, VAT (domestic and import), income tax, supplementary duty, excise and other receipts.",
  },
  {
    area: "Real economy",
    detail:
      "Crop area and production for rice, wheat, jute, pulses, oilseeds, tea, sugarcane, cotton and tobacco; industrial production for chemicals, fertiliser, textiles, steel, food, glass, matches and cigarettes.",
  },
  {
    area: "Digital payments",
    detail:
      "MFS accounts and transactions, payment cards, internet and mobile banking, QR payments and agent-banking activity from Bangladesh Bank's monthly payment-system tables.",
  },
  {
    area: "Capital markets",
    detail:
      "DSEX, DS30 and DSES indices, turnover, volume, trades and market capitalisation, plus daily prices for 600+ instruments listed on the Dhaka Stock Exchange.",
  },
  {
    area: "Districts",
    detail:
      "Population and Housing Census 2022 for all 64 districts: population, households, sex ratio, age structure, education, work, housing, drinking water, sanitation, cooking fuel, religion, ethnicity and connectivity.",
  },
  {
    area: "Commodity & retail prices",
    detail:
      "International gold, Brent and Dubai crude benchmarks, and Bangladesh Bank's monthly retail price table for rice, wheat, pulses, sugar, tea, hides, skins and gold.",
  },
  {
    area: "Revision history (vintages)",
    detail:
      "First prints and dated revisions are recorded automatically in `observation_revisions`, so any figure can be reproduced as it was first published.",
  },
  {
    area: "Derived indicators",
    detail:
      "Clearly labelled series BanglaDataHub computes from official inputs with a published formula: the real call-money rate, real M2 growth, 12-month remittance growth and BDT depreciation.",
  },
];

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "AboutPage",
          name: "About BanglaDataHub",
          description: DESCRIPTION,
          url: "https://bangladatahub.com/about",
          about: {
            "@type": "Organization",
            name: "BanglaDataHub",
            url: "https://bangladatahub.com",
            description:
              "A self-serve REST API for Bangladesh's official financial and economic data, covering " +
              COVERAGE.map((c) => c.area).join(", ") +
              " — sourced from Bangladesh Bank, the Bangladesh Bureau of Statistics, NBR, EPB and the Dhaka Stock Exchange.",
            areaServed: "Bangladesh",
            knowsAbout: COVERAGE.map((c) => c.area),
          },
        }),
      },
    ],
  }),
  component: About,
});

function About() {
  return (
    <main>
      <Panel ground="paper" full={false} className="pt-32 pb-12">
        <PanelInner>
          <Eyebrow>About</Eyebrow>
          <PanelHeadline className="mt-6">All of Bangladesh's economy, in one API.</PanelHeadline>
          <div className="doc-prose mt-8 max-w-[68ch] text-[17px]">
            <p>
              BanglaDataHub is a single source for Bangladesh's official financial and economic data. The
              numbers exist — but they are scattered across government sites, buried in PDFs and
              spreadsheets, and inconsistent from one release to the next. We collect them, validate them
              against the publisher's own totals, normalise units, dates and identifiers, and serve them
              from our own database through one fast REST API.
            </p>
            <p>
              The result is a <strong>clean, documented, developer-first</strong> view of the economy —{" "}
              <strong>{SERIES_COUNT} official series</strong>, with public pricing and a free tier to
              start. Sign up and make your first call in minutes. No sales calls, no "contact us".
            </p>
          </div>
        </PanelInner>
      </Panel>

      <Panel ground="ink" full={false} className="py-14">
        <PanelInner>
          <Eyebrow>What's inside</Eyebrow>
          <h2 className="mt-4 max-w-[52ch] font-display text-[26px] text-ink">
            One API key unlocks the country's numbers.
          </h2>
          <div className="mt-8 grid gap-x-10 gap-y-7 md:grid-cols-2">
            {COVERAGE.map((c) => (
              <div key={c.area}>
                <h3 className="text-[16px] font-medium text-ink">{c.area}</h3>
                <p className="mt-2 text-[14px] leading-relaxed text-ink-soft">{c.detail}</p>
              </div>
            ))}
          </div>
          <p className="mt-10 text-[14px] text-ink-soft">
            Explore every dataset in the{" "}
            <Link to="/coverage" className="text-seal hover:underline">
              full catalog
            </Link>
            , or see live freshness on the{" "}
            <Link to="/status" className="text-seal hover:underline">
              status page
            </Link>
            .
          </p>
        </PanelInner>
      </Panel>

      <Panel ground="paper" full={false} className="py-14">
        <PanelInner>
          <div className="grid gap-12 md:grid-cols-3">
            <div>
              <Eyebrow>Where it comes from</Eyebrow>
              <p className="mt-4 text-[15px] leading-relaxed text-ink-soft">
                Every number traces to an official public release — Bangladesh Bank, the Bangladesh
                Bureau of Statistics, NBR, the Export Promotion Bureau and the Dhaka Stock Exchange —
                dated and sourced, so your analysis is reproducible and citable.
              </p>
            </div>
            <div>
              <Eyebrow>Always current</Eyebrow>
              <p className="mt-4 text-[15px] leading-relaxed text-ink-soft">
                Each source is checked as soon as its publisher releases new figures — daily, monthly,
                quarterly or annually — and every figure is validated before it goes live. The status
                page shows when each dataset last updated.
              </p>
            </div>
            <div>
              <Eyebrow>Who it's for</Eyebrow>
              <p className="mt-4 text-[15px] leading-relaxed text-ink-soft">
                Fintech, lending, remittance and wallet teams pricing risk; researchers, economists and
                journalists tracing macro history; hedge funds and macro desks hunting signals; BI teams
                and universities pulling reproducible datasets; and students on the free tier.
              </p>
            </div>
          </div>
          <div className="mt-12 border-t border-rule pt-8">
            <p className="max-w-[60ch] text-[16px] text-ink-soft">
              BanglaDataHub focuses on official macro and market data. For company fundamentals and
              filings beyond the DSE feed, use the exchange's own disclosure portal.
            </p>
            <div className="mt-6 flex flex-wrap gap-3 text-[14px]">
              <Link to="/signup" className="bg-seal px-4 py-2.5 text-seal-contrast hover:opacity-90">
                Get a free API key
              </Link>
              <Link to="/docs" className="border border-rule px-4 py-2.5 hover:border-seal">
                Read the docs
              </Link>
              <Link to="/coverage" className="border border-rule px-4 py-2.5 hover:border-seal">
                Browse the catalog
              </Link>
            </div>
          </div>
        </PanelInner>
      </Panel>
    </main>
  );
}
