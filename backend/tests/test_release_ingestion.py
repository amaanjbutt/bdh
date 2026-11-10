import base64
import json
from datetime import date
from io import BytesIO
from types import SimpleNamespace
from unittest.mock import MagicMock, Mock
from zipfile import ZipFile

import httpx
import pytest
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from openpyxl import Workbook

from app import db
from ingestion import http_client
from ingestion.framework import FetchedFile
from ingestion.jobs import bb_workbook, bbs_census, bbs_cpi, dam_prices, epb_exports
from scripts.presign_staged_release import encrypt_url
from scripts.replay_releases import read_files


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


def test_publisher_relay_matches_host_boundaries(monkeypatch):
    monkeypatch.setattr(http_client, "_RELAY", "https://relay.example.test")
    monkeypatch.setattr(http_client, "_RELAY_KEY", "test")
    monkeypatch.setattr(http_client, "_RELAY_HOSTS", ["bbs.gov.bd"])

    url = "https://bbs.gov.bd/pages/static-pages/cpi"
    assert http_client.relayed(url) == (
        "https://relay.example.test/?url=https%3A%2F%2Fbbs.gov.bd%2Fpages%2Fstatic-pages%2Fcpi",
        {"X-Relay-Key": "test"},
    )
    outside = "https://bbs.gov.bd.example.test/report"
    assert http_client.relayed(outside) == (outside, None)


def test_bb_current_issue_uses_unquoted_relative_link(monkeypatch):
    html = """<a href=../../../../../../pub/monthly/econtrds/etoct26.xlsx>Download</a>
        <a href=../../../../../../pub/monthly/econtrds/etsep26.xlsx>Download</a>"""
    monkeypatch.setattr(http_client, "get", Mock(return_value=SimpleNamespace(text=html)))
    assert bb_workbook.BbWorkbookJob()._latest_workbook_url() == (
        "https://www.bb.org.bd/pub/monthly/econtrds/etoct26.xlsx"
    )


def test_bb_industry_archive_limits_months():
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Table VI"
    sheet["A3"] = "Period"
    sheet["B3"] = "Sugar"
    sheet["B4"] = "Metric Tons"
    sheet.append(["2021-22", None])
    # Table VI of the April 2022 issue preserved by the Wayback Machine.
    sheet.append(["December", 6600])
    sheet.append(["January", 12735])
    sheet.append(["February", 2041])
    f = workbook_file(workbook, "bb_industry_archive_2022-01-01_2022-02-01.xlsx", date(2022, 4, 30))

    rows = bb_workbook.BbWorkbookJob().parse(f)
    assert [(r.series_id, r.obs_date, r.value) for r in rows] == [
        ("industry.production.sugar_metric_tons", date(2022, 1, 1), 12735),
        ("industry.production.sugar_metric_tons", date(2022, 2, 1), 2041),
    ]


def test_epb_discovery_orders_by_fiscal_period():
    def release(month, path):
        return f"""<tr><td data-column="export_data_year">২০২৫-২০২৬</td>
            <td data-column="epb_export_data_month">জুলাই{month}</td>
            <td><a href="/{path}.xlsx" title="Monthly Summary Sheet">Summary</a>
            <a href="/service.xlsx" title="Service Summary Sheet">Service</a></td></tr>"""

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


def test_epb_june_summary_uses_full_year_and_shifted_monthly_columns(monkeypatch):
    workbook = Workbook()
    sheet = workbook.create_sheet("Worksheet 1")
    sheet["A2"] = "Report: Summary Sheet"
    sheet["A3"] = "Period: July-June  2025-2026"
    # EPB June 2026, row 8 (first product aggregate).
    for _ in range(4):
        sheet.append([])
    sheet.append(["A. Primary Commodities ( 1-24)", 1443.88, 1448.52,
                  -0.32032695, 123.37, 98.24, 25.58021173, 93.13])
    monkeypatch.setattr(epb_exports, "ensure_series", Mock())
    when = date(2026, 6, 30)
    rows = epb_exports.EpbExportsJob().parse(workbook_file(workbook, "epb_summary_june.xlsx", when))
    values = {(row.series_id.rsplit(".", 1)[-1], row.obs_date): row.value for row in rows}
    assert values["a_primary_commodities_1_24", when] == values["ytd", when] == 1443.88
    assert values["ytd", date(2025, 6, 30)] == 1448.52
    assert values["monthly", when] == 123.37
    assert values["monthly", date(2026, 5, 31)] == 98.24
    assert values["monthly", date(2025, 6, 30)] == 93.13


