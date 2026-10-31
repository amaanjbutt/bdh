# ops/

| Path | What | Used by |
|---|---|---|
| `deploy/deploy_from_pc.sh` | Deploy `main` from the owner's PC: `vps`, `web`, `relay`, each only if changed, only after green CI | the owner's PC (Git Bash) |
| `deploy/deploy.sh` | VPS deploy: fetch → snapshot → checkout → rebuild api/scheduler (detached) → health check → auto-rollback | `deploy_from_pc.sh` (forced-command SSH key) or by hand on the VPS |
| `deploy/authorized_keys.example` | The forced-command line for the deploy key on the VPS | one-time VPS setup |
| `caddy/Caddyfile.api` | TLS + reverse proxy for `api.bangladatahub.com` | `caddy` service in `docker-compose.server.yml` |
| `relay/` | `bangladata-relay` Cloudflare Worker — allowlisted, keyed fetches for publishers that drop datacenter IPs | `deploy_from_pc.sh relay` |
| `seo/gen_sitemap.sh` | Series + core sitemaps from the catalog (`SITEMAP_DB=prod`) → `frontend/public/` | by hand after catalog changes |
| `seo/indexnow_submit.sh` | Submit every sitemap URL to IndexNow (Bing/Yandex/DDG) | by hand after a deploy with new URLs |

Run the SEO scripts from the repo root. The ingestion scheduler runs on the VPS; there is no
separate ingestion mirror.
