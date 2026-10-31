"""Bangladesh Bank statistical-workbook parser.

The Bangladesh Bank publishes its *Monthly Economic Trends* as one Excel workbook
(28 statistical tables, ~20 years of monthly history) and a separate historical
workbook (1972 onward). Both are wide matrices with multi-row headers and mixed
annual/monthly periods. This module turns a declarative table spec into tidy
observation records and a catalog of series metadata.

Keeping the spec declarative means the catalog builder (scripts/build_bb_catalog)
and the ingestion job parse exactly the same columns, so a series can never be
ingested under an id that is absent from the catalog.
"""
from __future__ import annotations

import calendar
import re
from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Iterable

import openpyxl

CURRENT_URL = "https://www.bb.org.bd/pub/monthly/econtrds/statisticaltable.xlsx"
HISTORICAL_URL = "https://www.bb.org.bd/econdata/time_series_data1972-2024.xlsx"

MONTHS = {
    "jan": 1, "january": 1, "feb": 2, "february": 2, "mar": 3, "march": 3,
    "apr": 4, "april": 4, "may": 5, "jun": 6, "june": 6, "jul": 7, "july": 7,
    "aug": 8, "august": 8, "sep": 9, "sept": 9, "september": 9, "oct": 10,
    "october": 10, "nov": 11, "november": 11, "dec": 12, "december": 12,
}


def clean_label(v: Any) -> str:
    if v is None:
        return ""
    s = str(v).replace("\u00a0", " ").replace("\u2013", "-").replace("\u2014", "-")
    s = s.replace("\n", " ").replace("\r", " ").replace("\t", " ")
    s = re.sub(r"(?<=[A-Za-z])-\s+(?=[a-z])", "", s)  # Agricul-ture -> Agriculture
    s = re.sub(r"\s+", " ", s).strip(" .:-")
    return s


def slugify(s: str, maxlen: int = 72) -> str:
    s = clean_label(s).lower()
    s = s.replace("&", " and ").replace("%", " pct ")
    s = re.sub(r"[^a-z0-9]+", "_", s).strip("_")
    s = re.sub(r"_+", "_", s)
    if len(s) > maxlen:
        s = s[:maxlen].rstrip("_")
    return s or "value"


def _num(v: Any) -> float | None:
    if v is None:
        return None
    if isinstance(v, bool):
        return None
    if isinstance(v, (int, float, Decimal)):
        return float(v)
    s = str(v).strip().replace(",", "")
    if s in {"", "-", "--", "..", "N/A", "n/a", "�", "*", "—"}:
        return None
    s = s.replace("*", "").strip()
    try:
        return float(s)
    except ValueError:
        return None


@dataclass(frozen=True)
class Block:
    period_col: int = 0              # 0-based
    col_start: int = 1
    col_end: int | None = None
    header_rows: tuple[int, ...] = (2, 3, 4)  # 0-based
    data_start: int = 6              # 0-based
    skip_tokens: tuple[str, ...] = ()
    calendar_years: bool = False     # annual labels are calendar years, not FY


@dataclass(frozen=True)
class SheetSpec:
    sheet: str
    topic: str
    module: str
    unit: str
    frequency: str = "monthly"
    blocks: tuple[Block, ...] = (Block(),)
    source_url: str = CURRENT_URL
    id_overrides: dict[str, str] = field(default_factory=dict)  # header slug -> id
    name_overrides: dict[str, str] = field(default_factory=dict)
    unit_overrides: dict[str, str] = field(default_factory=dict)
    skip_slugs: tuple[str, ...] = ()
    include: tuple[str, ...] | None = None  # only these header slugs
    annual_only: bool = False


def _filled_header(ws, rows: Iterable[int], max_col: int) -> list[list[Any]]:
    """Header rows with merged cells expanded across their range."""
    wanted = list(rows)
    matrix = [[ws.cell(r + 1, c + 1).value for c in range(max_col)] for r in wanted]
    # openpyxl only returns the top-left value of a merged range; fan it out.
    for mr in getattr(ws, "merged_cells", []).ranges:
        min_row, max_row = mr.min_row - 1, mr.max_row - 1
        min_col, max_col_r = mr.min_col - 1, mr.max_col - 1
        val = ws.cell(mr.min_row, mr.min_col).value
        for ri, r in enumerate(wanted):
            if min_row <= r <= max_row:
                for c in range(min_col, max_col_r + 1):
                    if c < max_col:
                        matrix[ri][c] = val
    return matrix


