import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { Eyebrow, Panel, PanelHeadline, PanelInner } from "@/components/site/panel";
import { getPlans } from "@/lib/bangladata/api.functions";
import { accountEmail, createCheckout } from "@/lib/bangladata/dashboard.functions";
import { fmtCount } from "@/lib/bangladata/format";
import type { Plan } from "@/lib/bangladata/types";

const plansQuery = queryOptions({
  queryKey: ["plans"],
  queryFn: () => getPlans(),
  staleTime: 60 * 60 * 1000,
});

// Value-based (2026-10-04): plans differ by what the data is worth to you — how far
// back you can go, revisions, alerts, and the right to show it in your own product.
// Everything every plan shares is stated once above the table, not as a row of ticks.
const ROWS: { label: string; key: string; hint?: string }[] = [
  { label: "Best for", key: "for_who" },
  { label: "History", key: "history" },
  { label: "Revision vintages", key: "vintages", hint: "first prints and every dated revision, back to 2008 — any series as of a past date" },
  { label: "Webhooks", key: "webhooks", hint: "a POST the moment a series updates" },
  { label: "Bulk snapshots", key: "bulk" },
  { label: "Show the data in your product", key: "usage_rights" },
  { label: "Uptime SLA", key: "sla" },
  { label: "Support", key: "support" },
  { label: "Requests", key: "requests_day", hint: "fair use on paid plans" },
];

export const Route = createFileRoute("/pricing")({
  loader: ({ context }) => context.queryClient.ensureQueryData(plansQuery),
  head: () => ({
    meta: [
      { title: "Pricing — BanglaDataHub API" },
      {
        name: "description",
        content:
          "BanglaDataHub plans: start free with 500 API calls a month. Paid plans add longer history, past revisions of the data, webhooks and the right to show the data in your own product.",
      },
      { property: "og:title", content: "BanglaDataHub pricing" },
      {
        property: "og:description",
        content: "Start free with 500 calls a month. Paid plans add longer history, past revisions, webhooks and display rights.",
      },
    ],
  }),
  component: Pricing,
});

function cell(value: unknown) {
  if (value === true) return "Yes";
  if (value === false) return "—";
  if (typeof value === "number") return fmtCount(value);
  return String(value);
}

// The "Requests" row is a monthly allowance on Free and a generous fair-use ceiling
// on paid plans — volume is not what the paid plans sell.
function planCell(key: string, p: Plan): string {
  if (key === "requests_day") {
    if (p.free_credits != null) return `${fmtCount(p.free_credits)} / month`;
    return `${fmtCount(p.requests_day)} / day`;
  }
  if (key === "usage_rights") return p.usage_rights === "display" ? "Yes — in your app or site" : "Internal use";
  return cell((p as unknown as Record<string, unknown>)[key]);
}

function Pricing() {
  const { data: plans } = useSuspenseQuery(plansQuery);
  // If the visitor is signed in, bind checkout to their account email so an
  // upgrade lands on the existing account rather than creating a new one.
  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => {
    const t = typeof window !== "undefined" ? localStorage.getItem("bangladatahub-session") : null;
    if (!t) return;
    void accountEmail({ data: { token: t } }).then((r) => {
      if (r.ok && r.email) setEmail(r.email);
    });
  }, []);

  return (
    <main>
      <Panel ground="paper" full={false} className="pt-32 pb-16">
        <PanelInner>
          <Eyebrow>Pricing</Eyebrow>
          <PanelHeadline className="mt-6">Every dataset, on every plan.</PanelHeadline>
          <p className="mt-6 max-w-[60ch] text-[18px] text-ink-soft">
            Start free with 500 API calls a month, no card needed. Paid plans add longer history, every past
            revision of the figures, webhooks, and the right to show the data in your own app or website.
          </p>
          <p className="mt-4 max-w-[64ch] text-[15px] text-ink-soft">
            All plans cover exchange rates, inflation, interest rates, money and credit, trade, remittances,
            digital payments, DSE market data, district statistics and the rest, with CSV export and
            ready-made transforms such as year-on-year change.
          </p>
        </PanelInner>
      </Panel>

      <Panel ground="paper" full={false} className="pb-24">
        <PanelInner>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-t border-rule text-left">
              <thead>
                <tr>
                  <th className="eyebrow w-[220px] py-4 align-bottom">Plan</th>
                  {plans.map((p) => (
                    <th key={p.id} className="border-l border-rule px-5 py-4 align-bottom">
                      <span className="font-display text-[20px] font-normal">{p.name}</span>
                      <span className="num mt-1 block text-[28px] leading-none">
                        ${p.price_monthly}
                        {p.price_monthly > 0 ? (
                          <span className="text-[13px] text-ink-soft">/mo</span>
                        ) : null}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="num text-[13px]">
                {ROWS.map((row) => (
                  <tr key={row.key} className="border-t border-rule">
                    <th className="py-3 pr-4 text-left font-sans text-[14px] font-normal text-ink-soft">
                      {row.label}
                      {row.hint ? <span className="block text-[12px] opacity-70">{row.hint}</span> : null}
                    </th>
                    {plans.map((p) => (
                      <td key={p.id} className="border-l border-rule px-5 py-3">
                        {planCell(row.key, p)}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr className="border-t border-rule">
                  <td />
                  {plans.map((p) => (
                    <td key={p.id} className="border-l border-rule px-5 py-6 align-top">
                      <PlanCta plan={p} email={email} />
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          <div className="mt-12 grid gap-6 border-t border-rule pt-8 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <Eyebrow>Teams & institutions</Eyebrow>
              <p className="mt-3 max-w-[64ch] text-[16px]">
                Annual plans billed in BDT against a purchase order, display and redistribution
                licences, custom series and onboarding for banks, asset managers and DFIs.
              </p>
            </div>
            <a
              href="mailto:hello@bangladatahub.com?subject=BanglaDataHub%20annual%20plan"
              className="inline-block border border-rule px-4 py-2.5 text-[14px] transition-colors hover:border-seal hover:text-seal"
            >
              Ask about an annual plan
            </a>
          </div>
        </PanelInner>
      </Panel>
    </main>
  );
}

// Free routes to signup (instant key); paid plans start a pay-first LemonSqueezy
// checkout — the account + key are provisioned on payment and handed over at
// /welcome, so a buyer never has to sign up before paying.
function PlanCta({ plan, email }: { plan: Plan; email: string | null }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (plan.id === "free" || plan.price_monthly === 0) {
    return (
      <Link
        to="/signup"
        className="inline-block bg-seal px-4 py-2.5 font-sans text-[14px] text-seal-contrast transition-opacity hover:opacity-90"
      >
        Start free
      </Link>
    );
  }

  async function buy() {
    setErr(null);
    setBusy(true);
    try {
      const res = await createCheckout({ data: { plan: plan.id, email: email ?? undefined } });
      if (res.ok && res.url) {
        window.location.href = res.url;
        return;
      }
      setErr(res.error ?? "Couldn't start checkout. Please try again.");
    } catch {
      setErr("Couldn't reach the billing service.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={buy}
        disabled={busy}
        className="inline-block bg-seal px-4 py-2.5 font-sans text-[14px] text-seal-contrast transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {busy ? "Starting…" : `Choose ${plan.name}`}
      </button>
      {err ? <p className="mt-2 max-w-[16ch] text-[12px] text-flag">{err}</p> : null}
    </div>
  );
}
