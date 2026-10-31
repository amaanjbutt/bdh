from datetime import date

import pytest

from ingestion.jobs.derive_indicators import _yoy


def test_yoy_monthly():
    pts = {date(2025, 9, 1): 100.0, date(2026, 9, 1): 110.0}
    assert _yoy(pts)[date(2026, 9, 1)] == pytest.approx(10.0)


def test_yoy_daily_nearest():
    pts = {date(2025, 10, 29): 100.0, date(2026, 10, 29): 120.0}
    assert _yoy(pts)[date(2026, 10, 29)] == pytest.approx(20.0)
