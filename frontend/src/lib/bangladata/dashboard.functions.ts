import { createServerFn } from "@tanstack/react-start";
import type { JsonValue } from "./types";

/**
 * Dashboard calls, authenticated by the user's **session token** (from login,
 * held client-side). The token transits our server function but is never
 * persisted; the backend accepts it via X-Session-Token.
 */

export type EndpointUsage = {
  route: string;
  requests: number;
  ok: number;
  client_errors: number;
  server_errors: number;
  avg_ms: number | null;
};

export const getDashboard = createServerFn({ method: "GET" })
  .validator((input: { token: string }) => input)
  .handler(async ({ data }) => {
    const { sessionFetch, apiConfigured } = await import("./client.server");
    if (!apiConfigured()) return { configured: false as const };

    const account = await sessionFetch<Record<string, JsonValue>>("/v1/account", data.token);
    if (account.status === 401) return { configured: true as const, authed: false as const };

    const [usage, history, endpoints, keys, webhooks] = await Promise.all([
      sessionFetch<Record<string, JsonValue>>("/v1/usage", data.token),
      sessionFetch<{ data: { day: string; requests: number }[] }>("/v1/usage/history", data.token),
      sessionFetch<{ data: EndpointUsage[] }>("/v1/usage/endpoints?days=30", data.token),
      sessionFetch<{ data: Record<string, JsonValue>[] }>("/v1/keys", data.token),
      sessionFetch<{ data: Record<string, JsonValue>[] }>("/v1/webhooks", data.token),
    ]);

    return {
      configured: true as const,
      authed: true as const,
      account: account.data,
      usage: usage.data,
      history: history.data?.data ?? [],
      endpoints: endpoints.data?.data ?? [],
      keys: keys.data?.data ?? [],
      webhooks: webhooks.data?.data ?? [],
    };
  });

// Admin panel data (session-gated + admin-email gated server-side). Returns
// discriminated states so the page can show sign-in / not-authorized / data.
export const getAdmin = createServerFn({ method: "GET" })
  .validator((input: { token: string }) => input)
  .handler(async ({ data }) => {
    const { sessionFetch, apiConfigured } = await import("./client.server");
    if (!apiConfigured()) return { configured: false as const };
    const overview = await sessionFetch<Record<string, JsonValue>>("/v1/admin/overview", data.token);
    if (overview.status === 401) return { configured: true as const, authed: false as const };
    if (overview.status === 403) {
      return { configured: true as const, authed: true as const, admin: false as const };
    }
    const users = await sessionFetch<{ data: Record<string, JsonValue>[] }>(
      "/v1/admin/users?limit=100", data.token,
    );
    return {
      configured: true as const,
      authed: true as const,
      admin: true as const,
      overview: overview.data,
      users: users.data?.data ?? [],
    };
  });

const ADMIN_TABS = ["ingestion", "dq", "traffic", "catalog", "system"] as const;
export type AdminTab = (typeof ADMIN_TABS)[number];

// One admin tab's data (/v1/admin/{tab}); the tab name is whitelisted.
export const getAdminTab = createServerFn({ method: "GET" })
  .validator((input: { token: string; tab: AdminTab; days?: number }) => input)
  .handler(async ({ data }) => {
    if (!ADMIN_TABS.includes(data.tab)) return { ok: false, status: 400, data: null };
    const { sessionFetch } = await import("./client.server");
    const q = data.tab === "traffic" ? `?days=${Math.max(1, Math.min(90, data.days ?? 7))}` : "";
    return sessionFetch<Record<string, JsonValue>>(`/v1/admin/${data.tab}${q}`, data.token);
  });

export const createKey = createServerFn({ method: "POST" })
  .validator((input: { token: string; label?: string }) => input)
  .handler(async ({ data }) => {
    const { sessionFetch } = await import("./client.server");
    const res = await sessionFetch<Record<string, JsonValue>>("/v1/keys", data.token, {
      method: "POST",
      body: { label: data.label || null },
    });
    return { ok: res.ok, status: res.status, data: res.data };
  });

export const revokeKey = createServerFn({ method: "POST" })
  .validator((input: { token: string; id: string }) => input)
  .handler(async ({ data }) => {
    const { sessionFetch } = await import("./client.server");
    const res = await sessionFetch(`/v1/keys/${data.id}`, data.token, { method: "DELETE" });
    return { ok: res.ok, status: res.status };
  });

