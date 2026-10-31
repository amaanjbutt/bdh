"""Bangladesh Bank HTML pages: daily FX, reserves, remittances, rates, money
supply and T-bill/T-bond auction results.

The BB site is server-rendered (no JSON API) and is reachable with a normal
browser fingerprint. These pages carry the freshest data — the advertised
`statisticaltable.xlsx` workbook is frozen at 2021 — so the HTML layer is the
live edge of the macro catalog.
"""
from __future__ import annotations

import re
from datetime import date, datetime

from bs4 import BeautifulSoup

from ingestion import http_client
from ingestion.bb_tables import _parse_period
from ingestion.framework import FetchedFile, IngestionJob, Record

BASE = "https://www.bb.org.bd/en/index.php"
PAGES = {
    "bb_fx.html": f"{BASE}/econdata/exchangerate",
    "bb_reserves.html": f"{BASE}/econdata/intreserve",
    "bb_remittances.html": f"{BASE}/econdata/wageremitance",
    "bb_rates.html": f"{BASE}/econdata/intrate",
    "bb_money.html": f"{BASE}/econdata/moneysupply",
    "bb_auctions.html": f"{BASE}/monetaryactivity/treasury",
}


def _rows(table) -> list[list[str]]:
    out = []
    for tr in table.find_all("tr"):
        cells = [c.get_text(" ", strip=True) for c in tr.find_all(["td", "th"])]
        if cells:
            out.append(cells)
    return out


def _num(s: str) -> float | None:
    s = (s or "").replace(",", "").replace("%", "").strip()
    if not s or s in {"-", "--", "…", "N/A"}:
        return None
    try:
        return float(s)
    except ValueError:
        return None


def _table_with(html: str, *needles: str):
    soup = BeautifulSoup(html, "lxml")
    for t in soup.find_all("table"):
        text = t.get_text(" ", strip=True).lower()
        if all(n.lower() in text for n in needles):
            return _rows(t)
    return []


def _month_records(rows, value_idx: dict[str, int], series: dict[str, str],
                   ctx: dict | None = None) -> list[Record]:
    """Parse rows of the form FY heading / Month | value | value."""
    ctx = ctx or {}
    out = []
    for row in rows:
        if not row:
            continue
        d, kind = _parse_period(row[0], ctx)
        if d is None or kind == "annual":
            continue
        for key, idx in value_idx.items():
            if idx < len(row):
                v = _num(row[idx])
                if v is not None:
                    out.append(Record(series[key], d, v))
    return out


