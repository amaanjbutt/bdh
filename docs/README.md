# Internal docs — index

Durable knowledge only. Live state comes from the system itself (`/v1/status`,
`ingestion_runs`, `/admin/state`), not from prose. Public, user-facing docs live in
`frontend/content/docs/` (published at `/docs`).

## Start here

| Doc | Answers |
|---|---|
| [`../AGENTS.md`](../AGENTS.md) | The compact agent map: where things run, what to read for each task, hard rules |
| [`cloudflare.md`](./cloudflare.md) | Live Cloudflare architecture: Workers, D1, R2, cron, GitHub Actions, auth, limits |
| [`cloudflare-runbook.md`](./cloudflare-runbook.md) | Exact deploy/seed/sync/secret/domain commands and troubleshooting |
| [`operations.md`](./operations.md) | Local stack, configuration, backups, incidents, R2; Cloudflare and legacy VPS |
| [`architecture.md`](./architecture.md) | Components, data model, request + ingestion flow, frontend, delivery |

## By task

| Task | Read |
|---|---|
| Deploy the API, website, D1 or cron | `cloudflare.md`, `cloudflare-runbook.md` |
| Add or fix an ingestion job | `ingestion.md`, `backend/ingestion/framework.py` |
| Add an AMC NAV adapter | `ingestion.md`, `backend/ingestion/jobs/amc_nav.py`, `frontend/content/docs/data-funds.md` |
| Change the D1 schema or sync | `cloudflare/api/schema.sql`, `backend/scripts/export_d1.py`, `sync_d1.py` |
| Change the public API | `cloudflare/api/src/index.ts`, `frontend/content/docs/api-reference.md` |
| Investigate a bad value | `data-quality.md`, the series page, the source document |
| Understand a past failure | `history/2026-11-01-cloudflare-deployment.md` |
| Know why a choice was made | `decisions.md` |
| See what is open | `backlog.md` |
| Check product/plans/audience | `product.md` |
| Check a hard rule | `rules.md` |

## All docs

| Doc | Answers |
|---|---|
| [`product.md`](./product.md) | What BanglaDataHub is, who it's for, coverage per module, plans and positioning |
| [`architecture.md`](./architecture.md) | Components, data model, request + ingestion flow, frontend rendering, delivery |
| [`ingestion.md`](./ingestion.md) | All seventeen jobs: source, schedule, tables; how a run works; GitHub Actions runner |
| [`operations.md`](./operations.md) | Local stack, configuration, backups, incidents, R2; Cloudflare and legacy VPS paths |
| [`cloudflare.md`](./cloudflare.md) | Live Cloudflare architecture and resource map |
| [`cloudflare-runbook.md`](./cloudflare-runbook.md) | Operational commands and troubleshooting |
| [`data-quality.md`](./data-quality.md) | Gates, source-specific checks, annotations, quarantine |
| [`rules.md`](./rules.md) | Every hard rule |
| [`decisions.md`](./decisions.md) | Dated decisions — don't reopen them |
| [`backlog.md`](./backlog.md) | Open work, prioritised |
| [`history/2026-11-01-cloudflare-deployment.md`](./history/2026-11-01-cloudflare-deployment.md) | Full build log of the Cloudflare migration, failures and current state |

## Code-level guides

- [`../cloudflare/README.md`](../cloudflare/README.md) — Worker layout, D1 schema/migrations, endpoint map, deploy secrets
- [`../backend/README.md`](../backend/README.md) — FastAPI/ingestion layout
- [`../backend/scripts/README.md`](../backend/scripts/README.md) — operator scripts, including D1/R2 sync
- [`../frontend/README.md`](../frontend/README.md) — routes, data layer, service binding, deploy
- [`../ops/README.md`](../ops/README.md) — legacy VPS/Caddy, relay, SEO
- [`../.github/workflows/ingest.yml`](../.github/workflows/ingest.yml) — the heavy ingestion runner

**Keeping docs true:** when a change alters behaviour described here, update the doc in the
same commit. Keep `AGENTS.md` a map, not a manual. Deep procedures go in
`cloudflare-runbook.md`; one dated record per migration/incident goes in `history/`.
