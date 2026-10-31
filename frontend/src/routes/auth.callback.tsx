import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

/**
 * Landing for the Google OAuth redirect. The backend bounces here with the
 * session token in the URL fragment (#session=…) — fragments never hit a server
 * or logs — which we store and then continue into the dashboard.
 */
export const Route = createFileRoute("/auth/callback")({
  component: AuthCallback,
});

const SESSION_KEY = "bangladatahub-session";

function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    const hash = typeof window !== "undefined" ? window.location.hash : "";
    const token = new URLSearchParams(hash.replace(/^#/, "")).get("session");
    if (token) {
      try {
        localStorage.setItem(SESSION_KEY, token);
      } catch {
        /* ignore */
      }
      // Clear the token from the URL, then enter the app.
      history.replaceState(null, "", "/auth/callback");
      navigate({ to: "/dashboard" });
    } else {
      navigate({ to: "/login", search: { error: "sign-in failed — please try again" } });
    }
  }, [navigate]);

  return (
    <main className="mx-auto max-w-[1160px] px-6 pt-32 pb-24 md:px-10">
      <p className="num text-[14px] text-ink-soft">Signing you in…</p>
    </main>
  );
}
