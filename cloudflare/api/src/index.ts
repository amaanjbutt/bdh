/**
 * BanglaDataHub public API on Cloudflare Workers + D1.
 *
 * The Python ingestion jobs still run on GitHub Actions (PDF/Excel parsing,
 * browser TLS, OCR); this Worker is the always-on read layer and the D1 writer
 * for their incremental sync. It also owns the Cloudflare Cron Trigger that
 * dispatches the ingestion workflow when data goes stale.
 */
export interface Env {
  DB: D1Database;
  PUBLIC_BASE?: string;
  SYNC_TOKEN?: string;
  GITHUB_TOKEN?: string;
  GITHUB_REPO?: string;
  GITHUB_WORKFLOW?: string;
}

type Row = Record<string, any>;

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "X-API-Key, Content-Type, X-Sync-Token, X-Session-Token",
};

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };
const PUBLIC_CACHE = "public, max-age=60, s-maxage=300";
const MAX_LIMIT = 10000;

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...CORS, ...headers },
  });
}

function fail(status: number, message: string, code?: string): Response {
  return json({ success: false, error: { message, ...(code ? { code } : {}) } }, status);
}

function parseJson<T>(raw: unknown, fallback: T): T {
  if (raw == null || raw === "") return fallback;
  if (typeof raw === "object") return raw as T;
  try {
    return JSON.parse(String(raw)) as T;
  } catch {
    return fallback;
  }
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function today(): string {
  return iso(new Date());
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function bool(v: unknown): boolean {
  return v === true || v === 1 || v === "1" || v === "true";
}

function addYears(dateStr: string, years: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const target = new Date(d);
  target.setUTCFullYear(d.getUTCFullYear() + years);
  if (target.getUTCMonth() !== d.getUTCMonth()) target.setUTCDate(0);
  return iso(target);
}

function minusYears(years: number): string {
  return addYears(today(), -years);
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
}

// ---------------------------------------------------------------------------
// Auth (API keys in D1; sha256 hex, same as the Python API)
// ---------------------------------------------------------------------------

interface Caller {
  userId: string;
  plan: string;
  historyYears: number | null;
  pro: boolean;
}

const PLAN_HISTORY: Record<string, number | null> = {
  free: 1,
  developer: 10,
  pro: null,
  business: null,
  basic: 10,
};

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function authenticate(req: Request, env: Env, required = true): Promise<Caller | null> {
  const url = new URL(req.url);
  const key = req.headers.get("X-API-Key") || url.searchParams.get("api_key");
  if (!key) {
    if (!required) return null;
    throw new HttpError(401, "missing API key");
  }
  const hash = await sha256Hex(key);
  const row = await env.DB.prepare(
    `SELECT u.id AS user_id, u.plan, u.subscription_status, u.period_end
       FROM api_keys k JOIN users u ON u.id = k.user_id
      WHERE k.key_hash = ? AND k.revoked_at IS NULL`,
  )
    .bind(hash)
    .first<Row>();
  if (!row) throw new HttpError(401, "invalid API key");
  const plan = String(row.plan || "").toLowerCase();
  const normalized = plan === "basic" ? "developer" : plan;
  if (!(normalized in PLAN_HISTORY)) throw new HttpError(402, "no active subscription");
  const status = String(row.subscription_status || "");
  const periodEnd = row.period_end ? String(row.period_end).slice(0, 10) : null;
  const active = status === "active";
  const pastDueOk =
    status === "past_due" &&
    periodEnd !== null &&
    Date.parse(`${periodEnd}T00:00:00Z`) + 3 * 86400000 >= Date.parse(`${today()}T00:00:00Z`);
  if (!active && !pastDueOk) throw new HttpError(402, "subscription inactive");
  return {
    userId: String(row.user_id),
    plan: normalized,
    historyYears: PLAN_HISTORY[normalized],
    pro: normalized === "pro" || normalized === "business",
  };
}

class HttpError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function historyFloor(caller: Caller): string | null {
  return caller.historyYears === null ? null : minusYears(caller.historyYears);
}

// ---------------------------------------------------------------------------
// Accounts, sessions and API keys (free-tier self-serve on D1)
// ---------------------------------------------------------------------------

const PLAN_LIMITS: Record<string, { per_min: number; per_day: number; credits: number | null }> = {
  free: { per_min: 10, per_day: 500, credits: 500 },
  developer: { per_min: 60, per_day: 10000, credits: null },
  pro: { per_min: 300, per_day: 100000, credits: null },
  business: { per_min: 600, per_day: 500000, credits: null },
};

function callerFromUser(row: Row): Caller {
  const raw = String(row.plan || "free").toLowerCase();
  const plan = raw === "basic" ? "developer" : raw in PLAN_LIMITS ? raw : "free";
  return {
    userId: String(row.user_id ?? row.id),
    plan,
    historyYears: PLAN_HISTORY[plan],
    pro: plan === "pro" || plan === "business",
  };
}

function b64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function unb64(value: string): Uint8Array {
  const bin = atob(value);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function b64url(bytes: Uint8Array): string {
  return b64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" }, key, 256,
  );
  return new Uint8Array(bits);
}

const PBKDF2_ITERATIONS = 100000;

async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const dk = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2_sha256$${PBKDF2_ITERATIONS}$${b64(salt)}$${b64(dk)}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const [algo, iters, saltB64, dkB64] = stored.split("$");
    if (algo !== "pbkdf2_sha256") return false;
    // Cloudflare WebCrypto rejects >100k iterations. Old Python hashes at
    // 200k must be reset (the API key still works; only dashboard login needs it).
    if (Number(iters) > PBKDF2_ITERATIONS) return false;
    const expected = unb64(dkB64);
    const got = await pbkdf2(password, unb64(saltB64), Number(iters));
    if (got.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < got.length; i++) diff |= got[i] ^ expected[i];
    return diff === 0;
  } catch {
    return false;
  }
}

async function createSession(env: Env, userId: string): Promise<string> {
  const token = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const now = new Date().toISOString();
  const expires = new Date(Date.now() + 30 * 86400000).toISOString();
  await env.DB.prepare(
    "INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?,?,?,?)",
  ).bind(await sha256Hex(token), userId, expires, now).run();
  return token;
}

async function authenticateSessionOrKey(req: Request, env: Env): Promise<Caller> {
  const session = req.headers.get("X-Session-Token");
  if (session) {
    const row = await env.DB.prepare(
      `SELECT u.id AS user_id, u.plan
         FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = ? AND s.expires_at > ?`,
    ).bind(await sha256Hex(session), new Date().toISOString()).first<Row>();
    if (!row) throw new HttpError(401, "invalid or expired session");
    return callerFromUser(row);
  }
  return (await authenticate(req, env, true))!;
}

async function signup(req: Request, env: Env): Promise<Response> {
  const body = await req.json<{ email?: string; password?: string }>().catch(() => ({}));
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(422, "a valid email is required");
  if (password.length < 8) throw new HttpError(422, "password must be at least 8 characters");

  const ip = req.headers.get("CF-Connecting-IP") || "unknown";
  const day = today();
  const hit = await env.DB.prepare(
    `INSERT INTO signup_ips (ip, day, count) VALUES (?,?,1)
     ON CONFLICT(ip, day) DO UPDATE SET count = count + 1 RETURNING count`,
  ).bind(ip, day).first<Row>();
  if (Number(hit?.count || 0) > 20) throw new HttpError(429, "too many signups from this address; try again tomorrow");

  const existing = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
  if (existing) throw new HttpError(409, "an account already exists for this email; sign in instead");

  const userId = crypto.randomUUID();
  const now = new Date().toISOString();
  const period = `${day.slice(0, 7)}-01`;
  await env.DB.prepare(
    `INSERT INTO users
       (id, email, created_at, plan, subscription_status, credits_remaining, credits_period, password_hash)
     VALUES (?,?,?,?,?,?,?,?)`,
  ).bind(userId, email, now, "free", "active", 500, period, await hashPassword(password)).run();

  const plaintext = `bd_live_${b64url(crypto.getRandomValues(new Uint8Array(32)))}`;
  const prefix = `${plaintext.slice(0, 16)}…`;
  await env.DB.prepare(
    `INSERT INTO api_keys (key_hash, user_id, label, created_at, id, key_prefix)
     VALUES (?,?,?,?,?,?)`,
  ).bind(await sha256Hex(plaintext), userId, "free signup", now, crypto.randomUUID(), prefix).run();

  const token = await createSession(env, userId);
  return json({
    success: true,
    session_token: token,
    email,
    plan: "free",
    api_key: plaintext,
    note: "store this key now — it is shown only once",
  }, 201);
}

async function login(req: Request, env: Env): Promise<Response> {
  const body = await req.json<{ email?: string; password?: string }>().catch(() => ({}));
  const email = String(body.email || "").trim().toLowerCase();
  const row = await env.DB.prepare("SELECT id, password_hash FROM users WHERE email = ?").bind(email).first<Row>();
  if (!row || !(await verifyPassword(String(body.password || ""), String(row.password_hash || "")))) {
    throw new HttpError(401, "invalid email or password");
  }
  return json({ success: true, session_token: await createSession(env, String(row.id)), email });
}

