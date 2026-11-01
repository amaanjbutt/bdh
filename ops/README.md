# ops/

Legacy/alternative operations. **Cloudflare is the primary deployment**: the API and website
are Workers, D1 is the serving DB, R2 holds snapshots, and the heavy Python ingestion runs in
`.github/workflows/ingest.yml`. See [`../docs/cloudflare.md`](../docs/cloudflare.md).

The VPS/Caddy path below is kept for a persistent Postgres or browser-based ingestion.

| Path | What | Used by |
|---|---|---|
| `deploy/deploy_from_pc.sh` | Legacy VPS/relay deploy from the owner's PC: `vps`, `web`, `relay`, only after green CI | owner's PC (Git Bash) |
| `deploy/deploy.sh` | VPS deploy: fetch → snapshot → checkout → rebuild api/scheduler (detached) → health check → auto-rollback | `deploy_from_pc.sh` or by hand |
| `deploy/authorized_keys.example` | Forced-command line for the VPS deploy key | one-time VPS setup |
| `caddy/Caddyfile.api` | TLS + reverse proxy for `api.bangladatahub.com` | `caddy` service in `docker-compose.server.yml` |
| `relay/` | `bangladata-relay` Cloudflare Worker — allowlisted, keyed fetches for publishers that drop datacenter IPs | `deploy_from_pc.sh relay` |
| `seo/gen_sitemap.sh` | Series + core sitemaps from the catalog (`SITEMAP_DB=prod`) → `frontend/public/` | after catalog changes |
| `seo/indexnow_submit.sh` | Submit every sitemap URL to IndexNow (Bing/Yandex/DDG) | after a deploy with new URLs |

Run the SEO scripts from the repo root. The heavy ingestion scheduler is now the GitHub
Actions `Ingest` workflow, not a VPS process.
