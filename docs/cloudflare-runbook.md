# Cloudflare runbook

Operational commands for the live deployment. Architecture and rationale:
[`cloudflare.md`](./cloudflare.md). Build history:
[`history/2026-11-01-cloudflare-deployment.md`](./history/2026-11-01-cloudflare-deployment.md).

## Live resources

| Thing | Value |
|---|---|
| Website | <https://bangladatahub.amaanjbutt.workers.dev> |
| API | <https://bangladatahub-api.amaanjbutt.workers.dev> |
| API Worker | `bangladatahub-api` |
| Website Worker | `bangladatahub` |
| D1 | `bangladatahub` (`2de61d47-c067-4d35-83de-a88d05774eae`, APAC) |
| R2 | `bangladeshdatahub-raw` |
| Postgres snapshot | `s3://bangladeshdatahub-raw/postgres/latest.dump` |
| Series mirror | `s3://bangladeshdatahub-raw/series/` |
| Ingest workflow | `.github/workflows/ingest.yml` (daily 01:30 UTC) |
| Cron | `*/30 * * * *` on `bangladatahub-api` |

Secrets are in `secrets.md`; GitHub repository secrets hold the R2 keys and
`D1_SYNC_TOKEN`. Never put them in `wrangler.jsonc` or docs.

## Deploy the API Worker

```bash
cd cloudflare/api
npx --yes wrangler@latest deploy
```

This deploys `src/index.ts`, the D1 binding, and the cron trigger. Verify:

```bash
curl https://bangladatahub-api.amaanjbutt.workers.dev/health
curl https://bangladatahub-api.amaanjbutt.workers.dev/v1/status
```

## Deploy the website

```bash
cd frontend
npm run build
cd .output/server
npx --yes wrangler@latest deploy \
  --var BANGLADATA_API_BASE:https://bangladatahub-api.amaanjbutt.workers.dev \
  --var BANGLADATA_PUBLIC_API_BASE:https://bangladatahub-api.amaanjbutt.workers.dev
```

If Wrangler complains about two config files, remove the generated redirect:

```bash
rm -f frontend/.wrangler/deploy/config.json
```

The site's server-side API key is a Worker secret, set once:

```bash
cd frontend/.output/server
npx --yes wrangler@latest secret put BANGLADATA_API_KEY
```

`frontend/wrangler.jsonc` must keep both:

```jsonc
"compatibility_flags": ["nodejs_compat", "nodejs_compat_populate_process_env"],
"services": [{ "binding": "API", "service": "bangladatahub-api" }]
```

Without the first, `process.env` is empty and the site silently renders fixtures.
Without the second, Worker-to-Worker fetches fail with Cloudflare error 1042.

## Set / rotate secrets

API Worker:

```bash
cd cloudflare/api
npx --yes wrangler@latest secret put SYNC_TOKEN
npx --yes wrangler@latest secret put GITHUB_TOKEN   # optional cron dispatch
```

Rotating `SYNC_TOKEN`:

1. Generate a new random value.
2. Update `secrets.md`.
3. `wrangler secret put SYNC_TOKEN` with the new value.
4. Update the GitHub `D1_SYNC_TOKEN` secret.
5. The next `Ingest` run uses the new token; old tokens stop working immediately.

`GITHUB_TOKEN` needs `actions:write` on `amaanjbutt/bdh`. With it set, the 30-minute
cron checks `max(obs_date)` and dispatches `ingest.yml` when data is >2 days old.

## D1 schema, migrations and seed

Fresh database:

```bash
cd cloudflare/api
npx --yes wrangler@latest d1 execute bangladatahub --remote --file=schema.sql
```

Apply incremental migrations once, in order:

```bash
npx --yes wrangler@latest d1 execute bangladatahub --remote \
  --file=migrations/0002_auth.sql
```

Seed from the canonical Postgres:

```bash
cd backend
DATABASE_URL=postgresql://... python -m scripts.export_d1
```

This writes chunked `INSERT OR REPLACE` files to `backend/data/d1/` (gitignored).
Apply them in name order:

```bash
cd cloudflare/api
for f in $(ls ../../backend/data/d1/*.sql | sort); do
  npx --yes wrangler@latest d1 execute bangladatahub --remote --file="$f" --yes
done
```

Check counts:

```bash
npx --yes wrangler@latest d1 execute bangladatahub --remote \
  --command="SELECT (SELECT count(*) FROM series) AS series,
                    (SELECT count(*) FROM observations) AS observations,
                    (SELECT count(*) FROM observation_revisions) AS revisions"
```

## Incremental sync into D1

The GitHub Actions `Ingest` workflow runs this automatically. By hand:

```bash
cd backend
DATABASE_URL=postgresql://... \
D1_SYNC_URL=https://bangladatahub-api.amaanjbutt.workers.dev \
D1_SYNC_TOKEN=... \
python -m scripts.sync_d1
```

