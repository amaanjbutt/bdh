import { CATALOG_BY_ID, MODULE_SERIES_COUNTS, MODULES, TOTAL_OBSERVATIONS } from "./catalog";
import type { Observation, SeriesResponse, StatusResponse } from "./types";

/**
 * Deterministic fixture generation. Every value derives from the series id, so
 * a given id always produces the same curve on server and client — no hydration
 * drift, no random numbers. These stand in until the API base URL is set.
 */

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

function noise(seed: string, i: number): number {
  const a = hash(`${seed}:${i}`);
  const b = hash(`${seed}:${i}:b`);
  return (a + b) / 2 - 0.5;
}

interface Profile {
  start: number;
  end: number;
  volatility: number;
  shape: "exp" | "linear" | "wave" | "step";
}

const PROFILES: Record<string, Profile> = {
  "fx.rate.usd": { start: 3.3, end: 287.4, volatility: 0.012, shape: "exp" },
  "fx.interbank.usd": { start: 57.6, end: 287.1, volatility: 0.004, shape: "exp" },
  "fx.rate.avg.gbp": { start: 13.3, end: 372.8, volatility: 0.014, shape: "exp" },
  "fx.rate.avg.eur": { start: 52.1, end: 312.4, volatility: 0.014, shape: "exp" },
  "fx.reer": { start: 102, end: 96.4, volatility: 0.02, shape: "wave" },
  "inflation.cpi.national.yoy": { start: 3.9, end: 4.6, volatility: 0.34, shape: "wave" },
  "inflation.cpi.urban.yoy": { start: 4.1, end: 5.1, volatility: 0.32, shape: "wave" },
  "inflation.cpi.rural.yoy": { start: 3.6, end: 3.9, volatility: 0.36, shape: "wave" },
  "inflation.core.nfne.yoy": { start: 4.4, end: 7.2, volatility: 0.2, shape: "wave" },
  "inflation.wpi.yoy": { start: 2.8, end: 3.4, volatility: 0.4, shape: "wave" },
  "commodities.wheat_flour": { start: 126.4, end: 118.9, volatility: 0.02, shape: "wave" },
  "commodities.sugar": { start: 142.7, end: 176.3, volatility: 0.02, shape: "linear" },
  "commodities.rice_irri": { start: 148.2, end: 139.5, volatility: 0.02, shape: "wave" },
  "commodities.petrol": { start: 251.9, end: 266.8, volatility: 0.015, shape: "wave" },
  "payments.raast.p2p.value": { start: 1.4, end: 8940.3, volatility: 0.06, shape: "exp" },
  "payments.pos.transactions": { start: 22.6, end: 68.4, volatility: 0.05, shape: "linear" },
  "payments.ecommerce.value": { start: 24.1, end: 189.7, volatility: 0.06, shape: "exp" },
  "payments.cards.debit": { start: 24.9, end: 46.2, volatility: 0.02, shape: "linear" },
  "rates.policy": { start: 8.5, end: 10.5, volatility: 0.0, shape: "step" },
  "rates.kibor.3m": { start: 7.6, end: 10.94, volatility: 0.03, shape: "step" },
  "rates.kibor.6m": { start: 7.8, end: 11.08, volatility: 0.03, shape: "step" },
  "rates.pkrv.10y": { start: 11.9, end: 11.62, volatility: 0.04, shape: "wave" },
  "external.reserves.total": { start: 0.4, end: 19.6, volatility: 0.03, shape: "exp" },
  "external.remittances.total": { start: 136, end: 3684, volatility: 0.08, shape: "exp" },
  "external.exports.total": { start: 486, end: 2914, volatility: 0.07, shape: "exp" },
  "external.imports.total": { start: 704, end: 5218, volatility: 0.07, shape: "exp" },
  "monetary.m2": { start: 8.4, end: 39840, volatility: 0.01, shape: "exp" },
  "monetary.credit.private": { start: 312, end: 10460, volatility: 0.02, shape: "exp" },
  "monetary.currency_in_circulation": { start: 168, end: 9740, volatility: 0.02, shape: "exp" },
  "real.gdp.annual": { start: 1.8, end: 3.1, volatility: 0.9, shape: "wave" },
  "real.lsm.index": { start: 92.6, end: 116.4, volatility: 0.05, shape: "wave" },
  "auto.sales_cars": { start: 8420, end: 13860, volatility: 0.18, shape: "wave" },
  "real.electricity.generation": { start: 7420, end: 12180, volatility: 0.16, shape: "wave" },
  "fiscal.fbr.collection": { start: 118, end: 1284, volatility: 0.14, shape: "exp" },
  "fiscal.debt.public": { start: 3186, end: 82640, volatility: 0.01, shape: "exp" },
  "telecom.subscribers.cellular.total": { start: 12.8, end: 202.4, volatility: 0.01, shape: "exp" },
  "telecom.broadband.subscribers": { start: 1.1, end: 152.8, volatility: 0.01, shape: "exp" },
  "social.population.total": { start: 33.7, end: 248.6, volatility: 0.002, shape: "exp" },
  "social.labour_force.participation": { start: 42.8, end: 44.9, volatility: 0.02, shape: "wave" },
  "funds.nav.index": { start: 100, end: 1486.2, volatility: 0.005, shape: "exp" },
  "funds.aum.total": { start: 118, end: 4126, volatility: 0.02, shape: "exp" },
  "securities.pib.floating.price": { start: 99.2, end: 100.6, volatility: 0.004, shape: "wave" },
  "securities.sukuk.ijara.price": { start: 99.6, end: 101.2, volatility: 0.004, shape: "wave" },
};