async function logout(req: Request, env: Env): Promise<Response> {
  const body = await req.json<{ session_token?: string }>().catch(() => ({}));
  if (body.session_token) {
    await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256Hex(body.session_token)).run();
  }
  return json({ success: true });
}

async function changePassword(req: Request, env: Env): Promise<Response> {
  const caller = await authenticateSessionOrKey(req, env);
  const body = await req.json<{ current_password?: string; new_password?: string }>().catch(() => ({}));
  if (String(body.new_password || "").length < 8) {
    throw new HttpError(422, "new password must be at least 8 characters");
  }
  const row = await env.DB.prepare("SELECT password_hash FROM users WHERE id = ?").bind(caller.userId).first<Row>();
  if (!row || !(await verifyPassword(String(body.current_password || ""), String(row.password_hash || "")))) {
    throw new HttpError(401, "current password is incorrect");
  }
  await env.DB.prepare("UPDATE users SET password_hash = ? WHERE id = ?")
    .bind(await hashPassword(String(body.new_password)), caller.userId).run();
  return json({ success: true });
}

async function account(req: Request, env: Env): Promise<Response> {
  const caller = await authenticateSessionOrKey(req, env);
  if (req.method === "PATCH") {
    const body = await req.json<{ name?: string | null; company?: string | null }>().catch(() => ({}));
    const updates: string[] = [];
    const params: any[] = [];
    for (const key of ["name", "company"] as const) {
      if (key in body) {
        updates.push(`${key} = ?`);
        params.push(String(body[key] ?? "").trim().slice(0, 120) || null);
      }
    }
    if (updates.length) {
      await env.DB.prepare(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`)
        .bind(...params, caller.userId).run();
    }
    return json({ success: true });
  }
  const u = await env.DB.prepare(
    "SELECT email, plan, subscription_status, period_end, name, company FROM users WHERE id = ?",
  ).bind(caller.userId).first<Row>();
  const keys = await env.DB.prepare(
    "SELECT count(*) AS c FROM api_keys WHERE user_id = ? AND revoked_at IS NULL",
  ).bind(caller.userId).first<Row>();
  return json({
    success: true,
    email: u?.email ?? null,
    name: u?.name ?? null,
    company: u?.company ?? null,
    plan: caller.plan,
    subscription_status: u?.subscription_status ?? null,
    period_end: u?.period_end ?? null,
    active_keys: Number(keys?.c || 0),
    active_webhooks: 0,
  });
}

async function keys(req: Request, env: Env, keyId?: string): Promise<Response> {
  const caller = await authenticateSessionOrKey(req, env);
  if (req.method === "GET") {
    const rows = await env.DB.prepare(
      `SELECT id, key_prefix, label, created_at, revoked_at, last_used_at
         FROM api_keys WHERE user_id = ? ORDER BY created_at DESC`,
    ).bind(caller.userId).all<Row>();
    return json({ success: true, data: rows.results || [], count: rows.results?.length || 0 });
  }
  if (req.method === "DELETE") {
    if (!keyId) throw new HttpError(422, "key id is required");
    await env.DB.prepare(
      "UPDATE api_keys SET revoked_at = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL",
    ).bind(new Date().toISOString(), keyId, caller.userId).run();
    return json({ success: true, revoked: keyId });
  }
  const active = await env.DB.prepare(
    "SELECT count(*) AS c FROM api_keys WHERE user_id = ? AND revoked_at IS NULL",
  ).bind(caller.userId).first<Row>();
  if (Number(active?.c || 0) >= 3) throw new HttpError(403, "key limit reached (3); revoke one first");
  const body = await req.json<{ label?: string }>().catch(() => ({}));
  const plaintext = `bd_live_${b64url(crypto.getRandomValues(new Uint8Array(32)))}`;
  const prefix = `${plaintext.slice(0, 16)}…`;
  await env.DB.prepare(
    "INSERT INTO api_keys (key_hash, user_id, label, created_at, id, key_prefix) VALUES (?,?,?,?,?,?)",
  ).bind(await sha256Hex(plaintext), caller.userId, body.label ?? null, new Date().toISOString(),
    crypto.randomUUID(), prefix).run();
  return json({
    success: true, api_key: plaintext, key_prefix: prefix,
    note: "store this key now — it is shown only once",
  }, 201);
}

async function usage(req: Request, env: Env, url: URL): Promise<Response> {
  const caller = await authenticateSessionOrKey(req, env);
  if (url.pathname.endsWith("/history")) return json({ success: true, data: [], count: 0 });
  if (url.pathname.endsWith("/endpoints")) {
    return json({ success: true, days: Number(url.searchParams.get("days") || 30), data: [], count: 0 });
  }
  const limits = PLAN_LIMITS[caller.plan];
  const u = await env.DB.prepare("SELECT credits_remaining, credits_period FROM users WHERE id = ?")
    .bind(caller.userId).first<Row>();
  return json({
    success: true,
    plan: caller.plan,
    limits: {
      per_min: limits.per_min,
      per_day: limits.per_day,
      history_years: caller.historyYears,
      credits: limits.credits,
    },
    usage: {
      minute_used: 0,
      minute_remaining: limits.per_min,
      day_used: 0,
      day_remaining: limits.per_day,
      credits_remaining: limits.credits === null ? null : Number(u?.credits_remaining ?? limits.credits),
      credits_reset: limits.credits === null ? null : `${today().slice(0, 7)}-01`,
    },
  });
}

// ---------------------------------------------------------------------------
// Series transforms (ported from backend/app/services/transforms.py)
// ---------------------------------------------------------------------------

const TRANSFORMS = new Set(["yoy", "mom", "pct_change", "3ma", "index"]);

function transformedUnit(kind: string, unit: string | null): string | null {
  if (kind === "yoy" || kind === "mom" || kind === "pct_change") return "percent";
  if (kind === "index") return "index";
  return unit;
}

function pct(current: number | null, base: number | null): number | null {
  if (current === null || base === null || base === 0) return null;
  return (current / base - 1) * 100;
}

function shiftYear(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const target = new Date(d);
  target.setUTCFullYear(d.getUTCFullYear() - 1);
  if (target.getUTCMonth() !== d.getUTCMonth()) target.setUTCDate(0);
  return iso(target);
}

function shiftMonth(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d.getUTCDate(), last));
  return iso(target);
}

function applyTransform(rows: Row[], kind: string, frequency: string): Row[] {
  if (!TRANSFORMS.has(kind)) throw new HttpError(422, `unknown transform '${kind}'`);
  if (kind === "yoy" && !["daily", "weekly", "monthly", "quarterly"].includes(frequency)) {
    throw new HttpError(422, `transform 'yoy' needs a sub-annual series; this one is '${frequency}'`);
  }
  if (kind === "mom" && frequency !== "monthly") {
    throw new HttpError(422, `transform 'mom' needs a monthly series; this one is '${frequency}'`);
  }
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const key = JSON.stringify(r.dims || {});
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push({ ...r, value: r.value === null ? null : Number(r.value) });
  }
  const out: Row[] = [];
  for (const group of groups.values()) {
    const asc = group.slice().sort((a, b) => String(a.obs_date).localeCompare(String(b.obs_date)));
    if (kind === "yoy" || kind === "mom") {
      const byDate = new Map(asc.map((r) => [r.obs_date, r.value]));
      for (const r of asc) {
        const target = kind === "yoy" ? shiftYear(r.obs_date) : shiftMonth(r.obs_date);
        let base = byDate.get(target) ?? null;
        if (base === null && kind === "yoy" && frequency === "daily") {
          const t = Date.parse(`${target}T00:00:00Z`);
          let best: string | null = null;
          for (const d of asc.map((x) => x.obs_date)) {
            if (Date.parse(`${d}T00:00:00Z`) > t) break;
            if (t - Date.parse(`${d}T00:00:00Z`) <= 7 * 86400000) best = d;
          }
          base = best ? byDate.get(best) ?? null : null;
        }
        out.push({ ...r, value: pct(num(r.value), num(base)) });
      }
    } else if (kind === "pct_change") {
      let prev: number | null = null;
      for (const r of asc) {
        out.push({ ...r, value: pct(num(r.value), prev) });
        prev = num(r.value);
      }
    } else if (kind === "3ma") {
      let window: number[] = [];
      for (const r of asc) {
        const v = num(r.value);
        if (v === null) {
          window = [];
          out.push({ ...r, value: null });
          continue;
        }
        window.push(v);
        if (window.length > 3) window.shift();
        out.push({ ...r, value: window.length === 3 ? window.reduce((a, b) => a + b, 0) / 3 : null });
      }
    } else {
      const base = asc.find((r) => num(r.value) !== null)?.value ?? null;
      const b = num(base);
      for (const r of asc) {
        const v = num(r.value);
        out.push({ ...r, value: v !== null && b ? (v / b) * 100 : null });
      }
    }
  }
  return out.sort((a, b) => String(a.obs_date).localeCompare(String(b.obs_date)));
}

// ---------------------------------------------------------------------------
// Catalog / status
// ---------------------------------------------------------------------------

function meta(row: Row): Row {
  return {
    id: row.id,
    module: row.module,
    name: row.name,
    description: row.description,
    unit: row.unit,
    frequency: row.frequency,
    source: row.source,
    source_url: row.source_url,
    dimensions: parseJson(row.dimensions, {}),
    first_date: row.first_date,
    last_date: row.last_date,
    tier: row.tier || "basic",
    canonical_id: row.canonical_id ?? null,
    derived: parseJson(row.derivation, null),
  };
}

const FRESHNESS: Record<string, [number, number]> = {
  daily: [3, 8],
  weekly: [10, 21],
  monthly: [45, 95],
  quarterly: [150, 220],
  annual: [550, 640],
  yearly: [550, 640],
  irregular: [45, 95],
  census: [4000, 4500],
  survey: [1500, 2200],
};

function freshness(lastDate: string | null, frequency: string): { age_days: number | null; state: string } {
  if (!lastDate) return { age_days: null, state: "stale" };
  const age = Math.max(0, daysBetween(lastDate, today()));
  const [delayed, stale] = FRESHNESS[frequency] || FRESHNESS.irregular;
  return { age_days: age, state: age > stale ? "stale" : age > delayed ? "delayed" : "fresh" };
}

async function catalogList(env: Env, url: URL): Promise<Response> {
  const module = url.searchParams.get("module");
  const source = url.searchParams.get("source");
  const q = url.searchParams.get("q");
  const canonicalOnly = url.searchParams.get("canonical_only") === "true";
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(url.searchParams.get("limit") || 500)));
  const offset = Math.max(0, Number(url.searchParams.get("offset") || 0));

  const clauses = ["is_active = 1"];
  const params: any[] = [];
  if (module) {
    clauses.push("module = ?");
    params.push(module);
  }
  if (source) {
    clauses.push("source = ?");
    params.push(source);
  }
  if (q) {
    clauses.push("(name LIKE ? OR description LIKE ? OR id LIKE ?)");
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (canonicalOnly) clauses.push("canonical_id IS NULL");
  const where = clauses.join(" AND ");

  const [rows, count] = await Promise.all([
    env.DB.prepare(`SELECT * FROM series WHERE ${where} ORDER BY id LIMIT ? OFFSET ?`)
      .bind(...params, limit, offset).all<Row>(),
    env.DB.prepare(`SELECT count(*) AS c FROM series WHERE ${where}`).bind(...params).first<Row>(),
  ]);
  return json(
    { success: true, data: (rows.results || []).map(meta), pagination: { next_cursor: null, count: Number(count?.c || 0) } },
    200,
    { "Cache-Control": PUBLIC_CACHE },
  );
}

async function status(env: Env): Promise<Response> {
  const [moduleRows, freqRows, totals, dse, dam, funds, auctions, jobs] = await Promise.all([
    env.DB.prepare(
      `SELECT s.module, count(DISTINCT s.id) AS series_count, count(o.series_id) AS observation_count,
              min(o.obs_date) AS first_date, max(o.obs_date) AS last_date
         FROM series s LEFT JOIN observations o ON o.series_id = s.id
        WHERE s.is_active = 1 GROUP BY s.module`,
    ).all<Row>(),
    env.DB.prepare(
      `SELECT module, frequency, count(*) AS c FROM series WHERE is_active = 1 GROUP BY module, frequency`,
    ).all<Row>(),
    env.DB.prepare(
      `SELECT (SELECT count(*) FROM series WHERE is_active = 1) AS series,
              (SELECT count(DISTINCT json_extract(dims, '$.fund')) FROM observations
                WHERE series_id LIKE 'funds.%' AND json_extract(dims, '$.fund') IS NOT NULL) AS funds,
              (SELECT count(DISTINCT substr(id, 7, instr(substr(id, 7), '.') - 1)) FROM series
                WHERE id LIKE 'funds.%' AND id NOT LIKE 'funds.registry.%'
                  AND id NOT LIKE 'funds.amc_nav.%') AS amcs,
              (SELECT count(*) FROM dse_securities) AS securities,
              (SELECT count(*) FROM observation_revisions) AS revisions`,
    ).first<Row>(),
    env.DB.prepare(`SELECT count(*) AS records, count(DISTINCT code) AS entities, max(obs_date) AS last_date FROM dse_prices`).first<Row>(),
    env.DB.prepare(`SELECT count(*) AS records, count(DISTINCT division || '|' || commodity) AS entities, max(price_date) AS last_date FROM dam_prices`).first<Row>(),
    env.DB.prepare(`SELECT count(*) AS records, count(DISTINCT json_extract(dims, '$.fund')) AS entities, max(obs_date) AS last_date
                      FROM observations WHERE series_id LIKE 'funds.%' AND json_extract(dims, '$.fund') IS NOT NULL`).first<Row>(),
    env.DB.prepare(`SELECT count(*) AS records, count(DISTINCT auction_type) AS entities, max(auction_date) AS last_date FROM auctions`).first<Row>(),
    env.DB.prepare(
      `SELECT r.job_name, r.status, r.started_at, r.finished_at, r.rows_upserted, r.error
         FROM ingestion_runs r
         JOIN (SELECT job_name, max(started_at) AS m FROM ingestion_runs GROUP BY job_name) x
           ON x.job_name = r.job_name AND x.m = r.started_at
        ORDER BY r.job_name`,
    ).all<Row>(),
  ]);

  const dominant = new Map<string, string>();
  for (const r of freqRows.results || []) {
    const cur = dominant.get(r.module);
    if (!cur) dominant.set(r.module, r.frequency);
  }
  const modules = (moduleRows.results || []).map((r) => {
    const freq = dominant.get(r.module) || "irregular";
    return {
      module: r.module,
      series_count: Number(r.series_count || 0),
      observation_count: Number(r.observation_count || 0),
      first_date: r.first_date,
      last_date: r.last_date,
      frequency: freq,
      ...freshness(r.last_date, freq),
    };
  });

  const dataset = (name: string, row: Row | null, frequency: string) => {
    const last = row?.last_date ?? null;
    return {
      dataset: name,
      records: Number(row?.records || 0),
      entities: Number(row?.entities || 0),
      last_date: last,
      frequency,
      ...freshness(last, frequency),
    };
  };

  const jobsOut = (jobs.results || []).map((r) => {
    const recent = r.started_at ? daysBetween(String(r.started_at).slice(0, 10), today()) <= 21 : false;
    return {
      job: r.job_name,
      status: r.status,
      last_run: r.started_at,
      finished_at: r.finished_at,
      rows: Number(r.rows_upserted || 0),
      error: r.error || null,
      recent,
    };
  });

  return json(
    {
      success: true,
      totals: {
        series: Number(totals?.series || 0),
        funds: Number(totals?.funds || 0),
        amcs: Number(totals?.amcs || 0),
        securities: Number(totals?.securities || 0),
        revisions: Number(totals?.revisions || 0),
      },
      modules,
      datasets: [
        dataset("funds", funds, "daily"),
        dataset("dse", dse, "daily"),
        dataset("auctions", auctions, "irregular"),
        dataset("agri", dam, "daily"),
      ],
      jobs: jobsOut,
      ops: { p95_ms: null, availability_pct: null, requests_24h: 0 },
    },
    200,
    { "Cache-Control": "public, max-age=60, s-maxage=60" },
  );
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

async function search(env: Env, url: URL): Promise<Response> {
  const q = (url.searchParams.get("q") || "").trim();
  if (!q) return json({ success: true, data: [], count: 0 });
  const module = url.searchParams.get("module");
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") || 20)));
  const kinds = (url.searchParams.get("kinds") || "series").trim();

  const clauses = ["is_active = 1", "(id LIKE ? OR name LIKE ? OR description LIKE ?)"];
  const params: any[] = [`%${q}%`, `%${q}%`, `%${q}%`];
  if (module) {
    clauses.push("module = ?");
    params.push(module);
  }
  const rows = await env.DB.prepare(
    `SELECT id, module, name, description, unit, frequency, source
       FROM series WHERE ${clauses.join(" AND ")}
      ORDER BY CASE WHEN id = ? THEN 0 WHEN name = ? THEN 1 WHEN id LIKE ? THEN 2 WHEN name LIKE ? THEN 3 ELSE 4 END,
               name
      LIMIT ?`,
  )
    .bind(...params, q, q, `${q}%`, `${q}%`, limit)
    .all<Row>();

  const data: Row[] = (rows.results || []).map((r) => ({
    kind: "series",
    id: r.id,
    title: r.name,
    subtitle: r.id,
    url: `/series/${encodeURIComponent(r.id)}`,
    module: r.module,
    unit: r.unit,
    frequency: r.frequency,
  }));

  if (kinds === "all" || kinds.split(",").map((k) => k.trim()).includes("district")) {
    const districts = await env.DB.prepare(
      `SELECT obs_date, value, dims FROM observations
        WHERE series_id = 'regional.census.population'
          AND json_extract(dims, '$.district') LIKE ?
        ORDER BY obs_date DESC LIMIT 20`,
    )
      .bind(`%${q}%`)
      .all<Row>();
    const seen = new Set<string>();
    for (const r of districts.results || []) {
      const dims = parseJson<Row>(r.dims, {});
      if (!dims.district || seen.has(dims.district)) continue;
      seen.add(dims.district);
      data.push({
        kind: "district",
        title: dims.district,
        subtitle: `${dims.division || ""} district`,
        url: `/districts/${encodeURIComponent(dims.district)}`,
        module: "regional",
        unit: "count",
        frequency: "census",
      });
      if (data.length >= limit) break;
    }
  }
  return json({ success: true, data: data.slice(0, limit), count: Math.min(data.length, limit) });
}

// ---------------------------------------------------------------------------
// Series
// ---------------------------------------------------------------------------

async function seriesById(env: Env, id: string): Promise<Row | null> {
  return env.DB.prepare("SELECT * FROM series WHERE id = ?").bind(id).first<Row>();
}

function dimsFilters(raw: string | null): Record<string, string> {
  if (!raw) return {};
  const out: Record<string, string> = {};
  for (const pair of raw.split(",")) {
    const idx = pair.indexOf(":");
    if (idx < 0) throw new HttpError(422, `bad dims token: '${pair}'`);
    out[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
  }
  return out;
}

function dimsClauses(dims: Record<string, string>): { sql: string; params: string[] } {
  const parts: string[] = [];
  const params: string[] = [];
  for (const [k, v] of Object.entries(dims)) {
    parts.push(`json_extract(dims, '$.${k.replace(/'/g, "")}') = ?`);
    params.push(v);
  }
  return { sql: parts.length ? ` AND ${parts.join(" AND ")}` : "", params };
}

async function seriesData(env: Env, id: string, url: URL, caller: Caller): Promise<Response> {
  const row = await seriesById(env, id);
  if (!row) throw new HttpError(404, "unknown series");

  const dims = dimsFilters(url.searchParams.get("dims"));
  let from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(url.searchParams.get("limit") || 1000)));
  const sort = url.searchParams.get("sort") === "asc" ? "asc" : "desc";
  const format = url.searchParams.get("format") === "csv" ? "csv" : "json";
  const transform = url.searchParams.get("transform");
  const vintage = url.searchParams.get("vintage");

  const floor = historyFloor(caller);
  if (floor && (!from || from < floor)) from = floor;

  let rows: Row[];
  if (vintage) {
    if (!caller.pro) throw new HttpError(403, "vintages require the Pro plan");
    rows = await asOfVintage(env, id, vintage, from, to, dims, limit);
  } else {
    const d = dimsClauses(dims);
    const clauses = ["series_id = ?", ...(from ? ["obs_date >= ?"] : []), ...(to ? ["obs_date <= ?"] : [])];
    const params: any[] = [id, ...(from ? [from] : []), ...(to ? [to] : [])];
    const sql = `SELECT obs_date, value, dims, flagged FROM observations
                  WHERE ${clauses.join(" AND ")}${d.sql}
                  ORDER BY obs_date ${sort === "asc" ? "ASC" : "DESC"} LIMIT ?`;
    rows = (await env.DB.prepare(sql).bind(...params, ...d.params, limit).all<Row>()).results || [];
  }

  if (transform) {
    if (!TRANSFORMS.has(transform)) throw new HttpError(422, `unknown transform '${transform}'`);
    const periodDays: Record<string, number> = {
      daily: 10, weekly: 21, fortnightly: 21, monthly: 45, quarterly: 120,
      "half-yearly": 200, semiannual: 200, annual: 400,
    };
    const per = periodDays[String(row.frequency || "").toLowerCase()] || 400;
    const lookback =
      transform === "index" ? null
        : transform === "yoy" ? 400
        : transform === "mom" ? 40
        : transform === "3ma" ? per * 3
        : per;
    if (lookback && from) {
      const d = dimsClauses(dims);
      const clauses = ["series_id = ?", "obs_date >= ?", ...(to ? ["obs_date <= ?"] : [])];
      const params: any[] = [id, iso(new Date(Date.parse(`${from}T00:00:00Z`) - lookback * 86400000)), ...(to ? [to] : [])];
      const sql = `SELECT obs_date, value, dims FROM observations WHERE ${clauses.join(" AND ")}${d.sql} ORDER BY obs_date ASC`;
      rows = (await env.DB.prepare(sql).bind(...params, ...d.params).all<Row>()).results || [];
    }
    rows = applyTransform(rows, transform, row.frequency);
    if (from) rows = rows.filter((r) => String(r.obs_date) >= from!);
    if (sort === "desc") rows = rows.slice().reverse();
    rows = rows.slice(0, limit);
  }

  const notes = await notesFor(env, id, rows.map((r) => String(r.obs_date)));

  if (format === "csv") {
    const lines = ["series,date,value,dims"];
    for (const r of rows) {
      const d = parseJson<Row>(r.dims, {});
      const cells = [id, r.obs_date, r.value ?? "", Object.keys(d).length ? JSON.stringify(d) : ""];
      lines.push(cells.map(csvCell).join(","));
    }
    return new Response(lines.join("\n"), {
      headers: { "content-type": "text/csv; charset=utf-8", ...CORS, "Cache-Control": PUBLIC_CACHE },
    });
  }

  return json(
    {
      success: true,
      series: id,
      meta: {
        name: row.name,
        unit: transform ? transformedUnit(transform, row.unit) : row.unit,
        frequency: row.frequency,
        source: row.source,
        last_updated: row.last_date,
        transform: transform || null,
        derived: parseJson(row.derivation, null),
        notes: notes.length ? notes : null,
      },
      data: rows.map((r) => ({
        date: r.obs_date,
        value: r.value === null ? null : Number(r.value),
        dims: parseJson(r.dims, {}),
      })),
      pagination: { next_cursor: null, count: rows.length },
    },
    200,
    { "Cache-Control": PUBLIC_CACHE },
  );
}

