"""Daily NAV adapters for Bangladesh's asset managers.

BSEC publishes the fund registry, not a central daily NAV feed: every asset
manager publishes its own NAV in a different shape. This job keeps one adapter
per manager and normalises the result to:

    funds.<amc>.<fund>.nav          headline NAV per unit (BDT)
    funds.<amc>.<fund>.nav_cost     NAV at cost, where the manager prints both
    funds.<amc>.<fund>.market_price buy/sale price, where it differs from NAV

Sources are public HTML tables, public PDFs and two public JSON endpoints
(LankaBangla, UCB). Each adapter is deliberately narrow: if a page changes
shape it returns no rows, the file counts as a parse failure, and the run fails
when *every* source is empty. A partial source failure is visible through
`funds.amc_nav.managers`, the number of managers that answered.
"""
from __future__ import annotations

import io
import json
import re
from dataclasses import dataclass
from datetime import date

import pdfplumber
from bs4 import BeautifulSoup

from ingestion import http_client
from ingestion.bb_tables import clean_label, slugify
from ingestion.catalog import ensure_series
from ingestion.framework import FetchedFile, IngestionJob, Record

# ---------------------------------------------------------------------------
# Shared parsers
# ---------------------------------------------------------------------------

_MONTHS = {
    m: i + 1
    for i, m in enumerate(
        ["jan", "feb", "mar", "apr", "may", "jun",
         "jul", "aug", "sep", "oct", "nov", "dec"]
    )
}


def _mkdate(year: object, month: object, day: object) -> date | None:
    try:
        y = int(str(year))
        if y < 100:
            y += 2000 if y < 70 else 1900
        m = int(str(month)) if str(month).isdigit() else _MONTHS.get(str(month)[:3].lower())
        d = int(str(day))
        if not m:
            return None
        return date(y, m, d)
    except (TypeError, ValueError):
        return None


def parse_date(raw: object) -> date | None:
    """Parse the date spellings used by the AMC pages (ISO, 29-Oct-26,
    October 29 2026, 29/10/2026, ...)."""
    s = clean_label(str(raw or ""))
    if not s:
        return None
    s = re.sub(r"(\d)(?:st|nd|rd|th)\b", r"\1", s, flags=re.IGNORECASE)
    m = re.search(r"\b(\d{4})-(\d{1,2})-(\d{1,2})\b", s)
    if m:
        return _mkdate(m.group(1), m.group(2), m.group(3))
    m = re.search(r"\b(\d{1,2})[\s./-]+([A-Za-z]{3,9}|\d{1,2})[\s.,/-]+(\d{2,4})\b", s)
    if m:
        return _mkdate(m.group(3), m.group(2), m.group(1))
    m = re.search(r"\b([A-Za-z]{3,9})\.?[\s/-]+(\d{1,2})[\s,./-]+(\d{2,4})\b", s)
    if m:
        return _mkdate(m.group(3), m.group(1), m.group(2))
    return None


def _num(raw: object) -> float | None:
    if raw is None:
        return None
    s = clean_label(str(raw))
    s = (s.replace(",", "").replace("৳", "")
          .replace("BDT", "").replace("Tk.", "").replace("Tk", ""))
    m = re.search(r"-?\d+(?:\.\d+)?", s)
    if not m:
        return None
    try:
        return float(m.group(0))
    except ValueError:
        return None


def _tables(html: bytes) -> list[list[list[str]]]:
    soup = BeautifulSoup(html, "lxml")
    out = []
    for table in soup.find_all("table"):
        rows = []
        for tr in table.find_all("tr"):
            cells = [clean_label(c.get_text(" ", strip=True)) for c in tr.find_all(["td", "th"])]
            if cells:
                rows.append(cells)
        out.append(rows)
    return out


def _text(html: bytes) -> str:
    return " ".join(BeautifulSoup(html, "lxml").get_text(" ", strip=True).split())


def _differs(a: float | None, b: float | None) -> bool:
    return a is not None and b is not None and abs(a - b) > 1e-9


@dataclass
class NavRow:
    fund: str
    when: date
    nav: float | None
    nav_cost: float | None = None
    market_price: float | None = None


# ---------------------------------------------------------------------------
# Adapters
# ---------------------------------------------------------------------------

class Adapter:
    slug: str
    manager: str
    url: str = ""
    frequency: str = "daily"

    def fetch(self) -> list[FetchedFile]:
        raise NotImplementedError

    def parse(self, f: FetchedFile) -> list[NavRow]:
        raise NotImplementedError

    def file(self, name: str, content: bytes) -> FetchedFile:
        return FetchedFile(f"{self.slug}__{name}", content, date.today())