def column_labels(ws, block: Block) -> list[tuple[int, str]]:
    """Return (0-based column, readable header label) for a block."""
    max_col = block.col_end if block.col_end is not None else ws.max_column
    matrix = _filled_header(ws, block.header_rows, max_col)
    out: list[tuple[int, str]] = []
    for c in range(block.col_start, max_col):
        parts: list[str] = []
        for row in matrix:
            raw = row[c] if c < len(row) else None
            if raw is None:
                continue
            s = clean_label(raw)
            if (not s or re.fullmatch(r"\d{1,3}", s) or s.startswith("=")
                    or re.fullmatch(r"[()+ .-]+", s)):
                continue
            if s.lower() in {"period", "end of period", "year/month", "sl no."}:
                continue
            if parts and parts[-1] == s:
                continue
            parts.append(s)
        label = " - ".join(parts) if parts else f"column {c + 1}"
        out.append((c, label))
    return out


_FY = re.compile(r"^(\d{4})\s*-\s*(\d{2,4})")
_YEAR = re.compile(r"^(\d{4})(?:\s*[\(\[].*)?$")
_MONTH = re.compile(r"^([A-Za-z]+)\.?\s*[-/]?\s*['’]?\s*(\d{2,4})?$")
_DATE_PATTERNS = (
    re.compile(r"^(\d{4})-(\d{2})-(\d{2})"),
    re.compile(r"^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$"),
)