// Update the display name / company shown in the dashboard (partial PATCH).
export const updateProfile = createServerFn({ method: "POST" })
  .validator((input: { token: string; name?: string; company?: string }) => input)
  .handler(async ({ data }) => {
    const { sessionFetch } = await import("./client.server");
    const body: Record<string, string> = {};
    if (data.name !== undefined) body.name = data.name;
    if (data.company !== undefined) body.company = data.company;
    const res = await sessionFetch<Record<string, JsonValue>>("/v1/account", data.token, {
      method: "PATCH",
      body,
    });
    return { ok: res.ok, status: res.status, data: res.data };
  });

export const createCheckout = createServerFn({ method: "POST" })
  .validator((input: { plan: string; email?: string }) => input)
  .handler(async ({ data }) => {
    const { publicPost } = await import("./client.server");
    const res = await publicPost<{ checkout_url?: string }>("/v1/checkout", {
      plan: data.plan,
      email: data.email || null,
    });
    return {
      ok: res.ok,
      url: res.data?.checkout_url ?? null,
      error: res.error ?? null,
    };
  });

// Redeem the one-time signup token from the checkout success redirect
// (/welcome?token=...) for the buyer's API key. Public; the token itself is the
// credential and the backend invalidates it after a single successful claim.
export const claimKey = createServerFn({ method: "POST" })
  .validator((input: { token: string }) => input)
  .handler(async ({ data }) => {
    const { publicGet } = await import("./client.server");
    const res = await publicGet<{ api_key?: string }>(
      `/v1/account/key/${encodeURIComponent(data.token)}`,
    );
    return { ok: res.ok, status: res.status, api_key: res.data?.api_key ?? null };
  });

// The LemonSqueezy customer-portal URL for the caller's subscription (update
// card, invoices, cancel). 404s if they have no subscription.
export const billingPortal = createServerFn({ method: "POST" })
  .validator((input: { token: string }) => input)
  .handler(async ({ data }) => {
    const { sessionFetch } = await import("./client.server");
    const res = await sessionFetch<{ url?: string }>("/v1/billing/portal", data.token);
    return { ok: res.ok, status: res.status, url: res.data?.url ?? null };
  });

// The logged-in user's email — used to pre-bind a pricing-page checkout to their
// existing account (so upgrading never creates a mismatched account).
export const accountEmail = createServerFn({ method: "POST" })
  .validator((input: { token: string }) => input)
  .handler(async ({ data }) => {
    const { sessionFetch } = await import("./client.server");
    const res = await sessionFetch<{ email?: string }>("/v1/account", data.token);
    return { ok: res.ok, email: res.data?.email ?? null };
  });

// API playground: run a GET against any /v1/ endpoint with the user's own key,
// server-side (the key transits our function, never persisted). Path is clamped
// to /v1/ to prevent it being pointed anywhere else.
export const runRequest = createServerFn({ method: "POST" })
  .validator((input: { key: string; path: string }) => input)
  .handler(async ({ data }) => {
    const { keyedFetch } = await import("./client.server");
    let path = (data.path || "").trim();
    if (!path.startsWith("/v1/")) path = "/v1/" + path.replace(/^\/+/, "");
    const res = await keyedFetch<unknown>(path, data.key);
    return {
      ok: res.ok,
      status: res.status,
      body: res.data != null ? JSON.stringify(res.data, null, 2) : "",
      path,
    };
  });

export const createWebhook = createServerFn({ method: "POST" })
  .validator((input: { token: string; url: string; series_id?: string; module?: string }) => input)
  .handler(async ({ data }) => {
    const { sessionFetch } = await import("./client.server");
    const res = await sessionFetch<Record<string, JsonValue>>("/v1/webhooks", data.token, {
      method: "POST",
      body: { url: data.url, series_id: data.series_id || null, module: data.module || null },
    });
    return { ok: res.ok, status: res.status, data: res.data };
  });

export const deleteWebhook = createServerFn({ method: "POST" })
  .validator((input: { token: string; id: string }) => input)
  .handler(async ({ data }) => {
    const { sessionFetch } = await import("./client.server");
    const res = await sessionFetch(`/v1/webhooks/${data.id}`, data.token, { method: "DELETE" });
    return { ok: res.ok, status: res.status };
  });
