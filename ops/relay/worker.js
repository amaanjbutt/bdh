// bangladata-relay — fetches publisher pages for the ingestion jobs through Cloudflare's network.
//
// GitHub runners time out on several public Bangladesh government portals.
// Only the scheduled jobs with the relay key can request their release paths.

const RELEASE_PATHS = new Map([
  ["bbs.gov.bd", ["/pages/static-pages/", "/site/page/"]],
  ["epb.gov.bd", ["/pages/epb-export-datas/", "/views/epb-export-data"]],
  ["dam.gov.bd", ["/pages/static-pages/", "/pages/marketprice"]],
  ["btrc.gov.bd", ["/pages/static-pages/", "/site/page/"]],
  ["pta.gov.pk", ["/"]],
  ["www.pta.gov.pk", ["/"]],
]);
const FILE_HOST = "objectstorage.ap-dcc-gazipur-1.oraclecloud15.com";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36";

function sameKey(given, expected) {
  const enc = new TextEncoder();
  const a = enc.encode(given);
  const b = enc.encode(expected);
  return a.byteLength === b.byteLength && crypto.subtle.timingSafeEqual(a, b);
}

function allowed(url) {
  if (url.protocol !== "https:" || url.port || url.username || url.password) return false;
  if (url.hostname === FILE_HOST) {
    return /\/o\/office-(?:bbs|epb|dam|btrc)\/[^?#]+\.(?:pdf|xlsx)$/i.test(url.pathname);
  }
  return RELEASE_PATHS.get(url.hostname)?.some((prefix) => url.pathname.startsWith(prefix)) ?? false;
}

export default {
  async fetch(request, env) {
    if (request.method !== "GET") return new Response("method not allowed", { status: 405 });
    if (!env.RELAY_KEY || !sameKey(request.headers.get("x-relay-key") || "", env.RELAY_KEY)) {
      return new Response("forbidden", { status: 403 });
    }
    let target;
    try {
      target = new URL(new URL(request.url).searchParams.get("url") || "");
    } catch {
      return new Response("bad url", { status: 400 });
    }
    if (!allowed(target)) {
      return new Response("publisher URL not allowed", { status: 403 });
    }
    let upstream;
    try {
      const signal = AbortSignal.timeout(30000);
      for (let hop = 0; hop <= 3; hop++) {
        upstream = await fetch(target, {
          headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml,*/*;q=0.8" },
          redirect: "manual",
          signal,
        });
        if (![301, 302, 303, 307, 308].includes(upstream.status)) break;
        const location = upstream.headers.get("location");
        await upstream.body?.cancel();
        if (!location || hop === 3) return new Response("publisher redirect limit", { status: 502 });
        target = new URL(location, target);
        if (!allowed(target)) return new Response("publisher redirect not allowed", { status: 502 });
      }
    } catch {
      return new Response("publisher unreachable", { status: 504 });
    }
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "content-type": upstream.headers.get("content-type") || "application/octet-stream",
        "cache-control": "no-store",
        "x-relay-colo": (request.cf && request.cf.colo) || "",
      },
    });
  },
};
