"""Parser tests for the per-AMC NAV adapters (no network, no database)."""
from datetime import date

from ingestion.framework import FetchedFile
from ingestion.jobs import amc_nav as m


def _file(name: str, body: str) -> FetchedFile:
    return FetchedFile(name, body.encode(), date(2026, 11, 1))


def test_parse_date_and_num():
    assert m.parse_date("2026-10-29") == date(2026, 10, 29)
    assert m.parse_date("29-Oct-26") == date(2026, 10, 29)
    assert m.parse_date("October. 29, 2026") == date(2026, 10, 29)
    assert m.parse_date("31-October-2026") == date(2026, 10, 31)
    assert m.parse_date("n/a") is None
    assert m._num("BDT 1,234.50/Unit") == 1234.5
    assert m._num("-") is None


def test_nam_skips_future_typo_rows():
    html = """
    <table>
      <tr><th>SL.</th><th>Date</th><th>NAV at Cost</th><th>NAV at Fair</th>
          <th>Buy</th><th>Sale</th><th>Validity</th></tr>
      <tr><td>1</td><td>October. 29, 2026</td><td>10.11/Unit</td><td>5.48/Unit</td>
          <td>5.48/Unit</td><td>5.48/Unit</td><td>Nov. 01, 2026</td></tr>
      <tr><td>2</td><td>October. 28, 2028</td><td>10.11/Unit</td><td>5.50/Unit</td>
          <td>5.50/Unit</td><td>5.50/Unit</td><td>Oct. 29, 2026</td></tr>
    </table>
    """
    rows = m.NamAdapter().parse(_file("nam__weekly.html", html))
    assert len(rows) == 1
    assert rows[0].when == date(2026, 10, 29)
    assert rows[0].nav == 5.48
    assert rows[0].nav_cost == 10.11


def test_race_closed_and_open_end_tables():
    html = """
    <p>Performance of Mutual Funds Managed by RACE (*calculated as of date: 29 October, 2026 )</p>
    <table>
      <tr><th>Mutual Fund</th><th>Inception</th><th>Fund Size</th><th>NAV at Cost</th>
          <th>NAV at Market</th><th>NAV/Unit at Cost</th><th>NAV/Unit at Market</th></tr>
      <tr><td>EBL First Mutual Fund</td><td>29-Aug-2009</td><td>1</td><td>2</td>
          <td>3</td><td>11.60</td><td>6.56</td></tr>
    </table>
    <table>
      <tr><th>Fund Name</th><th>NAV at Cost</th><th>NAV at Market</th>
          <th>NAV/Unit at Cost</th><th>NAV/Unit at Market</th><th>Buy</th><th>Sale</th></tr>
      <tr><td>RACE Special Opportunities Unit Fund</td><td>1</td><td>2</td>
          <td>11.94</td><td>6.93</td><td>6.93</td><td>6.93</td></tr>
    </table>
    """
    rows = m.RaceAdapter().parse(_file("race__home.html", html))
    got = {r.fund: r for r in rows}
    assert got["EBL First Mutual Fund"].nav == 6.56
    assert got["EBL First Mutual Fund"].nav_cost == 11.60
    assert got["RACE Special Opportunities Unit Fund"].nav == 6.93
    assert got["RACE Special Opportunities Unit Fund"].nav_cost == 11.94


def test_idlc_table():
    html = """
    <table>
      <tr><th>Fund Name</th><th>NAV Date</th><th>Nav At Cost Value</th>
          <th>Nav At Fair Value</th><th>Investor's Buy Price</th><th>Investor's Sale Price</th></tr>
      <tr><td>IDLC Balanced Fund</td><td>October 29, 2026</td><td>12.07</td>
          <td>12.40</td><td>12.40</td><td>12.40</td></tr>
    </table>
    """
    rows = m.IdlcAdapter().parse(_file("idlc__nav.html", html))
    assert rows[0].fund == "IDLC Balanced Fund"
    assert rows[0].when == date(2026, 10, 29)
    assert rows[0].nav == 12.40
    assert rows[0].nav_cost == 12.07


def test_capm_swapped_columns_are_corrected():
    html = """
    <table>
      <tr><th>Date of Calculation</th><th>NAV at Cost</th><th>NAV at MV</th>
          <th>NAV/Unit At Cost</th><th>NAV/Unit at MV</th></tr>
      <tr><td>2024-05-09</td><td>BDT 10.92</td><td>BDT 9.20</td>
          <td>BDT 547290820.25</td><td>BDT 461303567.07</td></tr>
      <tr><td>2024-05-08</td><td>BDT 547000000.00</td><td>BDT 460000000.00</td>
          <td>BDT 10.91</td><td>BDT 9.19</td></tr>
    </table>
    """
    rows = m.CapmAdapter().parse(_file("capm__mf.html", html))
    got = {r.when: r for r in rows}
    assert got[date(2024, 5, 9)].nav == 9.20
    assert got[date(2024, 5, 9)].nav_cost == 10.92
    assert got[date(2024, 5, 8)].nav == 9.19
    assert got[date(2024, 5, 8)].nav_cost == 10.91


