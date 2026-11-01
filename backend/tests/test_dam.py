from ingestion.jobs import dam_prices


def test_dam_helpers():
    assert dam_prices._date("২৬-১০-২০২৬") is not None
    assert dam_prices._range("55.00 - 65.00") == (55.0, 65.0)
    assert dam_prices._range("55.00 65.00") == (55.0, 65.0)
    assert dam_prices._division("বিভাগ : ঢাকা, বরিশাল, চট্টগ্রাম") == "Dhaka"
    assert dam_prices._division("বিভাগ: চট্টগ্রাম") == "Chattogram"
