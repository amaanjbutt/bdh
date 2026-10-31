import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { type ReactNode, useEffect, useState } from "react";

import { type AdminTab, getAdmin, getAdminTab } from "@/lib/bangladata/dashboard.functions";
import { fmtCount, fmtDate } from "@/lib/bangladata/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin")({
  head: () => ({
    // Admin surface — keep it out of search indexes entirely.
    meta: [{ title: "Admin — BanglaDataHub" }, { name: "robots", content: "noindex,nofollow" }],
  }),
  component: Admin,
});

const SESSION_KEY = "bangladatahub-session";

type Overview = {
  users: { total: number; signups_today: number; signups_7d: number; signups_30d: number; active_paid: number };
  subscriptions: { by_plan: Record<string, number>; mrr_usd: number };
  usage: { requests_today: number };
};
type UserRow = {
  email: string; plan: string; status: string | null; created_at: string;
  credits_remaining: number | null; keys: number; last_active: string | null;
};
type Row = Record<string, unknown>;
type State =
  | { kind: "loading" }
  | { kind: "signedout" }
  | { kind: "error" }
  | { kind: "forbidden" }
  | { kind: "ok"; overview: Overview; users: UserRow[] };

const TABS: { id: "overview" | AdminTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "traffic", label: "API traffic" },
  { id: "ingestion", label: "Ingestion" },
  { id: "dq", label: "Data quality" },
  { id: "catalog", label: "Catalog" },
  { id: "system", label: "System" },
];

function Shell({ children }: { children: ReactNode }) {
  return <main className="mx-auto min-h-screen max-w-[1160px] px-6 pt-24 pb-16 md:px-10">{children}</main>;
}

