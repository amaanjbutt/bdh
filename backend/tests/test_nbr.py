from datetime import date

from ingestion.jobs import nbr_revenue


def test_nbr_period_from_bengali_title():
    assert nbr_revenue.period_for("২০২৫-২৬ অর্থবছরের জুন’২৬ মাস এবং জুন’২৬ মাস পর্যন্ত") == date(2026, 6, 30)
    assert nbr_revenue.period_for("২০২৪-২৫ অর্থবছরের মে’২৫ মাস পর্যন্ত") == date(2025, 5, 31)
    assert nbr_revenue.period_for("Annual Report 2024-25") is None


def test_nbr_component_totals_validation():
    # monthly actual row from the June-2026 statement
    row = ["Ryb'26 gv‡mi ivR¯^ AvniY"] + [
        "3749.00", "7265.00", "917.00", "476.00", "0.00", "249.00", "12656.00",
        "340.00", "12786.00", "3851.00", "1.00", "401.00", "17379.00",
        "24259.00", "216.00", "13.00", "24488.00", "54523.00",
    ]
    assert nbr_revenue._valid_columns(row)

    bad = list(row)
    bad[18] = "1.00"
    assert not nbr_revenue._valid_columns(bad)
