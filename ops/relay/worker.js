// bangladata-relay — fetches publisher pages for the ingestion jobs through Cloudflare's network.
//
// pta.gov.pk drops connections from every datacenter we have (the VPS, GitHub's runners) but answers
// Cloudflare's egress from any data centre (tested 2026-10-26 from Dhaka and Marseille), so the VPS
// job fetches PTA through this Worker: GET /?url=<encoded https URL> with header X-Relay-Key.
// Not an open proxy: the key (Worker secret RELAY_KEY) is required, https only, allowlisted hosts
// only, GET only, and nothing from the caller's request is forwarded upstream.
// Deployed by ops/deploy/deploy_from_pc.sh (part "relay"); the key lives in secrets.md and the VPS .env
// (FETCH_RELAY_URL, FETCH_RELAY_KEY).

const HOSTS = new Set(["www.pta.gov.pk", "pta.gov.pk"]);
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36";

function sameKey(given, expected) {
  const enc = new TextEncoder();
  const a = enc.encode(given);
  const b = enc.encode(expected);
  return a.byteLength === b.byteLength && crypto.subtle.timingSafeEqual(a, b);
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
    if (target.protocol !== "https:" || !HOSTS.has(target.hostname)) {
      return new Response("host not allowed", { status: 403 });
    }
    let upstream;
    try {
      upstream = await fetch(target.toString(), {
        headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml,*/*;q=0.8" },
        redirect: "follow",
        signal: AbortSignal.timeout(25000),
      });
    } catch (e) {
      return new Response(`upstream unreachable: ${e}`, { status: 504 });
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