- `--full` ignores the watermark and sends everything.
- The script sends only rows changed since the Worker's `last_sync`.
- It advances the watermark only after every batch succeeds.
- On D1's free-tier daily write limit it prints a warning, exits 0, and leaves the
  watermark unchanged so the next run resumes.

Check the watermark:

```bash
curl -H "X-Sync-Token: $D1_SYNC_TOKEN" \
  https://bangladatahub-api.amaanjbutt.workers.dev/admin/state
```

## Postgres snapshot (R2)

The GitHub Actions runner has no persistent database. It restores the snapshot,
runs the jobs, dumps the result, and uploads it back.

```bash
cd backend
python -m scripts.r2_snapshot download /tmp/bd.dump
pg_restore --clean --if-exists --no-owner --no-privileges -d "$DATABASE_URL" /tmp/bd.dump
# ... run jobs ...
pg_dump -Fc -d "$DATABASE_URL" -f /tmp/bd.dump
python -m scripts.r2_snapshot upload /tmp/bd.dump
```

The workflow only uploads after a **successful restore**, so a failed restore
cannot overwrite the last good snapshot. If a bad snapshot is ever uploaded,
restore `backend/data/bangladata.dump` from the owner's machine and upload it.

## R2 per-series flat-file mirror

```bash
cd backend
DATABASE_URL=postgresql://... python -m scripts.export_r2_series
```

Writes `series/<id>.json` and `series/_index.json` to R2. Current size: 3,596
files / ~23.5 MB. This is the flat-file export/backup path; D1 remains the SQL
serving layer.

## Run the ingestion workflow

Full daily set (the default), or a subset:

```bash
gh workflow run ingest.yml --repo amaanjbutt/bdh
gh workflow run ingest.yml --repo amaanjbutt/bdh -f jobs=dam_prices
gh workflow run ingest.yml --repo amaanjbutt/bdh -f full_sync=true
```

Watch it:

```bash
gh run list --repo amaanjbutt/bdh --workflow ingest.yml --limit 3
gh run view <run-id> --repo amaanjbutt/bdh --log
```

The default job set is `bb_web,bb_workbook,bbs_cpi,btrc_telecom,nbr_revenue,
bpdb_power,dam_prices,bsec_funds,icb_nav,amc_nav,dse_market,epb_exports,
tcb_prices,derive_indicators`. A full run takes roughly 8 minutes in practice.

## Custom domain

`bangladatahub.com` is **not in the current Cloudflare account**. To attach it:

1. Add the zone to Cloudflare and point the registrar's nameservers at it.
2. Add Worker routes:
   - `bangladatahub.com/*` → `bangladatahub`
   - `api.bangladatahub.com/*` → `bangladatahub-api`
3. Update the frontend Worker vars:
   - `BANGLADATA_API_BASE=https://api.bangladatahub.com`
   - `BANGLADATA_PUBLIC_API_BASE=https://api.bangladatahub.com`
4. Update the `publicApiBase()` fallback in `frontend/src/lib/bangladata/client.server.ts`.
5. Redeploy the website Worker.

The site's canonical/SEO URLs already say `bangladatahub.com`, so only the runtime
API base needs changing.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Site shows `USD/BDT 287.40` or other Pakistan-era values | `process.env` is empty; check `nodejs_compat_populate_process_env` and the `API` service binding. |
| `error code: 1042` on a Worker fetch | Same-zone Worker-to-Worker fetch; use the `API` service binding. |
| D1 `free tier daily row write limit` | 100k rows/day cap. Wait until 00:00 UTC or upgrade to Workers Paid. `sync_d1` resumes automatically. |
| D1 `too many SQL variables` | Batch has >100 bound params. `adminSync` flushes 5 statements at a time; do not raise it without checking the widest row (18 params). |
| Signup/login returns 500 with `Pbkdf2 ... iteration counts above 100000` | Cloudflare WebCrypto cap. New hashes are 100k; reset any old 200k dashboard password. API keys still work. |
| `pg_restore: unrecognized configuration parameter "transaction_timeout"` | Runner `pg_dump` is newer than the Postgres service. The workflow uses `postgres:18`; keep them aligned. |
| Wrangler: “Found both a user configuration file … and a deploy configuration file” | Remove `frontend/.wrangler/deploy/config.json`, then deploy from `.output/server`. |
| Stale page after a deploy/data change | Edge cache. Bump `CACHE_BUST_VERSION` in `frontend/src/server.ts` only for the intended paths; `/series` and `/data` are deliberately long-cached. |
| Ingest sync failed but jobs succeeded | Check `/admin/state`; the watermark only advances on a complete sync. Re-run `sync_d1` after the D1 budget resets. |
| API returns 404 for `/v1/funds`, `/v1/amcs`, `/v1/trade/*` | Those legacy/fixture endpoints are not ported; the live fund endpoints are `/v1/funds/registry`, `/v1/funds/amcs`, `/v1/funds/nav`. |
