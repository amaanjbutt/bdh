import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { Eyebrow, Panel, PanelHeadline, PanelInner } from "@/components/site/panel";
import { GoogleButton, OrDivider } from "@/components/site/google-button";
import { login } from "@/lib/bangladata/auth.functions";

export const Route = createFileRoute("/login")({
  validateSearch: (s: Record<string, unknown>): { error?: string } => ({
    error: typeof s.error === "string" ? s.error : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Sign in — BanglaDataHub" },
      { name: "description", content: "Sign in to your BanglaDataHub dashboard." },
    ],
  }),
  component: Login,
});

const SESSION_KEY = "bangladatahub-session";

function Login() {
  const navigate = useNavigate();
  const { error: oauthError } = Route.useSearch();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(oauthError ?? null);

  async function onSubmit() {
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await login({ data: { email: email.trim(), password } });
    setBusy(false);
    if (res.ok && res.session_token) {
      try {
        localStorage.setItem(SESSION_KEY, res.session_token);
      } catch {
        /* ignore */
      }
      navigate({ to: "/dashboard" });
    } else {
      setError(res.status === 401 ? "Invalid email or password." : res.error ?? "Sign in failed.");
    }
  }

  return (
    <main>
      <Panel ground="paper" full={false} className="pt-32 pb-24">
        <PanelInner>
          <Eyebrow>Sign in</Eyebrow>
          <PanelHeadline className="mt-6">Welcome back.</PanelHeadline>

          <div className="mt-8 max-w-[420px]">
            <GoogleButton label="Sign in with Google" />
            <OrDivider />
          </div>

          <div className="max-w-[420px] space-y-3">
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
              placeholder="Password"
              autoComplete="current-password"
              className="w-full border border-rule bg-paper px-3 py-2.5 text-[14px] outline-none focus:border-seal"
            />
            <button
              onClick={onSubmit}
              disabled={busy}
              className="w-full bg-seal px-5 py-2.5 text-[14px] text-seal-contrast transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </div>
          {error ? <p className="mt-4 text-[14px] text-flag">{error}</p> : null}

          <p className="mt-8 text-[14px] text-ink-soft">
            New here?{" "}
            <Link to="/signup" className="text-seal underline underline-offset-2">
              Create a free account
            </Link>
            .
          </p>
        </PanelInner>
      </Panel>
    </main>
  );
}
