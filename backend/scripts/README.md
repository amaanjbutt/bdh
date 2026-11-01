# backend/scripts/

Operator tools. Run from `backend/` inside the API image or with `DATABASE_URL` set.

| Script | What |
|---|---|
| `build_bb_catalog.py` | Rebuild `ingestion/bb_catalog.json` from the BB workbook specs (`bb_tables.py`) |
| `check_repo.py` | CI consistency check: jobs imported, jobs scheduled, docs mention every job, no control characters |
| `backup.sh` | One `pg_dump -Fc`, verify it with a scratch restore, prune old dumps |
| `backup_loop.sh` | Nightly loop used by the `backup` compose service |
| `vintages_core.py` | Vintage/revision helpers (the trigger owns the actual rows) |
| `export_d1.py` | Postgres → chunked `INSERT OR REPLACE` SQL for D1, in `backend/data/d1/` |
| `sync_d1.py` | Incremental Postgres → Worker `/admin/sync`; watermark, resumable on D1's daily write cap |
| `r2_snapshot.py` | Download/upload the Postgres snapshot used by the GitHub Actions ingestion runner |
| `export_r2_series.py` | Per-series JSON mirror (`series/<id>.json` + `_index.json`) in R2 |

Cloudflare paths:

- D1 seed: `export_d1.py` → apply files with `wrangler d1 execute`.
- Daily sync: `sync_d1.py` (called by `.github/workflows/ingest.yml`).
- Postgres persistence: `r2_snapshot.py` (called by the workflow).
- R2 flat files: `export_r2_series.py` (called by the workflow).

See [`../../docs/cloudflare-runbook.md`](../../docs/cloudflare-runbook.md) for commands.

Scripts that existed for the previous Pakistan product (EasyData quota, PSX/fund loaders,
merit-order OCR, AMIS loaders) were removed with their jobs.
