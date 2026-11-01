"""Write one JSON file per series to R2 (`series/<id>.json`).

This is the flat-file half of the hybrid: D1 remains the query/serving layer for
catalog, search, status and cross-series SQL, while R2 holds a cheap, portable
snapshot of every series for export, disaster recovery and future R2-served
reads.

    python -m scripts.export_r2_series
    python -m scripts.export_r2_series --limit 5   # smoke test

The index (`series/_index.json`) carries the catalog metadata and counts.
"""
from __future__ import annotations

import argparse
import json
import os
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, datetime, timezone
from decimal import Decimal

import boto3
import psycopg
from botocore.config import Config
from psycopg.rows import dict_row

from app.config import settings

SERIES_COLS = [
    "id", "module", "name", "description", "unit", "frequency", "source",
    "source_url", "dimensions", "min_value", "max_value", "max_step",
    "first_date", "last_date", "tier", "is_active", "derivation", "canonical_id",
]


def clean(value):
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, dict):
        return value
    return value


def row_dict(row: dict) -> dict:
    return {k: clean(v) for k, v in row.items()}


def client():
    if not (settings.r2_endpoint and settings.r2_access_key_id and settings.r2_secret_access_key):
        raise SystemExit("R2 is not configured (R2_ENDPOINT / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY)")
    return boto3.client(
        "s3",
        endpoint_url=settings.r2_endpoint,
        aws_access_key_id=settings.r2_access_key_id,
        aws_secret_access_key=settings.r2_secret_access_key,
        region_name=settings.r2_region,
        config=Config(signature_version="s3v4", retries={"max_attempts": 2}),
    )


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--prefix", default="series")
    ap.add_argument("--limit", type=int, default=0, help="smoke-test only: export N series")
    ap.add_argument("--workers", type=int, default=16)
    args = ap.parse_args()

    dsn = os.getenv("DATABASE_URL", "postgresql://bangladata:bangladata@127.0.0.1:5432/bangladata")
    s3 = client()

    with psycopg.connect(dsn) as conn:
        def q(sql: str, params: tuple = ()) -> list[dict]:
            with conn.cursor(row_factory=dict_row) as cur:
                cur.execute(sql, params)
                return [row_dict(r) for r in cur.fetchall()]

        series = q(f"SELECT {', '.join(SERIES_COLS)} FROM series WHERE is_active ORDER BY id")
        if args.limit:
            series = series[: args.limit]

        ids = [s["id"] for s in series]
        obs_by_series: dict[str, list[dict]] = {sid: [] for sid in ids}
        rev_by_series: dict[str, list[dict]] = {sid: [] for sid in ids}
        for r in q(
            "SELECT series_id, obs_date, value, dims, flagged, first_seen_at, revised_at "
            "FROM observations WHERE series_id = ANY(%s) ORDER BY series_id, obs_date",
            (ids,),
        ):
            obs_by_series[r["series_id"]].append({
                "date": clean(r["obs_date"]),
                "value": clean(r["value"]),
                "dims": r["dims"] or {},
                "flagged": bool(r["flagged"]),
                "first_seen_at": clean(r["first_seen_at"]),
                "revised_at": clean(r["revised_at"]),
            })
        for r in q(
            "SELECT series_id, obs_date, dims, value, superseded_at, source "
            "FROM observation_revisions WHERE series_id = ANY(%s) "
            "ORDER BY series_id, obs_date, superseded_at",
            (ids,),
        ):
            rev_by_series[r["series_id"]].append({
                "date": clean(r["obs_date"]),
                "dims": r["dims"] or {},
                "value": clean(r["value"]),
                "superseded_at": clean(r["superseded_at"]),
                "source": r["source"],
            })

    generated = datetime.now(timezone.utc).isoformat()
    index = {
        "generated_at": generated,
        "count": len(series),
        "series": [
            {**s, "observations": len(obs_by_series[s["id"]]), "revisions": len(rev_by_series[s["id"]])}
            for s in series
        ],
    }

    def upload(payload: dict) -> tuple[str, int]:
        sid = payload["id"]
        body = json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode()
        key = f"{args.prefix}/{sid}.json"
        s3.put_object(
            Bucket=settings.r2_bucket, Key=key, Body=body,
            ContentType="application/json; charset=utf-8",
            CacheControl="public, max-age=300",
        )
        return sid, len(body)

    payloads = [
        {**s, "observations": obs_by_series[s["id"]], "revisions": rev_by_series[s["id"]]}
        for s in series
    ]
    total = 0
    done = 0
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = {pool.submit(upload, p): p["id"] for p in payloads}
        for fut in as_completed(futures):
            _, size = fut.result()
            total += size
            done += 1
            if done % 500 == 0:
                print(f"  {done}/{len(payloads)} files, {total / 1e6:.1f} MB")

    s3.put_object(
        Bucket=settings.r2_bucket,
        Key=f"{args.prefix}/_index.json",
        Body=json.dumps(index, separators=(",", ":"), ensure_ascii=False).encode(),
        ContentType="application/json; charset=utf-8",
        CacheControl="public, max-age=300",
    )
    print(f"exported {len(payloads)} series, {total / 1e6:.1f} MB -> "
          f"s3://{settings.r2_bucket}/{args.prefix}/")


if __name__ == "__main__":
    main()