class LrGlobalAdapter(Adapter):
    """LR Global's six funds publish a weekly NAV history PDF each."""

    slug = "lrglobal"
    manager = "LR Global Bangladesh Asset Management"
    frequency = "weekly"
    url = "https://www.lrglobalbd.com/funds/"
    funds = {
        "DBH1STMF": "DBH First Mutual Fund",
        "GREENDELMF": "Green Delta Mutual Fund",
        "AIBL1STIMF": "AIBL 1st Islamic Mutual Fund",
        "MBL1STMF": "MBL 1st Mutual Fund",
        "LRGLOBMF1": "LR Global Bangladesh Mutual Fund One",
        "NCCBLMF1": "NCCBL Mutual Fund-1",
    }

    def fetch(self) -> list[FetchedFile]:
        out = []
        for code in self.funds:
            url = f"http://lrglobalbd.com/wp-content/docs/NAV/{code}_NAV.pdf"
            content = http_client.get(url, timeout=120).content
            if content[:4] != b"%PDF":
                raise ValueError(f"{code}: not a PDF")
            out.append(self.file(f"{code}.pdf", content))
        return out

    def parse(self, f: FetchedFile) -> list[NavRow]:
        code = f.filename.split("__", 1)[1].split(".")[0]
        fund = self.funds.get(code)
        if not fund:
            return []
        rows = []
        with pdfplumber.open(io.BytesIO(f.content)) as pdf:
            for page in pdf.pages:
                for line in (page.extract_text() or "").splitlines():
                    m = re.match(r"^(\d{1,2}-[A-Za-z]{3}-\d{2})\s+([\d,]+\.\d+)", line.strip())
                    if not m:
                        continue
                    when, nav = parse_date(m.group(1)), _num(m.group(2))
                    if when and nav and nav > 0:
                        rows.append(NavRow(fund, when, nav))
        return rows


class NamAdapter(Adapter):
    """National Asset Management publishes one weekly NAV table per fund."""

    slug = "nam"
    manager = "National Asset Management"
    frequency = "weekly"
    url = "https://www.nambd.com/Weekly_NAV.html"
    fund = "NAM IBBL Islamic Unit Fund"

    def fetch(self) -> list[FetchedFile]:
        return [self.file("weekly.html", http_client.get(self.url, timeout=60).content)]

    def parse(self, f: FetchedFile) -> list[NavRow]:
        today = date.today()
        rows = []
        for table in _tables(f.content):
            for cells in table:
                if len(cells) < 6 or cells[0].lower() == "sl.":
                    continue
                when = parse_date(cells[1])
                # The publisher has a typo (October 28, 2028). Never invent a
                # future point; the next day's row still covers that date.
                if when is None or when > today:
                    continue
                nav = _num(cells[3])
                if nav is None:
                    continue
                cost = _num(cells[2])
                buy = _num(cells[4])
                rows.append(NavRow(
                    self.fund, when, nav,
                    nav_cost=cost if _differs(cost, nav) else None,
                    market_price=buy if _differs(buy, nav) else None,
                ))
        return rows


class SandhaniAdapter(Adapter):
    slug = "sandhani"
    manager = "Sandhani Asset Management"
    url = "https://sandhaniaml.com/allnavdata"
    pages = {
        "all": "https://sandhaniaml.com/allnavdata",
        "shariah": "https://sandhaniaml.com/sandhanishariahfund",
    }

    def fetch(self) -> list[FetchedFile]:
        return [self.file(f"{key}.html", http_client.get(url, timeout=60).content)
                for key, url in self.pages.items()]

    @staticmethod
    def _fund(raw: str) -> str:
        low = raw.lower()
        if "shariah" in low:
            return "Sandhani AML SLFL Shariah Fund"
        return "Sandhani AML SLIC Fixed Income Fund"

    def parse(self, f: FetchedFile) -> list[NavRow]:
        rows = []
        for table in _tables(f.content):
            for cells in table:
                if len(cells) < 3 or cells[0].lower().startswith("fund name"):
                    continue
                when, nav = parse_date(cells[1]), _num(cells[2])
                if when is None or nav is None:
                    continue
                buy = _num(cells[3]) if len(cells) > 3 else None
                rows.append(NavRow(self._fund(cells[0]), when, nav,
                                   market_price=buy if _differs(buy, nav) else None))
        return rows


