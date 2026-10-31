# backend/scripts/

Operator tools. Run from `backend/` inside the API image unless noted.

| Script | What |
|---|---|
| `build_bb_catalog.py` | Rebuild `ingestion/bb_catalog.json` from the BB workbook specs (`bb_tables.py`) |
| `check_repo.py` | CI consistency check: jobs imported, jobs scheduled, docs mention every job, no control characters |
| `backup.sh` | One `pg_dump -Fc`, verify it with a scratch restore, prune old dumps |
| `backup_loop.sh` | Nightly loop used by the `backup` compose service |
| `vintages_core.py` | Vintage/revision helpers (the trigger owns the actual rows) |

Scripts that existed for the previous Pakistan product (EasyData quota, PSX/fund loaders,
merit-order OCR, AMIS loaders) were removed with their jobs.
