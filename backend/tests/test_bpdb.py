from datetime import date

from ingestion.jobs import bpdb_power


def test_bpdb_date_and_numbers():
    text = "Date : 28-10-2026\nDay Peak Generation 14895.99 MW"
    assert bpdb_power._date(text) == date(2026, 10, 28)
    assert bpdb_power._num("14,895.99") == 14895.99
    assert bpdb_power._num("") is None


def test_bpdb_summary_patterns():
    text = (
        "Day Peak Generation 14895.99 MW 12:00 Hr. Energy Generated 350.68960 MKWHr.\n"
        "Day Peak Demand 15767.99 MW 12:00 Hr. Energy Unserverd 14.23700 MKWHr.\n"
        "Evening Peak Generation 15954.6 MW 19:00 Hr. Minimum Generation of the Day 13305.08 MW 06:00 Hr.\n"
        "Maximum Generation of the Day 15954.6 MW 19:00 Hr. Total Gas Supplied 841.31 MMCFD.\n"
        "Evening Peak Demand 16391.56 MW 18:00 Hr. Production Cost per KWHr 8.97201 Tk.\n"
        "Energy Demand 364.92660 MKWHr. Energy Generated 350.68960 MKWHr.\n"
        "Total Import through C/B Interconnector: MKWHr: 43.439465 Peak Hr Flow 1862.32 MW"
    )
    import re
    for key, _, _, pattern in bpdb_power.SUMMARY:
        assert re.search(pattern, text, re.IGNORECASE), key
