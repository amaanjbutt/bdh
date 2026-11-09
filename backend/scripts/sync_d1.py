"""Push Postgres changes into the Cloudflare D1 read API.

The Worker owns the public API; this script is the bridge from the Python
ingestion runners (GitHub Actions) to D1. It sends only rows changed since the
Worker's `last_sync` watermark, in batches, and advances the watermark only
after every batch succeeds.

    D1_SYNC_URL=https://bangladatahub-api.amaanjbutt.workers.dev \
    D1_SYNC_TOKEN=... python -m scripts.sync_d1

`--full` ignores the watermark (initial mirror / disaster recovery).
"""
from __future__ import annotations

import argparse
import json
import os
from datetime import date, datetime, timezone
from decimal import Decimal

import psycopg
from curl_cffi import requests
from psycopg.rows import dict_row

SERIES_COLS = [
    "id", "module", "name", "description", "unit", "frequency", "source",
    "source_url", "dimensions", "min_value", "max_value", "max_step",
    "first_date", "last_date", "tier", "is_active", "derivation", "canonical_id",
]
OBS_COLS = ["series_id", "obs_date", "value", "dims", "flagged", "first_seen_at", "revised_at"]
REV_COLS = ["series_id", "obs_date", "dims", "value", "superseded_at", "source"]
RUN_COLS = ["job_name", "started_at", "finished_at", "status", "rows_upserted", "error", "raw_file"]
FUND_COLS = ["name", "fund_type", "consent_date", "subscription_open", "subscription_close",
             "nrb_close", "amount_crore", "document_url", "source", "updated_at"]
DAM_COLS = ["price_date", "division", "commodity", "unit", "current_min", "current_max",
            "month_ago_min", "month_ago_max", "year_ago_min", "year_ago_max", "source", "revised_at"]
SEC_COLS = ["code", "name", "sector", "board", "category", "asset_type", "is_active",
            "first_seen", "last_seen", "updated_at"]
PRICE_COLS = ["code", "obs_date", "ltp", "ycp", "open", "high", "low", "close", "volume",
              "value_mn", "trades", "change_pct", "revised_at"]
INDEX_COLS = ["index_code", "obs_date", "value", "change", "change_pct", "revised_at"]
DAILY_COLS = ["obs_date", "turnover_mn", "volume", "trades", "advances", "declines", "unchanged",
              "market_cap_equity_mn", "market_cap_mf_mn", "market_cap_debt_mn",
              "market_cap_total_mn", "source", "revised_at"]
CAL_COLS = ["release_date", "indicator", "source", "series_id", "actual_value"]
AUC_COLS = ["auction_type", "tenor", "auction_date", "settlement_date", "cutoff_yield",
            "offered_amount", "accepted_amount", "bid_to_cover", "source", "revised_at"]


def clean(row: dict) -> dict:
    out = {}
    for k, v in row.items():
        if isinstance(v, Decimal):
            out[k] = float(v)
        elif isinstance(v, datetime):
            out[k] = v.isoformat()
        elif isinstance(v, date):
            out[k] = v.isoformat()
        elif isinstance(v, dict):
            out[k] = json.dumps(v, separators=(",", ":"), ensure_ascii=False)
        elif isinstance(v, list):
            out[k] = json.dumps(v, separators=(",", ":"), ensure_ascii=False)
        else:
            out[k] = v
    return out


def fetch(conn, sql: str, params: tuple = ()) -> list[dict]:
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(sql, params)
        return [clean(r) for r in cur.fetchall()]


def post(url: str, token: str, payload: dict) -> dict:
    resp = requests.post(
        f"{url.rstrip('/')}/admin/sync",
        json=payload,
        headers={"X-Sync-Token": token, "accept": "application/json"},
        impersonate="chrome",
        timeout=120,
    )
    if resp.status_code >= 300:
        text = resp.text
        if "free tier daily row write limit" in text:
            raise SyncLimitReached(text)
        raise SystemExit(f"sync failed ({resp.status_code}): {text[:500]}")
    return resp.json()


class SyncLimitReached(Exception):
    """D1's free-tier daily write budget is exhausted; resume after midnight UTC."""


def state(url: str, token: str) -> str | None:
    resp = requests.get(
        f"{url.rstrip('/')}/admin/state",
        headers={"X-Sync-Token": token, "accept": "application/json"},
        impersonate="chrome",
        timeout=60,
    )
    if resp.status_code >= 300:
        raise SystemExit(f"state failed ({resp.status_code}): {resp.text[:500]}")
    return resp.json().get("last_sync")


