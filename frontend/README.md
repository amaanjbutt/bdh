# frontend/ — bangladatahub.com

The website, docs and self-serve dashboard. **TanStack Start (SSR, React 19) + Vite +
Tailwind v4 + shadcn + Recharts**, built for **Cloudflare Workers** (worker
`bangladatahub`). It calls the API Worker through a **service binding** (`env.API`); the
site's API key never reaches the browser.

Live: <https://bangladatahub.amaanjbutt.workers.dev>. The intended domain is
`bangladatahub.com` (zone not attached yet).

## Develop

Node 24 (CI uses 24; 20+ works).

```sh
npm ci
npm run dev            # http://localhost:8080 — fixtures unless BANGLADATA_API_BASE is set
# against the live API:
BANGLADATA_API_BASE=https://bangladatahub-api.amaanjbutt.workers.dev \
BANGLADATA_API_KEY=<key> npm run dev
npm run lint && npm run typecheck && npm run build
```

`npm run dev`/`build` first run `scripts/build-llms.mjs`, which fetches live counts from
`/v1/status` (falls back to the committed `src/lib/bangladata/live-counts.json` offline) and
regenerates the files listed below.

## Deploy

```sh
npm run build
cd .output/server
npx wrangler deploy \
  --var BANGLADATA_API_BASE:https://bangladatahub-api.amaanjbutt.workers.dev \
  --var BANGLADATA_PUBLIC_API_BASE:https://bangladatahub-api.amaanjbutt.workers.dev
```

The API key is a Worker secret, set once:

```sh
cd .output/server
npx wrangler secret put BANGLADATA_API_KEY
```

`frontend/wrangler.jsonc` pins the worker name (`bangladatahub`), the
`compatibility_date`, `nodejs_compat_populate_process_env`, and the `API` service binding.
Do not remove any of those: without the flag `process.env` is empty and the site silently
renders fixtures; without the binding, Worker-to-Worker fetches fail with Cloudflare 1042.

If Wrangler reports both a user config and a deploy config, remove the generated redirect
`frontend/.wrangler/deploy/config.json` and deploy from `.output/server` again.

To force-refresh cached pages bump `CACHE_BUST_VERSION` in `src/server.ts` — never for
`/series` or `/data`.

## Where things live

- **Routes** — `src/routes/*.tsx` (file-based; `routeTree.gen.ts` is generated).
  `__root.tsx` = shell + site-wide JSON-LD.
- **Data layer** — `src/lib/bangladata/`: `client.server.ts` (server-only; service binding,
  `BANGLADATA_API_BASE`/`BANGLADATA_API_KEY` for non-Worker runs, fixtures fallback),
  `api.functions.ts` (page loaders), `dashboard.functions.ts`/`auth.functions.ts` (user calls,
  proxied with the user's own key/session), `catalog.ts` (modules, `MODULE_TO_BACKEND`,
  explorers), `format.ts` (`fmtValue`, `unitLabel`), `districts.ts`, `cross-section.ts`,
  `search.ts`.
- **SEO / crawlers** — `seo.ts` (titles, descriptions, JSON-LD shared by React pages and
  crawler HTML), `bot-render.ts` (lightweight HTML for crawler UAs on a cache miss — add
  every new crawlable route), `src/server.ts` (edge cache rules, `CACHE_BUST_VERSION`, bot
  routing).
- **Counts** — never hand-typed: `counts.ts` (`SERIES_COUNT`, `fillCounts`) over
  `live-counts.json`; markdown uses `{{SERIES_COUNT}}`, `{{MODULE_COUNT:<module>}}`.
- **Content (markdown CMS)** — `content/docs/*.md` (frontmatter `title`, `description`,
  `section`, `order`; sections listed in both `scripts/build-llms.mjs` and
  `src/lib/bangladata/docs.ts`), `content/llms/` (llms.txt template + AGENTS.md for API
  users).
- **Generated, not committed** — `public/docs/`, `public/llms.txt`,
  `public/llms-full.txt`, `public/AGENTS.md`, `public/changelog.xml`,
  `public/sitemap-{docs,explorers,topics}.xml`. Committed fallbacks: `live-counts.json`,
  `public/sitemap-series.xml`, `public/sitemap-core.xml`. The series and core sitemaps come
  from `ops/seo/gen_sitemap.sh`.

## Gotchas

- `BANGLADATA_API_BASE` must include the scheme and host, with no trailing slash.
- Fixture mode is intentional: a build without the API still succeeds and renders the
  catalog seeds.
- The site is edge-cached; a data change appears after the cache TTL unless you bump
  `CACHE_BUST_VERSION`.
- Google sign-in is not ported to the Worker; the button was removed from signup/login.
  The FastAPI API still has `/auth/google/*` for the legacy/VPS path.
