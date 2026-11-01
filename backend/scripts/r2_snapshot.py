"""Download/upload the Postgres snapshot used by the GitHub Actions ingestion runner.

The runner has no persistent database host: it restores the last snapshot from
R2, runs the Python jobs, dumps the result, and uploads it back. One object,
`postgres/latest.dump`, is the durable state.

    python -m scripts.r2_snapshot download /tmp/bangladata.dump
    python -m scripts.r2_snapshot upload   /tmp/bangladata.dump
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

from app.config import settings


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
    ap.add_argument("action", choices=["download", "upload"])
    ap.add_argument("path")
    ap.add_argument("--key", default=os.getenv("R2_SNAPSHOT_KEY", "postgres/latest.dump"))
    args = ap.parse_args()
    path = Path(args.path)
    s3 = client()

    if args.action == "download":
        path.parent.mkdir(parents=True, exist_ok=True)
        try:
            s3.download_file(settings.r2_bucket, args.key, str(path))
        except ClientError as exc:
            code = str(exc.response.get("Error", {}).get("Code", ""))
            if code in ("404", "NoSuchKey", "NotFound"):
                print(f"no snapshot at s3://{settings.r2_bucket}/{args.key}")
                sys.exit(1)
            raise
        print(f"downloaded s3://{settings.r2_bucket}/{args.key} -> {path} ({path.stat().st_size} bytes)")
    else:
        if not path.exists():
            raise SystemExit(f"missing local file: {path}")
        s3.upload_file(str(path), settings.r2_bucket, args.key)
        print(f"uploaded {path} ({path.stat().st_size} bytes) -> s3://{settings.r2_bucket}/{args.key}")


if __name__ == "__main__":
    main()