function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

async function notesFor(env: Env, id: string, dates: string[]): Promise<Row[]> {
  if (!dates.length) return [];
  const unique = [...new Set(dates)];
  const placeholders = unique.map(() => "?").join(",");
  const rows = await env.DB.prepare(
    `SELECT obs_date, dims, note, kind FROM observation_notes
      WHERE series_id = ? AND obs_date IN (${placeholders}) ORDER BY obs_date`,
  )
    .bind(id, ...unique)
    .all<Row>();
  return (rows.results || []).map((r) => ({
    date: r.obs_date,
    dims: parseJson(r.dims, {}),
    note: r.note,
    kind: r.kind,
  }));
}

async function asOfVintage(
  env: Env, id: string, vintage: string, from: string | null, to: string | null,
  dims: Record<string, string>, limit: number,
): Promise<Row[]> {
  const vt = `${vintage}T23:59:59.999Z`;
  const d = dimsClauses(dims);
  const clauses = ["series_id = ?", ...(from ? ["obs_date >= ?"] : []), ...(to ? ["obs_date <= ?"] : [])];
  const params: any[] = [id, ...(from ? [from] : []), ...(to ? [to] : [])];
  const current = (await env.DB.prepare(
    `SELECT obs_date, value, dims, first_seen_at FROM observations
      WHERE ${clauses.join(" AND ")}${d.sql} ORDER BY obs_date DESC LIMIT ?`,
  ).bind(...params, ...d.params, limit).all<Row>()).results || [];
  const revs = (await env.DB.prepare(
    `SELECT obs_date, dims, value, superseded_at FROM observation_revisions
      WHERE series_id = ? ORDER BY obs_date, superseded_at ASC`,
  ).bind(id).all<Row>()).results || [];

  const byKey = new Map<string, Row[]>();
  for (const r of revs) {
    const key = `${r.obs_date}|${JSON.stringify(parseJson(r.dims, {}))}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(r);
  }
  const out: Row[] = [];
  for (const r of current) {
    const known = r.first_seen_at ? String(r.first_seen_at) : "2026-10-04T00:00:00Z";
    if (known > vt) continue;
    const key = `${r.obs_date}|${JSON.stringify(parseJson(r.dims, {}))}`;
    const chain = byKey.get(key) || [];
    let value = r.value;
    for (const rev of chain) {
      if (String(rev.superseded_at) > vt) {
        value = rev.value;
        break;
      }
    }
    out.push({ obs_date: r.obs_date, value, dims: r.dims });
  }
  return out.sort((a, b) => String(b.obs_date).localeCompare(String(a.obs_date)));
}

async function latest(env: Env, id: string, url: URL, caller: Caller): Promise<Response> {
  const row = await seriesById(env, id);
  if (!row) throw new HttpError(404, "unknown series");
  const dims = dimsFilters(url.searchParams.get("dims"));
  const d = dimsClauses(dims);
  const rows = await env.DB.prepare(
    `SELECT obs_date, value, dims, flagged FROM (
       SELECT obs_date, value, dims, flagged,
              ROW_NUMBER() OVER (PARTITION BY dims ORDER BY obs_date DESC) AS rn
         FROM observations WHERE series_id = ?${d.sql}
     ) WHERE rn = 1 ORDER BY obs_date DESC`,
  ).bind(id, ...d.params).all<Row>();
  const notes = await notesFor(env, id, (rows.results || []).map((r) => String(r.obs_date)));
  return json(
    {
      success: true,
      series: id,
      meta: {
        name: row.name, unit: row.unit, frequency: row.frequency, source: row.source,
        last_updated: row.last_date, transform: null, derived: parseJson(row.derivation, null),
        notes: notes.length ? notes : null,
      },
      data: (rows.results || []).map((r) => ({
        date: r.obs_date, value: r.value === null ? null : Number(r.value), dims: parseJson(r.dims, {}),
      })),
      pagination: { next_cursor: null, count: rows.results?.length || 0 },
    },
    200,
    { "Cache-Control": PUBLIC_CACHE },
  );
}

async function revisions(env: Env, id: string, url: URL, caller: Caller): Promise<Response> {
  const row = await seriesById(env, id);
  if (!row) throw new HttpError(404, "unknown series");
  if (!caller.pro) throw new HttpError(403, "revision history requires the Pro plan");
  const dims = dimsFilters(url.searchParams.get("dims"));
  const changedOnly = url.searchParams.get("changed_only") === "true";
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(url.searchParams.get("limit") || 1000)));
  const d = dimsClauses(dims);
  const current = (await env.DB.prepare(
    `SELECT obs_date, value, dims, first_seen_at FROM observations WHERE series_id = ?${d.sql} ORDER BY obs_date DESC LIMIT ?`,
  ).bind(id, ...d.params, limit).all<Row>()).results || [];
  const revs = (await env.DB.prepare(
    `SELECT obs_date, dims, value, superseded_at FROM observation_revisions WHERE series_id = ? ORDER BY obs_date, superseded_at ASC`,
  ).bind(id).all<Row>()).results || [];
  const byKey = new Map<string, Row[]>();
  for (const r of revs) {
    const key = `${r.obs_date}|${JSON.stringify(parseJson(r.dims, {}))}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(r);
  }
  const data = [];
  for (const r of current) {
    const key = `${r.obs_date}|${JSON.stringify(parseJson(r.dims, {}))}`;
    const chain = byKey.get(key) || [];
    if (changedOnly && chain.length === 0) continue;
    const firstPrint = chain.length ? chain[0].value : r.value;
    data.push({
      date: r.obs_date,
      dims: parseJson(r.dims, {}),
      value: r.value === null ? null : Number(r.value),
      first_print: firstPrint === null ? null : Number(firstPrint),
      first_seen: r.first_seen_at ? String(r.first_seen_at).slice(0, 10) : null,
      revisions: chain.map((v) => ({
        value: v.value === null ? null : Number(v.value),
        until: String(v.superseded_at).slice(0, 10),
        source: "BanglaDataHub revision tracking",
      })),
    });
  }
  return json({
    success: true,
    series: id,
    meta: {
      name: row.name, unit: row.unit, frequency: row.frequency, source: row.source,
      last_updated: row.last_date, transform: null, derived: parseJson(row.derivation, null),
      notes: null,
    },
    data,
    pagination: { next_cursor: null, count: data.length, revised_points: data.filter((x) => x.revisions.length).length },
  });
}

