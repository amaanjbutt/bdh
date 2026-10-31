# Product

**BanglaDataHub** is a self-serve REST API and website for Bangladesh's official
economic, financial and market data. It turns the PDFs, Excel workbooks and HTML tables
published by Bangladesh Bank, BBS, NBR, EPB and DSE into one consistent, documented time-series
database with JSON/CSV delivery, revision history and a free tier.

- Website: **https://bangladatahub.com**
- API: **https://api.bangladatahub.com**
- Repo: **https://github.com/amaanjbutt/bdh**

## Who it is for

- **Fintech, banks and remittance companies** — FX, policy rates, money supply, reserves and
  digital-payment volumes for pricing, treasury and risk models.
- **Asset managers, brokers and research desks** — DSE indices, turnover, market
  capitalisation and daily instrument prices alongside the macro backdrop.
- **Economists, journalists and students** — a citable, reproducible macro history from 1972
  without scraping eight government sites.
- **Developers and BI teams** — one API key, JSON/CSV, server-side transforms, webhooks and a
  documented schema.

## Coverage

| Module | What it contains | Source | Depth |
|---|---|---|---|
| `forex` | Daily USD/BDT reference rate and major crosses; annual USD/BDT history | Bangladesh Bank | 1972 → |
| `inflation` | National, food and non-food CPI; YoY, 12-month average, index | BBS | 1973 → |
| `rates` | Policy repo, SLF/SDF, bank rate, call money, deposit/lending, T-bill and T-bond cut-offs | Bangladesh Bank | 2000s → |
| `monetary` | M1, M2, currency outside banks, reserve money, private credit | Bangladesh Bank | 2009 → |
| `external` | Exports, imports, trade balance, reserves, remittances, EPB product receipts | BB · EPB | 1972 → |
| `fiscal` | NBR tax receipts: customs, VAT, income tax, supplementary duty, excise | NBR · BB | 2010 → |
| `real` | GDP current/constant, growth, per-capita income, crop area and production | BBS · BB | 1972 → |
| `industry` | Monthly production of chemicals, fertiliser, textiles, steel, food, glass, matches, cigarettes | Bangladesh Bank | 2010 → |
| `payments` | MFS accounts and transactions, cards, internet/mobile banking, QR, agent banking | Bangladesh Bank | 2020 → |
| `market` | DSEX, DS30, DSES, turnover, volume, trades, market cap, 600+ instrument prices | DSE | 2025 → |
| `commodities` | Gold, Brent, Dubai crude and Bangladesh Bank's retail price table | Bangladesh Bank | 2002 → |
| `agri` | Rice, wheat, jute, pulses, oilseeds, tea, sugarcane, cotton and tobacco area/production | Bangladesh Bank | 1990s → |
| `social` | Population, labour, wage and social indicators from the BB workbook | Bangladesh Bank | 1973 → |
| `regional` | Census 2022 population, households, age, education, work, housing, water, sanitation, fuel, religion, connectivity for all 64 districts | BBS | 2022 |
| derived | Real call-money rate, real M2 growth, remittance growth, BDT depreciation | BanglaDataHub | computed |

Every series has a stable readable id, unit, frequency, source URL and last-updated date.
Raw files are archived before parsing; revisions are recorded in `observation_revisions`
and available through `?vintage=`.

## What makes it different

1. **Official, traceable sources.** Every point links to the publisher and the archived raw
   file. No social-media or unofficial estimates.
2. **One schema.** Different publishers' units, date conventions and table layouts are
   normalised into `series` + `observations` with a documented unit and frequency.
3. **Revision history.** Restatements are preserved as vintages instead of silently
   overwriting the old number.
4. **District granularity.** Census 2022 is published as one observation per indicator per
   district, not a PDF table.
5. **Developer surface.** JSON/CSV, server-side transforms, OpenAPI docs, webhooks and a
   status page that shows source freshness.

## Plans

| Plan | Price | Requests/day | History | Notes |
|---|---|---|---|---|
| Free | $0 | 500 | 1 year | evaluation, students, journalists |
| Developer | $19/mo | 10,000 | 10 years | one analyst or developer |
| Pro | $49/mo | 100,000 | full, to 1972 | risk, treasury and research teams; vintages |
| Business | $199/mo | 500,000 | full, to 1972 | display rights, SLA, unlimited webhooks |

## Non-goals

- Company fundamentals beyond the DSE feed.
- Forecasts or model outputs presented as official data.
- Redistribution of publisher content outside the API's terms.
