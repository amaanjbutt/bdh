## What & why

## Checklist
- [ ] CI is green (backend tests, lint, typecheck, build, repo checks, secret scan)
- [ ] Docs updated where behaviour changed (`docs/`, `frontend/content/docs/` for public API/data docs)
- [ ] New/changed job: registry + schedule (or MONITORED_EXTERNAL / WORKSTATION) + workflow + test + `docs/ingestion.md`
- [ ] Prod data or schema change? Backup + DDL steps written below (CD does not migrate)
- [ ] `docs/backlog.md` updated (done items removed); new owner decisions in `docs/decisions.md`

## Prod steps after merge (if any)
