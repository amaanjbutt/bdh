from datetime import date

from ingestion.bb_tables import _parse_period, slugify


def test_fiscal_year_and_months():
    ctx = {}
    d, kind = _parse_period("2025-26", ctx)
    assert (d, kind) == (date(2026, 6, 30), "annual")
    d, kind = _parse_period("July", ctx)
    assert (d, kind) == (date(2025, 7, 1), "monthly")
    d, kind = _parse_period("January", ctx)
    assert (d, kind) == (date(2026, 1, 1), "monthly")


def test_calendar_year_and_month_label():
    ctx = {}
    d, kind = _parse_period("2024", ctx)
    assert (d, kind) == (date(2024, 12, 31), "annual")
    d, kind = _parse_period("Jul-26", ctx)
    assert (d, kind) == (date(2026, 7, 1), "monthly")


def test_slugify():
    assert slugify("CPI - General (2021-22)") == "cpi_general_2021_22"