class EdgeAdapter(Adapter):
    slug = "edge"
    manager = "EDGE AMC"
    url = "https://www.edgeamc.com/nav"
    funds = [
        "EDGE Bangladesh Mutual Fund",
        "EDGE AMC Growth Fund",
        "EDGE High Quality Income Fund",
        "EDGE Al-Amin Shariah Consumer Fund",
    ]

    def fetch(self) -> list[FetchedFile]:
        return [self.file("nav.html", http_client.get(self.url, timeout=60).content)]

    def parse(self, f: FetchedFile) -> list[NavRow]:
        text = _text(f.content)
        m = re.search(r"As on\s+(\d{1,2}\s+[A-Za-z]+\s+\d{4})", text)
        when = parse_date(m.group(1)) if m else None
        if when is None:
            return []
        body = text[m.end():] if m else text
        stop = body.find("Call us")
        if stop > 0:
            body = body[:stop]
        rows = []
        for fund in self.funds:
            mm = re.search(re.escape(fund) + r"\s+([\d.,]+)", body)
            nav = _num(mm.group(1)) if mm else None
            if nav:
                rows.append(NavRow(fund, when, nav))
        return rows


class IdlcAdapter(Adapter):
    slug = "idlc"
    manager = "IDLC Asset Management"
    url = "https://idlcamc.com/nav"

    def fetch(self) -> list[FetchedFile]:
        return [self.file("nav.html", http_client.get(self.url, timeout=60).content)]

    def parse(self, f: FetchedFile) -> list[NavRow]:
        rows = []
        for table in _tables(f.content):
            for cells in table:
                if len(cells) < 4 or cells[0].lower() == "fund name":
                    continue
                when, nav = parse_date(cells[1]), _num(cells[3])
                if when is None or nav is None:
                    continue
                cost = _num(cells[2])
                buy = _num(cells[4]) if len(cells) > 4 else None
                rows.append(NavRow(
                    cells[0], when, nav,
                    nav_cost=cost if _differs(cost, nav) else None,
                    market_price=buy if _differs(buy, nav) else None,
                ))
        return rows


class ImpressAdapter(Adapter):
    slug = "impress"
    manager = "Impress Capital"
    url = "https://impresscapital.com/"
    pages = {
        "inctl": ("https://impresscapital.com/icl-inctl-sf.php", "ICL INCTL Shariah Fund"),
        "esquire": ("https://impresscapital.com/esq-icl-af.php", "Esquire ICL Apparel Fund"),
        "bcb": ("https://impresscapital.com/bcb-icl-gf.php", "BCB ICL Growth Fund"),
        "balanced": ("https://impresscapital.com/icl-bf.php", "ICL Balanced Fund"),
    }

    def fetch(self) -> list[FetchedFile]:
        return [self.file(f"{key}.html", http_client.get(url, timeout=60).content)
                for key, (url, _) in self.pages.items()]

    def parse(self, f: FetchedFile) -> list[NavRow]:
        key = f.filename.split("__", 1)[1].split(".")[0]
        fund = self.pages.get(key, (None, None))[1]
        if not fund:
            return []
        rows = []
        for table in _tables(f.content):
            for cells in table:
                if len(cells) < 5:
                    continue
                when, nav = parse_date(cells[0]), _num(cells[1])
                if when is None or nav is None:
                    continue
                cost = _num(cells[2])
                buy = _num(cells[3])
                rows.append(NavRow(
                    fund, when, nav,
                    nav_cost=cost if _differs(cost, nav) else None,
                    market_price=buy if _differs(buy, nav) else None,
                ))
        return rows


class CapitecAdapter(Adapter):
    slug = "capitec"
    manager = "Capitec Asset Management"
    url = "https://www.capitecbd.com/nav/open-end"
    pages = {
        "open": "https://www.capitecbd.com/nav/open-end",
        "close": "https://www.capitecbd.com/nav/close-end",
        "padma": "https://www.capitecbd.com/fund/capitec-padma-p-f-shariah-unit-fund/",
        "popular": "https://www.capitecbd.com/fund/capitec-popular-life-unit-fund/",
        "ibbl": "https://www.capitecbd.com/fund/capitec-ibbl-shariah-unit-fund/",
        "grameen": "https://www.capitecbd.com/fund/capitec-grameen-bank-growth-fund/",
    }
    names = {
        "padma": "Capitec Padma P. F. Shariah Unit Fund",
        "popular": "Capitec Popular Life Unit Fund",
        "ibbl": "Capitec IBBL Shariah Unit Fund",
        "grameen": "Capitec Grameen Bank Growth Fund",
    }

    def fetch(self) -> list[FetchedFile]:
        return [self.file(f"{key}.html", http_client.get(url, timeout=60).content)
                for key, url in self.pages.items()]

    def parse(self, f: FetchedFile) -> list[NavRow]:
        key = f.filename.split("__", 1)[1].split(".")[0]
        name = self.names.get(key, "")
        rows = []
        for table in _tables(f.content):
            if not table:
                continue
            header = [c.lower() for c in table[0]]

            def pick(*needles: str, exclude: tuple[str, ...] = ()) -> int | None:
                for i, h in enumerate(header):
                    if all(n in h for n in needles) and not any(x in h for x in exclude):
                        return i
                return None

            date_idx = pick("date")
            nav_idx = (pick("per unit at mv") or pick("at mkt")
                       or pick("nav per unit", exclude=("cost",)))
            cost_idx = pick("per unit at cost") or pick("at cost")
            buy_idx = pick("buy")
            if date_idx is None or nav_idx is None:
                continue
            for cells in table[1:]:
                if len(cells) <= max(date_idx, nav_idx):
                    continue
                when = parse_date(cells[date_idx])
                nav = _num(cells[nav_idx])
                if when is None or nav is None:
                    continue
                fund = cells[0] if key in ("open", "close") else name
                if not fund:
                    continue
                cost = _num(cells[cost_idx]) if cost_idx is not None and len(cells) > cost_idx else None
                buy = _num(cells[buy_idx]) if buy_idx is not None and len(cells) > buy_idx else None
                rows.append(NavRow(
                    fund, when, nav,
                    nav_cost=cost if _differs(cost, nav) else None,
                    market_price=buy if _differs(buy, nav) else None,
                ))
        return rows