class BbWebJob(IngestionJob):
    name = "bb_web"
    source = "BB"

    def fetch(self, backfill: bool = False) -> list[FetchedFile]:
        files = []
        for filename, url in PAGES.items():
            try:
                content = http_client.get(url, timeout=60).content
            except Exception:
                continue
            files.append(FetchedFile(filename, content, date.today()))
        return files

    def parse(self, f: FetchedFile) -> list[Record]:
        html = f.content.decode("utf-8", errors="replace")
        if f.filename == "bb_fx.html":
            return self._parse_fx(html)
        if f.filename == "bb_reserves.html":
            return self._parse_reserves(html)
        if f.filename == "bb_remittances.html":
            return self._parse_remittances(html)
        if f.filename == "bb_rates.html":
            return self._parse_rates(html)
        if f.filename == "bb_money.html":
            return self._parse_money(html)
        if f.filename == "bb_auctions.html":
            return self._parse_auctions(html)
        return []

    # ---- individual pages -------------------------------------------------

    def _parse_fx(self, html: str) -> list[Record]:
        m = re.search(r"FX Rate Sheet effective for\s*(\d{2})/(\d{2})/(\d{4})", html, re.I)
        d = date(int(m.group(3)), int(m.group(2)), int(m.group(1))) if m else date.today()
        out: list[Record] = []

        usd = _table_with(html, "USD/BDT", "WAR")
        for row in usd:
            if row and row[0].upper() == "USD" and len(row) >= 4:
                for key, idx in (("fx.rate.usd.bid", 1), ("fx.rate.usd.ask", 2), ("fx.rate.usd", 3)):
                    v = _num(row[idx])
                    if v is not None:
                        out.append(Record(key, d, v))

        cross = _table_with(html, "Cross Rates", "Bid Rate", "Ask Rate")
        mapping = {"EUR": "fx.rate.eur", "GBP": "fx.rate.gbp", "INR": "fx.rate.inr",
                   "JPY": "fx.rate.jpy", "CNY": "fx.rate.cny", "CNH": "fx.rate.cny",
                   "SGD": "fx.rate.sgd", "CAD": "fx.rate.cad", "AUD": "fx.rate.aud"}
        for row in cross:
            if not row:
                continue
            code = row[0].upper()
            if code in mapping and len(row) >= 3:
                bid, ask = _num(row[1]), _num(row[2])
                if bid is not None and ask is not None:
                    out.append(Record(mapping[code], d, (bid + ask) / 2))
        return out

    def _parse_reserves(self, html: str) -> list[Record]:
        rows = _table_with(html, "Foreign Exchange Reserves(Gross)", "BPM6")
        return _month_records(rows, {"reserves.gross": 1, "reserves.bpm6": 2},
                              {"reserves.gross": "reserves.gross",
                               "reserves.bpm6": "reserves.bpm6"})

    def _parse_remittances(self, html: str) -> list[Record]:
        rows = _table_with(html, "Remittances", "million US dollar")
        out = []
        ctx: dict = {}
        for row in rows:
            if not row:
                continue
            d, kind = _parse_period(row[0], ctx)
            if d is None or kind == "annual":
                continue
            usd = _num(row[1]) if len(row) > 1 else None
            bdt = _num(row[2]) if len(row) > 2 else None
            if usd is not None:
                out.append(Record("remittances.total.usd", d, usd))
            if bdt is not None:
                out.append(Record("remittances.total.bdt", d, bdt))
        return out

    def _parse_rates(self, html: str) -> list[Record]:
        rows = _table_with(html, "Bank rate", "Call Money", "Deposits", "Advances")
        series = {
            "rates.bank": "rates.bank",
            "rates.call_money": "rates.call_money",
            "rates.deposit": "rates.deposit",
            "rates.lending": "rates.lending",
            "rates.spread": "rates.spread",
        }
        out = []
        ctx: dict = {}
        for row in rows:
            if not row:
                continue
            d, kind = _parse_period(row[0], ctx)
            if d is None or kind == "annual":
                continue
            # 0 month, 1 bank rate, 2 call-money borrowing, 3 call-money lending,
            # 4 deposit, 5 advances, 6 spread
            idx = {"rates.bank": 1, "rates.call_money": 2, "rates.deposit": 4,
                   "rates.lending": 5, "rates.spread": 6}
            for key, i in idx.items():
                if i < len(row):
                    v = _num(row[i])
                    if v is not None:
                        out.append(Record(series[key], d, v))
        return out

    def _parse_money(self, html: str) -> list[Record]:
        soup = BeautifulSoup(html, "lxml")
        table = None
        for t in soup.find_all("table"):
            if "Components" in t.get_text(" ", strip=True) and "Money Supply" in t.get_text(" ", strip=True):
                table = _rows(t)
                break
        if not table:
            return []
        # Header row: Components | Aug, 2026 | Jul, 2026 | Aug, 2025 | ...
        header_i = next((i for i, r in enumerate(table) if r and r[0].lower() == "components"), 0)
        header = table[header_i]
        dates = []
        for h in header[1:4]:
            m = re.match(r"([A-Za-z]{3})[a-z]*\s*,?\s*(\d{4})", h)
            if m:
                month = datetime.strptime(m.group(1), "%b").month
                dates.append(date(int(m.group(2)), month, 1))
            else:
                dates.append(None)
        out = []
        mapping = {
            "currency outside": "monetary.currency_outside_banks",
            "money supply (m1)": "monetary.m1",
            "money supply(m2)": "monetary.m2",
            "money supply (m2)": "monetary.m2",
        }
        for row in table[header_i + 1:]:
            if not row:
                continue
            label = row[0].lower()
            key = next((v for k, v in mapping.items() if k in label), None)
            if not key:
                continue
            for i in range(3):
                if i + 1 < len(row) and dates[i]:
                    v = _num(row[i + 1])
                    if v is not None:
                        # Source table is Taka million; catalog unit is BDT billion.
                        out.append(Record(key, dates[i], v / 1000.0))
        return out

    def _parse_auctions(self, html: str) -> list[Record]:
        rows = _table_with(html, "Issue date", "Cut off yield")
        out: list[Record] = []
        tenor_map = {
            "14 days": ("tbill", "14d", "rates.tbill.14d"),
            "91 days": ("tbill", "91d", "rates.tbill.91d"),
            "182 days": ("tbill", "182d", "rates.tbill.182d"),
            "364 days": ("tbill", "364d", "rates.tbill.364d"),
            "2yr": ("tbond", "2y", "rates.tbond.2y"),
            "3yr": ("tbond", "3y", None),
            "5yr": ("tbond", "5y", "rates.tbond.5y"),
            "10yr": ("tbond", "10y", "rates.tbond.10y"),
            "15yr": ("tbond", "15y", "rates.tbond.15y"),
            "20yr": ("tbond", "20y", "rates.tbond.20y"),
        }
        for row in rows:
            if len(row) < 13 or not re.match(r"\d{2}/\d{2}/\d{4}", row[0]):
                continue
            try:
                d = datetime.strptime(row[0], "%d/%m/%Y").date()
            except ValueError:
                continue
            label = row[3].lower().replace(" ", "")
            meta = None
            for key, val in tenor_map.items():
                if label.startswith(key.replace(" ", "")):
                    meta = val
                    break
            if meta is None:
                continue
            atype, tenor, sid = meta
            cutoff = _num(row[12])
            face = _num(row[5])
            accepted = _num(row[8])
            try:
                from app import db
                db.execute(
                    """INSERT INTO auctions (auction_type, tenor, auction_date, cutoff_yield,
                                             offered_amount, accepted_amount, source)
                       VALUES (%s,%s,%s,%s,%s,%s,'BB')
                       ON CONFLICT (auction_type, tenor, auction_date) DO UPDATE SET
                         cutoff_yield=EXCLUDED.cutoff_yield,
                         offered_amount=EXCLUDED.offered_amount,
                         accepted_amount=EXCLUDED.accepted_amount,
                         revised_at=now()""",
                    (atype, tenor, d, cutoff, face, accepted),
                )
            except Exception:  # noqa: BLE001
                pass
            if sid and cutoff is not None:
                out.append(Record(sid, d, cutoff))
        return out
