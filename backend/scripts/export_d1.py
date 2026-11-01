"""Export the Postgres snapshot to D1-compatible SQL files.

The Cloudflare Worker is the public read layer; D1 is its serving database.
This script is deliberately dumb: it serialises the canonical Postgres tables
into `INSERT OR REPLACE` statements, chunked so `wrangler d1 execute` never
gets a multi-megabyte request. Run it, then apply the files with
`cloudflare/api/deploy_seed.ps1` (or the bash equivalent).

    DATABASE_URL=... python -m scripts.export_d1
"""
from __future__ import annotations

import json
import os
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path

import psycopg

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "backend" / "data" / "d1"
CHUNK = 1000

# table -> (columns, order_by)
TABLES: dict[str, tuple[list[str], str]] = {
    "series": ([
        "id", "module", "name", "description", "unit", "frequency", "source",
        "source_url", "dimensions", "min_value", "max_value", "max_step",
        "first_date", "last_date", "tier", "is_active", "derivation", "canonical_id",
    ], "id"),
    "observations": ([
        "series_id", "obs_date", "value", "dims", "flagged", "first_seen_at", "revised_at",
    ], "series_id, obs_date, dims"),
    "observation_revisions": ([
        "series_id", "obs_date", "dims", "value", "superseded_at", "source",
    ], "series_id, obs_date, superseded_at"),
    "observation_notes": ([
        "series_id", "obs_date", "dims", "note", "kind",
    ], "series_id, obs_date"),
    "fund_registry": ([
        "name", "fund_type", "consent_date", "subscription_open", "subscription_close",
        "nrb_close", "amount_crore", "document_url", "source", "updated_at",
    ], "name"),
    "dam_prices": ([
        "price_date", "division", "commodity", "unit", "current_min", "current_max",
        "month_ago_min", "month_ago_max", "year_ago_min", "year_ago_max", "source", "revised_at",
    ], "price_date, division, commodity, unit"),
    "dse_securities": ([
        "code", "name", "sector", "board", "category", "asset_type", "is_active",
        "first_seen", "last_seen", "updated_at",
    ], "code"),
    "dse_prices": ([
        "code", "obs_date", "ltp", "ycp", "open", "high", "low", "close", "volume",
        "value_mn", "trades", "change_pct", "revised_at",
    ], "code, obs_date"),
    "dse_indices": ([
        "index_code", "obs_date", "value", "change", "change_pct", "revised_at",
    ], "index_code, obs_date"),
    "dse_market_daily": ([
        "obs_date", "turnover_mn", "volume", "trades", "advances", "declines", "unchanged",
        "market_cap_equity_mn", "market_cap_mf_mn", "market_cap_debt_mn",
        "market_cap_total_mn", "source", "revised_at",
    ], "obs_date"),
    "release_calendar": ([
        "release_date", "indicator", "source", "series_id", "actual_value",
    ], "release_date, indicator"),
    "auctions": ([
        "auction_type", "tenor", "auction_date", "settlement_date", "cutoff_yield",
        "offered_amount", "accepted_amount", "bid_to_cover", "source", "revised_at",
    ], "auction_type, tenor, auction_date"),
    "ingestion_runs": ([
        "job_name", "started_at", "finished_at", "status", "rows_upserted", "error", "raw_file",
    ], "started_at, id"),
    "users": ([
        "id", "email", "created_at", "plan", "subscription_status", "period_end",
        "credits_remaining", "credits_period",
    ], "id"),
    "api_keys": ([
        "key_hash", "user_id", "label", "created_at", "revoked_at", "id", "key_prefix", "last_used_at",
    ], "created_at, key_hash"),
}


def q(value: object) -> str:
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "1" if value else "0"
    if isinstance(value, (int, float, Decimal)):
        return str(value)
    if isinstance(value, (date, datetime)):
        return quote(value.isoformat())
    if isinstance(value, dict):
        return quote(json.dumps(value, separators=(",", ":"), ensure_ascii=False))
    if isinstance(value, list):
        return quote(json.dumps(value, separators=(",", ":"), ensure_ascii=False))
    return quote(str(value))


def quote(value: str) -> str:
    return "'" + value.replace("\x00", "").replace("'", "''") + "'"


def main() -> None:
    dsn = os.getenv("DATABASE_URL", "postgresql://bangladata:bangladata@127.0.0.1:5432/bangladata")
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("*.sql"):
        old.unlink()

    manifest: list[dict] = []
    seq = 0
    with psycopg.connect(dsn) as conn:
        for table, (columns, order_by) in TABLES.items():
            try:
                rows = conn.execute(
                    f"SELECT {', '.join(columns)} FROM {table} ORDER BY {order_by}"
                ).fetchall()
            except Exception as exc:  # a table that doesn't exist on this install is fine
                print(f"skip {table}: {exc}")
                continue
            if not rows:
                print(f"{table:24} 0 rows")
                continue
            for start in range(0, len(rows), CHUNK):
                chunk = rows[start:start + CHUNK]
                lines = [
                    f"INSERT OR REPLACE INTO {table} ({', '.join(columns)}) VALUES "
                    f"({', '.join(q(v) for v in row)});"
                    for row in chunk
                ]
                seq += 1
                name = f"{seq:04d}_{table}.sql"
                (OUT / name).write_text("\n".join(lines) + "\n", encoding="utf-8")
                manifest.append({"file": name, "table": table, "rows": len(chunk)})
            print(f"{table:24} {len(rows):>7} rows -> {(len(rows) + CHUNK - 1) // CHUNK} file(s)")

    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    total = sum(m["rows"] for m in manifest)
    print(f"\n{len(manifest)} files, {total} rows -> {OUT}")


if __name__ == "__main__":
    main()
