"""Bangladesh Bank statistical workbooks (current + 1972-2024 historical).

The current Monthly Economic Trends is published as a monthly `.xlsx`
(`et<month><yy>.xlsx`) but F5 sometimes rejects non-browser clients. We try
curl_cffi first, then an optional Chromium download, then the long-lived
`statisticaltable.xlsx` (frozen in 2021 but still useful for the 2009-2021
monthly backfill). The 1972-2024 historical workbook supplies the long annual
history.

Every workbook is parsed through the same declarative table specs used to build
`ingestion/bb_catalog.json`, so unknown columns are ignored rather than written
under invented ids.
"""
from __future__ import annotations

import json
import os
import re
from datetime import date

from ingestion import bb_tables, browser_fetch, http_client
from ingestion.catalog import CORE
from ingestion.framework import FetchedFile, IngestionJob, Record, dedupe_last


def _target_units() -> dict[str, str]:
    units = {}
    path = os.path.join(os.path.dirname(__file__), "..", "bb_catalog.json")
    try:
        with open(path, encoding="utf-8") as f:
            units.update({r["id"]: r.get("unit") or "" for r in json.load(f)})
    except Exception:  # noqa: BLE001
        pass
    units.update({r["id"]: r.get("unit") or "" for r in CORE})
    return units


def _factor(source: str, target: str) -> float:
    """Convert publisher table units into the public catalog unit."""
    if not source or not target or source == target:
        return 1.0
    if source == "bdt_crore" and target == "bdt_bn":
        return 0.01
    if source == "bdt_crore" and target == "bdt_mn":
        return 10.0
    if source == "bdt_mn" and target == "bdt_bn":
        return 0.001
    if source == "bdt_mn" and target == "bdt_crore":
        return 0.1
    if source == "bdt" and target == "bdt_bn":
        return 1e-9
    if source == "usd" and target == "usd_mn":
        return 1e-6
    if source == "usd_mn" and target == "usd_bn":
        return 1e-3
    return 1.0

LATEST_PAGE = "https://www.bb.org.bd/en/index.php/publication/publictn/3/10"


class BbWorkbookJob(IngestionJob):
    name = "bb_workbook"
    source = "BB"

    def _download(self, url: str) -> bytes | None:
        try:
            return http_client.get(url, timeout=120).content
        except Exception:
            return browser_fetch.download(url, timeout_ms=120_000)

    def _latest_workbook_url(self) -> str:
        """Resolve the newest et*.xlsx link from the publications page."""
        try:
            html = http_client.get(LATEST_PAGE, timeout=45).text
        except Exception:
            return ""
        # Links are relative and may contain a double slash.
        links = re.findall(r'href=["\']([^"\']*econtrds/et[a-z0-9]+\.xlsx)["\']', html, re.I)
        if not links:
            return ""
        # Page order is newest first.
        u = links[0]
        if u.startswith("http"):
            return u
        if u.startswith("//"):
            return "https:" + u
        return "https://www.bb.org.bd/" + u.lstrip("/")

    def fetch(self, backfill: bool = False) -> list[FetchedFile]:
        files: list[FetchedFile] = []
        latest_url = self._latest_workbook_url()
        current = self._download(latest_url) if latest_url else None
        if not current or not current.startswith(b"PK"):
            current = self._download(bb_tables.CURRENT_URL)
        if current and current.startswith(b"PK"):
            files.append(FetchedFile("bb_current.xlsx", current, date.today()))

        hist = self._download(bb_tables.HISTORICAL_URL)
        if hist:
            files.append(FetchedFile("bb_historical.xlsx", hist, date.today()))
        return files

    def parse(self, f: FetchedFile) -> list[Record]:
        if f.filename.startswith("bb_historical"):
            _, recs = bb_tables.parse_workbook_bytes(f.content, bb_tables.HISTORICAL_SPECS)
        else:
            _, recs = bb_tables.parse_workbook_bytes(f.content, bb_tables.CURRENT_SPECS)
        units = _target_units()
        out = []
        for r in recs:
            fid = r["series_id"]
            factor = _factor(r.get("unit", ""), units.get(fid, ""))
            value = r["value"] * factor if r["value"] is not None else None
            out.append(Record(
                series_id=fid,
                obs_date=r["obs_date"],
                value=value,
                dims=r.get("dims") or {},
            ))
        return dedupe_last(out)


# A small convenience for tests and for reading an already-downloaded workbook.
def parse_file(path: str, historical: bool = False):
    specs = bb_tables.HISTORICAL_SPECS if historical else bb_tables.CURRENT_SPECS
    return bb_tables.parse_workbook(path, specs)
