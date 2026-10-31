import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { type ReactNode, useEffect, useMemo, useState } from "react";

import { getSearch } from "@/lib/bangladata/api.functions";
import { changePassword, logout } from "@/lib/bangladata/auth.functions";
import {
  billingPortal,
  createCheckout,
  createKey,
  createWebhook,
  deleteWebhook,
  getDashboard,
  revokeKey,
  runRequest,
  updateProfile,
  type EndpointUsage,
} from "@/lib/bangladata/dashboard.functions";
import { fmtCount, fmtDate } from "@/lib/bangladata/format";
import type { CatalogRecord } from "@/lib/bangladata/types";
import { cn } from "@/lib/utils";
import { SERIES_COUNT } from "@/lib/bangladata/counts";
import { MODULES } from "@/lib/bangladata/catalog";
import { searchGroup, type SearchHit } from "@/lib/bangladata/search";

const MODULE_COUNT = MODULES.filter((m) => !m.href).length;

export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — BanglaDataHub" }] }),
  component: Dashboard,
});

const SESSION_KEY = "bangladatahub-session";

type ApiKey = { id: string; key_prefix: string | null; label: string | null; created_at: string; revoked_at: string | null; last_used_at: string | null };
type Hook = { id: string; url: string; series_id: string | null; module: string | null; is_active: boolean; last_status: number | null };
type Data = {
  account: { plan?: string; email?: string; subscription_status?: string; name?: string; company?: string } | null;
  usage: { limits?: { per_day: number; credits?: number | null }; usage?: { day_used: number; day_remaining: number; credits_remaining?: number | null } } | null;
  history: { day: string; requests: number }[];
  endpoints: EndpointUsage[];
  keys: ApiKey[];
  webhooks: Hook[];
};

type Tab = "overview" | "playground" | "explore" | "keys" | "webhooks" | "usage" | "billing" | "settings";
const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "playground", label: "API playground" },
  { id: "explore", label: "Explore data" },
  { id: "keys", label: "API keys" },
  { id: "webhooks", label: "Webhooks" },
  { id: "usage", label: "Usage" },
  { id: "billing", label: "Billing" },
  { id: "settings", label: "Settings" },
];

