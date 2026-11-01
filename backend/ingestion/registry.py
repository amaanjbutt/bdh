"""Central job registry.

Kept separate from `ingestion.run` (the CLI) so both the CLI runner and the
scheduler import the same JOBS map without a circular dependency.
"""
from __future__ import annotations

from ingestion.framework import IngestionJob
from ingestion.jobs.amc_nav import AmcNavJob
from ingestion.jobs.bb_payments import BbPaymentsJob
from ingestion.jobs.bb_web import BbWebJob
from ingestion.jobs.bb_workbook import BbWorkbookJob
from ingestion.jobs.bbs_census import BbsCensusJob
from ingestion.jobs.bbs_cpi import BbsCpiJob
from ingestion.jobs.bbs_gdp import BbsGdpJob
from ingestion.jobs.bpdb_power import BpdbPowerJob
from ingestion.jobs.btrc_telecom import BtrcTelecomJob
from ingestion.jobs.bsec_funds import BsecFundsJob
from ingestion.jobs.dam_prices import DamPricesJob
from ingestion.jobs.derive_indicators import DeriveIndicatorsJob
from ingestion.jobs.dse_market import DseMarketJob
from ingestion.jobs.epb_exports import EpbExportsJob
from ingestion.jobs.icb_nav import IcbNavJob
from ingestion.jobs.nbr_revenue import NbrRevenueJob
from ingestion.jobs.tcb_prices import TcbPricesJob

JOBS: dict[str, type[IngestionJob]] = {
    BbWorkbookJob.name: BbWorkbookJob,
    BbWebJob.name: BbWebJob,
    BbPaymentsJob.name: BbPaymentsJob,
    BbsCpiJob.name: BbsCpiJob,
    BbsGdpJob.name: BbsGdpJob,
    BbsCensusJob.name: BbsCensusJob,
    BpdbPowerJob.name: BpdbPowerJob,
    BtrcTelecomJob.name: BtrcTelecomJob,
    BsecFundsJob.name: BsecFundsJob,
    AmcNavJob.name: AmcNavJob,
    DamPricesJob.name: DamPricesJob,
    DseMarketJob.name: DseMarketJob,
    EpbExportsJob.name: EpbExportsJob,
    IcbNavJob.name: IcbNavJob,
    NbrRevenueJob.name: NbrRevenueJob,
    TcbPricesJob.name: TcbPricesJob,
    DeriveIndicatorsJob.name: DeriveIndicatorsJob,
}
