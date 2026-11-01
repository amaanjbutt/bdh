# Workflows

| File | What | Runs |
|---|---|---|
| `ci.yml` | Lint, tests, schema idempotency, repo consistency, frontend build, gitleaks, actionlint | every push/PR |
| `ingest.yml` | Heavy Python ingestion; restores the Postgres snapshot from R2, runs jobs, dumps back, exports R2 series, syncs D1 | daily 01:30 UTC + `workflow_dispatch` |

`ci.yml` never deploys. Deploy the Workers manually (or with the legacy
`ops/deploy/deploy_from_pc.sh`) after CI is green:

```bash
cd cloudflare/api && npx wrangler deploy
cd frontend && npm run build && cd .output/server && npx wrangler deploy
```

`ingest.yml` needs the R2 and D1 secrets listed in
[`../../docs/cloudflare-runbook.md`](../../docs/cloudflare-runbook.md). Use
`gh workflow run ingest.yml --repo amaanjbutt/bdh` for a manual run.
