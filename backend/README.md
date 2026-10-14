# SMM Orchestrator Backend

The backend turns the repository's Markdown skills into a tenant-isolated, durable workflow service. PostgreSQL owns workflow state and the queue; the LLM can only propose artifacts and context changes. An authenticated approval accepts those proposals.

Every new workspace atomically initializes a durable phase-1 workflow and active conversation. PostgreSQL also retains ordered messages, exact pending questions and answers, bounded summary ranges, immutable canonical-context revisions, exact review threads, artifact lineage, and structured final posts. Typed recipes select the next mandatory step for human `continue` requests, while queued and revised runs pin the exact recipe, skill bundle, root instructions, and context revisions they must execute.

## Local setup (no Docker)

Requirements: Node.js 22 (the supported major pinned in `.node-version`), pnpm 11.15.1, and PostgreSQL 16+.

```bash
cp backend/.env.example backend/.env
cd backend
pnpm install --frozen-lockfile
pnpm run migrate
pnpm run bootstrap -- \
  --organization-name "My Studio" \
  --organization-slug my-studio \
  --key-name local-development
pnpm run dev
```

Save the bootstrap token immediately; only its SHA-256 hash is stored. Run the worker in a second terminal:

```bash
cd backend
pnpm run dev:worker
```

Create a workspace with the token:

```bash
curl -X POST http://localhost:3001/v1/workspaces \
  -H "Authorization: Bearer $SMM_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"name":"My Brand","slug":"my-brand","timezone":"Africa/Lagos"}'
```

Use `LLM_PROVIDER=mock` for deterministic local verification. Set `LLM_PROVIDER=openai`, `OPENAI_API_KEY`, and `OPENAI_MODEL` only when real model execution is wanted.

The Astro BFF and Fastify must use the same assertion issuer and audience. In production, configure HTTPS values for `BETTER_AUTH_URL`, `AUTH_JWKS_URL`, and `AUTH_TOKEN_ISSUER`. Transactional verification/reset emails remain durable in PostgreSQL until a worker with `AUTH_EMAIL_WEBHOOK_URL`, `AUTH_EMAIL_WEBHOOK_TOKEN`, and `AUTH_EMAIL_FROM` can deliver them.

M6 workers use renewable fenced leases. Configure worker/HTTP/database concurrency, queue/account admission, daily token/spend ceilings, and workload-specific timeouts from `.env.example`; do not increase one resource limit without recalculating the full database/provider budget. Production requires a separate `METRICS_BEARER_TOKEN`. Migration `010` must be applied after draining pre-M6 workers, and migrations through `016` must precede an M9 API/worker release. M9 content-free stage telemetry uses `PERFORMANCE_TRACE_SAMPLE_RATE`; capture query plans with `pnpm run baseline:plans` and run the billable direct-provider benchmark only intentionally with `pnpm run baseline:provider`.

## Review documentation

Start at [`../docs/README.md`](../docs/README.md). It covers the features, API, security model, database, operations, tests, and architectural decisions.

## Quality checks

```bash
pnpm run skills:audit
pnpm run typecheck
pnpm test
pnpm run build
pnpm audit
pnpm run security:scan
pnpm run eval:release
```

Operational procedures live in [`../docs/runbooks/`](../docs/runbooks/). Dead jobs are inspected with `pnpm run jobs -- list-dead` and retried only after correction with `pnpm run jobs -- retry-dead JOB_UUID`.

For the combined API and worker deployment on Render Free, see
[`../docs/cloudflare-render-deploy.md`](../docs/cloudflare-render-deploy.md).