def test_ucb_json():
    body = """
    {"data": [{"attributes": {
        "date": "2026-10-29", "market_price": "10.58", "buy": "10.58",
        "fund": {"data": {"attributes": {"product_type": "UCB AML"}}}
    }}]}
    """
    rows = m.UcbAdapter().parse(_file("ucb__ucb_aml-1.json", body))
    assert rows[0].fund == "UCB AML First Mutual Fund"
    assert rows[0].nav == 10.58


def test_green_delta_chart():
    html = """
    <script>
    window.visualizer.charts = Object.assign(window.visualizer.charts || {},
    {"visualizer-11787-1":{"type":"line",
      "series":[{"label":"\\ufeffx","type":"string"},{"label":"Nav Per Unit","type":"number"}],
      "data":[["29-October-26", 11.47], ["28-October-26", 11.51]]}});
    </script>
    """
    rows = m.GreenDeltaAdapter().parse(_file("greendelta__fund.html", html))
    assert [r.nav for r in rows] == [11.47, 11.51]
    assert rows[0].when == date(2026, 10, 29)


def test_capitec_header_mapping():
    html = """
    <table>
      <tr><th>Fund Name</th><th>NAV as on Date</th><th>NAV at Cost(৳)</th>
          <th>NAV at Mkt(৳)</th><th>Investor's Buy(৳)</th><th>Investor's Sale(৳)</th>
          <th>Validity Date</th></tr>
      <tr><td>Capitec Padma P. F. Shariah Unit Fund</td><td>29 Oct 2026</td>
          <td>11.44</td><td>07.57</td><td>07.57</td><td>07.34</td><td>01 Nov 2026</td></tr>
    </table>
    """
    rows = m.CapitecAdapter().parse(_file("capitec__open.html", html))
    assert rows[0].nav == 7.57
    assert rows[0].nav_cost == 11.44


def test_prime_rates_text():
    html = """
    <p>NAV at Cost Price as on 29 October 2026 117.30 Tk Per Unit</p>
    <p>NAV at Market Price as on 29 October 2026 72.27 Tk Per Unit</p>
    <p>Sale Price: 72.00 Tk Per Unit</p>
    """
    rows = m.PrimeAdapter().parse(_file("prime__pffuf.html", html))
    assert rows[0].fund == "Prime Financial First Unit Fund"
    assert rows[0].when == date(2026, 10, 29)
    assert rows[0].nav == 72.27
    assert rows[0].nav_cost == 117.30
    assert rows[0].market_price == 72.0


def test_candlestone_table():
    html = """
    <table>
      <tr><th>Fund Name</th><th>NAV as on</th><th>NAV Per Unit-Cost (BDT)</th>
          <th>NAV Per Unit-Market (BDT)</th><th>Investor's Buy Price (BDT)</th>
          <th>Investor's Sale Price (BDT)</th></tr>
      <tr><td>CandleStone Rupali Bank Growth Fund</td><td>2026-10-29</td>
          <td>9.72</td><td>6.52</td><td>6.52</td><td>6.52</td></tr>
    </table>
    """
    rows = m.CandleStoneAdapter().parse(_file("candlestone__nav.html", html))
    assert rows[0].nav == 6.52
    assert rows[0].nav_cost == 9.72


def test_cwt_table():
    html = """
    <table>
      <tr><th>Publishing Date</th><th>Validity Date</th><th>NAV (At Market Price)</th>
          <th>NAV (At Cost Price)</th><th>Sale Price</th><th>Repurchase Price</th>
          <th>DSEX INDEX</th></tr>
      <tr><td>29/10/2026</td><td>01/11/2026</td><td>15.73</td><td>13.94</td>
          <td>15.73</td><td>15.73</td><td>5417.44</td></tr>
    </table>
    """
    rows = m.CwtAdapter().parse(_file("cwt__ebfgf.html", html))
    assert rows[0].fund == "CWT Emerging Bangladesh First Growth Fund"
    assert rows[0].when == date(2026, 10, 29)
    assert rows[0].nav == 15.73
    assert rows[0].nav_cost == 13.94
    assert rows[0].market_price is None