const DEFAULT_PROFILE: Profile = { start: 100, end: 180, volatility: 0.05, shape: "linear" };

function stepDates(first: string, last: string, frequency: string): string[] {
  const out: string[] = [];
  const end = new Date(`${last}T00:00:00Z`);
  const cursor = new Date(`${first}T00:00:00Z`);
  const cap = 3000;

  while (cursor <= end && out.length < cap) {
    out.push(cursor.toISOString().slice(0, 10));
    switch (frequency) {
      case "daily":
      case "weekly":
        cursor.setUTCDate(cursor.getUTCDate() + 7);
        break;
      case "monthly":
        cursor.setUTCMonth(cursor.getUTCMonth() + 1);
        break;
      case "quarterly":
        cursor.setUTCMonth(cursor.getUTCMonth() + 3);
        break;
      default:
        cursor.setUTCFullYear(cursor.getUTCFullYear() + 1);
    }
  }
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

function precisionFor(unit: string): number {
  if (unit === "units" || unit === "gwh") return 0;
  return 2;
}

function lastUpdatedFor(frequency: string, lastDate: string): string {
  const d = new Date(`${lastDate}T00:00:00Z`);
  const bump = frequency === "daily" ? 6 : frequency === "weekly" ? 26 : 34;
  d.setUTCHours(bump);
  return d.toISOString();
}

export function buildSeries(id: string, dims?: Record<string, string>): SeriesResponse | null {
  const record = CATALOG_BY_ID[id];
  if (!record) return null;

  const profile = PROFILES[id] ?? DEFAULT_PROFILE;
  const dates = stepDates(record.first_date, record.last_date, record.frequency);
  const n = dates.length;
  const dimSeed = dims
    ? Object.entries(dims)
        .map(([k, v]) => `${k}:${v}`)
        .join("|")
    : "";
  const seed = `${id}|${dimSeed}`;
  const dimShift = dimSeed && dimSeed !== "city:national" ? 0.9 + hash(dimSeed) * 0.22 : 1;
  const p = precisionFor(record.unit);

  const data: Observation[] = dates.map((date, i) => {
    const t = n === 1 ? 1 : i / (n - 1);
    let base: number;

    switch (profile.shape) {
      case "exp": {
        const ratio = Math.max(profile.end, 0.0001) / Math.max(profile.start, 0.0001);
        base = profile.start * Math.pow(ratio, Math.pow(t, 1.7));
        break;
      }
      case "wave": {
        const span = profile.end - profile.start;
        base =
          profile.start +
          span * t +
          Math.abs(span || profile.start * 0.35) *
            0.6 *
            Math.sin(t * Math.PI * 3.1 + hash(id) * 6.28);
        break;
      }
      case "step": {
        const span = profile.end - profile.start;
        base = profile.start + (span * Math.round(t * 8)) / 8;
        break;
      }
      default:
        base = profile.start + (profile.end - profile.start) * t;
    }

    const jitter = 1 + noise(seed, i) * profile.volatility * 2;
    return { date, value: Number((base * jitter * dimShift).toFixed(p)) };
  });

  // Pin the final observation so the tape, the figure and the chart agree.
  data[data.length - 1] = {
    date: dates[dates.length - 1] ?? record.last_date,
    value: Number((profile.end * dimShift).toFixed(p)),
  };

  return {
    success: true,
    series: id,
    meta: {
      name: record.name,
      unit: record.unit,
      frequency: record.frequency,
      source: record.source,
      last_updated: lastUpdatedFor(record.frequency, record.last_date),
    },
    data,
  };
}

export function buildStatus(): StatusResponse {
  const modules = MODULES.map((m, idx) => {
    const count = MODULE_SERIES_COUNTS[m.slug] ?? 0;
    const staleness = m.slug === "funds" ? 1000 * 60 * 60 * 24 * 9 : 1000 * 60 * (17 + idx * 23);
    const lastRun = new Date(Date.UTC(2026, 6, 31, 5, 40) - staleness);
    const next = new Date(lastRun.getTime() + 1000 * 60 * 60 * 24);
    return {
      module: m.slug,
      name: m.name,
      last_run: lastRun.toISOString(),
      next_expected: next.toISOString(),
      state: (m.slug === "funds" ? "stale" : "fresh") as "fresh" | "stale",
      series: count,
      observations: Math.round(count * (140 + hash(m.slug) * 900)),
      history: Array.from({ length: 90 }, (_, i) =>
        m.slug === "funds" && i > 82 ? 0 : hash(`${m.slug}:${i}`) > 0.985 ? 0 : 1,
      ),
    };
  });

  return {
    availability_pct: null,
    p95_ms: null,
    requests_24h: 0,
    observations: TOTAL_OBSERVATIONS,
    series: modules.reduce((a, m) => a + m.series, 0),
    last_ingestion: new Date(Date.UTC(2026, 6, 31, 5, 40)).toISOString(),
    modules,
  };
}
