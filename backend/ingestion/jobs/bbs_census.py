"""BBS Population & Housing Census 2022 — district and subdistrict tables.

BBS publishes one workbook per district (64 files) plus a national SDG table.
The C-01 sheet is the stable headline table (households, population by sex,
sex ratio); each district workbook lays it out with a slightly different
column offset, so the parser locates the "Administrative Unit, Location and
Community" header instead of hardcoding a column.

District observations retain their existing IDs and dimensions. Selected
upazila and thana tables use separate IDs and the publisher's geographic codes.
"""
from __future__ import annotations

import io
import re
from datetime import date

import openpyxl
from bs4 import BeautifulSoup

from ingestion import http_client
from ingestion.bb_tables import Block, _num, clean_label, column_labels, slugify
from ingestion.catalog import ensure_series
from ingestion.framework import FetchedFile, IngestionJob, Record

LANDING = "https://bbs.gov.bd/pages/static-pages/6922e073933eb65569e27220"
CENSUS_DATE = date(2022, 6, 30)
_AGGREGATES = {"rural", "urban", "total"}
_SUBDISTRICT_TABLES = {"c01", "c02", "c06", "c15", "c16", "c18"}

# The 64 districts as BBS spells them in the Census 2022 workbooks, grouped by division.
DISTRICT_DIVISION: dict[str, str] = {
    "Barguna": "Barishal", "Barishal": "Barishal", "Bhola": "Barishal",
    "Jhalokathi": "Barishal", "Patuakhali": "Barishal", "Pirojpur": "Barishal",
    "Bandarban": "Chattogram", "Brahmanbaria": "Chattogram", "Chandpur": "Chattogram",
    "Chattogram": "Chattogram", "Cumilla": "Chattogram", "Cox's Bazar": "Chattogram",
    "Feni": "Chattogram", "Khagrachhari": "Chattogram", "Lakshmipur": "Chattogram",
    "Noakhali": "Chattogram", "Rangamati": "Chattogram",
    "Dhaka": "Dhaka", "Faridpur": "Dhaka", "Gazipur": "Dhaka", "Gopalganj": "Dhaka",
    "Kishoreganj": "Dhaka", "Madaripur": "Dhaka", "Manikganj": "Dhaka",
    "Munshiganj": "Dhaka", "Narayanganj": "Dhaka", "Narsingdi": "Dhaka",
    "Rajbari": "Dhaka", "Shariatpur": "Dhaka", "Tangail": "Dhaka",
    "Bagerhat": "Khulna", "Chuadanga": "Khulna", "Jashore": "Khulna",
    "Jhenaidah": "Khulna", "Khulna": "Khulna", "Kushtia": "Khulna", "Magura": "Khulna",
    "Meherpur": "Khulna", "Narail": "Khulna", "Satkhira": "Khulna",
    "Jamalpur": "Mymensingh", "Mymensingh": "Mymensingh", "Netrakona": "Mymensingh",
    "Sherpur": "Mymensingh",
    "Bogura": "Rajshahi", "Chapainawabganj": "Rajshahi", "Joypurhat": "Rajshahi",
    "Naogaon": "Rajshahi", "Natore": "Rajshahi", "Pabna": "Rajshahi",
    "Rajshahi": "Rajshahi", "Sirajganj": "Rajshahi",
    "Dinajpur": "Rangpur", "Gaibandha": "Rangpur", "Kurigram": "Rangpur",
    "Lalmonirhat": "Rangpur", "Nilphamari": "Rangpur", "Panchagarh": "Rangpur",
    "Rangpur": "Rangpur", "Thakurgaon": "Rangpur",
    "Habiganj": "Sylhet", "Moulvibazar": "Sylhet", "Sunamganj": "Sylhet",
    "Sylhet": "Sylhet",
}


def district_name(raw: str) -> str:
    """BBS writes some names in full caps; keep a stable, readable spelling."""
    name = clean_label(raw).replace("'S", "'s").replace("'S ", "'s ")
    return "Cox's Bazar" if name.lower() == "cox's bazar" else name


