import { createServerFn } from "@tanstack/react-start";

/**
 * Auth server functions. They proxy to the backend's /auth/* endpoints (public,
 * no key) so the browser never needs the API base. The returned session token is
 * stored client-side by the caller and passed back on dashboard calls.
 */

type AuthResult = {
  ok: boolean;
  status: number;
  session_token?: string;
  api_key?: string;
  error?: string;
};

export const signup = createServerFn({ method: "POST" })
  .validator((input: { email: string; password: string }) => input)
  .handler(async ({ data }): Promise<AuthResult> => {
    const { publicPost } = await import("./client.server");
    const res = await publicPost<{ session_token: string; api_key: string }>(
      "/auth/signup",
      { email: data.email, password: data.password },
    );
    return {
      ok: res.ok,
      status: res.status,
      session_token: res.data?.session_token,
      api_key: res.data?.api_key,
      error: res.error,
    };
  });

export const login = createServerFn({ method: "POST" })
  .validator((input: { email: string; password: string }) => input)
  .handler(async ({ data }): Promise<AuthResult> => {
    const { publicPost } = await import("./client.server");
    const res = await publicPost<{ session_token: string }>("/auth/login", {
      email: data.email,
      password: data.password,
    });
    return {
      ok: res.ok,
      status: res.status,
      session_token: res.data?.session_token,
      error: res.error,
    };
  });

// Set an initial password for a pay-first buyer, authorized by their one-time
// signup token from /welcome. Returns a session so they're logged straight in.
export const setPassword = createServerFn({ method: "POST" })
  .validator((input: { token: string; password: string }) => input)
  .handler(async ({ data }): Promise<AuthResult> => {
    const { publicPost } = await import("./client.server");
    const res = await publicPost<{ session_token: string }>("/auth/set-password", {
      token: data.token,
      password: data.password,
    });
    return {
      ok: res.ok,
      status: res.status,
      session_token: res.data?.session_token,
      error: res.error,
    };
  });

export const logout = createServerFn({ method: "POST" })
  .validator((input: { token: string }) => input)
  .handler(async ({ data }) => {
    const { publicPost } = await import("./client.server");
    await publicPost("/auth/logout", { session_token: data.token });
    return { ok: true };
  });

export const changePassword = createServerFn({ method: "POST" })
  .validator((input: { token: string; current_password: string; new_password: string }) => input)
  .handler(async ({ data }) => {
    const { sessionFetch } = await import("./client.server");
    const res = await sessionFetch<{ error?: { message?: string } }>(
      "/auth/change-password",
      data.token,
      { method: "POST", body: { current_password: data.current_password, new_password: data.new_password } },
    );
    return {
      ok: res.ok,
      status: res.status,
      error: res.data?.error?.message,
    };
  });
