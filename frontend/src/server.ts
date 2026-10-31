import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

// Public SEO pages are identical for every visitor (the session lives in
// localStorage and is applied client-side), so the rendered HTML is safe to cache
// at the Cloudflare edge. This turns repeat visits into ~50ms cache hits instead of
// a fresh SSR that fans out to the VPS API on every load. Everything user-specific
// or mutating is excluded.
const CACHE_DENY = /^\/(dashboard|login|signup|welcome|auth|_serverFn|api)(\/|$)/;
// Edge-cache strategy (the free-tier CPU fix). Crawlers hitting the ~2k-URL
// sitemap generate the bulk of traffic; every cache MISS is a full SSR render, and
// concurrent cold renders push some over the free tier's per-request CPU cap
// ("CPU limit exceeded"). Two levers keep that under control WITHOUT a paid plan:
//   1. Long freshness on slow-changing content (series/data/funds/... rarely move)
//      so each URL renders at most ~once/day instead of ~hourly — far fewer renders.
//   2. A long stale-while-revalidate so once a URL is cached it is served from cache
//      (and revalidated in the background) — it never 5xx's again even if a later
//      re-render is slow. Deploys reflect on these pages within a day (or purge to
//      force-refresh). Dynamic pages (home/status/coverage) stay short so live
//      figures don't go stale.
const LONG_CACHE = "public, s-maxage=86400, stale-while-revalidate=2592000";
const SHORT_CACHE = "public, s-maxage=3600, stale-while-revalidate=86400";
// Slow-changing, high-volume pages (the crawler bulk) get the long cache.
// Trade figures change once a year (a new fiscal year loaded).
const LONG_CACHE_PATHS = /^\/(series|data|docs|derived|districts|topics|market)(\/|$)/;

function cacheControlFor(url: URL): string {
  return LONG_CACHE_PATHS.test(url.pathname) ? LONG_CACHE : SHORT_CACHE;
}

// One-off edge-cache bust after a site-wide change: only the listed path prefixes
// get a new cache key (they re-render once, per-access, and re-cache); every other
// URL keeps its existing entry, so we never trigger a mass cold-render storm. The
// ~2k /series and /data landing pages are deliberately excluded (their nav being a
// day stale is invisible; they self-refresh). Bump the version to bust again.
//   v1 (2026-10-31): BanglaDataHub launch — Bangladesh Bank, BBS, NBR, EPB and DSE data,
//   Census 2022 district profiles, DSE market explorer and market/topic pages.
const CACHE_BUST_PATHS = /^\/(about|docs|pricing|privacy|dashboard|districts|topics|coverage|market)(\/|$)/;
const CACHE_BUST_VERSION = "1";

function cacheKeyFor(request: Request, url: URL): Request {
  if (!CACHE_BUST_PATHS.test(url.pathname)) return request;
  const keyUrl = new URL(url.href);
  keyUrl.searchParams.set("_cv", CACHE_BUST_VERSION);
  return new Request(keyUrl.toString(), request);
}

// Cheap pre-checks before loading the crawler renderer (exact UA list lives in
// bot-render.ts `BOT_UA`).
const BOT_PATHS = /^\/(?:(?:series|data|districts|topics)\/[^/]+|districts|topics|market)\/?$/;
const BOT_UA_HINT = /bot|crawl|spider|slurp|google|bing|yandex|baidu|gpt|claude|anthropic|perplexity|facebookexternalhit|whatsapp|applebot|cohere|diffbot/i;

function edgeCache(): Cache | undefined {
  const c = (globalThis as { caches?: { default?: Cache } }).caches;
  return c?.default;
}

function isCacheableRequest(request: Request, url: URL): boolean {
  return request.method === "GET" && !CACHE_DENY.test(url.pathname);
}

function hasWaitUntil(ctx: unknown): ctx is { waitUntil: (p: Promise<unknown>) => void } {
  return typeof ctx === "object" && ctx !== null && "waitUntil" in ctx;
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    const url = new URL(request.url);
    const cacheable = isCacheableRequest(request, url);
    const cache = edgeCache();

    const cacheKey = cacheKeyFor(request, url);

    if (cacheable && cache) {
      const hit = await cache.match(cacheKey);
      if (hit) {
        const r = new Response(hit.body, hit);
        r.headers.set("X-Edge-Cache", "HIT");
        return r;
      }
    }

    // Crawlers on a cache miss for /series/{id}, /data/{module}, /districts[/{slug}],
    // /topics[/{slug}] or /market get the lightweight, content-equivalent HTML (see
    // lib/bangladata/bot-render.ts) instead of a cold React SSR, which exceeds the
    // free tier's 10ms CPU cap and 5xx's.
    // It lives under its own cache key so people never receive the light page.
    if (cacheable && cache && BOT_PATHS.test(url.pathname) && BOT_UA_HINT.test(request.headers.get("user-agent") ?? "")) {
      const bot = await import("./lib/bangladata/bot-render");
      if (bot.isBot(request.headers.get("user-agent"))) {
        const botKeyUrl = new URL(cacheKey.url);
        botKeyUrl.searchParams.set("_bot", "1");
        const botKey = new Request(botKeyUrl.toString(), { method: "GET" });
        const botHit = await cache.match(botKey);
        if (botHit) {
          const r = new Response(botHit.body, botHit);
          r.headers.set("X-Edge-Cache", "BOT-HIT");
          return r;
        }
        try {
          const html = await bot.renderForBot(url);
          if (html && typeof html === "object") {
            return new Response(null, { status: 301, headers: { Location: html.redirect, "Cache-Control": "public, max-age=86400" } });
          }
          if (html) {
            const res = new Response(html, {
              status: 200,
              headers: {
                "content-type": "text/html; charset=utf-8",
                "Cache-Control": cacheControlFor(url),
                "X-Edge-Cache": "BOT-MISS",
              },
            });
            await cache.put(botKey, res.clone()).catch(() => {}); // awaited: waitUntil doesn't fire here
            return res;
          }
        } catch (error) {
          console.error(error); // fall through to full SSR
        }
      }
    }

    try {
      const handler = await getServerEntry();
      const response = await normalizeCatastrophicSsrResponse(
        await handler.fetch(request, env, ctx),
      );

      const isHtml200 =
        response.status === 200 &&
        !response.headers.has("set-cookie") &&
        (response.headers.get("content-type") ?? "").includes("text/html");
      if (cacheable && cache && isHtml200) {
        const cached = new Response(response.body, response);
        cached.headers.set("Cache-Control", cacheControlFor(url));
        cached.headers.set("X-Edge-Cache", "MISS");
        const put = cache.put(cacheKey, cached.clone()).catch(() => {});
        if (hasWaitUntil(ctx)) ctx.waitUntil(put);
        else await put;
        return cached;
      }
      return response;
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
