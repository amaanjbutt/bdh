import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { Eyebrow, Panel, PanelHeadline, PanelInner } from "@/components/site/panel";
import { signup } from "@/lib/bangladata/auth.functions";

export const Route = createFileRoute("/signup")({
  head: () => ({
    meta: [
      { title: "Create your account — BanglaDataHub" },
      {
        name: "description",
        content:
          "Create a free BanglaDataHub account — 500 API calls every month, every dataset, CSV export. No credit card.",
      },
    ],
  }),
  component: Signup,
});

const SESSION_KEY = "bangladatahub-session";

function Signup() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function onSubmit() {
    const e = email.trim();
    if (!e || password.length < 8) {
      setError(password.length < 8 ? "Password must be at least 8 characters." : "Enter your email.");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await signup({ data: { email: e, password } });
    setBusy(false);
    if (res.ok && res.session_token) {
      try {
        localStorage.setItem(SESSION_KEY, res.session_token);
      } catch {
        /* ignore */
      }
      setApiKey(res.api_key ?? null);
    } else if (res.status === 409) {
      setError("An account already exists for this email. Sign in instead.");
    } else {
      setError(res.error ?? "Signup failed. Please try again.");
    }
  }

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

  // Success: show the one-time key, then into the dashboard.
  if (apiKey) {
    return (
      <main>
        <Panel ground="paper" full={false} className="pt-32 pb-24">
          <PanelInner>
            <Eyebrow>You're in</Eyebrow>
            <PanelHeadline className="mt-6">Your account is ready.</PanelHeadline>
            <p className="mt-6 max-w-[52ch] text-[17px] text-ink-soft">
              Here's your first API key — shown only once. Copy it now; you can always create
              more from your dashboard.
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
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <button
                onClick={() => navigate({ to: "/dashboard" })}
                className="bg-seal px-5 py-2.5 text-[14px] text-seal-contrast transition-opacity hover:opacity-90"
              >
                Go to dashboard
              </button>
              <Link to="/docs/$slug" params={{ slug: "getting-started" }} className="text-[14px] text-seal underline underline-offset-2">
                Make your first call →
              </Link>
            </div>
          </PanelInner>
        </Panel>
      </main>
    );
  }

  return (
    <main>
      <Panel ground="paper" full={false} className="pt-32 pb-24">
        <PanelInner>
          <Eyebrow>Create account</Eyebrow>
          <PanelHeadline className="mt-6">Start free in seconds.</PanelHeadline>
          <p className="mt-6 max-w-[52ch] text-[17px] text-ink-soft">
            No credit card. 500 free API calls every month across every dataset, with CSV export. You can
            upgrade any time.
          </p>

          <div className="mt-8 max-w-[420px] space-y-3">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              className="w-full border border-rule bg-paper px-3 py-2.5 text-[14px] outline-none focus:border-seal"
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onSubmit()}
              placeholder="Password (8+ characters)"
              autoComplete="new-password"
              className="w-full border border-rule bg-paper px-3 py-2.5 text-[14px] outline-none focus:border-seal"
            />
            <button
              onClick={onSubmit}
              disabled={busy}
              className="w-full bg-seal px-5 py-2.5 text-[14px] text-seal-contrast transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Creating account…" : "Create free account"}
            </button>
          </div>
          {error ? <p className="mt-4 max-w-[52ch] text-[14px] text-flag">{error}</p> : null}

          <p className="mt-8 text-[14px] text-ink-soft">
            Already have an account?{" "}
            <Link to="/login" className="text-seal underline underline-offset-2">
              Sign in
            </Link>
            .
          </p>
        </PanelInner>
      </Panel>
    </main>
  );
}
