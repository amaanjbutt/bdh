"""Replay verified publisher files through the normal archive and ingestion path."""
from __future__ import annotations

import argparse
import json
from datetime import date
from pathlib import PurePosixPath
from zipfile import ZipFile

from ingestion.framework import FetchedFile
from ingestion.registry import JOBS

REPLAYABLE = ("bbs_census", "bbs_cpi", "dam_prices", "epb_exports")


def read_files(bundle: ZipFile, job: str) -> list[FetchedFile]:
    manifest = json.loads(bundle.read("manifest.json"))
    files = []
    seen = set()
    for entry in manifest.get(job, []):
        filename = entry["filename"]
        when = date.fromisoformat(entry["when"])
        path = PurePosixPath(filename)
        if filename != path.name or "\\" in filename or path.suffix not in {".xlsx", ".pdf"}:
            raise ValueError("Invalid staged release filename")
        if when > date.today() or filename in seen:
            raise ValueError("Future-dated or duplicate staged release")
        seen.add(filename)
        files.append(FetchedFile(filename, bundle.read(f"{job}/{filename}"), when))
    if not files:
        raise ValueError(f"No staged publisher files for {job}")
    return sorted(files, key=lambda file: file.when)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("job", choices=REPLAYABLE)
    parser.add_argument("bundle")
    args = parser.parse_args()
    with ZipFile(args.bundle) as bundle:
        files = read_files(bundle, args.job)
    result = JOBS[args.job]().run(backfill=True, staged_files=files)
    print(result)
    if result["status"] != "success":
        raise SystemExit(1)


if __name__ == "__main__":
    main()