// ---------------------------------------------------------------------------
// Market / regional / funds / DAM
// ---------------------------------------------------------------------------

async function marketOverview(env: Env): Promise<Response> {
  const [idx, day] = await Promise.all([
    env.DB.prepare(
      `SELECT index_code, obs_date, value, change, change_pct FROM (
         SELECT *, ROW_NUMBER() OVER (PARTITION BY index_code ORDER BY obs_date DESC) AS rn
           FROM dse_indices
       ) WHERE rn = 1`,
    ).all<Row>(),
    env.DB.prepare("SELECT * FROM dse_market_daily ORDER BY obs_date DESC LIMIT 1").first<Row>(),
  ]);
  return json({
    success: true,
    indices: (idx.results || []).map((r) => ({
      code: r.index_code, date: r.obs_date, value: num(r.value),
      change: num(r.change), change_pct: num(r.change_pct),
    })),
    session: {
      date: day?.obs_date ?? null,
      turnover_mn: num(day?.turnover_mn),
      volume: num(day?.volume),
      trades: day?.trades ?? null,
      advances: day?.advances ?? null,
      declines: day?.declines ?? null,
      unchanged: day?.unchanged ?? null,
      market_cap_total_mn: num(day?.market_cap_total_mn),
    },
  }, 200, { "Cache-Control": "public, max-age=120, s-maxage=120" });
}

