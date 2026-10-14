# M6 operational hardening audit

Audit date: 2026-10-09  
Scope: backend runtime, PostgreSQL queue/migration, server-only Astro boundary,
observability, recovery, export, CI, and non-Docker operations. Frontend UI and
browser end-to-end execution were explicitly excluded.

## Verdict

M6 is **internally implemented and verified**. Its source, migrations, tests,
builds, local load smoke, logical restore drill, ADR, and runbooks agree.
Production release remains `VERIFY`, not `DONE`, until staging/hosting owners
complete the external gates listed below. Local evidence must not be presented
as proof of production-scale capacity, managed PITR, or live alert delivery.

No Docker dependency, vector database, generic workflow engine, publishing
connector, team-management surface, or general-purpose ORM was introduced.

## Implemented controls

| Area | Evidence-backed behavior |
| --- | --- |
| Queue ownership | Unique renewable lease owner, monotonic fencing token, expiry, conditional renew/complete/fail, bounded expired-lease recovery, and attempt events |
| Stale-result safety | Every worker-owned workflow write locks and validates the current queue lease/run fence before changing steps, artifacts, context, approvals, or phase state |
| Backpressure/fairness | Global and per-account admission, conservative daily token/spend reservation, bounded HTTP/worker/model concurrency, per-account running limits, fair account ordering, and no in-memory work queue |
| Failure handling | Retryable/permanent provider classification, jittered bounded retries, dead state, content-free inspection, guarded operator retry, terminal email-payload disposal, and graceful worker drain |
| Correlation | Validated/generated request IDs flow through Astro, Fastify, run, job, step, structured logs, and OpenAI request headers |
| Observability | Authenticated content-free Prometheus metrics for HTTP, admission rejection reasons, queue depth/age/events, model calls/tokens/estimated cost/latency, phases, approvals, optional skills, and pool pressure |
| Readiness | Database connectivity, exact migration `010`, and complete active recipe/skill release are required before readiness succeeds |
| PostgreSQL | Explicit pool/query/statement/lock/idle-transaction/connect timeouts, claim/lease indexes, additive populated upgrade, cursor validation, and maximum page sizes |
| Obsidian | Optional one-way durable export jobs, deduplication, bounded file/byte counts, safe path segments, root containment, restrictive temporary files, and atomic replacement |
| Operations | Dead-job, incident, production-readiness, deployment/rollback, backup/restore, capacity, retention, alert, load, and soak procedures |
| Delivery controls | Frozen pnpm CI, Node major pin, dependency audit, source secret scan, release evaluations, typecheck, tests, and production builds |

## Strict audit findings closed

The final review found and corrected these issues before the milestone verdict:

1. A dead workflow job could have been requeued after its workspace became
   archived or otherwise non-ready. Operator retry now locks both records,
   requires the exact failed/ready state pair, and changes them atomically.
2. Workspace/context cursors validated shape but not timestamp, UUID, key
   grammar, or size before PostgreSQL casts. Invalid cursors now fail with the
   stable `400 invalid_cursor` contract.
3. A manually malformed legacy running queue row could fail migration `010`'s
   lease-state constraint. The upgrade now supplies safe legacy lock identity
   and time values so recovery can fence it.
4. Shutdown grace could be configured shorter than the maximum run duration.
   Configuration now rejects that unsafe combination.
5. Admission limits were observable only through aggregate HTTP statuses.
   Metrics now expose a closed set of queue-admission rejection reasons without
   tenant IDs, request bodies, prompts, or payloads.
6. The populated-upgrade fixture originally omitted a historical non-null
   `prompt_snapshot`; the fixture was corrected and the complete upgrade passed.
7. Concurrent first-time Obsidian export requests could both miss replay
   detection before the unique index selected a winner. Replay detection now
   runs behind the transaction-scoped admission lock and the test submits both
   requests concurrently.
8. Integration files shared one disposable database while the test runner could
   execute files in parallel, allowing retained fixtures to affect another
   suite nondeterministically. Files now run sequentially; intentional races
   remain explicit inside their owning tests.

## Verification evidence

