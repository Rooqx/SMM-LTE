# Operations without Docker

## Runtime topology

Run four managed components:

1. PostgreSQL 16+.
2. The Astro server/backend-for-frontend from `client/`.
3. One or more Fastify API processes from `backend/`.
4. One or more worker processes from `backend/`.

Run `pnpm run migrate:prod` as a release/pre-deploy command before new application instances. The migration advisory lock is a safety net, not a reason to let every replica migrate concurrently.

Migration `010` additively backfills correlation IDs and active-job fences, adds renewable lease/attempt-event columns and indexes, and records model latency/cost estimates. Rehearse the full `001`–`010` chain and populated `001`–`009` upgrade on a restored production-like copy. Drain pre-M6 workers before applying it: the lease-state constraint deliberately prevents their unfenced claims. Record duration/locks and take a verified encrypted backup. Do not edit an applied migration; use a new numbered migration for follow-up.

Migrate before starting API or workers. Startup registers and verifies the source-controlled recipe/skill release; `/ready` stays unhealthy if the database lacks the current expected migration `017` or the complete active release. Migrations `012`–`016` are additive M9 changes; `017` adds adaptive question selection mode. Apply them before the matching API/worker release. Keep at least one compatible worker version capable of executing every live pinned release during rolling deployments.

## Environment contract

Astro requires `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `SMM_API_BASE_URL`, and a matching `SMM_API_AUDIENCE`. Google is enabled only when both Google credentials exist. Use a distinct high-entropy auth secret per environment.

Fastify requires the same database plus `AUTH_JWKS_URL`, `AUTH_TOKEN_ISSUER`, and `AUTH_TOKEN_AUDIENCE`. The audience must equal Astro's value. Production also requires the complete email gateway group: URL, bearer token, and verified sender.

Model workers also use explicit safety/capacity limits: `MAX_CONTEXT_CHARS`, `MEMORY_CONTEXT_MAX_CHARS`, `MEMORY_CONVERSATION_MAX_CHARS`, `MEMORY_RECENT_MESSAGES`, `MAX_MODEL_ACTIONS_PER_RUN`, `MAX_MODEL_TOKENS_PER_RUN`, `MAX_RUN_DURATION_MS`, `MAX_OPTIONAL_SKILL_DEPTH`, and `MAX_TOOL_RESULT_BYTES`. HTTP, pool, queue, lease, worker/model concurrency, per-account job/token/spend, and separate primary/option-model price settings are explicit in `.env.example`. Option-assistant generation, cache-hit, fallback, token, and configured-cost counters are exported from authenticated metrics. Keep price values at zero until verified; zero means cost telemetry is unavailable, not that usage is free. Tune limits from measured prompts, verified pricing, provider quotas, and the total connection budget; do not remove limits to work around a failing recipe.

Use HTTPS for the public auth origin, JWKS URL, every extra trusted origin, and the email gateway. Keep database certificate verification enabled for managed PostgreSQL. Production requires a distinct `METRICS_BEARER_TOKEN`; restrict `/metrics` to the private monitoring path. Secrets belong in the host secret manager, never `.env` committed to source control or `PUBLIC_*` variables.

## Local startup

```bash
cd backend
pnpm install --frozen-lockfile
pnpm run migrate
pnpm run dev
```

In a second terminal:

```bash
cd backend
pnpm run dev:worker
```

In a third terminal:

```bash
cd client
pnpm install --frozen-lockfile
pnpm run dev
```

The existing frontend login controls are not part of M1 and still require a later UI migration. Backend auth can be verified through the Better Auth HTTP endpoints described in `testing.md`.

## Transactional email gateway

The recommended hosted provider is Resend. Verify a sending domain in Resend,
create a server-side sending key, and configure the backend worker:

```env
EMAIL_PROVIDER=resend
RESEND_API_KEY=re_replace_me
AUTH_EMAIL_FROM=noreply@example.com
AUTH_EMAIL_TIMEOUT_MS=10000
```

The key belongs only in the backend host's secret manager. The sender must be
an address on the verified domain. The existing PostgreSQL queue remains the
durability and retry authority; the worker calls Resend with the job's stable
idempotency key and maps the auth-email kind to a provider tag. A Resend `409`
is retryable because it can mean a concurrent or conflicting idempotent
request and does not by itself prove delivery.

The provider-neutral webhook remains available for self-hosted or future
providers. Set `EMAIL_PROVIDER=webhook`, then configure
`AUTH_EMAIL_WEBHOOK_URL`, `AUTH_EMAIL_WEBHOOK_TOKEN`, and `AUTH_EMAIL_FROM`.
The worker sends an HTTPS `POST` containing `from`, `to`, `subject`, `text`,
and `category`, with `Authorization: Bearer` and `Idempotency-Key` headers. The
gateway must:

- authenticate the worker and enforce TLS;
- treat the idempotency key as exactly-once acceptance for its retention window;
- return `2xx` for acceptance and may return `409` for an already accepted key;
- use `408`, `429`, or `5xx` for retryable failures;
- use other `4xx` codes for permanent payload/account failures;
- avoid logging message bodies and action URLs.

If the gateway is not configured in development, the worker does not claim auth-email jobs, preserving them for later delivery.

## Hosting and scaling checklist

- Terminate HTTPS at a trusted proxy. Keep `TRUST_PROXY_HOPS=0` unless a fixed topology is tested against spoofed forwarding headers.
- Configure exact Google callback URLs for each environment and request identity scopes only.
- Enforce distributed abuse limits at the edge; Better Auth database limits and Fastify's per-process limiter are defense in depth.
- Budget the sum of Astro, API, and worker pool maxima below PostgreSQL's connection limit.
- Run independent supervisors and health monitoring for Astro, API, workers, and the email gateway.
- Alert on auth error rate, verification-email delay, dead/retried jobs, PostgreSQL saturation, JWKS failures, API latency, and model spend.
- Track model action type, calls/tokens per run, policy rejections, tool-result truncation, and pending-question age without logging prompt or artifact bodies.
- Keep a seven-day JWKS overlap during automatic signing-key rotation. Verify old/new API replicas accept the overlap during rolling deploys.
- Define session, verification, rate-limit, job, workflow, artifact, and audit retention jobs before production.
- Do not delete recipe or bundle rows manually. Referenced versions are foreign-key protected; future release retirement also requires a documented retention window and a checked no-live-reference query.
- During rolling deploys, check `/ready` on every API/worker build and drain old workers only after no queued/retryable run needs their source-controlled recipe implementation.
- Back up PostgreSQL with encryption and test point-in-time restoration. Set approved SLO, RTO, and RPO values before launch.
- Review Better Auth and other security-critical release notes before dependency updates.

Use [`runbooks/production-readiness.md`](./runbooks/production-readiness.md) for capacity math, alert thresholds, load/soak evidence, backup/restore, migration rollout, and rollback. Use [`runbooks/jobs.md`](./runbooks/jobs.md) and [`runbooks/incidents.md`](./runbooks/incidents.md) for queue and incident response.

## Obsidian

Obsidian is a review and knowledge interface, not a concurrency database. Configure `OBSIDIAN_EXPORT_ROOT` only on a worker (or the compatibility API process) with a private mounted or synced filesystem. Hosted callers should enqueue `/exports/obsidian/jobs`; the worker retries filesystem failures under a fenced durable job. Exports validate the workspace/account, sanitize path segments, resolve parents inside the configured root, cap files/bytes, write restrictive temporary files, and atomically rename them. Keep synchronization one-way until a reviewed conflict policy exists.
