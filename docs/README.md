# Internal docs — index

Durable knowledge only. Live state comes from the system itself (`/v1/status`,
`ingestion_runs`), not from prose. Public, user-facing docs live in
`frontend/content/docs/` (published at bangladatahub.com/docs).

| Doc | Answers |
|---|---|
| [`../AGENTS.md`](../AGENTS.md) | Start here: repo map, where things run, commands, the non-negotiable rules |
| [`product.md`](./product.md) | What BanglaDataHub is, who it's for, coverage per module, plans and positioning |
| [`architecture.md`](./architecture.md) | Components, data model, request + ingestion flow, frontend rendering, delivery |
| [`ingestion.md`](./ingestion.md) | All seventeen jobs: source, schedule, tables; how a run works |
| [`operations.md`](./operations.md) | Local stack, deploy, configuration, backups, incidents, R2 |
| [`data-quality.md`](./data-quality.md) | Gates, source-specific checks, annotations, quarantine |
| [`rules.md`](./rules.md) | Every hard rule |
| [`decisions.md`](./decisions.md) | Owner decisions (dated) — don't reopen them |
| [`backlog.md`](./backlog.md) | Open work, prioritised |

Code-level guides: [`../backend/README.md`](../backend/README.md),
[`../backend/scripts/README.md`](../backend/scripts/README.md),
[`../frontend/README.md`](../frontend/README.md), [`../ops/README.md`](../ops/README.md).

**Keeping docs true:** when a change alters behaviour described here, update the doc in the
same PR. When you finish a piece of work, update `backlog.md` (remove what's done) and add
any new decision to `decisions.md`. Don't add session diaries — the git log is the history.
