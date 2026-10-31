from datetime import date

from ingestion.framework import FetchedFile
from ingestion.jobs import btrc_telecom as btrc


def test_btrc_internet_table():
    html = """
    <html><body><table>
      <tr><th>মাস</th><th>মোবাইল (মিলিয়ন)</th><th>আইএসপি ও পিএসটিএন (মিলিয়ন)</th><th>মোট গ্রাহক (মিলিয়ন)</th></tr>
      <tr><td>আগস্ট, ২০২৬</td><td>১২২.২৬</td><td>১৫.৪০</td><td>১৩৭.৬৬</td></tr>
      <tr><td>জুলাই, ২০২৬</td><td>১২১.৫২</td><td>১৫.২৩</td><td>১৩৬.৭৫</td></tr>
    </table></body></html>
    """.encode("utf-8")
    btrc.ensure_series = lambda rows: None
    records = btrc.BtrcTelecomJob().parse(
        FetchedFile("btrc_internet.html", html, date.today())
    )
    got = {(r.series_id, r.obs_date): r.value for r in records}
    assert got[("telecom.internet.mobile", date(2026, 8, 31))] == 122.26
    assert got[("telecom.internet.isp_pstn", date(2026, 8, 31))] == 15.40
    assert got[("telecom.internet.total", date(2026, 7, 31))] == 136.75


def test_btrc_tower_table_two_header_rows():
    html = """
    <html><body><table>
      <tr><th>Month</th><th>Mobile Network Operator</th><th>Tower Sharing Operator</th></tr>
      <tr><td>GP</td><td>Robi</td><td>Banglalink</td><td>Teletalk</td><td>edotco</td>
          <td>Summit</td><td>Kirtonkhola</td><td>Frontier</td><td>BTCL</td><td>Total</td></tr>
      <tr><td>August, 2026</td><td>11,788</td><td>2,185</td><td>3,905</td><td>3,526</td>
          <td>16,982</td><td>5,636</td><td>1,242</td><td>939</td><td>514</td><td>46,717</td></tr>
    </table></body></html>
    """.encode("utf-8")
    btrc.ensure_series = lambda rows: None
    records = btrc.BtrcTelecomJob().parse(
        FetchedFile("btrc_towers.html", html, date.today())
    )
    got = {r.series_id: r.value for r in records}
    assert got["telecom.towers.gp"] == 11788
    assert got["telecom.towers.total"] == 46717
    assert got["telecom.towers.btcl"] == 514