| Check | Result | Scope and limits |
| --- | --- | --- |
| Backend typecheck/build | PASS | TypeScript no-emit check and production compilation/migration copy |
| Backend unit-only run | PASS | 12 files, 31 tests; 8 PostgreSQL files intentionally skipped without `TEST_DATABASE_URL` |
| Fresh PostgreSQL 16 regression | PASS | Final untouched database, migrations `001`–`010`, 20 files and 61 tests; all M1–M5 regressions and final M6 guards included |
| Focused M6 PostgreSQL run | PASS | 7 tests: fencing/correlation, admission, fairness/metrics, export dedupe, cursor rejection, archived retry denial, and populated `001`–`009` upgrade |
| Astro server boundary | PASS | 69 files, zero diagnostics; 9 files/26 tests pass and 1 database file/2 tests skip without a URL; production server build passes |
| Release evaluation | PASS | 5 files, 15 deterministic recipe/registry/action/compiler/memory tests |
| Skill audit | PASS WITH INFO | 44 skills and expected phase counts; known legacy Markdown/host-question references remain informational and are runtime-bridged |
| Secret scan | PASS | No known secret pattern in source-controlled project files |
| Dependency audit | PASS | Backend and client: no known vulnerabilities at the high-severity threshold |
| Logical restore drill | PASS | Disposable PostgreSQL custom-format dump restored through migration `010`; representative organization/workspace values matched |
| Authenticated HTTP smoke | PASS WITH EXPECTED REJECTION | 10 seconds, concurrency 20, 801 requests, 80.1 req/s, p50 178.39 ms, p95 488.68 ms, p99 1162.38 ms, 300 × `200`, 501 × deliberate rate-limit `429`, zero network errors and zero `5xx` |
| Browser E2E | NOT RUN | Explicitly deferred to `docs/testing.md` |

One non-authoritative rerun used the already exercised restore/load database and
correctly found two retained immutable releases where a historical test expects
one pristine release. The untouched final database removed that fixture
contamination and passed all 61 tests; no production code change was required.

## Security, scalability, and maintainability assessment

- SQL values remain parameterized and account/workspace ownership stays in
  repository queries. No raw model value becomes a SQL identifier, tool name,
  filesystem destination, or phase transition.
- Lease checks happen inside the same short transaction as each worker-owned
  mutation. Transactions never span provider or filesystem calls.
- Horizontal API/worker scale remains stateless; PostgreSQL is the only shared
  coordination point. Explicit process/pool/concurrency budgets prevent replica
  count from silently becoming an unlimited database or provider load.
- The PostgreSQL queue is still the simplest appropriate design. Redis or an
  external broker is a measurement-triggered future decision, not an M6 need.
- Metrics labels are bounded and contain no account, workspace, prompt, email,
  token, artifact body, or job payload. Logs redact security and content fields.
- The Obsidian vault remains an output view. PostgreSQL is authoritative and an
  export failure cannot roll back approved canonical state.
- The queue/operator/provider boundaries are separated into focused modules;
  comments explain concurrency and security invariants rather than narrating
  ordinary syntax.

## External production gates

These items cannot be truthfully completed by local source code alone:

- run multi-route load and multi-hour soak tests against sanitized,
  production-like volume; review pool waits, locks, dead tuples, autovacuum,
  query plans, index growth, queue fairness, and worker restarts;
- configure separate least-privilege PostgreSQL roles/secrets per deployed
  process and prove the total replica connection budget;
- enable managed encrypted backups and PITR, then meet the approved RTO/RPO in
  a timed hosting restore drill (the local logical restore is only a procedure
  check);
- connect metrics to the selected monitoring service, fire every documented
  alert, confirm ownership/routing, and retain evidence;
- approve SLO, RTO, RPO, retention, provider price inputs, token/spend ceilings,
  and capacity targets;
- rehearse the real staged rollout, pre-M6 worker drain, canary, forward-fix,
  and application rollback on the hosting platform; and
- complete the separately documented Google, email, proxy, security, and
  browser end-to-end acceptance.

Until those gates pass, M6 is `VERIFY` for production even though its internal
implementation is complete.
