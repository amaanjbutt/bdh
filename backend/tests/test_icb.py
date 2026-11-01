from datetime import date

from ingestion.framework import FetchedFile
from ingestion.jobs import icb_nav


def test_icb_nav_table():
    html = """
    <html><body><p>The Net Asset Value (NAV) of Non-CDS funds as on  29 - Oct - 2026</p>
    <table>
      <tr><th>Fund Name</th><th>Face Value</th><th>Cost Price (Tk.)</th><th>Market Price (Tk.)</th></tr>
      <tr><td>ICB AMCL Unit Fund</td><td>100</td><td>324.22</td><td>210.55</td></tr>
    </table></body></html>
    """
    icb_nav.ensure_series = lambda rows: None
    rows = icb_nav.IcbNavJob().parse(FetchedFile("icb.html", html.encode(), date.today()))
    got = {r.series_id: r for r in rows}
    assert got["funds.icb.icb_amcl_unit_fund.nav"].value == 324.22
    assert got["funds.icb.icb_amcl_unit_fund.market_price"].value == 210.55
    assert got["funds.icb.icb_amcl_unit_fund.nav"].obs_date == date(2026, 10, 29)
