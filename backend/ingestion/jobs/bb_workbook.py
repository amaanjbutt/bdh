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
from dataclasses import replace
from datetime import date
from io import BytesIO
from urllib.parse import urljoin, urlsplit
from zipfile import is_zipfile

from bs4 import BeautifulSoup

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
            content = http_client.get(url, timeout=120, retry_transient=True).content
            if is_zipfile(BytesIO(content)):
                return content
        except Exception:
            pass
        content = browser_fetch.download(url, timeout_ms=120_000)
        return content if content and is_zipfile(BytesIO(content)) else None

    def _latest_workbook_url(self) -> str:
        """Resolve the newest et*.xlsx link from the publications page."""
        try:
            html = http_client.get(LATEST_PAGE, timeout=60, retry_transient=True).text
        except Exception:
            return ""
        # The publisher uses unquoted, relative href attributes.
        for link in BeautifulSoup(html, "lxml").select("a[href]"):
            url = urljoin(LATEST_PAGE, link["href"])
            if re.search(r"/econtrds/et[a-z0-9]+\.xlsx$", urlsplit(url).path, re.I):
                return url
        return ""

    def fetch(self, backfill: bool = False) -> list[FetchedFile]:
        files: list[FetchedFile] = []
        hist = self._download(bb_tables.HISTORICAL_URL)
        if hist:
            files.append(FetchedFile("bb_historical.xlsx", hist, date.today()))
        elif backfill:
            self.fetch_warnings.append("Bangladesh Bank historical workbook could not be downloaded")
        if backfill and (legacy := self._download(bb_tables.CURRENT_URL)):
            files.append(FetchedFile("bb_current.xlsx", legacy, date.today()))
        latest_url = self._latest_workbook_url()
        latest = self._download(latest_url) if latest_url else None
        if latest:
            files.append(FetchedFile("bb_latest.xlsx", latest, date.today()))
        else:
            self.fetch_warnings.append("Latest Bangladesh Bank Monthly Economic Trends workbook unavailable")
        return files

    def parse(self, f: FetchedFile) -> list[Record]:
        if f.filename.startswith("bb_historical"):
            _, recs = bb_tables.parse_workbook_bytes(f.content, bb_tables.HISTORICAL_SPECS)
        elif f.filename == "bb_latest.xlsx":
            industry = next(spec for spec in bb_tables.CURRENT_SPECS if spec.sheet == "Table VI")
            # The current issue moved and reorganised several tables. Only use
            # the verified industrial layout from it. bb_web owns live macro IDs.
            _, recs = bb_tables.parse_workbook_bytes(f.content, [industry, replace(industry, sheet="Table VIA")])
            if not recs:
                raise ValueError("Latest Bangladesh Bank workbook has no industrial production observations")
        else:
            _, recs = bb_tables.parse_workbook_bytes(f.content, bb_tables.CURRENT_SPECS)
        units = _target_units()
        out = []
        for r in recs:
            fid = r["series_id"]
            if f.filename == "bb_latest.xlsx" and fid not in units:
                continue
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
