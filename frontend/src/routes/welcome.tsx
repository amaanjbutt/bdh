import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

import { Eyebrow, Panel, PanelHeadline, PanelInner } from "@/components/site/panel";
import { setPassword } from "@/lib/bangladata/auth.functions";
import { claimKey } from "@/lib/bangladata/dashboard.functions";

const SESSION_KEY = "bangladatahub-session";

/**
 * Post-checkout landing. LemonSqueezy redirects the buyer here as
 * `/welcome?token=<signup_token>` after a successful payment. We redeem the
 * token once for their API key (shown a single time) and point them at the
 * dashboard. If the token is missing or already claimed, we still confirm the
 * purchase and route them to sign in.
 */
export const Route = createFileRoute("/welcome")({
  validateSearch: (search: Record<string, unknown>): { token?: string } => ({
    token: typeof search.token === "string" ? search.token : undefined,
  }),
  head: () => ({ meta: [{ title: "Welcome — BanglaDataHub" }] }),
  component: Welcome,
});

type State = "loading" | "have_key" | "no_key";

function Welcome() {
  const navigate = useNavigate();
  const { token } = Route.useSearch();
  const [state, setState] = useState<State>(token ? "loading" : "no_key");
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const claimed = useRef(false);
  // Set-a-password (dashboard access for pay-first buyers).
  const [pwd, setPwd] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwErr, setPwErr] = useState<string | null>(null);

  async function savePassword() {
    if (!token) return;
    if (pwd.length < 8) {
      setPwErr("Password must be at least 8 characters.");
      return;
    }
    setPwErr(null);
    setPwBusy(true);
    const res = await setPassword({ data: { token, password: pwd } });
    setPwBusy(false);
    if (res.ok && res.session_token) {
      try {
        localStorage.setItem(SESSION_KEY, res.session_token);
      } catch {
        /* ignore */
      }
      navigate({ to: "/dashboard" });
    } else if (res.status === 409) {
      setPwErr("This account already has a password — sign in instead.");
    } else {
      setPwErr(res.error ?? "Couldn't set your password. Please try again.");
    }
  }

  useEffect(() => {
    if (!token || claimed.current) return;
    claimed.current = true; // one-time claim; never fire twice
    void (async () => {
      const res = await claimKey({ data: { token } });
      if (res.ok && res.api_key) {
        setApiKey(res.api_key);
        setState("have_key");
      } else {
        setState("no_key");
      }
    })();
  }, [token]);

  async function copyKey() {
    if (!apiKey) return;
    try {
      await navigator.clipboard.writeText(apiKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <main>
      <Panel ground="paper" full={false} className="pt-32 pb-24">
        <PanelInner>
          <Eyebrow>Payment complete</Eyebrow>
          <PanelHeadline className="mt-6">You're all set. Thank you.</PanelHeadline>

          {state === "loading" && (
            <p className="mt-6 num text-[15px] text-ink-soft">Setting up your account…</p>
          )}

          {state === "have_key" && apiKey && (
            <>
              <p className="mt-6 max-w-[52ch] text-[17px] text-ink-soft">
                Your subscription is active and your account is ready. Here's your API key —
                shown only once. Copy it now; you can always create more from your dashboard.
              </p>
              <div className="mt-8 max-w-[640px] border border-seal bg-seal-tint p-5">
                <p className="eyebrow">API key — shown once</p>
                <p className="num mt-2 break-all text-[15px]">{apiKey}</p>
                <button
                  onClick={copyKey}
                  className="mt-4 bg-seal px-4 py-2 text-[13px] text-seal-contrast transition-opacity hover:opacity-90"
                >
                  {copied ? "Copied ✓" : "Copy key"}
                </button>
              </div>

              <div className="mt-8 max-w-[420px]">
                <p className="eyebrow">Set a password for your dashboard</p>
                <p className="mt-2 text-[14px] text-ink-soft">
                  Create a password so you can sign in to manage keys, usage, and billing.
                </p>
                <div className="mt-3 space-y-3">
                  <input
                    type="password"
                    value={pwd}
                    onChange={(e) => setPwd(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && savePassword()}
                    placeholder="Password (8+ characters)"
                    autoComplete="new-password"
                    className="w-full border border-rule bg-paper px-3 py-2.5 text-[14px] outline-none focus:border-seal"
                  />
                  <button
                    onClick={savePassword}
                    disabled={pwBusy}
                    className="w-full bg-seal px-5 py-2.5 text-[14px] text-seal-contrast transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    {pwBusy ? "Saving…" : "Set password & go to dashboard"}
                  </button>
                </div>
                {pwErr ? <p className="mt-3 text-[13px] text-flag">{pwErr}</p> : null}
              </div>
            </>
          )}

          {state === "no_key" && (
            <p className="mt-6 max-w-[52ch] text-[17px] text-ink-soft">
              Your subscription is active. If you already have an account, your plan has been
              upgraded automatically — sign in to find your keys. If this was your first purchase
              and you've already claimed your key, it won't be shown again; create a new one from
              the dashboard any time.
            </p>
          )}

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Link
              to="/dashboard"
              className="bg-seal px-5 py-2.5 text-[14px] text-seal-contrast transition-opacity hover:opacity-90"
            >
              Go to dashboard
            </Link>
            <Link
              to="/docs/$slug"
              params={{ slug: "getting-started" }}
              className="text-[14px] text-seal underline underline-offset-2"
            >
              Make your first call →
            </Link>
          </div>
        </PanelInner>
      </Panel>
    </main>
  );
}