class MblAdapter(Adapter):
    slug = "mbl"
    manager = "MBL Asset Management"
    url = "https://mblamlbd.com/our-fund/net-asset-value"
    fund = "Mercantile Bank Unit Fund"

    def fetch(self) -> list[FetchedFile]:
        return [self.file("nav.html", http_client.get(self.url, timeout=60).content)]

    def parse(self, f: FetchedFile) -> list[NavRow]:
        rows = []
        for table in _tables(f.content):
            for cells in table:
                if len(cells) < 2 or cells[0].lower() == "nav as on":
                    continue
                when, nav = parse_date(cells[0]), _num(cells[1])
                if when is None or nav is None:
                    continue
                buy = _num(cells[2]) if len(cells) > 2 else None
                rows.append(NavRow(self.fund, when, nav,
                                   market_price=buy if _differs(buy, nav) else None))
        return rows


class LankaBanglaAdapter(Adapter):
    slug = "lankabangla"
    manager = "LankaBangla Asset Management"
    url = "https://lbamcl.com/nav/"
    api = "https://lbamcl.com/api/include/classes/frontend/getnav.php?action=history"
    funds = {
        "1": "LankaBangla 1st Balanced Unit Fund",
        "5": "LankaBangla Al Arafah Shariah Unit Fund",
        "6": "LB Gratuity Opportunities Fund",
        "7": "LB Gratuity Wealth Builder Fund",
        "8": "LankaBangla Fixed Income Fund",
    }

    def fetch(self) -> list[FetchedFile]:
        out = []
        for fid in self.funds:
            resp = http_client.post(
                self.api,
                data={"fund_name": fid, "from_date": "2016-01-01",
                      "to_date": date.today().isoformat()},
                timeout=90,
            )
            out.append(self.file(f"fund{fid}.json", resp.content))
        return out

    def parse(self, f: FetchedFile) -> list[NavRow]:
        payload = json.loads(f.content)
        rows = []
        for row in payload.get("data", []):
            if len(row) < 4:
                continue
            fund = clean_label(row[0])
            when, nav = parse_date(row[2]), _num(row[3])
            if when is None or nav is None or not fund:
                continue
            buy = _num(row[4]) if len(row) > 4 else None
            rows.append(NavRow(fund, when, nav,
                               market_price=buy if _differs(buy, nav) else None))
        return rows


class RaceAdapter(Adapter):
    slug = "race"
    manager = "Bangladesh RACE Asset Management"
    url = "http://www.racebd.com/"

    def fetch(self) -> list[FetchedFile]:
        return [self.file("home.html", http_client.get(self.url, timeout=60).content)]

    def parse(self, f: FetchedFile) -> list[NavRow]:
        text = _text(f.content)
        m = re.search(r"calculated as of date:\s*(\d{1,2}\s+[A-Za-z]+,?\s+\d{4})", text)
        when = parse_date(m.group(1)) if m else None
        if when is None:
            return []
        tables = _tables(f.content)
        rows = []
        # Closed-end: name, inception, fund size, NAV at cost, NAV at market,
        # NAV/unit at cost, NAV/unit at market.
        for table in tables:
            for cells in table:
                if len(cells) < 7 or cells[0].lower() == "mutual fund":
                    continue
                nav, cost = _num(cells[6]), _num(cells[5])
                if nav is None:
                    continue
                # Open-end table: name, NAV at cost, NAV at market, NAV/unit at
                # cost, NAV/unit at market, buy, sale, action.
                if cells[0].lower().startswith("race "):
                    nav, cost = _num(cells[4]), _num(cells[3])
                    buy = _num(cells[5]) if len(cells) > 5 else None
                else:
                    buy = None
                rows.append(NavRow(
                    cells[0], when, nav,
                    nav_cost=cost if _differs(cost, nav) else None,
                    market_price=buy if _differs(buy, nav) else None,
                ))
        return rows


