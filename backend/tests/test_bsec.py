from datetime import date

from ingestion.jobs import bsec_funds


def test_bsec_helpers():
    assert bsec_funds._date("17-Aug-2023") == date(2023, 8, 17)
    assert bsec_funds._date("-") is None
    assert bsec_funds._num("200.00") == 200.0