const fmtCell = (v: unknown): string => {
  if (v == null || v === "") return "—";
  if (typeof v === "number") return fmtCount(v);
  if (typeof v === "boolean") return v ? "yes" : "";
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return `${fmtDate(s.slice(0, 10))} ${s.slice(11, 16)}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return fmtDate(s);
  return s;
};

/** A plain table over API rows (column order = the given keys). */
function Table({ rows, cols, highlight }: { rows: Row[]; cols: [string, string][]; highlight?: (r: Row) => boolean }) {
  if (!rows.length) return <p className="num mt-3 text-[13px] text-ink-soft">Nothing yet.</p>;
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-[13px]">
        <thead className="eyebrow text-ink-soft">
          <tr className="border-b border-rule">
            {cols.map(([, label]) => (
              <th key={label} className="py-2 pr-4 font-normal">{label}</th>
            ))}
          </tr>
        </thead>
        <tbody className="num">
          {rows.map((r, i) => (
            <tr key={i} className={cn("border-b border-rule align-top", highlight?.(r) && "bg-seal-tint")}>
              {cols.map(([k]) => (
                <td key={k} className="max-w-[420px] py-2 pr-4 break-words">{fmtCell(r[k])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-10">
      <p className="eyebrow border-t border-rule pt-4">{title}</p>
      {children}
    </section>
  );
}

function Tiles({ items }: { items: { l: string; v: string }[] }) {
  return (
    <div className="mt-6 grid grid-cols-2 gap-px border border-rule bg-rule md:grid-cols-4">
      {items.map((s) => (
        <div key={s.l} className="bg-paper px-5 py-6">
          <p className="num text-[28px] leading-none">{s.v}</p>
          <p className="eyebrow mt-2">{s.l}</p>
        </div>
      ))}
    </div>
  );
}

function Admin() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [state, setState] = useState<State>({ kind: "loading" });
  const [tab, setTab] = useState<"overview" | AdminTab>("overview");

  useEffect(() => {
    const t = typeof window !== "undefined" ? localStorage.getItem(SESSION_KEY) : null;
    setReady(true);
    setToken(t);
    if (!t) { setState({ kind: "signedout" }); return; }
    void (async () => {
      const res = await getAdmin({ data: { token: t } });
      if (!("authed" in res) || !res.configured) { setState({ kind: "error" }); return; }
      if (!res.authed) { localStorage.removeItem(SESSION_KEY); navigate({ to: "/login" }); return; }
      if (!("admin" in res) || !res.admin) { setState({ kind: "forbidden" }); return; }
      setState({ kind: "ok", overview: res.overview as Overview, users: res.users as UserRow[] });
    })();
  }, [navigate]);

  if (!ready || state.kind === "loading") {
    return <Shell><p className="num text-[14px] text-ink-soft">Loading…</p></Shell>;
  }
  if (state.kind === "signedout") {
    return (
      <Shell>
        <p className="eyebrow">Admin</p>
        <h1 className="mt-4 text-[36px] leading-tight">Sign in to continue.</h1>
        <p className="mt-4 text-[17px] text-ink-soft">Use an admin account to view the panel.</p>
        <Link to="/login" className="mt-8 inline-block bg-seal px-4 py-2.5 text-[14px] text-seal-contrast">Log in</Link>
      </Shell>
    );
  }
  if (state.kind === "forbidden") {
    return (
      <Shell>
        <p className="eyebrow">Admin</p>
        <h1 className="mt-4 text-[36px] leading-tight">Not authorized.</h1>
        <p className="mt-4 text-[17px] text-ink-soft">This account doesn't have admin access.</p>
        <Link to="/dashboard" className="mt-8 inline-block border border-rule px-4 py-2.5 text-[14px]">Back to dashboard</Link>
      </Shell>
    );
  }
  if (state.kind === "error") {
    return <Shell><p className="text-[15px] text-ink-soft">Admin data isn't reachable right now.</p></Shell>;
  }

  return (
    <Shell>
      <div className="flex items-center justify-between border-b border-rule pb-5">
        <div>
          <p className="eyebrow">Admin</p>
          <p className="mt-1 text-[20px]">{TABS.find((t) => t.id === tab)?.label}</p>
        </div>
        <Link to="/dashboard" className="text-[13px] text-ink-soft hover:text-seal">Dashboard →</Link>
      </div>
      <nav className="mt-4 flex flex-wrap gap-1" aria-label="Admin sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "border px-3 py-1.5 text-[13px] transition-colors",
              tab === t.id ? "border-seal bg-seal-tint text-seal" : "border-rule hover:border-seal",
            )}
          >
            {t.label}
          </button>
        ))}
      </nav>
      {tab === "overview" ? (
        <OverviewTab overview={state.overview} users={state.users} />
      ) : token ? (
        <TabData key={tab} tab={tab} token={token} />
      ) : null}
    </Shell>
  );
}

function OverviewTab({ overview: o, users }: { overview: Overview; users: UserRow[] }) {
  return (
    <>
      <Tiles
        items={[
          { l: "Users", v: fmtCount(o.users.total) },
          { l: "Active paid", v: fmtCount(o.users.active_paid) },
          { l: "MRR", v: `$${fmtCount(o.subscriptions.mrr_usd)}` },
          { l: "Requests today", v: fmtCount(o.usage.requests_today) },
          { l: "Signups · today", v: fmtCount(o.users.signups_today) },
          { l: "Signups · 7d", v: fmtCount(o.users.signups_7d) },
          { l: "Signups · 30d", v: fmtCount(o.users.signups_30d) },
          {
            l: "Paid by plan",
            v: Object.entries(o.subscriptions.by_plan).map(([p, n]) => `${p} ${n}`).join(" · ") || "—",
          },
        ]}
      />
      <Section title="Recent accounts">
        <Table
          rows={users as unknown as Row[]}
          cols={[["email", "Email"], ["plan", "Plan"], ["status", "Status"], ["credits_remaining", "Credits"],
            ["keys", "Keys"], ["created_at", "Joined"], ["last_active", "Last active"]]}
        />
      </Section>
    </>
  );
}

function TabData({ tab, token }: { tab: AdminTab; token: string }) {
  const [days, setDays] = useState(7);
  const [data, setData] = useState<Row | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setFailed(false);
    void getAdminTab({ data: { token, tab, days } }).then((res) => {
      if (cancelled) return;
      if (res.ok && res.data) setData(res.data as Row);
      else setFailed(true);
    });
    return () => { cancelled = true; };
  }, [tab, token, days]);

  if (failed) return <p className="mt-8 text-[15px] text-ink-soft">This section isn't reachable right now.</p>;
  if (!data) return <p className="num mt-8 text-[14px] text-ink-soft">Loading…</p>;
  const rows = (k: string) => ((data[k] as Row[] | undefined) ?? []);

  if (tab === "ingestion") {
    const jobs = rows("jobs");
    return (
      <>
        <Tiles
          items={[
            { l: "Jobs", v: fmtCount(jobs.length) },
            { l: "Late", v: fmtCount(Number(data["late"] ?? 0)) },
            { l: "Last run failed", v: fmtCount(Number(data["failing"] ?? 0)) },
            { l: "Workstation jobs", v: fmtCount(jobs.filter((j) => j["where"] === "workstation").length) },
          ]}
        />
        <Section title="Every job (late or failing rows highlighted)">
          <Table
            rows={jobs}
            highlight={(r) => Boolean(r["late"]) || r["last_status"] === "failed"}
            cols={[["job", "Job"], ["where", "Runs on"], ["last_status", "Last status"], ["last_run", "Last run"],
              ["last_load", "Last load (rows > 0)"], ["expected_days", "Expected every (d)"], ["late", "Late"],
              ["failures_7d", "Fails 7d"], ["last_error", "Last error"]]}
          />
        </Section>
      </>
    );
  }

  if (tab === "dq") {
    const q = (data["quarantine"] ?? {}) as Record<string, number | null>;
    const notes = (data["notes"] ?? {}) as Row;
    return (
      <>
        <Tiles
          items={[
            { l: "Public notes", v: fmtCount(Number(notes["notes"] ?? 0)) },
            { l: "Unit slips fixed", v: fmtCount(Number(q["obs_scale_corrections"] ?? 0)) },
            {
              l: "Quarantined rows",
              v: fmtCount(Object.entries(q).filter(([k]) => k !== "obs_scale_corrections")
                .reduce((a, [, n]) => a + Number(n ?? 0), 0)),
            },
          ]}
        />
        <Section title="Findings by detector and verdict">
          <Table
            rows={rows("findings")}
            highlight={(r) => r["verdict"] === "unchecked" || r["verdict"] === "source_differs"}
            cols={[["detector", "Detector"], ["verdict", "Verdict"], ["points", "Points"], ["series", "Series"]]}
          />
        </Section>
        <Section title="Quarantine tables">
          <Table rows={Object.entries(q).map(([table, n]) => ({ table, rows: n }))} cols={[["table", "Table"], ["rows", "Rows"]]} />
        </Section>
      </>
    );
  }

  if (tab === "traffic") {
    const top = (data["top"] ?? {}) as Record<string, Row[]>;
    const byDay = rows("by_day");
    const total = byDay.reduce((a, r) => a + Number(r["requests"] ?? 0), 0);
    return (
      <>
        <div className="mt-6 flex flex-wrap items-center gap-1">
          {[1, 7, 30, 90].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDays(d)}
              className={cn("border px-3 py-1.5 text-[13px]", days === d ? "border-seal bg-seal-tint text-seal" : "border-rule")}
            >
              {d === 1 ? "Today" : `${d} days`}
            </button>
          ))}
        </div>
        <Tiles
          items={[
            { l: "Requests", v: fmtCount(total) },
            { l: "With an API key", v: fmtCount(byDay.reduce((a, r) => a + Number(r["keyed"] ?? 0), 0)) },
            { l: "4xx / 5xx", v: fmtCount(byDay.reduce((a, r) => a + Number(r["errors"] ?? 0), 0)) },
            { l: "Unique IPs (days)", v: fmtCount((top["unique"] ?? []).reduce((a, r) => a + Number(r["requests"] ?? 0), 0)) },
          ]}
        />
        <Section title="Per day">
          <Table rows={byDay} cols={[["day", "Day"], ["requests", "Requests"], ["keyed", "Keyed"], ["errors", "4xx/5xx"]]} />
        </Section>
        <Section title="Per endpoint">
          <Table
            rows={rows("by_route")}
            cols={[["route", "Endpoint"], ["requests", "Requests"], ["client_errors", "4xx"], ["server_errors", "5xx"],
              ["ms_typical", "Typical ms"], ["ms_p95_max", "p95 ms (worst day)"]]}
          />
        </Section>
        <Section title="Per account">
          <Table rows={rows("by_user")} cols={[["email", "Account"], ["plan", "Plan"], ["requests", "Requests"], ["endpoints", "Endpoints"]]} />
        </Section>
        {[
          ["subject", "Most-requested series and items"],
          ["page", "Site pages that called the API"],
          ["ua", "Client types"],
          ["country", "Countries"],
          ["status", "Status codes"],
          ["route_public", "Public endpoints (no key)"],
        ].map(([k, label]) => (
          <Section key={k} title={`${label} (completed days)`}>
            <Table rows={top[k!] ?? []} cols={[["value", "Value"], ["requests", "Requests"]]} />
          </Section>
        ))}
      </>
    );
  }

  if (tab === "catalog") {
    const ds = (data["datasets"] ?? {}) as Row;
    return (
      <>
        <Tiles
          items={[
            { l: "Live series", v: fmtCount(rows("modules").reduce((a, r) => a + Number(r["series"] ?? 0), 0)) },
            { l: "DSE instruments", v: fmtCount(Number(ds["securities"] ?? 0)) },
            { l: "Census districts", v: fmtCount(Number(ds["census_districts"] ?? 0)) },
            { l: "Search entities", v: fmtCount(Number(ds["search_entities"] ?? 0)) },
          ]}
        />
        <Section title="Modules">
          <Table rows={rows("modules")} cols={[["module", "Module"], ["series", "Series"], ["derived", "Derived"], ["last_date", "Newest data"]]} />
        </Section>
        <Section title="Sources">
          <Table rows={rows("sources")} cols={[["source", "Source"], ["series", "Series"]]} />
        </Section>
      </>
    );
  }

  // system
  const dbSize = (data["database"] ?? {}) as Row;
  const redis = (data["redis"] ?? {}) as Row;
  const rl = (data["request_log"] ?? {}) as Row;
  const backups = rows("backup_tables");
  return (
    <>
      <Tiles
        items={[
          { l: "Database", v: String(dbSize["pretty"] ?? "—") },
          { l: "Redis memory", v: String(redis["used_memory_human"] ?? "—") },
          { l: "Request-log queue", v: fmtCount(Number(redis["reqlog_queue"] ?? 0)) },
          { l: "Backup tables", v: fmtCount(backups.length) },
        ]}
      />
      <Section title="Request log">
        <span />
      </Section>
      <Section title={`Request log — ${fmtCount(Number(rl["partitions"] ?? 0))} partitions; archive ${rl["archive_configured"] ? "configured" : "NOT configured (old days are kept)"}`}>
        <span />
      </Section>
      <Section title="Largest tables">
        <Table rows={rows("largest_tables")} cols={[["table", "Table"], ["pretty", "Size"]]} />
      </Section>
      <Section title="Backup tables (drop when no longer needed)">
        <Table rows={backups} cols={[["table", "Table"], ["pretty", "Size"]]} />
      </Section>
    </>
  );
}