async function marketSecurities(env: Env, url: URL): Promise<Response> {
  const q = url.searchParams.get("q");
  const sector = url.searchParams.get("sector");
  const limit = Math.min(5000, Math.max(1, Number(url.searchParams.get("limit") || 1000)));
  const clauses = ["s.is_active = 1"];
  const params: any[] = [];
  if (q) {
    clauses.push("(s.code LIKE ? OR s.name LIKE ?)");
    params.push(`%${q}%`, `%${q}%`);
  }
  if (sector) {
    clauses.push("s.sector = ?");
    params.push(sector);
  }
  const rows = await env.DB.prepare(
    `SELECT s.code, s.name, s.sector, s.board, s.category, s.asset_type,
            p.obs_date, p.ltp, p.ycp, p.close, p.volume, p.value_mn, p.trades, p.change_pct
       FROM dse_securities s
       LEFT JOIN dse_prices p ON p.code = s.code
        AND p.obs_date = (SELECT max(obs_date) FROM dse_prices WHERE code = s.code)
      WHERE ${clauses.join(" AND ")}
      ORDER BY COALESCE(p.value_mn, 0) DESC LIMIT ?`,
  ).bind(...params, limit).all<Row>();
  return json({
    success: true,
    data: (rows.results || []).map((r) => ({
      code: r.code, name: r.name, sector: r.sector, board: r.board, category: r.category,
      asset_type: r.asset_type, date: r.obs_date, ltp: num(r.ltp), ycp: num(r.ycp),
      close: num(r.close), value_mn: num(r.value_mn), trades: r.trades,
      change_pct: num(r.change_pct),
    })),
    count: rows.results?.length || 0,
  }, 200, { "Cache-Control": PUBLIC_CACHE });
}

async function marketPrices(env: Env, code: string, url: URL): Promise<Response> {
  const exists = await env.DB.prepare("SELECT 1 FROM dse_securities WHERE code = ?").bind(code).first();
  if (!exists) throw new HttpError(404, "unknown instrument");
  const clauses = ["code = ?"];
  const params: any[] = [code];
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if (from) { clauses.push("obs_date >= ?"); params.push(from); }
  if (to) { clauses.push("obs_date <= ?"); params.push(to); }
  const limit = Math.min(5000, Math.max(1, Number(url.searchParams.get("limit") || 1000)));
  const rows = await env.DB.prepare(
    `SELECT * FROM dse_prices WHERE ${clauses.join(" AND ")} ORDER BY obs_date DESC LIMIT ?`,
  ).bind(...params, limit).all<Row>();
  return json({
    success: true, code,
    data: (rows.results || []).map((r) => ({
      date: r.obs_date, ltp: num(r.ltp), ycp: num(r.ycp), open: num(r.open),
      high: num(r.high), low: num(r.low), close: num(r.close), volume: num(r.volume),
      value_mn: num(r.value_mn), trades: r.trades, change_pct: num(r.change_pct),
    })),
    count: rows.results?.length || 0,
  });
}

async function regionalDistricts(env: Env): Promise<Response> {
  const ids = ["regional.census.population", "regional.census.households", "regional.census.sex_ratio"];
  const rows = await env.DB.prepare(
    `SELECT series_id, obs_date, value, dims FROM (
       SELECT series_id, obs_date, value, dims,
              ROW_NUMBER() OVER (PARTITION BY series_id, dims ORDER BY obs_date DESC) AS rn
         FROM observations
        WHERE series_id IN (?, ?, ?) AND json_extract(dims, '$.district') IS NOT NULL
          AND json_extract(dims, '$.subdistrict') IS NULL
     ) WHERE rn = 1`,
  ).bind(...ids).all<Row>();
  const fields: Record<string, string> = {
    "regional.census.population": "population",
    "regional.census.households": "households",
    "regional.census.sex_ratio": "sex_ratio",
  };
  const out = new Map<string, Row>();
  const popDate = new Map<string, string>();
  for (const r of rows.results || []) {
    const dims = parseJson<Row>(r.dims, {});
    if (!dims.district) continue;
    const key = `${dims.division || ""}|${dims.district}`;
    if (!out.has(key)) out.set(key, { province: dims.division, district: dims.district });
    out.get(key)![fields[r.series_id]] = num(r.value);
    if (r.series_id === "regional.census.population") popDate.set(key, r.obs_date);
  }
  const latest = [...popDate.values()].sort().at(-1);
  const data = [...out.entries()]
    .filter(([k]) => popDate.get(k) === latest)
    .map(([k, v]) => ({ ...v, census_date: popDate.get(k) }))
    .sort((a, b) => (num(b.population) || 0) - (num(a.population) || 0));
  return json({ success: true, data, count: data.length }, 200, { "Cache-Control": "public, max-age=3600" });
}