class CapmAdapter(Adapter):
    slug = "capm"
    manager = "CAPM (Capital & Asset Portfolio Management)"
    url = "https://www.capmbd.com/"
    pages = {
        "cuf": ("https://www.capmbd.com/home/mutual/cuf", "CAPM Unit Fund"),
        "mf": ("https://www.capmbd.com/home/mutual/mf", "CAPM BDBL Mutual Fund 01"),
        "icuf": ("https://www.capmbd.com/home/mutual/icuf", "CAPM IBBL Islamic Mutual Fund"),
    }

    def fetch(self) -> list[FetchedFile]:
        return [self.file(f"{key}.html", http_client.get(url, timeout=90).content)
                for key, (url, _) in self.pages.items()]

    def parse(self, f: FetchedFile) -> list[NavRow]:
        key = f.filename.split("__", 1)[1].split(".")[0]
        fund = self.pages.get(key, (None, None))[1]
        if not fund:
            return []
        rows = []
        for table in _tables(f.content):
            for cells in table:
                if len(cells) < 5 or not cells[0].lower().startswith("date of calculation"):
                    continue
                for row in table[1:]:
                    if len(row) < 5:
                        continue
                    when = parse_date(row[0])
                    cost_total, mv_total = _num(row[1]), _num(row[2])
                    cost_unit, mv_unit = _num(row[3]), _num(row[4])
                    # CAPM swapped the total and per-unit columns on a couple of
                    # dates (2024-05-09, 2021-11-04). Detect the magnitude flip
                    # rather than publishing a 461-million-taka "NAV per unit".
                    if (cost_unit is not None and cost_total is not None
                            and cost_unit > cost_total * 10):
                        cost_unit, cost_total = cost_total, cost_unit
                        mv_unit, mv_total = mv_total, mv_unit
                    nav = mv_unit
                    if when is None or nav is None:
                        continue
                    cost = cost_unit
                    buy = _num(row[5]) if len(row) > 5 else None
                    rows.append(NavRow(
                        fund, when, nav,
                        nav_cost=cost if _differs(cost, nav) else None,
                        market_price=buy if _differs(buy, nav) else None,
                    ))
                break
        if rows:
            return rows
        text = _text(f.content)
        m = re.search(r"Fund's NAV as on\s*:?\s*(\d{1,2}-[A-Za-z]{3}-\d{4})", text)
        when = parse_date(m.group(1)) if m else None
        nav_m = re.search(r"NAV/ ?Unit at MV\s*:?\s*BDT\s*([\d,.]+)", text)
        cost_m = re.search(r"NAV/ ?Unit at Cost\s*:?\s*BDT\s*([\d,.]+)", text)
        nav = _num(nav_m.group(1)) if nav_m else None
        cost = _num(cost_m.group(1)) if cost_m else None
        if when and nav:
            rows.append(NavRow(fund, when, nav, nav_cost=cost if _differs(cost, nav) else None))
        return rows


class VipbAdapter(Adapter):
    slug = "vipb"
    manager = "VIPB Asset Management"
    url = "https://vipbamc.com/"
    pages = {
        "sebl": ("https://vipbamc.com/fund/vipb-sebl-1st-unit-fund", "VIPB SEBL 1st Unit Fund"),
        "nli": ("https://vipbamc.com/fund/vipb-nli-1st-unit-fund", "VIPB NLI 1st Unit Fund"),
        "accelerated": ("https://vipbamc.com/fund/vipb-accelerated-income-unit-fund", "VIPB Accelerated Income Unit Fund"),
        "growth": ("https://vipbamc.com/fund/vipb-growth-fund", "VIPB Growth Fund"),
        "balanced": ("https://vipbamc.com/fund/vipb-balanced-fund", "VIPB Balanced Fund"),
        "fixed": ("https://vipbamc.com/fund/vipb-fixed-income-fund", "VIPB Fixed Income Fund"),
    }

    def fetch(self) -> list[FetchedFile]:
        return [self.file(f"{key}.html", http_client.get(url, timeout=60).content)
                for key, (url, _) in self.pages.items()]

    def parse(self, f: FetchedFile) -> list[NavRow]:
        key = f.filename.split("__", 1)[1].split(".")[0]
        fund = self.pages.get(key, (None, None))[1]
        if not fund:
            return []
        text = _text(f.content)
        m = re.search(r"Figures as of\s+(\d{1,2}\s+[A-Za-z]+\s+\d{4})", text)
        when = parse_date(m.group(1)) if m else None
        if when is None:
            return []
        nav = None
        for table in _tables(f.content):
            for cells in table:
                if len(cells) >= 2 and cells[0].lower().startswith("net asset value"):
                    nav = _num(cells[1])
                    break
            if nav is not None:
                break
        return [NavRow(fund, when, nav)] if nav else []


