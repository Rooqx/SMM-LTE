# Production readiness and recovery runbook

This runbook defines the M6 operating baseline. Values are initial engineering
targets and require product/operations owner approval before launch.

## Service objectives

| Objective | Initial target | Measurement |
| --- | --- | --- |
| Monthly API availability | 99.9% excluding announced maintenance | Edge/API successful requests |
| Authenticated read p95 | 300 ms | API request histogram |
| Authenticated write p95 | 750 ms before queued external work | API request histogram |
| Admitted model-job start p95 | 60 seconds | Job creation-to-claim timestamps |
| Verification/reset email acceptance p95 | 2 minutes | Email job creation-to-completion |
| Recovery time objective (RTO) | 60 minutes | Timed isolated restore drill |
| Recovery point objective (RPO) | 5 minutes | Managed PostgreSQL PITR configuration |

The application must not claim these objectives until production-like load,
monitoring, backup, and restore evidence meets them.

## Capacity budget

Keep the sum of every process pool below the PostgreSQL connection limit with
at least 20% reserved for migrations, monitoring, and incident access:

```text
(Astro replicas × Astro pool max)
+ (API replicas × DATABASE_POOL_MAX)
+ (worker replicas × DATABASE_POOL_MAX)
+ migration/monitoring reserve
<= 80% of max_connections
```

Worker count does not override `WORKER_CONCURRENCY`,
`WORKER_MODEL_CONCURRENCY`, account concurrency, queue depth, daily token, or
estimated-spend limits. Increase a limit only after load evidence and provider,
database, and cost budgets are updated together.

## Backup and isolated restore drill

Use managed encrypted backups and PITR in production. For a portable logical
drill, define password-free `pg_service.conf` entries named `smm_source` and
`smm_restore`; never place credentials in shell history or command arguments.
The restore target must be isolated and disposable.

```bash
umask 077
pg_dump --dbname=service=smm_source --format=custom --file=/secure/path/smm.dump
pg_restore --dbname=service=smm_restore --clean --if-exists --no-owner /secure/path/smm.dump
psql service=smm_restore -c "SELECT version, checksum FROM schema_migrations ORDER BY version"
psql service=smm_restore -c "SELECT count(*) FROM organizations"
psql service=smm_restore -c "SELECT count(*) FROM workflow_runs"
```

Then start one API and one worker against the restore with external delivery
disabled, verify `/ready`, read representative workspaces/artifacts/posts, and
execute a mock-provider workflow. Record backup timestamp, recovery timestamp,
duration, latest restored transaction/time, row-count checks, operator, and any
errors. Delete the isolated target through the hosting control plane only after
evidence is retained. Test PITR separately through the managed provider.

## Deployment and rollback

1. Run frozen installs, skill audit, typecheck, unit/integration tests, release
   evaluations, builds, vulnerability audit, and secret scan.
2. Take and verify the release backup; rehearse migration on a restored copy.
3. Drain pre-M6 workers. Migration `010` intentionally prevents them from
   making unfenced claims.
4. Run exactly one `pnpm run migrate:prod` process.
5. Start M6 workers, confirm lease renewals/claims, then deploy API replicas.
6. Check `/ready` on each replica and authenticated `/metrics` through the
   private monitoring network.
7. Canary a small admitted workload; watch errors, queue age, provider latency,
   spend, database waits, and dead jobs before full traffic.

Migration `010` is additive. Old API replicas can overlap temporarily because
new columns have defaults. Old workers cannot safely roll back after `010`; keep
the M6 worker or deploy a reviewed forward fix. Never reverse data migrations
or drop columns during an incident. Roll back application traffic separately
and preserve the database for diagnosis.

## Alerts

Initial actionable thresholds:

- API `5xx` >2% for 5 minutes, or p95 above the target for 10 minutes;
- any sustained database-pool waiter, pool use >80%, lock timeout spike, or
  database connection failure;
- oldest admitted model job >120 seconds warning or >300 seconds critical;
- active queue depth >70% warning or >90% critical;
- any newly dead job, repeated lease recovery, or lease-lost spike;
- provider retry/error rate >10% for 5 minutes;
- daily token or estimated spend >80% warning and 100% admission stop;
- verification/reset email age >2 minutes;
- authentication failure rate above the reviewed baseline; and
- `/ready` failure or active recipe/bundle mismatch on any serving replica.

Alerts must link to the relevant incident or job runbook and identify an owner.

## Retention baseline

No destructive retention automation is enabled by M6. Before launch, the data
owner must approve jurisdiction-appropriate periods. Initial planning values
are: job attempt events and process metrics 30 days, completed queue payloads 30
days (auth bodies are already disposed immediately), conversation/model usage 1
year, and audit events/artifact/context revision history at least 1 year.
Backups follow the approved RPO/PITR window and deletion policy. Account export
and deletion require separate bounded, reviewed workflows; never expose a
browser-triggered unbounded cascade.

## Load, soak, and query-plan evidence

Use a staging database restored from sanitized production-like volume. The
included runner sends only bounded HTTP requests:

```bash
cd backend
LOAD_BASE_URL=https://staging.example.com \
LOAD_API_KEY=... \
LOAD_ROUTE='/v1/workspaces?limit=30' \
LOAD_CONCURRENCY=20 \
LOAD_DURATION_SECONDS=60 \
pnpm run load:smoke
```

For soak, use `pnpm run load:soak` with an approved multi-hour duration and
exercise reads, cursor traversal, run admission, retries, worker restarts, and
provider throttling. Record p50/p95/p99, throughput, errors, pool waiters, queue
age, dead tuples, autovacuum runs, index growth, locks, token/spend usage, and
worker recovery. Capture `EXPLAIN (ANALYZE, BUFFERS)` for queue claim,
conversation memory, final-post filters, and workspace pagination on the
sanitized staging copy. Never run `ANALYZE` load probes against production
without operator approval.