async function regionalDistrict(env: Env, name: string): Promise<Response> {
  const rows = await env.DB.prepare(
    `SELECT o.series_id, o.obs_date, o.value, o.dims
       FROM observations o JOIN series s ON s.id = o.series_id AND s.module = 'regional' AND s.is_active = 1
      WHERE json_extract(o.dims, '$.district') = ? AND json_extract(o.dims, '$.subdistrict') IS NULL
      ORDER BY o.series_id, o.obs_date`,
  ).bind(name).all<Row>();
  if (!rows.results?.length) throw new HttpError(404, `unknown district: ${name}`);
  const province = parseJson<Row>(rows.results[0].dims, {}).division;
  return json({
    success: true,
    data: {
      district: name,
      province,
      rows: rows.results.map((r) => ({
        series: r.series_id, date: r.obs_date, value: num(r.value), dims: parseJson(r.dims, {}),
      })),
      province_rows: [],
    },
  }, 200, { "Cache-Control": "public, max-age=3600" });
}

async function fundsRegistry(env: Env, url: URL): Promise<Response> {
  const type = url.searchParams.get("fund_type");
  const q = url.searchParams.get("q");
  const limit = Math.min(1000, Math.max(1, Number(url.searchParams.get("limit") || 300)));
  const clauses: string[] = [];
  const params: any[] = [];
  if (type) { clauses.push("fund_type = ?"); params.push(type); }
  if (q) { clauses.push("name LIKE ?"); params.push(`%${q}%`); }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = await env.DB.prepare(
    `SELECT name, fund_type, consent_date, subscription_open, subscription_close,
            nrb_close, amount_crore, document_url
       FROM fund_registry ${where} ORDER BY consent_date DESC, name LIMIT ?`,
  ).bind(...params, limit).all<Row>();
  return json({ success: true, data: rows.results || [], count: rows.results?.length || 0 });
}

async function fundsAmcs(env: Env): Promise<Response> {
  const rows = await env.DB.prepare(
    `SELECT substr(s.id, 7, instr(substr(s.id, 7), '.') - 1) AS amc,
            min(s.source) AS manager,
            count(DISTINCT s.id) AS series,
            count(DISTINCT json_extract(o.dims, '$.fund')) AS funds,
            count(*) AS observations,
            min(o.obs_date) AS first_date,
            max(o.obs_date) AS last_date
       FROM series s JOIN observations o ON o.series_id = s.id
      WHERE s.id LIKE 'funds.%' AND s.id NOT LIKE 'funds.registry.%' AND s.id NOT LIKE 'funds.amc_nav.%'
      GROUP BY 1 ORDER BY 1`,
  ).all<Row>();
  return json({ success: true, data: rows.results || [], count: rows.results?.length || 0 });
}

async function fundsNav(env: Env, url: URL): Promise<Response> {
  const amc = url.searchParams.get("amc");
  const fund = url.searchParams.get("fund");
  const asOf = url.searchParams.get("as_of");
  const limit = Math.min(2000, Math.max(1, Number(url.searchParams.get("limit") || 500)));
  const clauses = ["o.series_id LIKE 'funds.%'", "o.series_id NOT LIKE 'funds.registry.%'", "o.series_id NOT LIKE 'funds.amc_nav.%'"];
  const params: any[] = [];
  if (amc) { clauses.push("substr(o.series_id, 7, instr(substr(o.series_id, 7), '.') - 1) = ?"); params.push(amc); }
  if (fund) { clauses.push("json_extract(o.dims, '$.fund') LIKE ?"); params.push(`%${fund}%`); }
  if (asOf) { clauses.push("o.obs_date <= ?"); params.push(asOf); }
  const rows = await env.DB.prepare(
    `WITH latest AS (
       SELECT o.series_id, json_extract(o.dims, '$.fund') AS fund, o.obs_date, o.value,
              ROW_NUMBER() OVER (PARTITION BY o.series_id ORDER BY o.obs_date DESC) AS rn
         FROM observations o WHERE ${clauses.join(" AND ")}
     )
     SELECT substr(l.series_id, 7, instr(substr(l.series_id, 7), '.') - 1) AS amc,
            l.fund, l.obs_date AS date, l.value AS nav,
            (SELECT value FROM observations WHERE series_id = replace(l.series_id, '.nav', '.nav_cost') AND obs_date = l.obs_date) AS nav_cost,
            (SELECT value FROM observations WHERE series_id = replace(l.series_id, '.nav', '.market_price') AND obs_date = l.obs_date) AS market_price
       FROM latest l WHERE l.rn = 1 AND l.series_id LIKE '%.nav'
      ORDER BY amc, l.fund LIMIT ?`,
  ).bind(...params, limit).all<Row>();
  return json({ success: true, data: rows.results || [], count: rows.results?.length || 0 });
}

async function dam(env: Env, url: URL): Promise<Response> {
  const date = url.searchParams.get("price_date");
  const division = url.searchParams.get("division");
  const commodity = url.searchParams.get("commodity");
  const limit = Math.min(5000, Math.max(1, Number(url.searchParams.get("limit") || 500)));
  const clauses: string[] = [];
  const params: any[] = [];
  if (date) { clauses.push("price_date = ?"); params.push(date); }
  else clauses.push("price_date = (SELECT max(price_date) FROM dam_prices)");
  if (division) { clauses.push("division LIKE ?"); params.push(`%${division}%`); }
  if (commodity) { clauses.push("commodity LIKE ?"); params.push(`%${commodity}%`); }
  const rows = await env.DB.prepare(
    `SELECT price_date, division, commodity, unit, current_min, current_max,
            month_ago_min, month_ago_max, year_ago_min, year_ago_max
       FROM dam_prices WHERE ${clauses.join(" AND ")} ORDER BY division, commodity LIMIT ?`,
  ).bind(...params, limit).all<Row>();
  return json({ success: true, data: rows.results || [], count: rows.results?.length || 0 });
}

async function damDates(env: Env): Promise<Response> {
  const rows = await env.DB.prepare(
    `SELECT price_date, count(*) AS rows, group_concat(DISTINCT division) AS divisions
       FROM dam_prices GROUP BY price_date ORDER BY price_date DESC LIMIT 60`,
  ).all<Row>();
  return json({ success: true, data: rows.results || [], count: rows.results?.length || 0 });
}

async function calendar(env: Env, url: URL): Promise<Response> {
  const next = url.searchParams.get("next");
  const from = url.searchParams.get("from") || today();
  const to = url.searchParams.get("to");
  const module = url.searchParams.get("module");
  const clauses: string[] = [];
  const params: any[] = [];
  if (next) {
    clauses.push("c.release_date >= ?");
    params.push(today());
  } else {
    clauses.push("c.release_date >= ?");
    params.push(from);
    clauses.push("c.release_date <= ?");
    params.push(to || iso(new Date(Date.now() + 30 * 86400000)));
  }
  if (module) { clauses.push("s.module = ?"); params.push(module); }
  const limit = next ? `LIMIT ${Math.min(100, Math.max(1, Number(next)))}` : "";
  const rows = await env.DB.prepare(
    `SELECT c.release_date AS date, c.indicator, c.source, c.series_id, c.actual_value
       FROM release_calendar c LEFT JOIN series s ON s.id = c.series_id
      WHERE ${clauses.join(" AND ")} ORDER BY c.release_date, c.indicator ${limit}`,
  ).bind(...params).all<Row>();
  return json({ success: true, data: rows.results || [], count: rows.results?.length || 0 });
}