def chunks(rows: list[dict], size: int):
    for i in range(0, len(rows), size):
        yield rows[i:i + size]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--full", action="store_true", help="ignore the watermark and send everything")
    ap.add_argument("--batch", type=int, default=800)
    args = ap.parse_args()

    url = os.getenv("D1_SYNC_URL", "https://bangladatahub-api.amaanjbutt.workers.dev")
    token = os.getenv("D1_SYNC_TOKEN")
    if not token:
        raise SystemExit("D1_SYNC_TOKEN is not set")
    dsn = os.getenv("DATABASE_URL", "postgresql://bangladata:bangladata@127.0.0.1:5432/bangladata")

    since = None if args.full else state(url, token)
    if args.full or not since:
        since = "2000-01-01T00:00:00+00:00"
    watermark = datetime.now(timezone.utc).isoformat()

    with psycopg.connect(dsn) as conn:
        observations = fetch(
            conn,
            f"SELECT {', '.join(OBS_COLS)} FROM observations "
            "WHERE revised_at > %s OR first_seen_at > %s ORDER BY series_id, obs_date, dims",
            (since, since),
        )
        if args.full or since.startswith("2000-"):
            series = fetch(conn, f"SELECT {', '.join(SERIES_COLS)} FROM series ORDER BY id")
        else:
            # A new or revised historical point can be older than the watermark.
            # Include its metadata even when both series period bounds are old.
            since_day = since[:10]
            series = fetch(
                conn,
                f"SELECT {', '.join(SERIES_COLS)} FROM series "
                "WHERE last_date >= %s OR first_date >= %s OR id = ANY(%s) ORDER BY id",
                (since_day, since_day, sorted({row["series_id"] for row in observations})),
            )
        revisions = fetch(
            conn,
            f"SELECT {', '.join(REV_COLS)} FROM observation_revisions "
            "WHERE superseded_at > %s ORDER BY series_id, obs_date, superseded_at",
            (since,),
        )
        runs = fetch(
            conn,
            f"SELECT {', '.join(RUN_COLS)} FROM ingestion_runs "
            "WHERE started_at > %s ORDER BY started_at",
            (since,),
        )
        funds = fetch(conn, f"SELECT {', '.join(FUND_COLS)} FROM fund_registry WHERE updated_at > %s", (since,))
        dam = fetch(conn, f"SELECT {', '.join(DAM_COLS)} FROM dam_prices WHERE revised_at > %s", (since,))
        securities = fetch(conn, f"SELECT {', '.join(SEC_COLS)} FROM dse_securities WHERE updated_at > %s", (since,))
        prices = fetch(conn, f"SELECT {', '.join(PRICE_COLS)} FROM dse_prices WHERE revised_at > %s", (since,))
        indices = fetch(conn, f"SELECT {', '.join(INDEX_COLS)} FROM dse_indices WHERE revised_at > %s", (since,))
        daily = fetch(conn, f"SELECT {', '.join(DAILY_COLS)} FROM dse_market_daily WHERE revised_at > %s", (since,))
        calendar = fetch(conn, f"SELECT {', '.join(CAL_COLS)} FROM release_calendar")
        auctions = fetch(conn, f"SELECT {', '.join(AUC_COLS)} FROM auctions WHERE revised_at > %s", (since,))

    print(
        f"since {since}: series={len(series)} obs={len(observations)} rev={len(revisions)} "
        f"runs={len(runs)} funds={len(funds)} dam={len(dam)} prices={len(prices)}"
    )

    # Series metadata is sent only when it changed (or on --full); sending all
    # 3,596 every run costs ~18k D1 writes before a single observation.
    try:
        for batch in chunks(series, args.batch):
            post(url, token, {"series": batch})

        for batch in chunks(observations, args.batch):
            post(url, token, {"observations": batch})

        for batch in chunks(revisions, args.batch):
            post(url, token, {"revisions": batch})

        for batch in chunks(runs, args.batch):
            post(url, token, {"ingestion_runs": batch})

        for batch in chunks(funds, args.batch):
            post(url, token, {"fund_registry": batch})
        for batch in chunks(dam, args.batch):
            post(url, token, {"dam_prices": batch})
        for batch in chunks(securities, args.batch):
            post(url, token, {"dse_securities": batch})
        for batch in chunks(prices, args.batch):
            post(url, token, {"dse_prices": batch})
        for batch in chunks(indices, args.batch):
            post(url, token, {"dse_indices": batch})
        for batch in chunks(daily, args.batch):
            post(url, token, {"dse_market_daily": batch})
        for batch in chunks(calendar, args.batch):
            post(url, token, {"release_calendar": batch})
        for batch in chunks(auctions, args.batch):
            post(url, token, {"auctions": batch})

        # Advance the watermark only after every batch above has succeeded.
        post(url, token, {"final": True, "watermark": watermark})
    except SyncLimitReached as exc:
        print(f"D1 free-tier daily write limit reached; watermark unchanged ({exc})")
        print("the next run resumes from the same watermark after midnight UTC")
        return
    print(f"synced; watermark={watermark}")


if __name__ == "__main__":
    main()