class EkushAdapter(Adapter):
    slug = "ekush"
    manager = "Ekush Wealth Management"
    url = "https://ekushwml.com/"
    pages = {
        "first": ("https://ekushwml.com/fund/first-unit-fund", "Ekush First Unit Fund"),
        "growth": ("https://ekushwml.com/fund/growth-fund", "Ekush Growth Fund"),
        "stable": ("https://ekushwml.com/fund/stable-return-fund", "Ekush Stable Return Fund"),
    }

    def fetch(self) -> list[FetchedFile]:
        return [self.file(f"{key}.html", http_client.get(url, timeout=60).content)
                for key, (url, _) in self.pages.items()]

    def parse(self, f: FetchedFile) -> list[NavRow]:
        key = f.filename.split("__", 1)[1].split(".")[0]
        fund = self.pages.get(key, (None, None))[1]
        if not fund:
            return []
        rows = []
        for table in _tables(f.content):
            for cells in table:
                if len(cells) < 4 or cells[0].lower() != "nav as on":
                    continue
                for row in table[1:]:
                    if len(row) < 2:
                        continue
                    when, nav = parse_date(row[0]), _num(row[1])
                    if when is None or nav is None:
                        continue
                    buy = _num(row[2]) if len(row) > 2 else None
                    rows.append(NavRow(fund, when, nav,
                                       market_price=buy if _differs(buy, nav) else None))
                break
        return rows


class ShantaAdapter(Adapter):
    slug = "shanta"
    manager = "Shanta Asset Management"
    url = "https://www.shanta-aml.com/our-funds"
    pages = {
        "first": ("https://www.shanta-aml.com/our-funds/shanta-first-income-unit-fund",
                  "Shanta First Income Unit Fund"),
        "amanah": ("https://www.shanta-aml.com/our-funds/shanta-amanah-shariah-fund",
                   "Shanta Amanah Shariah Fund"),
        "fixed": ("https://www.shanta-aml.com/our-funds/shanta-fixed-income-fund",
                  "Shanta Fixed Income Fund"),
    }

    def fetch(self) -> list[FetchedFile]:
        return [self.file(f"{key}.html", http_client.get(url, timeout=60).content)
                for key, (url, _) in self.pages.items()]

    def parse(self, f: FetchedFile) -> list[NavRow]:
        key = f.filename.split("__", 1)[1].split(".")[0]
        fund = self.pages.get(key, (None, None))[1]
        if not fund:
            return []
        rows = []
        for table in _tables(f.content):
            for cells in table:
                if len(cells) < 2:
                    continue
                if "nav" not in cells[0].lower() and "nav" not in cells[1].lower():
                    continue
                for row in table[1:]:
                    if len(row) < 2:
                        continue
                    when, nav = parse_date(row[0]), _num(row[1])
                    if when is None or nav is None:
                        continue
                    buy = _num(row[2]) if len(row) > 2 else None
                    rows.append(NavRow(fund, when, nav,
                                       market_price=buy if _differs(buy, nav) else None))
                break
        return rows


class InvestitAdapter(Adapter):
    slug = "investit"
    manager = "Investit Asset Management"
    url = "https://www.investitaml.com/funds"
    fund = "Investit Growth Fund"

    def fetch(self) -> list[FetchedFile]:
        return [self.file("funds.html", http_client.get(self.url, timeout=60).content)]

    def parse(self, f: FetchedFile) -> list[NavRow]:
        rows = []
        for table in _tables(f.content):
            for cells in table:
                if len(cells) < 2 or cells[0].lower() == "date":
                    continue
                when, nav = parse_date(cells[0]), _num(cells[1])
                if when and nav:
                    rows.append(NavRow(self.fund, when, nav))
        return rows