def _parse_period(raw: Any, ctx: dict) -> tuple[date | None, str | None]:
    """Return (observation date, kind) where kind is annual/monthly/quarterly/daily."""
    if raw is None:
        return None, None
    if isinstance(raw, (datetime, date)):
        d = raw.date() if isinstance(raw, datetime) else raw
        return d, "daily"
    if isinstance(raw, (int, float)) and 20000 < float(raw) < 80000:
        # Excel serial date (only accept plausible dates, not ordinary years).
        from datetime import timedelta
        return (datetime(1899, 12, 30) + timedelta(days=float(raw))).date(), "daily"
    s = clean_label(raw)
    if not s:
        return None, None

    m = _FY.match(s)
    if m:
        start = int(m.group(1))
        end_raw = m.group(2)
        end = int(end_raw) if len(end_raw) == 4 else (start // 100) * 100 + int(end_raw)
        if end < start:
            end += 100
        ctx["fy_start"] = start
        ctx["calendar_year"] = None
        return date(end, 6, 30), "annual"

    m = _YEAR.match(s)
    if m:
        y = int(m.group(1))
        ctx["calendar_year"] = y
        ctx["fy_start"] = None
        return date(y, 12, 31), "annual"

    m = _MONTH.match(s)
    if m:
        key = m.group(1).lower()
        if key in MONTHS:
            month = MONTHS[key]
            ytxt = m.group(2)
            if ytxt:
                y = int(ytxt)
                if y < 100:
                    y += 2000 if y <= 40 else 1900
            elif ctx.get("fy_start"):
                y = ctx["fy_start"] if month >= 7 else ctx["fy_start"] + 1
            elif ctx.get("calendar_year"):
                y = ctx["calendar_year"]
            else:
                return None, None
            return date(y, month, 1), "monthly"

    m = re.match(r"^Q([1-4])\b", s, re.I)
    if m:
        q = int(m.group(1))
        if ctx.get("fy_start"):
            y = ctx["fy_start"]
            month = {1: 9, 2: 12, 3: 3, 4: 6}[q]
            if q >= 3:
                y += 1
            last = calendar.monthrange(y, month)[1]
            return date(y, month, last), "quarterly"
        return None, None

    for pat in _DATE_PATTERNS:
        m = pat.match(s)
        if m:
            g = m.groups()
            if len(g[0]) == 4:
                y, mo, d = int(g[0]), int(g[1]), int(g[2])
            else:
                d, mo, y = int(g[0]), int(g[1]), int(g[2])
                if y < 100:
                    y += 2000 if y <= 40 else 1900
            try:
                return date(y, mo, d), "daily"
            except ValueError:
                return None, None
    return None, None


def derive_series(
    ws,
    spec: SheetSpec,
    block_index: int = 0,
) -> tuple[list[dict], list[dict]]:
    """Parse one block. Returns (catalog rows, observation records)."""
    block = spec.blocks[block_index]
    labels = column_labels(ws, block)
    catalog: list[dict] = []
    by_col: dict[int, dict] = {}
    used: set[str] = set()

    for col, label in labels:
        slug = slugify(label)
        if not slug or slug in spec.skip_slugs or label.lower().startswith("column "):
            continue
        if spec.include is not None and slug not in spec.include:
            continue
        sid = spec.id_overrides.get(slug) or f"{spec.topic}.{slug}"
        if sid in used:
            sid = f"{sid}_{col + 1}"
        used.add(sid)
        name = spec.name_overrides.get(slug) or label
        unit = spec.unit_overrides.get(slug, spec.unit)
        freq = "annual" if spec.annual_only else spec.frequency
        catalog.append({
            "id": sid,
            "module": spec.module,
            "name": name,
            "description": f"{spec.sheet} — {label} (Bangladesh Bank Monthly Economic Trends).",
            "unit": unit,
            "frequency": freq,
            "source": "BB",
            "source_url": spec.source_url,
            "dimensions": {},
            "min_value": None,
            "max_value": None,
            "max_step": None,
            "tier": "basic",
            "_col": col,
            "_label": label,
        })
        by_col[col] = catalog[-1]

    records: list[dict] = []
    ctx: dict = {}
    max_row = ws.max_row
    for r in range(block.data_start, max_row):
        raw_period = ws.cell(r + 1, block.period_col + 1).value
        obs_date, kind = _parse_period(raw_period, ctx)
        if obs_date is None:
            continue
        if spec.annual_only and kind != "annual":
            continue
        for col, meta in by_col.items():
            value = _num(ws.cell(r + 1, col + 1).value)
            if value is None:
                continue
            records.append({
                "series_id": meta["id"],
                "obs_date": obs_date,
                "value": value,
                "dims": {},
                "period_kind": kind,
                "unit": meta["unit"],
            })
    return catalog, records


# ---------------------------------------------------------------------------
# Current Monthly Economic Trends — table specs
# ---------------------------------------------------------------------------

CURRENT_SPECS: list[SheetSpec] = [
    SheetSpec(
        sheet="Table IA", topic="monetary.indicators", module="monetary", unit="bdt_crore",
        blocks=(Block(period_col=7, col_start=8, col_end=85, header_rows=(2, 3, 4), data_start=6),),
        id_overrides={"currency_in_circulation_bangladesh_bank_bb_notes": "monetary.currency_in_circulation.bb_notes"},
    ),
    SheetSpec(
        sheet="Table IB", topic="macro.indicators", module="real", unit="mixed",
        blocks=(Block(period_col=0, col_start=1, col_end=15, header_rows=(2, 3, 4), data_start=7),),
        id_overrides={"tk_us_dollar_period_average": "fx.rate.usd.period_average"},
    ),
    SheetSpec(
        sheet="TableIIA", topic="monetary.m2", module="monetary", unit="bdt_crore",
        blocks=(Block(period_col=0, col_start=1, col_end=15, header_rows=(2, 3, 4, 5), data_start=8),),
        id_overrides={"broad_money_m2_3_13": "monetary.m2"},
    ),
    SheetSpec(
        sheet="Table III A", topic="external.bop", module="external", unit="bdt_crore",
        blocks=(
            Block(period_col=0, col_start=1, col_end=14, header_rows=(2, 3), data_start=5),
            Block(period_col=14, col_start=15, col_end=22, header_rows=(2, 3), data_start=5),
        ),
        id_overrides={
            "goods_export_f_o_b": "external.exports",
            "goods_import_f_o_b": "external.imports",
            "goods_trade_balance": "external.trade_balance",
        },
    ),
    SheetSpec(
        sheet="Table IV", topic="trade.commodities", module="external", unit="bdt_crore",
        blocks=(
            Block(period_col=0, col_start=1, col_end=21, header_rows=(3, 4, 5), data_start=7),
            Block(period_col=21, col_start=23, col_end=42, header_rows=(3, 4, 5), data_start=7),
        ),
        id_overrides={
            "total_exports_1_through_10": "external.exports.goods",
            "total_imports_37": "external.imports.goods",
            "balance_of_trade": "external.trade_balance.goods",
        },
    ),
    SheetSpec(
        sheet="Table V", topic="agri.production", module="agri", unit="thousand_tonnes",
        blocks=(
            Block(period_col=0, col_start=1, col_end=14, header_rows=(2, 3), data_start=6),
            Block(period_col=14, col_start=15, col_end=30, header_rows=(2, 3), data_start=6),
        ),
    ),
    SheetSpec(
        sheet="Table VI", topic="industry.production", module="industry", unit="mixed",
        blocks=(Block(period_col=0, col_start=1, col_end=14, header_rows=(2, 3), data_start=3),),
    ),
    SheetSpec(
        sheet="Table VII", topic="inflation.cpi", module="inflation", unit="index",
        blocks=(Block(period_col=0, col_start=1, col_end=18, header_rows=(2, 3), data_start=6),),
        id_overrides={
            "cpi_general": "inflation.cpi.national.2005base",
            "inflation_general_point_to_point": "inflation.cpi.national.2005base.yoy",
            "inflation_general_12_month_average": "inflation.cpi.national.2005base.12m_avg",
            "cpi_food": "inflation.cpi.food.2005base",
            "inflation_food_point_to_point": "inflation.cpi.food.2005base.yoy",
            "inflation_food_12_month_average": "inflation.cpi.food.2005base.12m_avg",
            "cpi_non_food": "inflation.cpi.non_food.2005base",
            "inflation_non_food_point_to_point": "inflation.cpi.non_food.2005base.yoy",
            "inflation_non_food_12_month_average": "inflation.cpi.non_food.2005base.12m_avg",
        },
        unit_overrides={
            "inflation_general_point_to_point": "percent", "inflation_general_12_month_average": "percent",
            "inflation_food_point_to_point": "percent", "inflation_food_12_month_average": "percent",
            "inflation_non_food_point_to_point": "percent", "inflation_non_food_12_month_average": "percent",
        },
    ),
    SheetSpec(
        sheet="Table VIII", topic="prices.retail", module="commodities", unit="bdt",
        blocks=(Block(period_col=0, col_start=1, col_end=10, header_rows=(2, 3), data_start=5),),
    ),
    SheetSpec(
        sheet="TableIXA", topic="gdp.current", module="real", unit="bdt_crore",
        blocks=(Block(period_col=0, col_start=1, col_end=27, header_rows=(2, 3), data_start=4),),
        id_overrides={
            "gdp_at_current_market_price_16_17": "gdp.current.market_price",
            "gdp_at_current_producer_price_1_to_15": "gdp.current.producer_price",
        },
        annual_only=True,
    ),
    SheetSpec(
        sheet="TableIXB", topic="gdp.constant", module="real", unit="bdt_crore",
        blocks=(Block(period_col=0, col_start=1, col_end=23, header_rows=(2, 3), data_start=4),),
        id_overrides={
            "gdp_at_constant_market_price_16_17": "gdp.constant.market_price",
            "gdp_at_constant_producer_price_1_to_15": "gdp.constant.producer_price",
        },
        annual_only=True,
    ),
    SheetSpec(
        sheet="TableIXC", topic="gdp.national", module="real", unit="mixed",
        blocks=(Block(period_col=0, col_start=1, col_end=20, header_rows=(2, 3), data_start=5),),
        id_overrides={
            "annual_growth_of_gdp_at_current_market_price_pct": "gdp.growth.current",
            "annual_growth_of_gdp_at_constant_market_price_pct": "gdp.growth.constant",
        },
        annual_only=True,
    ),
    SheetSpec(
        sheet="TableX", topic="market.dse", module="market", unit="bdt_crore",
        blocks=(
            Block(period_col=0, col_start=1, col_end=6, header_rows=(2,), data_start=3),
            Block(period_col=5, col_start=6, col_end=11, header_rows=(2,), data_start=3, calendar_years=False),
        ),
        id_overrides={
            "general_index_dse_broad_index1": "market.dse.index.general",
            "turn_over_tk_in_crore": "market.dse.turnover",
            "total_issued_capital_tk_in_crore": "market.dse.issued_capital",
            "total_no_of_companies": "market.dse.listed_companies",
        },
        unit_overrides={
            "general_index_dse_broad_index1": "index",
            "total_no_of_companies": "count",
        },
    ),
    SheetSpec(
        sheet="TableXI", topic="market.dse.market_cap", module="market", unit="bdt_crore",
        blocks=(Block(period_col=0, col_start=1, col_end=18, header_rows=(2, 3), data_start=4),),
        id_overrides={"total_market_capitalisation": "market.dse.market_cap.total"},
    ),
    SheetSpec(
        sheet="Table XV", topic="rates.nfcd", module="rates", unit="percent",
        blocks=(Block(period_col=0, col_start=1, col_end=40, header_rows=(2, 3), data_start=5),),
    ),
    SheetSpec(
        sheet="TableXVI", topic="rates.call_money", module="rates", unit="percent",
        blocks=(Block(period_col=0, col_start=1, col_end=7, header_rows=(2, 3), data_start=4),),
        id_overrides={"average": "rates.call_money", "average_6": "rates.call_money.lending"},
    ),
    SheetSpec(
        sheet="Table XVIII", topic="remittances.flow", module="external", unit="mixed",
        blocks=(Block(period_col=0, col_start=1, col_end=5, header_rows=(2, 3), data_start=3),),
        id_overrides={
            "no_of_persons": "remittances.workers",
            "million_us": "remittances.total.usd",
            "taka_in_crore": "remittances.total.bdt",
        },
    ),
    SheetSpec(
        sheet="TableXIX", topic="remittances.by_country", module="external", unit="bdt_crore",
        blocks=(Block(period_col=0, col_start=1, col_end=21, header_rows=(2,), data_start=3),),
        id_overrides={"total": "remittances.total"},
    ),
    SheetSpec(
        sheet="TableXX", topic="fx.rate", module="forex", unit="bdt",
        blocks=(
            Block(period_col=0, col_start=1, col_end=16, header_rows=(2, 3), data_start=6),
            Block(period_col=15, col_start=16, col_end=75, header_rows=(2, 3), data_start=6),
        ),
        id_overrides={
            "us_dollar_period_average": "fx.rate.usd",
            "us_dollar_end_period": "fx.rate.usd.end",
            "euro_period_average": "fx.rate.eur",
            "euro_end_period": "fx.rate.eur.end",
            "indian_rupee_period_average": "fx.rate.inr",
            "indian_rupee_end_period": "fx.rate.inr.end",
        },
    ),
    SheetSpec(
        sheet="Table XXII", topic="commodities.world", module="commodities", unit="usd",
        blocks=(Block(period_col=0, col_start=1, col_end=25, header_rows=(2, 3), data_start=3, calendar_years=True),),
        id_overrides={
            "gold_us_troy_ounce": "commodities.gold",
            "petroleum_us_barrel": "commodities.brent",
            "petroleum_us_barrel_5": "commodities.dubai_crude",
        },
    ),
    SheetSpec(
        sheet="Table XXIII", topic="fiscal.nbr", module="fiscal", unit="bdt_crore",
        blocks=(Block(period_col=0, col_start=1, col_end=16, header_rows=(2, 3, 4), data_start=5),),
        id_overrides={"total_tax": "fiscal.nbr.total"},
    ),
]


# Historical workbook (1972 →) — selected tables with long annual history.
HISTORICAL_SPECS: list[SheetSpec] = [
    SheetSpec(
        sheet="Table VIII", topic="inflation.cpi.long", module="inflation", unit="index",
        blocks=(Block(period_col=0, col_start=1, col_end=7, header_rows=(8,), data_start=9),),
        annual_only=True,
        source_url=HISTORICAL_URL,
        id_overrides={
            "general": "inflation.cpi.national.long",
            "food": "inflation.cpi.food.long",
        },
    ),
    SheetSpec(
        sheet="TableXXII", topic="fx.rate.history", module="forex", unit="bdt",
        blocks=(Block(period_col=0, col_start=1, col_end=75, header_rows=(2, 3), data_start=6),),
        annual_only=True,
        source_url=HISTORICAL_URL,
        id_overrides={
            "us_dollar_period_average": "fx.rate.usd.history",
            "us_dollar_end_period": "fx.rate.usd.end.history",
        },
    ),
    SheetSpec(
        sheet="TableXXI", topic="remittances.by_country.history", module="external", unit="bdt_crore",
        blocks=(Block(period_col=0, col_start=1, col_end=20, header_rows=(2,), data_start=3),),
        annual_only=True,
        source_url=HISTORICAL_URL,
        id_overrides={"total": "remittances.total.history"},
    ),
    SheetSpec(
        sheet="TableXIA", topic="gdp.current.history", module="real", unit="bdt_crore",
        blocks=(Block(period_col=0, col_start=1, col_end=18, header_rows=(2,), data_start=4),),
        annual_only=True,
        source_url=HISTORICAL_URL,
        id_overrides={"gdp_at_market_prices_1_to_10": "gdp.current.market_price.history"},
    ),
    SheetSpec(
        sheet="TableXIB", topic="gdp.constant.history", module="real", unit="bdt_crore",
        blocks=(Block(period_col=0, col_start=1, col_end=20, header_rows=(2,), data_start=4),),
        annual_only=True,
        source_url=HISTORICAL_URL,
        id_overrides={"gdp_at_market_prices_1_to_10": "gdp.constant.market_price.history"},
    ),
    SheetSpec(
        sheet="Table XII", topic="market.dse.history", module="market", unit="mixed",
        blocks=(Block(period_col=0, col_start=1, col_end=5, header_rows=(2,), data_start=3),),
        annual_only=True,
        source_url=HISTORICAL_URL,
        id_overrides={
            "general_index": "market.dse.index.general.history",
            "turn_over_tk_in_crore": "market.dse.turnover.history",
            "total_issued_capital_tk_in_crore": "market.dse.issued_capital.history",
            "total_number_of_companies": "market.dse.listed_companies.history",
        },
    ),
    SheetSpec(
        sheet="Table XVIII", topic="rates.call_money.history", module="rates", unit="percent",
        blocks=(Block(period_col=0, col_start=1, col_end=8, header_rows=(2, 3), data_start=3),),
        annual_only=True,
        source_url=HISTORICAL_URL,
    ),
]


def parse_workbook_bytes(content: bytes, specs: list[SheetSpec]) -> tuple[list[dict], list[dict]]:
    """Parse a workbook from bytes (used by the ingestion job)."""
    import io

    wb = openpyxl.load_workbook(io.BytesIO(content), data_only=True, read_only=False)
    catalog: list[dict] = []
    records: list[dict] = []
    for spec in specs:
        if spec.sheet not in wb.sheetnames:
            continue
        ws = wb[spec.sheet]
        for bi in range(len(spec.blocks)):
            cat, recs = derive_series(ws, spec, bi)
            catalog.extend(cat)
            records.extend(recs)
    wb.close()
    return catalog, records


def parse_workbook(path: str, specs: list[SheetSpec]) -> tuple[list[dict], list[dict]]:
    """Parse every spec that exists in a workbook. Returns (catalog, records)."""
    wb = openpyxl.load_workbook(path, data_only=True, read_only=False)
    catalog: list[dict] = []
    records: list[dict] = []
    for spec in specs:
        if spec.sheet not in wb.sheetnames:
            continue
        ws = wb[spec.sheet]
        for bi in range(len(spec.blocks)):
            try:
                cat, recs = derive_series(ws, spec, bi)
            except Exception as exc:  # noqa: BLE001 — one odd table must not kill the run
                raise ValueError(f"{spec.sheet} block {bi}: {exc}") from exc
            catalog.extend(cat)
            records.extend(recs)
    wb.close()
    return catalog, records


def dedupe_catalog(rows: list[dict]) -> list[dict]:
    """Last row wins for a given id; strip private fields."""
    out: dict[str, dict] = {}
    for r in rows:
        rid = r["id"]
        out[rid] = {k: v for k, v in r.items() if not k.startswith("_")}
    return list(out.values())


def dedupe_records(records: list[dict]) -> list[dict]:
    out: dict[tuple, dict] = {}
    for r in records:
        out[(r["series_id"], r["obs_date"])] = r
    return list(out.values())