class BbsCensusJob(IngestionJob):
    name = "bbs_census"
    source = "BBS"

    def fetch(self, backfill: bool = False) -> list[FetchedFile]:
        html = http_client.get(LANDING, timeout=60, retry_transient=True).text
        soup = BeautifulSoup(html, "lxml")
        links = [a["href"] for a in soup.find_all("a", href=True)
                 if a["href"].lower().endswith(".xlsx") and "office-bbs" in a["href"]]
        import os

        max_files = int(os.getenv("CENSUS_MAX_FILES", "64"))
        files = []
        for i, url in enumerate(list(dict.fromkeys(links))[:max_files]):
            try:
                content = http_client.get(url, timeout=120, retry_transient=True).content
                if content.startswith(b"PK"):
                    files.append(FetchedFile(f"bbs_census_{i:02d}.xlsx", content, date.today()))
                else:
                    self.fetch_warnings.append(f"Census workbook {i + 1} is not an XLSX")
            except Exception:
                self.fetch_warnings.append(f"Census workbook {i + 1} could not be downloaded")
        return files

    def parse(self, f: FetchedFile) -> list[Record]:
        wb = openpyxl.load_workbook(io.BytesIO(f.content), data_only=True)
        out: list[Record] = []
        dynamic: list[dict] = []
        c01 = next((s for s in wb.sheetnames if self._sheet_code(s) == "c01"), None)
        districts = self._c01_districts(wb[c01]) if c01 else set()
        subdistricts = self._subdistricts(wb[c01], next(iter(districts))) if districts else {}
        for sheet in wb.sheetnames:
            code = self._sheet_code(sheet)
            if code is None:
                continue
            ws = wb[sheet]
            header = self._header(ws)
            if header is None:
                continue
            hr, name_col = header
            metrics = self._metrics(ws, hr, name_col)
            if not metrics:
                continue
            data_start = self._first_district(ws, hr, name_col)
            if data_start is None:
                continue
            get_id = self._id_for if code == "c01" else (
                lambda label, c=code: self._id_generic(c, label)
            )
            table_name = f"C-{int(code[1:]):02d}" if code.startswith("c") and code[1:].isdigit() else code.upper()
            used: dict[str, int] = {}
            col_ids: dict[int, str] = {}
            sheet_series: dict[str, dict] = {}
            for c, label in metrics:
                sid = get_id(label)
                # Long labels can collide after slug truncation; keep the columns apart.
                if sid in used:
                    sid = f"{sid}_{c + 1}"
                used[sid] = c
                col_ids[c] = sid
                unit = "percent" if any(k in label.lower() for k in ("rate", "share", "%")) else "count"
                if sid == "regional.census.sex_ratio":
                    unit = "number"
                sheet_series[sid] = {
                    "id": sid, "module": "regional", "name": f"Census 2022 — {label}",
                    "description": f"Population & Housing Census 2022, {table_name}: {label}.",
                    "unit": unit, "frequency": "census", "source": "BBS",
                    "source_url": LANDING, "dimensions": {}, "min_value": -100,
                    "max_value": 100_000_000, "max_step": None, "tier": "basic",
                }
            dynamic.extend(sheet_series.values())
            for r in range(data_start, ws.max_row):
                name = district_name(ws.cell(r + 1, name_col + 1).value)
                if not name or name.lower() in _AGGREGATES:
                    continue
                if districts and name not in districts:
                    continue
                nxt = clean_label(ws.cell(r + 2, name_col + 1).value).lower()
                if nxt != "rural":
                    continue
                dims = {"district": name}
                if name in DISTRICT_DIVISION:
                    dims["division"] = DISTRICT_DIVISION[name]
                for c, label in metrics:
                    v = _num(ws.cell(r + 1, c + 1).value)
                    if v is not None:
                        out.append(Record(col_ids[c], CENSUS_DATE, v, dims))
            if code in _SUBDISTRICT_TABLES and subdistricts:
                for c, _ in metrics:
                    sid = col_ids[c]
                    series = sheet_series[sid]
                    sub_id = sid.replace("regional.census.", "regional.census.subdistrict.", 1)
                    unit = series["unit"]
                    if code in {"c15", "c16"} and c > name_col + 1:
                        unit = "percent"
                    if code == "c18" and "average household size" in series["name"].lower():
                        unit = "number"
                    dynamic.append({
                        **series, "id": sub_id, "name": f'{series["name"]} (upazila/thana)',
                        "unit": unit,
                        "dimensions": {"district": "District name", "division": "Division name",
                                       "district_code": "BBS district code",
                                       "subdistrict": "Upazila or thana name",
                                       "subdistrict_code": "BBS upazila/thana code",
                                       "city_corporation_code": "BBS city corporation code when present"},
                    })
                    col_ids[c] = sub_id
                if code == "c01":
                    rows = {name: [tuple(cell.value for cell in ws[index])]
                            for name, (index, _) in subdistricts.items()}
                else:
                    rows = {}
                    for row in ws.iter_rows(min_row=data_start + 2, values_only=True):
                        name = clean_label(row[name_col])
                        if name in subdistricts:
                            rows.setdefault(name, []).append(row)
                for name, matches in rows.items():
                    if len(matches) != 1:
                        continue
                    for c, sid in col_ids.items():
                        v = _num(matches[0][c])
                        if v is not None:
                            out.append(Record(sid, CENSUS_DATE, v, subdistricts[name][1]))
        wb.close()
        if not out:
            raise ValueError("BBS census workbook contained no supported geographic totals")
        if dynamic:
            # A run parses 64 district workbooks that share almost all series ids.
            # Remember what this run has already upserted so only genuinely new
            # columns hit the catalog (the per-file upsert was the slow part).
            known: set[str] = getattr(self, "_known_series", set())
            unique = list({d["id"]: d for d in dynamic}.values())
            fresh = [d for d in unique if d["id"] not in known]
            if fresh:
                ensure_series(fresh)
                known.update(d["id"] for d in fresh)
            self._known_series = known
        return out

    def _subdistricts(self, sheet, district: str) -> dict[str, tuple[int, dict[str, str]]]:
        header = self._header(sheet)
        if header is None:
            return {}
        hr, name_col = header
        names = [clean_label(sheet.cell(hr + 1, c + 1).value).lower() for c in range(name_col)]
        district_col = next((i for i, name in enumerate(names) if name == "district"), None)
        subdistrict_col = next((i for i, name in enumerate(names) if "upazila" in name or "thana" in name), None)
        city_col = next((i for i, name in enumerate(names) if "city corporation" in name), None)
        if district_col is None or subdistrict_col is None:
            return {}
        result: dict[str, tuple[int, dict[str, str]]] = {}
        ambiguous: set[str] = set()
        rows = sheet.iter_rows(min_row=hr + 3, max_col=name_col + 1, values_only=True)
        for index, row in enumerate(rows, hr + 3):
            name = clean_label(row[name_col])
            dist = clean_label(row[district_col])
            sub = clean_label(row[subdistrict_col])
            if not name or name.lower() in _AGGREGATES or name.isdigit():
                continue
            if not dist.isdigit() or not sub.isdigit() or any(clean_label(v) for v in row[subdistrict_col + 1:name_col]):
                continue
            dims = {"district": district, "district_code": dist.zfill(2),
                    "subdistrict": name, "subdistrict_code": sub.zfill(2)}
            if district in DISTRICT_DIVISION:
                dims["division"] = DISTRICT_DIVISION[district]
            if city_col is not None and (city := clean_label(row[city_col])).isdigit():
                dims["city_corporation_code"] = city.zfill(2)
            if name in result:
                ambiguous.add(name)
            result[name] = index, dims
        return {name: entry for name, entry in result.items() if name not in ambiguous}

    @staticmethod
    def _plain_header(ws):
        for r in range(0, 16):
            for c in range(0, min(ws.max_column, 8)):
                txt = clean_label(ws.cell(r + 1, c + 1).value).lower()
                if ("administrative unit" in txt or "union and location" in txt
                        or "district" == txt):
                    return r
        return None

    @staticmethod
    def _metrics(ws, header_row: int, name_col: int):
        block = Block(period_col=name_col, col_start=name_col + 1, col_end=ws.max_column,
                      header_rows=(header_row, header_row + 1),
                      data_start=header_row + 3)
        out = []
        for c, label in column_labels(ws, block):
            low = label.lower()
            if low.startswith("column ") or low in {"total", "general", "institutional",
                                                    "others", "male", "female", "hijra"}:
                continue
            out.append((c, label))
        return out

    def _c01_districts(self, ws) -> set[str]:
        """The workbook is one district; its C-01 sheet starts with that district.

        Layouts vary (C-01 / C01 / C_01, extra code columns), so rather than
        inferring district rows from which code columns are filled, take the
        first administrative unit followed by a Rural row. That is the district
        headline, and every other sheet repeats the same first unit.
        """
        header = self._header(ws)
        if header is None:
            return set()
        hr, name_col = header
        data_start = self._first_district(ws, hr, name_col)
        if data_start is None:
            return set()
        for r in range(data_start, ws.max_row):
            name = district_name(ws.cell(r + 1, name_col + 1).value)
            if not name or name.lower() in _AGGREGATES:
                continue
            nxt = clean_label(ws.cell(r + 2, name_col + 1).value).lower()
            if nxt == "rural":
                return {name}
        return set()

    @staticmethod
    def _header(ws):
        for r in range(0, 16):
            for c in range(0, min(ws.max_column, 14)):
                txt = clean_label(ws.cell(r + 1, c + 1).value).lower()
                if (("administrative unit" in txt and "location" in txt)
                        or "union and location" in txt):
                    return r, c
        return None

    @staticmethod
    def _first_district(ws, header_row: int, name_col: int):
        for r in range(header_row + 1, min(header_row + 8, ws.max_row - 1)):
            name = clean_label(ws.cell(r + 1, name_col + 1).value)
            nxt = clean_label(ws.cell(r + 2, name_col + 1).value).lower()
            if name and name.lower() not in _AGGREGATES and nxt == "rural":
                return r
        return None

    @staticmethod
    def _id_for(label: str) -> str:
        low = label.lower()
        if "population" in low and "total" in low:
            return "regional.census.population"
        if "household" in low and "total" in low:
            return "regional.census.households"
        if "household" in low and "general" in low:
            return "regional.census.households.general"
        if "household" in low and "institutional" in low:
            return "regional.census.households.institutional"
        if "household" in low and "other" in low:
            return "regional.census.households.others"
        if low.strip() == "sex ratio":
            return "regional.census.sex_ratio"
        if "population" in low and "female" in low:
            return "regional.census.population.female"
        if "population" in low and "male" in low:
            return "regional.census.population.male"
        if "population" in low and "hijra" in low:
            return "regional.census.population.hijra"
        return f"regional.census.c01.{slugify(label)}"

    @staticmethod
    def _sheet_code(sheet: str) -> str | None:
        """Normalise the workbook's varying sheet names: C-01, C01, C_01, SDG…"""
        m = re.fullmatch(r"C[-_ ]?(\d{1,2})", sheet.strip(), re.IGNORECASE)
        if m:
            return f"c{int(m.group(1)):02d}"
        if sheet.strip().upper().startswith("SDG"):
            return slugify(sheet)
        return None

    @staticmethod
    def _id_generic(sheet: str, label: str) -> str:
        return f"regional.census.{sheet}.{slugify(label)}"