class UcbAdapter(Adapter):
    slug = "ucb"
    manager = "UCB Asset Management"
    url = "https://ucbasset.com/"
    api = "https://admin.ucbasset.com/api/navs"
    products = {
        "UCB AML": "UCB AML First Mutual Fund",
        "UCB Taqwa": "UCB Taqwa Growth Fund",
        "UCB INCOME": "UCB Income Plus Fund",
    }

    def fetch(self) -> list[FetchedFile]:
        out = []
        for product, fund in self.products.items():
            page = 1
            while True:
                url = (f"{self.api}?populate=*&filters[fund][product_type]={product}"
                       f"&sort=date:DESC&pagination[pageSize]=1000&pagination[page]={page}")
                resp = http_client.get(url, timeout=90)
                payload = resp.json()
                out.append(self.file(f"{slugify(product)}-{page}.json", resp.content))
                pages = payload.get("meta", {}).get("pagination", {}).get("pageCount", 1)
                if page >= pages:
                    break
                page += 1
        return out

    def parse(self, f: FetchedFile) -> list[NavRow]:
        payload = json.loads(f.content)
        rows = []
        for item in payload.get("data", []):
            attrs = item.get("attributes", {})
            fund_data = (attrs.get("fund") or {}).get("data") or {}
            fund_attrs = fund_data.get("attributes", {})
            product = fund_attrs.get("product_type", "")
            fund = self.products.get(product)
            when = parse_date(attrs.get("date"))
            nav = _num(attrs.get("market_price"))
            if not fund or when is None or nav is None:
                continue
            buy = _num(attrs.get("buy"))
            rows.append(NavRow(fund, when, nav,
                               market_price=buy if _differs(buy, nav) else None))
        return rows


class GreenDeltaAdapter(Adapter):
    slug = "greendelta"
    manager = "Green Delta Dragon Asset Management"
    url = "https://greendeltadragon.com/green-delta-dragon-enhanced-blue-chip-growth-fund/"
    fund = "Green Delta Dragon Enhanced Blue Chip Growth Fund"

    def fetch(self) -> list[FetchedFile]:
        return [self.file("fund.html", http_client.get(self.url, timeout=60).content)]

    def parse(self, f: FetchedFile) -> list[NavRow]:
        html = f.content.decode("utf-8", errors="replace")
        for m in re.finditer(r'"visualizer-\d+-\d+":\{', html):
            start = m.start() + len(m.group(0)) - 1
            try:
                chart, _ = json.JSONDecoder().raw_decode(html[start:])
            except ValueError:
                continue
            labels = [s.get("label") for s in chart.get("series", [])]
            if "Nav Per Unit" not in labels:
                continue
            idx = labels.index("Nav Per Unit")
            rows = []
            for row in chart.get("data", []):
                if len(row) <= idx:
                    continue
                when, nav = parse_date(str(row[0])), _num(row[idx])
                if when and nav:
                    rows.append(NavRow(self.fund, when, nav))
            if rows:
                return rows
        return []


class PrimeAdapter(Adapter):
    slug = "prime"
    manager = "Prime Finance Asset Management"
    url = "https://www.pamcbd.com/"
    pages = {
        "pffuf": ("https://www.pamcbd.com/pffuf_rates.htm", "Prime Financial First Unit Fund"),
        "rlimf": ("https://www.pamcbd.com/rlimf_rates.htm", "Rupali Life Insurance First Mutual Fund"),
        "pf2mf": ("https://www.pamcbd.com/pf2mf_rates.htm", "Prime Finance Second Mutual Fund"),
    }

    def fetch(self) -> list[FetchedFile]:
        return [self.file(f"{key}.html", http_client.get(url, timeout=60).content)
                for key, (url, _) in self.pages.items()]

    def parse(self, f: FetchedFile) -> list[NavRow]:
        key = f.filename.split("__", 1)[1].split(".")[0]
        fund = self.pages.get(key, (None, None))[1]
        if not fund:
            return []
        text = _text(f.content)
        cost = re.search(r"NAV at Cost Price as(?: on)?\s+(\d{1,2}\s+[A-Za-z]+\s+\d{4})\s+([\d.]+)", text)
        market = re.search(r"NAV at Market Price as(?: on)?\s+(\d{1,2}\s+[A-Za-z]+\s+\d{4})\s+([\d.]+)", text)
        if not market:
            return []
        when = parse_date(market.group(1))
        nav = _num(market.group(2))
        if when is None or nav is None:
            return []
        nav_cost = _num(cost.group(2)) if cost else None
        sale = re.search(r"Sale Price:\s*([\d.]+)", text)
        buy = _num(sale.group(1)) if sale else None
        return [NavRow(
            fund, when, nav,
            nav_cost=nav_cost if _differs(nav_cost, nav) else None,
            market_price=buy if _differs(buy, nav) else None,
        )]