def test_epb_other_product_rows_keep_their_parent_category(monkeypatch):
    workbook = Workbook()
    sheet = workbook.active
    sheet["A2"] = "Report: Summary Sheet"
    sheet["A3"] = "Period: July-June  2025-2026"
    for _ in range(4):
        sheet.append([])
    # EPB June 2026 repeats this residual label in distinct categories.
    sheet.append(["(1) Frozen And Live Fish ( 01-03)", 443.42])
    sheet.append(["e) Others", 17.23])
    sheet.append(["(27) Other mfd Products (90-98)", 604.89])
    sheet.append(["e) Others", 432.67])
    monkeypatch.setattr(epb_exports, "ensure_series", Mock())
    when = date(2026, 6, 30)
    rows = epb_exports.EpbExportsJob().parse(workbook_file(workbook, "epb_summary_june.xlsx", when))
    values = {row.series_id: row.value for row in rows}
    assert values["trade.exports.frozen_and_live_fish_01_03.other.ytd"] == 17.23
    assert values["trade.exports.other_mfd_products_90_98.other.ytd"] == 432.67
    assert "trade.exports.e_others.ytd" not in values


def test_epb_country_totals_chapters_and_headings_use_usd_millions(monkeypatch):
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
    headings = workbook.create_sheet("4 digit")
    headings["A3"] = "Period: July-October 2026-27"
    headings["C5"] = "USD"
    headings.append(["US: United States", None, None])
    headings.append([None, "6109: T-shirts, singlets and other vests", "277,764,924.01"])
    monkeypatch.setattr(epb_exports, "ensure_series", Mock())
    when = date(2026, 10, 31)
    rows = epb_exports.EpbExportsJob().parse(workbook_file(workbook, "epb_destinations_oct.xlsx", when))
    assert [(r.series_id, r.obs_date, r.dims["country"], round(r.value, 8)) for r in rows] == [
        ("trade.exports.country.ytd", when, "AE", 141.77382364),
        ("trade.exports.hs2.03.ytd", when, "AE", 0.31905911),
        ("trade.exports.hs4.6109.ytd", when, "US", 277.76492401),
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


def test_staged_release_reads_in_period_order_and_rejects_path_components():
    buffer = BytesIO()
    manifest = {
        "bbs_cpi": [{"filename": "new.xlsx", "when": "2026-10-31"},
                    {"filename": "old.xlsx", "when": "2026-09-30"}],
        "epb_exports": [{"filename": "../outside.xlsx", "when": "2026-10-31"}],
    }
    with ZipFile(buffer, "w") as bundle:
        bundle.writestr("manifest.json", json.dumps(manifest))
        bundle.writestr("bbs_cpi/new.xlsx", b"new")
        bundle.writestr("bbs_cpi/old.xlsx", b"old")
    with ZipFile(buffer) as bundle:
        assert [f.content for f in read_files(bundle, "bbs_cpi")] == [b"old", b"new"]
        with pytest.raises(ValueError, match="filename"):
            read_files(bundle, "epb_exports")


def test_staged_upload_url_can_only_be_read_with_the_private_key():
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    url = "https://example.test/upload"
    envelope = encrypt_url(private_key.public_key(), url)
    assert url not in envelope
    parts = {k: base64.b64decode(v) for k, v in json.loads(envelope).items()}
    key = private_key.decrypt(
        parts["key"], padding.OAEP(mgf=padding.MGF1(hashes.SHA256()), algorithm=hashes.SHA256(), label=None)
    )
    assert AESGCM(key).decrypt(parts["nonce"], parts["ciphertext"], None).decode() == url
