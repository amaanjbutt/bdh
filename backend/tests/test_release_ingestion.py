from datetime import date
from io import BytesIO
from types import SimpleNamespace
from unittest.mock import MagicMock, Mock

import httpx
from openpyxl import Workbook

from app import db
from ingestion import http_client
from ingestion.framework import FetchedFile
from ingestion.jobs import bb_workbook, bbs_census, bbs_cpi, dam_prices, epb_exports


def workbook_file(workbook, filename, when):
    buffer = BytesIO()
    workbook.save(buffer)
    return FetchedFile(filename, buffer.getvalue(), when)


def test_release_download_retries_timeout(monkeypatch):
    response = Mock(status_code=200)
    get = Mock(side_effect=[httpx.ReadTimeout("incomplete transfer"), response])
    monkeypatch.setattr(http_client, "_HAVE_CFFI", False)
    monkeypatch.setattr(http_client.httpx, "get", get)
    monkeypatch.setattr(http_client.time, "sleep", Mock())

    assert http_client.get("https://example.test/report.xlsx", retry_transient=True) is response
    assert get.call_count == 2


def test_bb_current_issue_uses_unquoted_relative_link(monkeypatch):
    html = """<a href=../../../../../../pub/monthly/econtrds/etoct26.xlsx>Download</a>
        <a href=../../../../../../pub/monthly/econtrds/etsep26.xlsx>Download</a>"""
    monkeypatch.setattr(http_client, "get", Mock(return_value=SimpleNamespace(text=html)))
    assert bb_workbook.BbWorkbookJob()._latest_workbook_url() == (
        "https://www.bb.org.bd/pub/monthly/econtrds/etoct26.xlsx"
    )


def test_epb_discovery_orders_by_fiscal_period():
    def release(month, path):
        return f"""<tr><td data-column="export_data_year">২০২৫-২০২৬</td>
            <td data-column="epb_export_data_month">জুলাই{month}</td>
            <td><a href="/{path}.xlsx" title="Monthly Summary Sheet">Summary</a></td></tr>"""

    html = "<table>" + release("", "jul") + release("-ফেব্রুয়ারি", "feb") + "</table>"
    releases = epb_exports._releases(html)
    assert sorted(releases) == [date(2025, 7, 31), date(2026, 2, 28)]
    assert releases[max(releases)]["summary"].endswith("/feb.xlsx")


def test_epb_july_template_and_previous_fiscal_year(monkeypatch):
    workbook = Workbook()
    sheet = workbook.active
    sheet["A2"] = "Report: Summary Sheet"
    sheet["A3"] = "Period: July  2026-2027"
    # EPB July 2026, row 8 (first product aggregate).
    sheet.append([])
    sheet.append([])
    sheet.append([])
    sheet.append(["A. Primary Commodities ( 1-24)", 1443.88, 120.05, 123.37, 2.69, 133.49, -10.07])
    monkeypatch.setattr(epb_exports, "ensure_series", Mock())
    when = date(2026, 7, 31)
    records = epb_exports.EpbExportsJob().parse(workbook_file(workbook, "epb_summary_july.xlsx", when))
    values = {(r.series_id.rsplit(".", 1)[-1], r.obs_date): r.value for r in records}
    assert values["a_primary_commodities_1_24", date(2026, 6, 30)] == 1443.88
    assert values["ytd", when] == values["monthly", when] == 120.05
    assert values["monthly", date(2026, 6, 30)] == 123.37
    assert values["ytd", date(2025, 7, 31)] == 133.49
    sheet["A3"] = "Period: July–January 2025-26"
    assert epb_exports._workbook_period(sheet) == (2025, date(2026, 1, 31))


def test_epb_country_totals_and_hs_chapters_use_usd_millions(monkeypatch):
    workbook = Workbook()
    summary = workbook.active
    summary.title = "Country Summary"
    summary["A3"] = "Period: July- October 2026-27"
    summary["B6"] = "USD"
    summary.append(["AE: United Arab Emirates", 141773823.64])
    chapters = workbook.create_sheet("2 Digit")
    chapters["A3"] = "Period: July-October 2026-27"
    chapters["C5"] = "USD"
    chapters.append(["AE: United Arab Emirates", None, 141773823.64])
    chapters.append([None, "03: Fish and crustaceans", 319059.11])
    monkeypatch.setattr(epb_exports, "ensure_series", Mock())
    when = date(2026, 10, 31)
    rows = epb_exports.EpbExportsJob().parse(workbook_file(workbook, "epb_destinations_oct.xlsx", when))
    assert [(r.series_id, r.obs_date, r.dims["country"], round(r.value, 8)) for r in rows] == [
        ("trade.exports.country.ytd", when, "AE", 141.77382364),
        ("trade.exports.hs2.03.ytd", when, "AE", 0.31905911),
    ]