class CandleStoneAdapter(Adapter):
    slug = "candlestone"
    manager = "CandleStone Investments Partner"
    url = "https://www.csrbgf.com/"
    fund = "CandleStone Rupali Bank Growth Fund"

    def fetch(self) -> list[FetchedFile]:
        return [self.file("nav.html", http_client.get(self.url, timeout=60).content)]

    def parse(self, f: FetchedFile) -> list[NavRow]:
        rows = []
        for table in _tables(f.content):
            for cells in table:
                if len(cells) < 4 or cells[0].lower() == "fund name":
                    continue
                when = parse_date(cells[1])
                nav = _num(cells[3])
                if when is None or nav is None:
                    continue
                cost = _num(cells[2])
                buy = _num(cells[4]) if len(cells) > 4 else None
                rows.append(NavRow(
                    self.fund, when, nav,
                    nav_cost=cost if _differs(cost, nav) else None,
                    market_price=buy if _differs(buy, nav) else None,
                ))
        return rows


# ---------------------------------------------------------------------------
# Job
# ---------------------------------------------------------------------------

class AmcNavJob(IngestionJob):
    name = "amc_nav"
    source = "AMC"

    adapters = [
        LrGlobalAdapter(), NamAdapter(), SandhaniAdapter(), EdgeAdapter(),
        IdlcAdapter(), ImpressAdapter(), CapitecAdapter(), MblAdapter(),
        LankaBanglaAdapter(), RaceAdapter(), CapmAdapter(), VipbAdapter(),
        EkushAdapter(), ShantaAdapter(), InvestitAdapter(), UcbAdapter(),
        GreenDeltaAdapter(), PrimeAdapter(), CandleStoneAdapter(),
    ]

    def fetch(self, backfill: bool = False) -> list[FetchedFile]:
        files: list[FetchedFile] = []
        errors: list[str] = []
        ok = 0
        for adapter in self.adapters:
            try:
                got = adapter.fetch()
                if not got:
                    raise ValueError("no files")
                files.extend(got)
                ok += 1
            except Exception as exc:  # noqa: BLE001 - one source must not sink the rest
                errors.append(f"{adapter.slug}: {exc}")
        self._managers_ok = ok
        if not files:
            raise RuntimeError("all AMC NAV sources failed: " + "; ".join(errors[:4]))
        if errors:
            import logging
            logging.getLogger("bangladata.ingest").warning(
                "amc_nav: %d/%d managers failed (%s)",
                len(errors), len(self.adapters), "; ".join(errors[:3]),
            )
        return files

    def parse(self, f: FetchedFile) -> list[Record]:
        slug = f.filename.split("__", 1)[0]
        adapter = next((a for a in self.adapters if a.slug == slug), None)
        if adapter is None:
            return []
        rows = adapter.parse(f)
        if not rows:
            raise ValueError(f"{f.filename}: no NAV rows")
        records = self._records(adapter, rows)
        records.append(self._manager_record())
        return records

    def _manager_record(self) -> Record:
        sid = "funds.amc_nav.managers"
        if not getattr(self, "_manager_series_ready", False):
            ensure_series([{
                "id": sid, "module": "funds",
                "name": "AMC NAV sources answering",
                "description": "Number of asset-manager NAV adapters that returned data on this run.",
                "unit": "count", "frequency": "daily", "source": "AMC",
                "source_url": "https://www.sec.gov.bd/fund-managers",
                "dimensions": {}, "min_value": 0, "max_value": 100,
                "max_step": None, "tier": "basic",
            }])
            self._manager_series_ready = True
        return Record(sid, date.today(), float(getattr(self, "_managers_ok", len(self.adapters))), {})

    def _records(self, adapter: Adapter, rows: list[NavRow]) -> list[Record]:
        catalog: dict[str, dict] = {}
        records: list[Record] = []
        for row in rows:
            if not row.fund or row.nav is None:
                continue
            fund_slug = slugify(row.fund)
            for suffix, value, label in (
                ("nav", row.nav, "NAV"),
                ("nav_cost", row.nav_cost, "NAV at cost"),
                ("market_price", row.market_price, "market price"),
            ):
                if value is None or value <= 0:
                    continue
                sid = f"funds.{adapter.slug}.{fund_slug}.{suffix}"
                if sid not in catalog:
                    catalog[sid] = {
                        "id": sid, "module": "funds",
                        "name": f"{row.fund} — {label}",
                        "description": (f"{adapter.manager} {label} per unit, BDT, "
                                        f"published on {adapter.url}."),
                        "unit": "bdt", "frequency": adapter.frequency,
                        "source": adapter.manager, "source_url": adapter.url,
                        "dimensions": {"fund": row.fund},
                        "min_value": 0, "max_value": 100_000,
                        "max_step": None, "tier": "basic",
                    }
                records.append(Record(sid, row.when, float(value),
                                      {"fund": row.fund, "amc": adapter.manager}))
        if catalog:
            ensure_series(list(catalog.values()))
        return records
