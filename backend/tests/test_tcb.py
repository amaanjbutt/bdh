from datetime import date
from io import BytesIO

import openpyxl

from ingestion.framework import FetchedFile
from ingestion.jobs import tcb_prices as tcb


def test_tcb_daily_price_sheet():
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Daily retail price"
    ws.cell(5, 1, "তারিখঃ ৩০-১০-২০২৬")
    ws.cell(9, 1, "চিনি")
    ws.cell(9, 2, "প্রতি কেজি")
    ws.cell(9, 3, 108)
    ws.cell(9, 4, 115)
    buf = BytesIO()
    wb.save(buf)

    tcb.ensure_series = lambda rows: None
    records = tcb.TcbPricesJob().parse(FetchedFile("tcb.xlsx", buf.getvalue(), date.today()))
    got = {r.series_id: r for r in records}
    assert got["prices.tcb.sugar.min"].value == 108
    assert got["prices.tcb.sugar.max"].value == 115
    assert got["prices.tcb.sugar.min"].obs_date == date(2026, 10, 30)
    assert got["prices.tcb.sugar.min"].dims == {"unit": "kg"}
