# Operations

## Local stack

```bash
cp .env.example .env
docker compose up -d db redis
docker compose run --rm --no-deps -v "$PWD/backend:/app" api python -m db.init
docker compose up -d api
```

The API is on `http://localhost:8000`; the website dev server is on `:8080`:

```bash
cd frontend
BANGLADATA_API_BASE=http://127.0.0.1:8050 BANGLADATA_API_KEY=<key> npm run dev -- --port 8080
```

On Windows, ports 7941–8040 are blocked; the examples use 8050 for a manual uvicorn run.
The compose stack publishes 8000.

## Configuration

| Variable | Used by | Purpose |
|---|---|---|
| `DATABASE_URL` | API, scheduler | Postgres connection |
| `REDIS_URL` | API, scheduler | rate limits, cache, sessions, job lock |
| `RAW_ARCHIVE_DIR` | ingestion | local raw-file archive |
| `PUBLIC_BASE_URL` | API | links in emails/docs |
| `R2_ENDPOINT`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | ingestion | optional R2 mirror |
| `BROWSER_FETCH`, `CHROME_PATH` | ingestion | browser fallback for F5-protected files |
| `INGEST_PROXY`, `INGEST_PROXY_HOSTS`, `INGEST_PROXY_MAP` | ingestion | optional egress proxy |
| `LEMONSQUEEZY_*` | billing | checkout + webhook |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | auth | Google sign-in |
| `RESEND_API_KEY`, `EMAIL_FROM`, `ADMIN_EMAILS` | API | transactional email and admin access |
| `BANGLADATA_API_BASE`, `BANGLADATA_API_KEY` | frontend | server-side API calls |

Secrets live in `secrets.md` on the owner's machine and in GitHub/Cloudflare secret stores; never commit them.

## Cloudflare (primary)

The live product is Cloudflare Workers + D1 + R2; the Python jobs run on GitHub
Actions. The full map, URLs, deploy commands and data flow are in
[`cloudflare.md`](./cloudflare.md). The short version:

```bash
cd cloudflare/api && npx wrangler deploy          # API + D1 + cron
cd frontend && npm run build
cd .output/server && npx wrangler deploy \
  --var BANGLADATA_API_BASE:https://bangladatahub-api.amaanjbutt.workers.dev \
  --var BANGLADATA_PUBLIC_API_BASE:https://bangladatahub-api.amaanjbutt.workers.dev
```

The `Ingest` GitHub Actions workflow (`01:30 UTC` daily) restores the Postgres
snapshot from R2, runs the Python jobs, uploads the new snapshot, and syncs
changed rows into D1. A Cloudflare Cron Trigger (`*/30 * * * *`) dispatches the
same workflow if data goes stale and `GITHUB_TOKEN` is configured.

## VPS (legacy / alternative)

The VPS path below is kept as an alternative for deployments that need a
persistent Postgres or browser-based ingestion. It is not used by the live
Cloudflare deployment.

## VPS layout

- `/opt/bangladata` — git checkout of `main`.
- `docker-compose.server.yml` — Postgres, Redis, API, scheduler, backup, Caddy.
- `/var/lib/bangladata/pgdata` — bind-mounted Postgres data.
- `/var/log/bangladata-deploy.log` — deploy log.
- `ops/deploy/deploy.sh` — fetch, build, health-check, rollback on failure.
- `ops/caddy/Caddyfile.api` — TLS + reverse proxy for `api.bangladatahub.com`.

Deploy from the owner's PC (Git Bash):

```bash
VPS_HOST=<host> ops/deploy/deploy_from_pc.sh vps
VPS_HOST=<host> ops/deploy/deploy_from_pc.sh web
```

The script refuses a dirty tree, a HEAD that is not `origin/main`, or a commit whose CI is
not green. `web` builds the frontend and runs `wrangler deploy`; `vps` SSHes with the
forced-command deploy key.

## Database

Schema changes are idempotent DDL in `backend/db/schema.sql`. Apply with:

```bash
docker compose exec api python -m db.init
```

**Never run `db.init` on production without a backup.** The deploy does not apply schema
changes automatically.

Backups run nightly in the `backup` service (`backend/scripts/backup_loop.sh`): `pg_dump -Fc`,
keep 14, verify each dump with a scratch restore. Restore:

```bash
docker compose -f docker-compose.server.yml exec -T db \
  pg_restore -U bangladata -d bangladata --clean --if-exists /backups/<file>.dump
```

## Health and incidents

- `GET /health` — process is up.
- `GET /v1/status` — database reachable, module freshness, totals.
- `ingestion_runs` — last run per job, status, rows, error, raw file.
- `dq_findings` — data-quality findings.

| Symptom | Check |
|---|---|
| API 5xx | `docker compose -f docker-compose.server.yml logs --tail 100 api` |
| Scheduler restarting | logs; check `DATABASE_URL` and `REDIS_URL` |
| Source stale | `ingestion_runs` for the job; dispatch it manually with `--force` |
| Census partial | the job skips unparseable files and reports `partial`; inspect the log and re-run |
| R2 upload failing | R2 must be enabled in the Cloudflare dashboard; the local archive still succeeds |
| Frontend 5xx | Worker logs; check `BANGLADATA_API_BASE` and the API status page |

## Cloudflare R2

R2 is enabled on the account, the bucket `bangladeshdatahub-raw` exists, and the S3 token
is in the local `.env` and (when provisioned) the VPS `.env`. The local archive is always
written; R2 is the mirror. To rotate the token:

1. Create an S3 API token with object read/write on the bucket in the Cloudflare dashboard.
2. Replace `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` in `secrets.md` and the VPS `.env`.
3. Restart `api` and `scheduler`, then run a small job (`bb_web`) and check
   `source_documents.r2_key` is populated.

The S3 endpoint is `https://<account-id>.r2.cloudflarestorage.com`; region `auto`.

## Browser-only downloads

Bangladesh Bank's current Monthly Economic Trends file is F5-protected from many networks.
Run the browser fallback on a workstation with Chrome:

```bash
BROWSER_FETCH=1 CHROME_PATH="C:\Program Files\Google\Chrome\Application\chrome.exe" \
  docker compose run --rm --no-deps -v "$PWD/backend:/app" api \
  python -m ingestion.run bb_workbook --force
```

The 1972–2024 historical workbook is not protected and is the reliable long-history source.