async function calendarIcs(env: Env): Promise<Response> {
  const rows = await env.DB.prepare(
    `SELECT release_date AS date, indicator, source, series_id FROM release_calendar
      WHERE release_date >= ? ORDER BY release_date, indicator`,
  ).bind(iso(new Date(Date.now() - 30 * 86400000))).all<Row>();
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//BanglaDataHub//Release calendar//EN",
    "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:Bangladesh data releases (BanglaDataHub)",
    "X-WR-CALDESC:When Bangladesh's economic indicators publish next.", "REFRESH-INTERVAL;VALUE=DURATION:PT12H",
  ];
  for (const r of rows.results || []) {
    const d = String(r.date).replace(/-/g, "");
    const nxt = iso(new Date(Date.parse(`${r.date}T00:00:00Z`) + 86400000)).replace(/-/g, "");
    const sid = r.series_id || "";
    const url = sid ? `https://bangladatahub.com/series/${sid}` : "https://bangladatahub.com/calendar";
    const uid = `${d}-${sid || "release"}@bangladatahub.com`;
    lines.push(
      "BEGIN:VEVENT", `UID:${uid}`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${d}`,
      `DTEND;VALUE=DATE:${nxt}`, `SUMMARY:${esc(`${r.indicator} (${r.source})`)}`,
      `DESCRIPTION:${esc(`Expected release. Series: ${sid || "see the calendar"}\n${url}`)}`,
      `URL:${url}`, "TRANSP:TRANSPARENT", "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return new Response(lines.join("\r\n") + "\r\n", {
    headers: { "content-type": "text/calendar; charset=utf-8", ...CORS, "Cache-Control": "public, max-age=3600" },
  });
}

// ---------------------------------------------------------------------------
// Plans / commodities placeholders
// ---------------------------------------------------------------------------

function plans(): Response {
  return json({
    success: true,
    plans: [
      { plan: "free", price_usd_month: 0, requests_per_day: 500, requests_per_min: 10, free_credits: 500, history: "1 year", funds_and_alternate: true, for: "Evaluating, students, journalists", usage_rights: "internal", vintages: false, webhooks: 0, sla: false },
      { plan: "developer", price_usd_month: 19, requests_per_day: 10000, requests_per_min: 60, free_credits: null, history: "10 years", funds_and_alternate: true, for: "One analyst or developer", usage_rights: "internal", vintages: false, webhooks: 3, sla: false },
      { plan: "pro", price_usd_month: 49, requests_per_day: 100000, requests_per_min: 300, free_credits: null, history: "Full, to 1972", funds_and_alternate: true, for: "Risk, treasury and research teams", usage_rights: "internal", vintages: true, webhooks: 50, sla: false },
      { plan: "business", price_usd_month: 199, requests_per_day: 500000, requests_per_min: 600, free_credits: null, history: "Full, to 1972", funds_and_alternate: true, for: "Apps that show the data to their users", usage_rights: "display", vintages: true, webhooks: null, sla: true },
    ],
  }, 200, { "Cache-Control": "public, max-age=3600" });
}

// ---------------------------------------------------------------------------
// Admin sync / dispatch
// ---------------------------------------------------------------------------

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

async function adminSync(req: Request, env: Env): Promise<Response> {
  const token = req.headers.get("X-Sync-Token") || "";
  if (!env.SYNC_TOKEN || !timingSafeEqual(token, env.SYNC_TOKEN)) {
    return fail(401, "invalid sync token");
  }
  const body = await req.json<any>();
  const statements: D1PreparedStatement[] = [];
  let seriesCount = 0, obsCount = 0, revCount = 0;

  for (const s of body.series || []) {
    statements.push(env.DB.prepare(
      `INSERT INTO series (id, module, name, description, unit, frequency, source, source_url,
                           dimensions, min_value, max_value, max_step, first_date, last_date,
                           tier, is_active, derivation, canonical_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET
         module=excluded.module, name=excluded.name, description=excluded.description,
         unit=excluded.unit, frequency=excluded.frequency, source=excluded.source,
         source_url=excluded.source_url, dimensions=excluded.dimensions,
         min_value=excluded.min_value, max_value=excluded.max_value, max_step=excluded.max_step,
         first_date=excluded.first_date, last_date=excluded.last_date, tier=excluded.tier,
         is_active=excluded.is_active, derivation=excluded.derivation, canonical_id=excluded.canonical_id`,
    ).bind(
      s.id, s.module, s.name, s.description ?? null, s.unit ?? null, s.frequency ?? "irregular",
      s.source ?? "UNKNOWN", s.source_url ?? null,
      typeof s.dimensions === "string" ? s.dimensions : JSON.stringify(s.dimensions || {}),
      s.min_value ?? null, s.max_value ?? null, s.max_step ?? null,
      s.first_date ?? null, s.last_date ?? null, s.tier ?? "basic",
      s.is_active === false ? 0 : 1,
      s.derivation == null ? null : (typeof s.derivation === "string" ? s.derivation : JSON.stringify(s.derivation)),
      s.canonical_id ?? null,
    ));
    seriesCount++;
  }

  for (const o of body.observations || []) {
    statements.push(env.DB.prepare(
      `INSERT INTO observations (series_id, obs_date, value, dims, flagged, first_seen_at, revised_at)
       VALUES (?,?,?,?,?,?,?)
       ON CONFLICT(series_id, obs_date, dims) DO UPDATE SET
         value=excluded.value, flagged=excluded.flagged, revised_at=excluded.revised_at
       WHERE observations.value IS NOT excluded.value OR observations.flagged IS NOT excluded.flagged`,
    ).bind(
      o.series_id, o.obs_date, o.value ?? null,
      typeof o.dims === "string" ? o.dims : JSON.stringify(o.dims || {}),
      o.flagged ? 1 : 0, o.first_seen_at ?? null, o.revised_at ?? null,
    ));
    obsCount++;
  }

  for (const r of body.revisions || []) {
    statements.push(env.DB.prepare(
      `INSERT INTO observation_revisions (series_id, obs_date, dims, value, superseded_at, source)
       VALUES (?,?,?,?,?,?)`,
    ).bind(
      r.series_id, r.obs_date,
      typeof r.dims === "string" ? r.dims : JSON.stringify(r.dims || {}),
      r.value ?? null, r.superseded_at, r.source ?? null,
    ));
    revCount++;
  }

  for (const run of body.ingestion_runs || []) {
    statements.push(env.DB.prepare(
      `INSERT INTO ingestion_runs (job_name, started_at, finished_at, status, rows_upserted, error, raw_file)
       VALUES (?,?,?,?,?,?,?)`,
    ).bind(run.job_name, run.started_at ?? null, run.finished_at ?? null, run.status ?? null,
      run.rows_upserted ?? 0, run.error ?? null, run.raw_file ?? null));
  }

  for (const r of body.fund_registry || []) {
    statements.push(env.DB.prepare(
      `INSERT OR REPLACE INTO fund_registry
         (name, fund_type, consent_date, subscription_open, subscription_close, nrb_close,
          amount_crore, document_url, source, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
    ).bind(r.name, r.fund_type, r.consent_date ?? null, r.subscription_open ?? null,
      r.subscription_close ?? null, r.nrb_close ?? null, r.amount_crore ?? null,
      r.document_url ?? null, r.source ?? "BSEC", r.updated_at));
  }

  for (const r of body.dam_prices || []) {
    statements.push(env.DB.prepare(
      `INSERT OR REPLACE INTO dam_prices
         (price_date, division, commodity, unit, current_min, current_max, month_ago_min,
          month_ago_max, year_ago_min, year_ago_max, source, revised_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).bind(r.price_date, r.division, r.commodity, r.unit, r.current_min ?? null,
      r.current_max ?? null, r.month_ago_min ?? null, r.month_ago_max ?? null,
      r.year_ago_min ?? null, r.year_ago_max ?? null, r.source ?? "DAM", r.revised_at));
  }

  for (const r of body.dse_securities || []) {
    statements.push(env.DB.prepare(
      `INSERT OR REPLACE INTO dse_securities
         (code, name, sector, board, category, asset_type, is_active, first_seen, last_seen, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
    ).bind(r.code, r.name ?? null, r.sector ?? null, r.board ?? null, r.category ?? null,
      r.asset_type ?? null, r.is_active === false ? 0 : 1, r.first_seen ?? null,
      r.last_seen ?? null, r.updated_at ?? null));
  }

  for (const r of body.dse_prices || []) {
    statements.push(env.DB.prepare(
      `INSERT OR REPLACE INTO dse_prices
         (code, obs_date, ltp, ycp, open, high, low, close, volume, value_mn, trades, change_pct, revised_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).bind(r.code, r.obs_date, r.ltp ?? null, r.ycp ?? null, r.open ?? null, r.high ?? null,
      r.low ?? null, r.close ?? null, r.volume ?? null, r.value_mn ?? null, r.trades ?? null,
      r.change_pct ?? null, r.revised_at ?? null));
  }

  for (const r of body.dse_indices || []) {
    statements.push(env.DB.prepare(
      `INSERT OR REPLACE INTO dse_indices (index_code, obs_date, value, change, change_pct, revised_at)
       VALUES (?,?,?,?,?,?)`,
    ).bind(r.index_code, r.obs_date, r.value ?? null, r.change ?? null, r.change_pct ?? null, r.revised_at ?? null));
  }

  for (const r of body.dse_market_daily || []) {
    statements.push(env.DB.prepare(
      `INSERT OR REPLACE INTO dse_market_daily
         (obs_date, turnover_mn, volume, trades, advances, declines, unchanged,
          market_cap_equity_mn, market_cap_mf_mn, market_cap_debt_mn, market_cap_total_mn, source, revised_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).bind(r.obs_date, r.turnover_mn ?? null, r.volume ?? null, r.trades ?? null,
      r.advances ?? null, r.declines ?? null, r.unchanged ?? null,
      r.market_cap_equity_mn ?? null, r.market_cap_mf_mn ?? null, r.market_cap_debt_mn ?? null,
      r.market_cap_total_mn ?? null, r.source ?? "DSE", r.revised_at ?? null));
  }

  for (const r of body.release_calendar || []) {
    statements.push(env.DB.prepare(
      `INSERT OR REPLACE INTO release_calendar (release_date, indicator, source, series_id, actual_value)
       VALUES (?,?,?,?,?)`,
    ).bind(r.release_date, r.indicator, r.source, r.series_id ?? null, r.actual_value ?? null));
  }

  for (const r of body.auctions || []) {
    statements.push(env.DB.prepare(
      `INSERT OR REPLACE INTO auctions
         (auction_type, tenor, auction_date, settlement_date, cutoff_yield, offered_amount,
          accepted_amount, bid_to_cover, source, revised_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
    ).bind(r.auction_type, r.tenor, r.auction_date, r.settlement_date ?? null,
      r.cutoff_yield ?? null, r.offered_amount ?? null, r.accepted_amount ?? null,
      r.bid_to_cover ?? null, r.source ?? "BB", r.revised_at ?? null));
  }

  for (const id of body.delete_series || []) {
    statements.push(env.DB.prepare("DELETE FROM observations WHERE series_id = ?").bind(id));
    statements.push(env.DB.prepare("DELETE FROM observation_revisions WHERE series_id = ?").bind(id));
    statements.push(env.DB.prepare("DELETE FROM series WHERE id = ?").bind(id));
  }

  // D1 batch limit is 100 statements; keep a safety margin.
  for (let i = 0; i < statements.length; i += 50) {
    await env.DB.batch(statements.slice(i, i + 50));
  }
  if (body.final && body.watermark) {
    await env.DB.prepare(
      "INSERT INTO sync_state (key, value) VALUES ('last_sync', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
    ).bind(body.watermark).run();
  }

  return json({ success: true, series: seriesCount, observations: obsCount, revisions: revCount });
}

async function adminState(req: Request, env: Env): Promise<Response> {
  const token = req.headers.get("X-Sync-Token") || "";
  if (!env.SYNC_TOKEN || !timingSafeEqual(token, env.SYNC_TOKEN)) {
    return fail(401, "invalid sync token");
  }
  const state = await env.DB.prepare("SELECT value FROM sync_state WHERE key = 'last_sync'").first<Row>();
  const counts = await env.DB.prepare(
    `SELECT (SELECT count(*) FROM series) AS series,
            (SELECT count(*) FROM observations) AS observations,
            (SELECT count(*) FROM observation_revisions) AS revisions,
            (SELECT max(obs_date) FROM observations) AS last_date`,
  ).first<Row>();
  return json({ success: true, last_sync: state?.value ?? null, counts });
}

async function adminDispatch(req: Request, env: Env): Promise<Response> {
  const token = req.headers.get("X-Sync-Token") || "";
  if (!env.SYNC_TOKEN || !timingSafeEqual(token, env.SYNC_TOKEN)) {
    return fail(401, "invalid sync token");
  }
  if (!env.GITHUB_TOKEN || !env.GITHUB_REPO) {
    return fail(501, "GITHUB_TOKEN and GITHUB_REPO are not configured");
  }
  const workflow = env.GITHUB_WORKFLOW || "ingest.yml";
  const res = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/actions/workflows/${workflow}/dispatches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "bangladatahub-api",
      "content-type": "application/json",
    },
    body: JSON.stringify({ ref: "main" }),
  });
  return json({ success: res.ok, status: res.status, body: await res.text() }, res.ok ? 202 : 502);
}

async function dispatchIfStale(env: Env): Promise<void> {
  const row = await env.DB.prepare("SELECT max(obs_date) AS last FROM observations").first<Row>();
  const last = row?.last ? String(row.last) : null;
  const stale = !last || daysBetween(last, today()) > 2;
  if (!stale) return;
  if (!env.GITHUB_TOKEN || !env.GITHUB_REPO) return;
  const workflow = env.GITHUB_WORKFLOW || "ingest.yml";
  await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/actions/workflows/${workflow}/dispatches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "bangladatahub-api",
      "content-type": "application/json",
    },
    body: JSON.stringify({ ref: "main" }),
  });
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    try {
      let m: RegExpMatchArray | null = null;
      if (path === "/" || path === "/health") {
        return json({ success: true, service: "bangladatahub-api", runtime: "cloudflare-workers", d1: true });
      }
      if (path === "/auth/signup" && request.method === "POST") return await signup(request, env);
      if (path === "/auth/login" && request.method === "POST") return await login(request, env);
      if (path === "/auth/logout" && request.method === "POST") return await logout(request, env);
      if (path === "/auth/change-password" && request.method === "POST") return await changePassword(request, env);
      if (path === "/auth/google/config") return json({ enabled: false });
      if (path === "/auth/set-password" && request.method === "POST") return fail(404, "no pending key claim");
      if (path === "/v1/account") return await account(request, env);
      if (path === "/v1/keys") return await keys(request, env);
      m = path.match(/^\/v1\/keys\/(.+)$/);
      if (m) return await keys(request, env, decodeURIComponent(m[1]));
      if (path === "/v1/usage" || path === "/v1/usage/history" || path === "/v1/usage/endpoints") {
        return await usage(request, env, url);
      }
      if (path === "/v1/webhooks" && request.method === "GET") {
        return json({ success: true, data: [], count: 0 });
      }
      if (path === "/v1/webhooks" && request.method === "POST") {
        return fail(501, "webhooks are not available on the edge deployment yet");
      }
      m = path.match(/^\/v1\/webhooks\/(.+)$/);
      if (m && request.method === "DELETE") return json({ success: true, deleted: decodeURIComponent(m[1]) });
      if (path === "/v1/billing/portal") {
        return fail(501, "billing portal is not available on the edge deployment yet");
      }
      m = path.match(/^\/v1\/account\/key\/(.+)$/);
      if (m) return fail(404, "no pending key claim");
      if (path === "/v1/status") return await status(env);
      if (path === "/v1/catalog") return await catalogList(env, url);
      m = path.match(/^\/v1\/catalog\/(.+)$/);
      if (m) {
        const row = await seriesById(env, decodeURIComponent(m[1]));
        if (!row) return fail(404, "unknown series");
        return json(meta(row), 200, { "Cache-Control": PUBLIC_CACHE });
      }
      if (path === "/v1/search") return await search(env, url);
      if (path === "/v1/plans") return plans();

      m = path.match(/^\/v1\/series\/(.+)\/latest$/);
      if (m) {
        const caller = await authenticate(request, env, true);
        return await latest(env, decodeURIComponent(m[1]), url, caller!);
      }
      m = path.match(/^\/v1\/series\/(.+)\/revisions$/);
      if (m) {
        const caller = await authenticate(request, env, true);
        return await revisions(env, decodeURIComponent(m[1]), url, caller!);
      }
      m = path.match(/^\/v1\/series\/(.+)$/);
      if (m) {
        const caller = await authenticate(request, env, true);
        return await seriesData(env, decodeURIComponent(m[1]), url, caller!);
      }

      if (path === "/v1/market/overview") return await marketOverview(env);
      if (path === "/v1/market/securities") {
        await authenticate(request, env, true);
        return await marketSecurities(env, url);
      }
      m = path.match(/^\/v1\/market\/securities\/(.+)\/prices$/);
      if (m) {
        await authenticate(request, env, true);
        return await marketPrices(env, decodeURIComponent(m[1]), url);
      }

      if (path === "/v1/regional/districts") return await regionalDistricts(env);
      m = path.match(/^\/v1\/regional\/district\/(.+)$/);
      if (m) {
        await authenticate(request, env, true);
        return await regionalDistrict(env, decodeURIComponent(m[1]));
      }

      if (path === "/v1/funds/registry") return await fundsRegistry(env, url);
      if (path === "/v1/funds/amcs") return await fundsAmcs(env);
      if (path === "/v1/funds/nav") return await fundsNav(env, url);
      if (path === "/v1/funds" || path === "/v1/amcs") return json({ success: true, data: [], count: 0 });

      if (path === "/v1/agri/dam") return await dam(env, url);
      if (path === "/v1/agri/dam/dates") return await damDates(env);
      if (path === "/v1/commodities/items" || path === "/v1/commodities/cities") {
        return json({ success: true, data: [], count: 0 });
      }

      if (path === "/v1/calendar") return await calendar(env, url);
      if (path === "/v1/calendar.ics") return await calendarIcs(env);

      if (path === "/admin/sync" && request.method === "POST") return await adminSync(request, env);
      if (path === "/admin/state" && request.method === "GET") return await adminState(request, env);
      if (path === "/admin/dispatch" && request.method === "POST") return await adminDispatch(request, env);

      return fail(404, `no route for ${path}`);
    } catch (exc) {
      if (exc instanceof HttpError) return fail(exc.status, exc.message, exc.code);
      console.error("unhandled", exc);
      return fail(500, "internal error");
    }
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(dispatchIfStale(env));
  },
};
