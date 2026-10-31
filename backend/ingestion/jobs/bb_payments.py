"""Bangladesh Bank e-banking / digital-finance and agent-banking workbooks.

One XLSX carries ~22 monthly tables (MFS accounts and transactions, cards,
internet banking, QR, school banking, agent banking). Column headers are
multi-row and publisher-defined, so this job derives catalog rows from the
headers themselves (readable names, count vs BDT-million units).
"""
from __future__ import annotations

import io
import re
from datetime import date

import openpyxl

from ingestion import browser_fetch, http_client
from ingestion.bb_tables import Block, _num, _parse_period, clean_label, column_labels, slugify
from ingestion.catalog import ensure_series
from ingestion.framework import FetchedFile, IngestionJob, Record

DIGITAL_URL = "https://www.bb.org.bd/econdata/fin_digitalfstat/fin_digitalfstat.xlsx"
AGENT_URL = "https://www.bb.org.bd/econdata/agent_banking/agent_timeseries.xlsx"


def _download(url: str) -> bytes | None:
    try:
        content = http_client.get(url, timeout=120).content
        if content[:2] == b"PK":
            return content
    except Exception:
        pass
    return browser_fetch.download(url, timeout_ms=120_000)


def _unit_for(label: str) -> tuple[str, float | None, float | None, float | None]:
    low = label.lower()
    if any(k in low for k in ("amount", "value", "turnover", "deposit", "loan", "balance")):
        return "bdt_mn", 0, 10_000_000, 1_000_000
    return "count", 0, 2_000_000_000, 100_000_000


class BbPaymentsJob(IngestionJob):
    name = "bb_payments"
    source = "BB"

    def fetch(self, backfill: bool = False) -> list[FetchedFile]:
        out = []
        for name, url in (("bb_digital_finance.xlsx", DIGITAL_URL),
                          ("bb_agent_banking.xlsx", AGENT_URL)):
            content = _download(url)
            if content:
                out.append(FetchedFile(name, content, date.today()))
        return out

    def parse(self, f: FetchedFile) -> list[Record]:
        wb = openpyxl.load_workbook(io.BytesIO(f.content), data_only=True)
        records: list[Record] = []
        for ws in wb.worksheets:
            if ws.max_row < 8 or ws.max_column < 2:
                continue
            records.extend(self._parse_sheet(ws, f.filename))
        wb.close()
        return records

    def _parse_sheet(self, ws, filename: str) -> list[Record]:
        # Find the period header row: first cell "Period" or "Year/Month".
        period_row = None
        for r in range(ws.max_row):
            v = clean_label(ws.cell(r + 1, 1).value).lower()
            if v in {"period", "year/month", "month"}:
                period_row = r
                break
        if period_row is None:
            return []
        # Headers usually occupy period_row .. period_row+2; data starts after.
        header_rows = tuple(range(period_row, min(period_row + 3, period_row + 3)))
        data_start = period_row + 3
        block = Block(period_col=0, col_start=1, col_end=ws.max_column,
                      header_rows=header_rows, data_start=data_start)
        labels = column_labels(ws, block)
        sheet_slug = slugify(re.sub(r"\s+", " ", ws.title))
        cat: list[dict] = []
        by_col: dict[int, str] = {}
        used: set[str] = set()
        for col, label in labels:
            if label.lower().startswith("column "):
                continue
            slug = slugify(label)
            sid = f"payments.{sheet_slug}.{slug}"
            if sid in used:
                sid = f"{sid}_{col + 1}"
            used.add(sid)
            unit, lo, hi, step = _unit_for(label)
            cat.append({
                "id": sid, "module": "payments", "name": f"{ws.title} — {label}",
                "description": f"Bangladesh Bank {ws.title}: {label}.",
                "unit": unit, "frequency": "monthly", "source": "BB",
                "source_url": DIGITAL_URL if "digital" in filename else AGENT_URL,
                "dimensions": {}, "min_value": lo, "max_value": hi,
                "max_step": step, "tier": "basic",
            })
            by_col[col] = sid
        if not cat:
            return []
        ensure_series(cat)
        out: list[Record] = []
        ctx: dict = {}
        for r in range(data_start, ws.max_row):
            raw = ws.cell(r + 1, 1).value
            d, kind = _parse_period(raw, ctx)
            if d is None or kind == "annual":
                continue
            for col, sid in by_col.items():
                v = _num(ws.cell(r + 1, col + 1).value)
                if v is not None:
                    out.append(Record(sid, d, v))
        return out
