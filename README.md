# BanglaDataHub

Self-serve REST API and website for **Bangladesh's official economic, financial and market
data** — macro, forex, inflation, interest rates, money and credit, external trade,
remittances and reserves, digital payments, Census 2022 districts, EPB export receipts and
the Dhaka Stock Exchange. Collected from Bangladesh Bank, BBS, NBR, EPB, DSE and other
official publishers, validated, and served from our own Postgres.

- Website: **https://bangladatahub.com** (docs: `/docs`, status: `/status`)
- API: **https://api.bangladatahub.com** — e.g.
  `curl -H "X-API-Key: <key>" https://api.bangladatahub.com/v1/series/inflation.cpi.national.yoy/latest`

## Repository

```
backend/     FastAPI API, ingestion framework + jobs, Postgres schema, operator scripts, tests
frontend/    the website — TanStack Start (SSR) on Cloudflare Workers, markdown docs/blog CMS
ops/         deploy, Caddy, Cloudflare Relay/R2, ingestion workflows, SEO scripts
docs/        internal docs: architecture, ingestion, operations, data quality, rules, decisions
.github/     CI only (tests, lint, typecheck, build, secret scan)
```

**AI agents and new contributors: read [`AGENTS.md`](./AGENTS.md) first.**

## Quick start (local)

```bash
cp .env.example .env
docker compose up -d db redis api
docker compose exec api python -m db.init
docker compose exec api python -m app.admin create-user you@example.com --plan pro
docker compose exec api python -m app.admin create-key <user_id> --label laptop
curl "http://localhost:8000/v1/catalog?module=inflation"
```

Seed the core datasets (each job is idempotent):

```bash
docker compose exec api python -m ingestion.run bb_web --force
docker compose exec api python -m ingestion.run bb_workbook --force
docker compose exec api python -m ingestion.run bbs_cpi --force
docker compose exec api python -m ingestion.run bb_payments --force
docker compose exec api python -m ingestion.run dse_market --force
docker compose exec api python -m ingestion.run bbs_gdp --force
docker compose exec api python -m ingestion.run bbs_census --force
docker compose exec api python -m ingestion.run epb_exports --force
docker compose exec api python -m ingestion.run derive_indicators --force
```

Frontend:

```bash
cd frontend && npm ci && npm run dev      # http://localhost:8080
```

Tests:

```bash
docker compose run --rm --no-deps -v "$PWD/backend:/app" api python -m pytest -q
cd frontend && npm run lint && npm run typecheck && npm run build
```

## Data coverage

| Module | Examples | Source |
|---|---|---|
| `forex` | USD/BDT daily reference, crosses, 1972–2024 annual | Bangladesh Bank |
| `inflation` | National/food/non-food CPI, YoY, 12-month average, long history | BBS |
| `rates` | Policy, call money, bank deposit/lending, T-bill/T-bond yields | Bangladesh Bank |
| `monetary` | M1, M2, currency, credit, monetary survey | Bangladesh Bank |
| `external` | Exports, imports, trade balance, reserves, remittances, product receipts | BB · EPB |
| `fiscal` | NBR tax receipts | NBR |
| `real` | GDP current/constant, growth, per capita | BBS |
| `industry` | Monthly production of chemicals, fertiliser, textiles, steel, food, glass, matches, cigarettes | Bangladesh Bank |
| `payments` | MFS, cards, internet banking, QR, agent banking | Bangladesh Bank |
| `telecom` | Mobile/internet subscribers, teledensity, 3G/4G, towers | BTRC |
| `energy` | Daily generation, demand, fuel mix, imports, load-shedding | BPDB · NLDC |
| `funds` | BSEC 141-fund registry; NAVs from 21 managers / 86 funds | BSEC · 21 AMCs |
| `market` | DSEX/DS30/DSES, turnover, market cap, 600+ instruments | DSE |
| `commodities` | Gold, Brent, Dubai crude, BB retail prices, TCB daily Dhaka prices | Bangladesh Bank · TCB |
| `agri` | Crop area and production for rice, wheat, jute, pulses, tea, cotton, tobacco | Bangladesh Bank |
| `social` | Wage Rate Index and social indicators | Bangladesh Bank |
| `regional` | Census 2022 population, households, age, education, work, housing, water, sanitation, fuel, religion, connectivity | BBS |

Every series has a stable readable id, a unit, a frequency, a source URL and a last-updated
date. Raw files are archived before parsing; revisions are recorded in
`observation_revisions` and available through `?vintage=`.

## Shipping changes

Branch → PR → CI must pass → merge to `main` → deploy with `ops/deploy/deploy_from_pc.sh`
(API + website + ingestion mirror). See [`docs/operations.md`](docs/operations.md).

## License

Private repository. Data remains the property of the respective publishers; check each
publisher's terms before redistributing.
