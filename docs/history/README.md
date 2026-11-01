# History

One dated record per migration, incident or architecture change that is expensive to
rediscover. This is not a running diary; add a file only when the “why” and the failure modes
matter later.

| Date | Record | What |
|---|---|---|
| 2026-11-01 | [`2026-11-01-cloudflare-deployment.md`](./2026-11-01-cloudflare-deployment.md) | Moved serving to Cloudflare Workers + D1, ingestion to GitHub Actions + R2; the 1042/process.env/fixture, Postgres 18, D1 write-cap and PBKDF2 failures; current state and commits |