def test_bbs_cpi_uses_release_table_and_adds_month_end_rural_series():
    html = """<table><tr><td>Year-2025</td><td>PDF</td><td>Excel</td>
        <td>Year-2026</td><td>PDF</td><td>Excel</td></tr><tr><td>October</td>
        <td></td><td><a href="/old.xlsx">Excel</a></td><td>October</td><td></td>
        <td><a href="/latest.xlsx">Excel</a></td></tr></table>"""
    releases = bbs_cpi._cpi_releases(html)
    assert max(releases) == date(2026, 10, 31)
    assert releases[max(releases)].endswith("/latest.xlsx")

    sheet = Workbook().active
    sheet["B3"] = "2025-26"
    sheet["C5"] = "Oct'26"
    sheet["A7"] = "General Index"
    sheet["C7"] = 156.79789705573418
    sheet["A8"] = "Inflation (Point to Point)"
    sheet["C8"] = 8.288836181548859
    sheet["A9"] = "04. Housing, Water, Electricity, Gas, and Other Fuels"
    sheet["C9"] = 164.5
    sheet["A10"] = "Inflation (Point to Point)"
    sheet["C10"] = 4.25
    group_names = {}
    rows = bbs_cpi._parse_cpi_sheet(sheet, "rural", group_names)
    assert [(r.series_id, r.obs_date, r.value) for r in rows] == [
        ("inflation.cpi.rural", date(2026, 10, 31), 156.79789705573418),
        ("inflation.cpi.rural.yoy", date(2026, 10, 31), 8.288836181548859),
        ("inflation.cpi.rural.coicop.04", date(2026, 10, 31), 164.5),
        ("inflation.cpi.rural.coicop.04.yoy", date(2026, 10, 31), 4.25),
    ]
    assert group_names["inflation.cpi.rural.coicop.04"].startswith("Housing")


def test_census_upazila_is_separate_from_district_and_ward(monkeypatch):
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "C-01"
    # Columns and values excerpted from the BBS Barishal workbook.
    sheet.append(["District", "City Corporation", "Upazila/Thana", "Union/Ward",
                  "Administrative Unit, Location and Community", "Household", "Population"])
    sheet.append([None, None, None, None, None, "Total", "Total"])
    sheet.append(list(range(1, 8)))
    sheet.append(["06", None, None, None, "Barishal", 628895, 2570446])
    sheet.append(["06", None, None, None, "Rural", 438597, 1793382])
    sheet.append(["06", None, None, None, "Urban", 190298, 777064])
    sheet.append(["06", "50", None, None, "Barishal City Corporation", 104935, 419484])
    sheet.append(["06", "50", "51", None, "Barishal Sadar Thana", 104935, 419484])
    sheet.append(["06", "50", "51", "001", "Ward No. 01", 4750, 17850])
    monkeypatch.setattr(bbs_census, "ensure_series", Mock())
    records = bbs_census.BbsCensusJob().parse(
        workbook_file(workbook, "barishal.xlsx", date(2022, 6, 30))
    )
    district = next(r for r in records if r.series_id == "regional.census.population")
    assert district.dims == {"district": "Barishal", "division": "Barishal"}
    assert district.value == 2570446
    thana = [r for r in records if r.series_id == "regional.census.subdistrict.population"]
    assert len(thana) == 1
    assert thana[0].dims["subdistrict_code"] == "51"
    assert thana[0].dims["city_corporation_code"] == "50"
    assert thana[0].value == 419484


def test_dam_archive_dates_can_start_in_first_column(monkeypatch):
    html = """<table><tr><td>তারিখ</td><td>ঢাকা</td></tr>
        <tr><td>০৯-১১-২০২৬</td><td><a href="/nov09.pdf">Report</a></td></tr>
        <tr><td>ক্রম</td><td>তারিখ</td><td>বরিশাল</td></tr>
        <tr><td>৮</td><td>০৮-১১-২০২৬</td><td><a href="/nov08.pdf">Report</a></td></tr></table>"""
    fake_date = Mock(wraps=date)
    fake_date.today.return_value = date(2026, 11, 9)
    monkeypatch.setattr(dam_prices, "date", fake_date)
    monkeypatch.setattr(http_client, "get", Mock(side_effect=[
        SimpleNamespace(text=html), SimpleNamespace(content=b"%PDF-1.5"), SimpleNamespace(content=b"%PDF-1.5"),
    ]))
    files = dam_prices.DamPricesJob().fetch()
    assert [f.when for f in files] == [date(2026, 11, 8), date(2026, 11, 9)]
    assert [f.filename for f in files] == ["dam_2026-11-08_barishal.pdf", "dam_2026-11-09_dhaka.pdf"]
    assert dam_prices._range("65.00 - 75.00\n55.00 - 60.00") == (None, None)


def test_dam_keeps_dhaka_prices_for_distinct_categories(monkeypatch):
    # Dhaka's November 9 table labels both loose flour and loose pulses "open".
    rows = [
        ["১", "আটো", "প্যোরেট-সোেো", "প্রনি কেনি", "60.00 - 70.00", "60.00 - 70.00", "0", "55.00 - 65.00", "8.33"],
        [None, None, "ক োলো", "প্রনি কেনি", "45.00 - 52.00", "47.00 - 52.00", "-2.02", "48.00 - 50.00", "-1.02"],
        ["৩", "েলোই", "ক োলো", "প্রনি কেনি", "110.00 - 120.00", "100.00 - 110.00", "9.52", "100.00 - 110.00", "9.52"],
    ]
    pdf = MagicMock()
    pdf.__enter__.return_value = SimpleNamespace(pages=[SimpleNamespace(extract_tables=lambda: [rows])])
    conn = MagicMock()
    cursor = conn.__enter__.return_value.cursor.return_value.__enter__.return_value
    cursor.fetchone.return_value = (3,)
    monkeypatch.setattr(dam_prices.pdfplumber, "open", Mock(return_value=pdf))
    monkeypatch.setattr(dam_prices, "ensure_series", Mock())
    monkeypatch.setattr(db, "connection", Mock(return_value=conn))
    when = date(2026, 11, 9)

    result = dam_prices.DamPricesJob().parse(FetchedFile("dam_2026-11-09_dhaka.pdf", b"", when))
    prices = cursor.executemany.call_args.args[1]
    assert len({row[:4] for row in prices}) == 3
    assert {row[4:6] for row in prices} == {(60, 70), (45, 52), (110, 120)}
    assert result[0].value == 3