function Dashboard() {
  const navigate = useNavigate();
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<Tab>("overview");
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [newSecret, setNewSecret] = useState<string | null>(null);

  async function load(t: string) {
    const res = await getDashboard({ data: { token: t } });
    if (!("authed" in res) || !res.configured) {
      setError("The dashboard isn't reachable right now. Try again shortly.");
      return;
    }
    if (!res.authed) {
      localStorage.removeItem(SESSION_KEY);
      setToken(null);
      navigate({ to: "/login" });
      return;
    }
    setError(null);
    setData({
      account: res.account as Data["account"],
      usage: res.usage as Data["usage"],
      history: res.history,
      endpoints: (res.endpoints ?? []) as EndpointUsage[],
      keys: res.keys as ApiKey[],
      webhooks: res.webhooks as Hook[],
    });
  }

  useEffect(() => {
    const t = typeof window !== "undefined" ? localStorage.getItem(SESSION_KEY) : null;
    setToken(t);
    setReady(true);
    if (t) void load(t);
  }, []);

  async function signOut() {
    if (token) await logout({ data: { token } });
    localStorage.removeItem(SESSION_KEY);
    setToken(null);
    setData(null);
    navigate({ to: "/login" });
  }

  async function onCreateKey(label?: string) {
    if (!token) return;
    setBusy(true);
    const res = await createKey({ data: { token, label } });
    setBusy(false);
    if (res.ok && res.data) {
      setNewKey(String(res.data.api_key));
      void load(token);
    } else {
      setError(res.status === 403 ? "Key limit reached — revoke one first." : "Couldn't create a key.");
    }
  }
  async function onRevoke(id: string) {
    if (!token) return;
    await revokeKey({ data: { token, id } });
    void load(token);
  }
  async function onDeleteHook(id: string) {
    if (!token) return;
    await deleteWebhook({ data: { token, id } });
    void load(token);
  }

  // ---- signed-out ----
  if (ready && !token) {
    return (
      <main className="mx-auto max-w-[1160px] px-6 pt-32 pb-24 md:px-10">
        <p className="eyebrow">Dashboard</p>
        <h1 className="mt-4 text-[40px] leading-tight">Sign in to your account.</h1>
        <p className="mt-4 max-w-[46ch] text-[17px] text-ink-soft">
          Manage your keys, explore the data, and track usage.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link to="/login" className="bg-seal px-5 py-2.5 text-[14px] text-seal-contrast hover:opacity-90">Sign in</Link>
          <Link to="/signup" className="border border-rule px-5 py-2.5 text-[14px] hover:border-seal hover:text-seal">Create a free account</Link>
        </div>
      </main>
    );
  }
  if (!data) {
    return (
      <main className="mx-auto max-w-[1160px] px-6 pt-32 pb-24 md:px-10">
        <p className="num text-[14px] text-ink-soft">{error ?? "Loading your dashboard…"}</p>
      </main>
    );
  }

  const plan = data.account?.plan ?? "free";
  const dayUsed = data.usage?.usage?.day_used ?? 0;
  const dayLimit = data.usage?.limits?.per_day ?? 0;
  // Free tier is metered by a monthly allowance (resets on the 1st), not a daily quota.
  const credits = data.usage?.limits?.credits ?? null;
  const creditsLeft = data.usage?.usage?.credits_remaining ?? null;

  return (
    <main className="mx-auto min-h-screen max-w-[1240px] px-4 pt-24 pb-16 md:px-8">
      {/* header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule pb-5">
        <div>
          <p className="eyebrow">Dashboard</p>
          <p className="mt-1 text-[20px]">{data.account?.email}</p>
        </div>
        <div className="flex items-center gap-4 text-[13px]">
          <span className="num rounded-full border border-rule px-3 py-1 capitalize">{plan} plan</span>
          <Link to="/" className="text-ink-soft hover:text-seal">Back to site</Link>
          <button onClick={signOut} className="text-ink-soft hover:text-seal">Sign out</button>
        </div>
      </div>

      <div className="mt-6 gap-8 md:grid md:grid-cols-[180px_1fr]">
        {/* sidebar */}
        <nav className="mb-6 flex gap-1 overflow-x-auto md:mb-0 md:flex-col md:gap-0.5">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`whitespace-nowrap px-3 py-2 text-left text-[14px] transition-colors ${
                tab === t.id ? "bg-seal-tint font-medium text-seal" : "text-ink-soft hover:text-ink"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>

        {/* content */}
        <section className="min-w-0">
          {newKey ? (
            <Banner label="New key — shown once" value={newKey} onClose={() => setNewKey(null)} />
          ) : null}
          {newSecret ? (
            <Banner label="Signing secret — shown once" value={newSecret} onClose={() => setNewSecret(null)} />
          ) : null}

          {tab === "overview" && (
            <Overview
              plan={plan}
              dayUsed={dayUsed}
              dayLimit={dayLimit}
              credits={credits}
              creditsLeft={creditsLeft}
              keys={data.keys.filter((k) => !k.revoked_at).length}
              hooks={data.webhooks.length}
              onCreateKey={() => { setTab("keys"); void onCreateKey("dashboard"); }}
              onExplore={() => setTab("explore")}
            />
          )}
          {tab === "playground" && token && <Playground token={token} onKeyMade={() => void load(token)} />}
          {tab === "explore" && <Explore />}
          {tab === "keys" && (
            <Keys keys={data.keys} busy={busy} onCreate={() => onCreateKey("dashboard")} onRevoke={onRevoke} />
          )}
          {tab === "webhooks" && (
            <Webhooks
              webhooks={data.webhooks}
              onCreate={async (url, seriesId) => {
                if (!token) return;
                const res = await createWebhook({ data: { token, url, series_id: seriesId } });
                if (res.ok && res.data) { setNewSecret(String((res.data as Record<string, unknown>).signing_secret)); void load(token); }
                else setError(res.status === 403 ? "Webhooks need a paid plan." : "Couldn't add the webhook.");
              }}
              onDelete={onDeleteHook}
            />
          )}
          {tab === "usage" && <Usage today={dayUsed} limit={dayLimit} history={data.history} endpoints={data.endpoints} />}
          {tab === "billing" && token && <Billing plan={plan} status={data.account?.subscription_status} email={data.account?.email} token={token} />}
          {tab === "settings" && token && (
            <Settings
              email={data.account?.email as string | undefined}
              name={data.account?.name as string | undefined}
              company={data.account?.company as string | undefined}
              plan={plan}
              token={token}
            />
          )}
          {error ? <p className="mt-4 text-[13px] text-flag">{error}</p> : null}
        </section>
      </div>
    </main>
  );
}

// ---- sections ----

function SectionTitle({ children, sub }: { children: ReactNode; sub?: string }) {
  return (
    <div className="mb-5">
      <h2 className="text-[24px]">{children}</h2>
      {sub ? <p className="mt-1 text-[14px] text-ink-soft">{sub}</p> : null}
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-rule p-5">
      <p className="num text-[30px] leading-none">{value}</p>
      <p className="eyebrow mt-2">{label}</p>
    </div>
  );
}

function Overview({ plan, dayUsed, dayLimit, credits, creditsLeft, keys, hooks, onCreateKey, onExplore }: {
  plan: string; dayUsed: number; dayLimit: number; credits: number | null; creditsLeft: number | null;
  keys: number; hooks: number;
  onCreateKey: () => void; onExplore: () => void;
}) {
  return (
    <div>
      <SectionTitle sub="Your account at a glance.">Overview</SectionTitle>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="Plan" value={plan.charAt(0).toUpperCase() + plan.slice(1)} />
        <Tile label="Requests today" value={fmtCount(dayUsed)} />
        {credits != null ? (
          <Tile label="Free calls left this month" value={fmtCount(creditsLeft ?? 0)} />
        ) : (
          <Tile label="Daily limit" value={fmtCount(dayLimit)} />
        )}
        <Tile label="Active keys" value={String(keys)} />
      </div>
      <div className="mt-6 flex flex-wrap gap-3">
        <button onClick={onCreateKey} className="bg-seal px-4 py-2.5 text-[14px] text-seal-contrast hover:opacity-90">Create an API key</button>
        <button onClick={onExplore} className="border border-rule px-4 py-2.5 text-[14px] hover:border-seal hover:text-seal">Explore data</button>
        <Link to="/docs/$slug" params={{ slug: "getting-started" }} className="border border-rule px-4 py-2.5 text-[14px] hover:border-seal hover:text-seal">Read the docs</Link>
      </div>
      <p className="mt-6 text-[13px] text-ink-soft">{hooks} webhook{hooks === 1 ? "" : "s"} configured.</p>
    </div>
  );
}

function Explore() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setResults([]); return; }
    let cancelled = false;
    setLoading(true);
    const h = setTimeout(async () => {
      const r = await getSearch({ data: { q: term } });
      if (!cancelled) { setResults((r as SearchHit[]) ?? []); setLoading(false); }
    }, 220);
    return () => { cancelled = true; clearTimeout(h); };
  }, [q]);

  async function copy(id: string) {
    try { await navigator.clipboard.writeText(id); setCopied(id); setTimeout(() => setCopied(null), 1500); } catch { /* */ }
  }

  return (
    <div>
      <SectionTitle sub={`Search ${SERIES_COUNT} series in ${MODULE_COUNT} modules, plus Census 2022 districts. Click a result to open it, or copy a series id for the API.`}>
        Explore data
      </SectionTitle>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        autoFocus
        placeholder="Search — e.g. inflation, BIBOR, remittances, MFS and Bangla QR…"
        className="w-full border border-rule bg-paper px-4 py-3 text-[15px] outline-none focus:border-seal"
      />
      <div className="mt-4">
        {loading && <p className="num text-[13px] text-ink-soft">Searching…</p>}
        {!loading && q.trim().length >= 2 && results.length === 0 && (
          <p className="num text-[13px] text-ink-soft">No matches for “{q}”.</p>
        )}
        <ul className="divide-y divide-rule">
          {results.map((r) => (
            <li key={`${r.kind}:${r.url}`} className="flex items-center justify-between gap-4 py-3">
              <div className="min-w-0">
                <a href={r.url} className="text-[15px] hover:text-seal">
                  {r.title}
                </a>
                <p className="num mt-0.5 truncate text-[12px] text-ink-soft">
                  {r.kind === "series" ? `${r.id} · ${searchGroup(r).label} · ${r.frequency ?? ""}` : `${searchGroup(r).label} · ${r.subtitle ?? ""}`}
                </p>
              </div>
              {r.kind === "series" && r.id ? (
                <button onClick={() => copy(r.id!)} className="shrink-0 border border-rule px-3 py-1.5 text-[12px] hover:border-seal hover:text-seal">
                  {copied === r.id ? "Copied ✓" : "Copy id"}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

const PLAYGROUND_EXAMPLES = [
  { label: "Latest USD/BDT", path: "/v1/series/fx.rate.usd/latest" },
  { label: "Call-money rate (2026)", path: "/v1/series/rates.call_money?from=2026-01-01&sort=asc" },
  { label: "CPI inflation YoY", path: "/v1/series/inflation.cpi.national.yoy/latest" },
  { label: "Census 2022 population", path: "/v1/series/regional.census.population/latest" },
  { label: "Search 'remittances'", path: "/v1/search?q=remittances" },
];

function Playground({ token, onKeyMade }: { token: string; onKeyMade: () => void }) {
  const [key, setKey] = useState("");
  const [path, setPath] = useState("/v1/series/fx.rate.usd/latest");
  const [resp, setResp] = useState<{ status: number; body: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [makingKey, setMakingKey] = useState(false);
  const [copied, setCopied] = useState(false);

  async function run() {
    setBusy(true);
    const r = await runRequest({ data: { key: key.trim(), path } });
    setResp({ status: r.status, body: r.body || "(empty response)" });
    setBusy(false);
  }
  async function makeKey() {
    setMakingKey(true);
    const r = await createKey({ data: { token, label: "playground" } });
    setMakingKey(false);
    if (r.ok && r.data) { setKey(String(r.data.api_key)); onKeyMade(); }
  }
  const curl = `curl -H "X-API-Key: ${key.trim() || "YOUR_KEY"}" \\\n  "https://api.bangladatahub.com${path}"`;
  async function copyCurl() {
    try { await navigator.clipboard.writeText(curl); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* */ }
  }

  return (
    <div>
      <SectionTitle sub="Run a live request against the API with your own key — no setup.">API playground</SectionTitle>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="Paste an API key — or generate one →"
          className="num min-w-[260px] flex-1 border border-rule bg-paper px-3 py-2.5 text-[13px] outline-none focus:border-seal"
        />
        <button onClick={makeKey} disabled={makingKey} className="whitespace-nowrap border border-rule px-3 py-2.5 text-[13px] hover:border-seal hover:text-seal disabled:opacity-50">
          {makingKey ? "Generating…" : "Generate a key"}
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {PLAYGROUND_EXAMPLES.map((ex) => (
          <button
            key={ex.path}
            onClick={() => setPath(ex.path)}
            className={cn(
              "border px-3 py-1.5 text-[12px] transition-colors",
              path === ex.path ? "border-seal text-seal" : "border-rule text-ink-soft hover:border-seal hover:text-seal",
            )}
          >
            {ex.label}
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="num rounded-sm bg-seal-tint px-2 py-1 text-[12px] font-medium text-seal">GET</span>
        <input
          value={path}
          onChange={(e) => setPath(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && run()}
          className="num min-w-[260px] flex-1 border border-rule bg-paper px-3 py-2.5 text-[13px] outline-none focus:border-seal"
        />
        <button onClick={run} disabled={busy} className="bg-seal px-5 py-2.5 text-[14px] text-seal-contrast transition-opacity hover:opacity-90 disabled:opacity-50">
          {busy ? "Running…" : "Run"}
        </button>
      </div>

      <div className="mt-4 border border-rule">
        <div className="flex items-center justify-between border-b border-rule px-3 py-2">
          <span className="eyebrow">cURL</span>
          <button onClick={copyCurl} className="text-[12px] text-ink-soft hover:text-seal">{copied ? "Copied ✓" : "Copy"}</button>
        </div>
        <pre className="num overflow-x-auto whitespace-pre-wrap break-all px-3 py-3 text-[12px] text-ink-soft">{curl}</pre>
      </div>

      {resp && (
        <div className="mt-4 border border-rule">
          <div className="flex items-center justify-between border-b border-rule px-3 py-2">
            <span className="eyebrow">Response</span>
            <span className={cn("num text-[12px]", resp.status >= 200 && resp.status < 300 ? "text-seal" : "text-flag")}>
              {resp.status || "no response"}
            </span>
          </div>
          <pre className="num max-h-[380px] overflow-auto px-3 py-3 text-[12px]">{resp.body}</pre>
        </div>
      )}
    </div>
  );
}

function Keys({ keys, busy, onCreate, onRevoke }: { keys: ApiKey[]; busy: boolean; onCreate: () => void; onRevoke: (id: string) => void }) {
  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <SectionTitle sub="Keys authenticate your API calls. Keep them secret.">API keys</SectionTitle>
        <button onClick={onCreate} disabled={busy} className="bg-seal px-4 py-2 text-[13px] text-seal-contrast hover:opacity-90 disabled:opacity-50">+ New key</button>
      </div>
      <table className="num w-full border-t border-rule text-[13px]">
        <tbody>
          {keys.length === 0 && <tr><td className="py-3 text-ink-soft">No keys yet.</td></tr>}
          {keys.map((k) => (
            <tr key={k.id} className="border-b border-rule">
              <td className="py-3 pr-4">{k.key_prefix ?? "pk_live_…"}</td>
              <td className="py-3 pr-4 font-sans text-ink-soft">{k.label ?? "—"}</td>
              <td className="py-3 pr-4 text-ink-soft">created {fmtDate(k.created_at)}</td>
              <td className="py-3 pr-4 text-ink-soft">{k.last_used_at ? `used ${fmtDate(k.last_used_at)}` : "never used"}</td>
              <td className="py-3 pr-4 text-right">
                {k.revoked_at ? <span className="text-ink-soft">revoked</span> : <button onClick={() => onRevoke(k.id)} className="text-flag hover:underline">Revoke</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Webhooks({ webhooks, onCreate, onDelete }: { webhooks: Hook[]; onCreate: (url: string, seriesId: string) => void; onDelete: (id: string) => void }) {
  const [url, setUrl] = useState("");
  const [seriesId, setSeriesId] = useState("");
  return (
    <div>
      <SectionTitle sub="Get a signed POST when a series updates.">Webhooks</SectionTitle>
      <div className="flex flex-wrap gap-3">
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://your-app.com/hook" className="num flex-1 border border-rule bg-paper px-3 py-2.5 text-[13px] outline-none focus:border-seal" />
        <input value={seriesId} onChange={(e) => setSeriesId(e.target.value)} placeholder="series id (e.g. rates.kibor.3m)" className="num flex-1 border border-rule bg-paper px-3 py-2.5 text-[13px] outline-none focus:border-seal" />
        <button onClick={() => url && seriesId && onCreate(url, seriesId)} className="bg-seal px-4 py-2.5 text-[13px] text-seal-contrast hover:opacity-90">Add</button>
      </div>
      <table className="num mt-6 w-full border-t border-rule text-[13px]">
        <tbody>
          {webhooks.length === 0 ? <tr><td className="py-3 text-ink-soft">No webhooks yet.</td></tr> : webhooks.map((h) => (
            <tr key={h.id} className="border-b border-rule">
              <td className="py-3 pr-4 break-all">{h.url}</td>
              <td className="py-3 pr-4 text-ink-soft">{h.series_id ?? h.module ?? "—"}</td>
              <td className="py-3 pr-4 text-right"><button onClick={() => onDelete(h.id)} className="text-flag hover:underline">Delete</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Usage({ today, limit, history, endpoints }: {
  today: number;
  limit: number;
  history: { day: string; requests: number }[];
  endpoints: EndpointUsage[];
}) {
  const maxReq = useMemo(() => Math.max(1, ...history.map((h) => h.requests)), [history]);
  return (
    <div>
      <SectionTitle sub="Requests against your plan limit.">Usage</SectionTitle>
      <div className="flex flex-wrap gap-x-12 gap-y-4 border-t border-rule pt-5">
        <div><p className="num text-[34px] leading-none">{fmtCount(today)}</p><p className="eyebrow mt-2">Requests today</p></div>
        <div><p className="num text-[34px] leading-none">{fmtCount(limit)}</p><p className="eyebrow mt-2">Daily limit</p></div>
      </div>
      <div className="mt-8 flex h-24 items-end gap-1">
        {history.length === 0 ? <p className="num text-[13px] text-ink-soft">Daily history will appear here as you make requests.</p>
          : history.map((h) => <div key={h.day} title={`${h.day}: ${h.requests}`} className="flex-1 bg-seal" style={{ height: `${Math.max(2, (h.requests / maxReq) * 100)}%` }} />)}
      </div>
      <h3 className="eyebrow mt-10">By endpoint · last 30 days</h3>
      {endpoints.length === 0 ? (
        <p className="num mt-3 text-[13px] text-ink-soft">Calls made with your API keys will be listed here by endpoint.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-rule text-left text-ink-soft">
                <th className="py-2 pr-4 font-normal">Endpoint</th>
                <th className="py-2 pr-4 text-right font-normal">Requests</th>
                <th className="py-2 pr-4 text-right font-normal">OK</th>
                <th className="py-2 pr-4 text-right font-normal">4xx</th>
                <th className="py-2 pr-4 text-right font-normal">5xx</th>
                <th className="py-2 text-right font-normal">Typical ms</th>
              </tr>
            </thead>
            <tbody>
              {endpoints.map((e) => (
                <tr key={e.route} className="border-b border-rule">
                  <td className="num py-2 pr-4">{e.route}</td>
                  <td className="num py-2 pr-4 text-right">{fmtCount(e.requests)}</td>
                  <td className="num py-2 pr-4 text-right">{fmtCount(e.ok)}</td>
                  <td className="num py-2 pr-4 text-right">{fmtCount(e.client_errors)}</td>
                  <td className="num py-2 pr-4 text-right">{fmtCount(e.server_errors)}</td>
                  <td className="num py-2 text-right">{e.avg_ms == null ? "—" : Math.round(e.avg_ms)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const PAID_PLANS: { id: string; name: string; price: number; blurb: string }[] = [
  { id: "developer", name: "Developer", price: 19, blurb: "10k requests/day · 10-year history · webhooks" },
  { id: "pro", name: "Pro", price: 49, blurb: "100k requests/day · full history to 1972 · bulk series dump" },
  { id: "business", name: "Business", price: 199, blurb: "500k requests/day · 99.9% SLA · dedicated support" },
];
const PLAN_RANK: Record<string, number> = { free: 0, developer: 1, pro: 2, business: 3 };

function Billing({ plan, status, email, token }: { plan: string; status?: string; email?: string; token: string }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [managing, setManaging] = useState(false);
  const currentRank = PLAN_RANK[plan] ?? 0;
  const isPaid = plan !== "free";

  async function upgrade(target: string) {
    setErr(null);
    setBusy(target);
    try {
      const res = await createCheckout({ data: { plan: target, email } });
      if (res.ok && res.url) {
        window.location.href = res.url;
        return;
      }
      setErr(res.error ?? "Couldn't start checkout. Please try again.");
    } catch {
      setErr("Couldn't reach the billing service.");
    } finally {
      setBusy(null);
    }
  }

  async function manage() {
    setErr(null);
    setManaging(true);
    try {
      const res = await billingPortal({ data: { token } });
      if (res.ok && res.url) {
        window.location.href = res.url;
        return;
      }
      setErr("Couldn't open the billing portal. Please try again.");
    } catch {
      setErr("Couldn't reach the billing service.");
    } finally {
      setManaging(false);
    }
  }

  return (
    <div>
      <SectionTitle sub="Manage your plan and upgrade.">Billing</SectionTitle>
      <div className="border border-rule p-5">
        <p className="text-[15px]">
          You're on the <span className="capitalize">{plan}</span> plan · {status ?? "active"}.
        </p>
        <p className="mt-1 text-[13px] text-ink-soft">
          Checkout is handled securely by LemonSqueezy. Your key is upgraded automatically once payment completes.
        </p>
        {isPaid ? (
          <button
            onClick={manage}
            disabled={managing}
            className="mt-4 border border-rule px-4 py-2.5 text-[14px] transition-colors hover:border-seal hover:text-seal disabled:opacity-50"
          >
            {managing ? "Opening…" : "Manage subscription"}
          </button>
        ) : null}
      </div>

      {err ? <p className="mt-4 text-[13px] text-flag">{err}</p> : null}

      <div className="mt-5 grid gap-4 md:grid-cols-3">
        {PAID_PLANS.map((p) => {
          const isCurrent = p.id === plan;
          const isDowngrade = (PLAN_RANK[p.id] ?? 0) < currentRank;
          return (
            <div key={p.id} className="flex flex-col border border-rule p-5">
              <p className="eyebrow">{p.name}</p>
              <p className="num mt-2 text-[28px] font-medium leading-none">
                ${p.price}
                <span className="text-[13px] text-ink-soft"> /mo</span>
              </p>
              <p className="mt-3 flex-1 text-[13px] text-ink-soft">{p.blurb}</p>
              {isCurrent ? (
                <span className="mt-4 inline-block border border-rule px-4 py-2.5 text-center text-[14px] text-ink-soft">
                  Current plan
                </span>
              ) : isDowngrade ? (
                <span className="mt-4 inline-block px-4 py-2.5 text-center text-[13px] text-ink-soft">
                  Included below your plan
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => upgrade(p.id)}
                  disabled={busy !== null}
                  className="mt-4 bg-seal px-4 py-2.5 text-[14px] text-seal-contrast transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {busy === p.id ? "Starting checkout…" : `Upgrade to ${p.name}`}
                </button>
              )}
            </div>
          );
        })}
      </div>

      <p className="mt-5 text-[13px] text-ink-soft">
        See the full comparison on the{" "}
        <Link to="/pricing" className="text-seal hover:underline">pricing page</Link>.
      </p>
    </div>
  );
}

function Settings({
  email,
  name: initialName,
  company: initialCompany,
  plan,
  token,
}: {
  email?: string;
  name?: string;
  company?: string;
  plan: string;
  token: string;
}) {
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Profile (name / company)
  const [name, setName] = useState(initialName ?? "");
  const [company, setCompany] = useState(initialCompany ?? "");
  const [pMsg, setPMsg] = useState<string | null>(null);
  const [pBusy, setPBusy] = useState(false);

  async function saveProfile() {
    setPMsg(null);
    setPBusy(true);
    const res = await updateProfile({ data: { token, name, company } });
    setPBusy(false);
    setPMsg(res.ok ? "Profile saved." : "Couldn't save profile.");
  }

  async function submit() {
    setMsg(null); setErr(null);
    if (next.length < 8) { setErr("New password must be at least 8 characters."); return; }
    setBusy(true);
    const res = await changePassword({ data: { token, current_password: cur, new_password: next } });
    setBusy(false);
    if (res.ok) { setMsg("Password updated."); setCur(""); setNext(""); }
    else setErr(res.status === 401 ? "Current password is incorrect." : res.error ?? "Couldn't update password.");
  }

  return (
    <div>
      <SectionTitle sub="Your profile and password.">Settings</SectionTitle>
      <div className="border border-rule p-5">
        <p className="eyebrow">Email</p>
        <p className="mt-1 text-[15px]">{email}</p>
        <p className="eyebrow mt-4">Plan</p>
        <p className="mt-1 text-[15px] capitalize">{plan}</p>
      </div>
      <div className="mt-4 max-w-[420px] border border-rule p-5">
        <p className="eyebrow">Profile</p>
        <div className="mt-3 space-y-3">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" autoComplete="name" className="w-full border border-rule bg-paper px-3 py-2.5 text-[14px] outline-none focus:border-seal" />
          <input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Company (optional)" autoComplete="organization" className="w-full border border-rule bg-paper px-3 py-2.5 text-[14px] outline-none focus:border-seal" />
          <button onClick={saveProfile} disabled={pBusy} className="bg-seal px-4 py-2.5 text-[14px] text-seal-contrast hover:opacity-90 disabled:opacity-50">{pBusy ? "Saving…" : "Save profile"}</button>
        </div>
        {pMsg ? <p className="mt-3 text-[13px] text-seal">{pMsg}</p> : null}
      </div>
      <div className="mt-4 max-w-[420px] border border-rule p-5">
        <p className="eyebrow">Change password</p>
        <div className="mt-3 space-y-3">
          <input type="password" value={cur} onChange={(e) => setCur(e.target.value)} placeholder="Current password" autoComplete="current-password" className="w-full border border-rule bg-paper px-3 py-2.5 text-[14px] outline-none focus:border-seal" />
          <input type="password" value={next} onChange={(e) => setNext(e.target.value)} placeholder="New password (8+ characters)" autoComplete="new-password" className="w-full border border-rule bg-paper px-3 py-2.5 text-[14px] outline-none focus:border-seal" />
          <button onClick={submit} disabled={busy} className="bg-seal px-4 py-2.5 text-[14px] text-seal-contrast hover:opacity-90 disabled:opacity-50">{busy ? "Saving…" : "Update password"}</button>
        </div>
        {msg ? <p className="mt-3 text-[13px] text-seal">{msg}</p> : null}
        {err ? <p className="mt-3 text-[13px] text-flag">{err}</p> : null}
      </div>
    </div>
  );
}

function Banner({ label, value, onClose }: { label: string; value: string; onClose: () => void }) {
  return (
    <div className="mb-5 border border-seal bg-seal-tint p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="eyebrow">{label}</p>
          <p className="num mt-2 break-all text-[15px]">{value}</p>
          <p className="mt-2 text-[13px] text-ink-soft">Copy it now — it won't be shown again.</p>
        </div>
        <button onClick={onClose} className="shrink-0 text-[13px] text-ink-soft hover:text-seal">Dismiss</button>
      </div>
    </div>
  );
}
