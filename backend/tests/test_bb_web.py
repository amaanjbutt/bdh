from ingestion.jobs.bb_web import BbWebJob


def test_fx_page():
    html = """
    <html><body>
    <p>FX Rate Sheet effective for 29/10/2026</p>
    <table><tr><td>A. USD/BDT Exchange Rate</td></tr>
      <tr><td>Currency</td><td>Bid Rate</td><td>Ask Rate</td><td>WAR</td></tr>
      <tr><td>USD</td><td>123.99</td><td>124.01</td><td>124.00</td></tr></table>
    <table><tr><td>B. Cross Rates</td></tr>
      <tr><td>Currency</td><td>Bid Rate</td><td>Ask Rate</td></tr>
      <tr><td>EUR</td><td>138.00</td><td>138.20</td></tr></table>
    </body></html>
    """
    recs = BbWebJob()._parse_fx(html)
    got = {r.series_id: r.value for r in recs}
    assert got["fx.rate.usd"] == 124.0
    assert got["fx.rate.usd.bid"] == 123.99
    assert got["fx.rate.eur"] == 138.1
    assert recs[0].obs_date.isoformat() == "2026-10-29"


def test_reserves_page():
    html = """
    <table>
      <tr><td>Period</td><td>Foreign Exchange Reserves(Gross)</td><td>Foreign Exchange Reserves(as per BPM6)</td></tr>
      <tr><td>2026-2027</td></tr>
      <tr><td>September</td><td>36014.8</td><td>31198.9</td></tr>
      <tr><td>August</td><td>37352.3</td><td>32442.3</td></tr>
    </table>
    """
    recs = BbWebJob()._parse_reserves(html)
    assert {r.series_id for r in recs} == {"reserves.gross", "reserves.bpm6"}
    assert recs[0].obs_date.isoformat() == "2026-09-01"
