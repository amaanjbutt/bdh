"""Raw archive: every fetched source file is stored immutably before parsing.

Local filesystem is always written as a durable fallback. When Cloudflare R2 is
configured (R2_ENDPOINT + keys), the same bytes are also uploaded to the bucket
and the object key is recorded in `source_documents`. R2 is best-effort: a
storage outage must never lose a parseable batch or fail an ingestion run.
"""
from __future__ import annotations

import hashlib
import logging
import mimetypes
import os
import re
from datetime import date

from app.config import settings

log = logging.getLogger("bangladata.storage")
_r2_client = None
_r2_warned = False


def _safe_component(c: str) -> str:
    """Sanitize a single path component so it cannot escape the archive dir."""
    c = str(c).replace("\\", "/").split("/")[-1]
    c = re.sub(r"[^A-Za-z0-9._-]", "_", c)
    if c in ("", ".", ".."):
        raise ValueError(f"unsafe path component: {c!r}")
    return c


def archive_path(source: str, job: str, when: date, filename: str) -> str:
    path = os.path.join(
        settings.raw_archive_dir,
        _safe_component(source),
        _safe_component(job),
        when.isoformat(),
        _safe_component(filename),
    )
    base = os.path.realpath(settings.raw_archive_dir)
    full = os.path.realpath(path)
    if not (full == base or full.startswith(base + os.sep)):
        raise ValueError("archive path escapes base dir")
    return path


def _client():
    global _r2_client
    if _r2_client is not None:
        return _r2_client
    if not (settings.r2_endpoint and settings.r2_access_key_id and settings.r2_secret_access_key):
        return None
    try:
        import boto3
        from botocore.config import Config

        _r2_client = boto3.client(
            "s3",
            endpoint_url=settings.r2_endpoint,
            aws_access_key_id=settings.r2_access_key_id,
            aws_secret_access_key=settings.r2_secret_access_key,
            region_name=settings.r2_region,
            config=Config(
                signature_version="s3v4",
                connect_timeout=5,
                read_timeout=20,
                retries={"max_attempts": 0},
            ),
        )
    except Exception as exc:  # noqa: BLE001
        log.warning("R2 client unavailable: %s", exc)
        return None
    return _r2_client


def _upload_r2(key: str, content: bytes, content_type: str | None) -> bool:
    global _r2_warned
    client = _client()
    if client is None:
        return False
    try:
        client.put_object(
            Bucket=settings.r2_bucket,
            Key=key,
            Body=content,
            ContentType=content_type or "application/octet-stream",
        )
        return True
    except Exception as exc:  # noqa: BLE001
        if not _r2_warned:
            log.warning("R2 upload failed (local archive kept): %s", exc)
            _r2_warned = True
        return False


def archive(
    source: str,
    job: str,
    when: date,
    filename: str,
    content: bytes,
    url: str | None = None,
    content_type: str | None = None,
) -> str:
    """Write raw content locally, mirror to R2 when configured, record metadata.

    Returns the local path.
    """
    path = archive_path(source, job, when, filename)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(content)

    digest = hashlib.sha256(content).hexdigest()
    content_type = content_type or mimetypes.guess_type(filename)[0]
    key = f"raw/{_safe_component(source)}/{_safe_component(job)}/{when.isoformat()}/{_safe_component(filename)}"
    uploaded = _upload_r2(key, content, content_type)

    # Metadata is useful but must never break ingestion (e.g. before schema init).
    try:
        from app import db

        db.execute(
            """
            INSERT INTO source_documents
                (source, job_name, url, filename, content_type, bytes, sha256,
                 fetched_for, storage_path, r2_key)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT (job_name, sha256) DO UPDATE SET
                url = EXCLUDED.url,
                storage_path = EXCLUDED.storage_path,
                r2_key = COALESCE(EXCLUDED.r2_key, source_documents.r2_key)
            """,
            (source, job, url, filename, content_type, len(content), digest,
             when, path, key if uploaded else None),
        )
    except Exception as exc:  # noqa: BLE001
        log.debug("source_documents write skipped: %s", exc)
    return path
