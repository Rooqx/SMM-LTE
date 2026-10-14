# ADR 0013: Use renewable leases and fencing tokens for PostgreSQL jobs

Date: 2026-10-09

## Status

Accepted and implemented for M6.

## Context

`FOR UPDATE SKIP LOCKED` prevents two workers from claiming the same available
row at the same instant, but it does not make a long external model call safe.
A worker can pause, lose its lock by timeout, and later return after another
worker has reclaimed the job. Without an execution fence, that stale worker
could commit artifacts or phase changes after the replacement has already won.

The service also needs bounded worker concurrency, fair account scheduling,
dead-job visibility, and graceful shutdown without placing an external network
call inside a PostgreSQL transaction.

## Decision

Keep the PostgreSQL queue, but give every claim:

- a unique lease owner;
- a monotonically increasing `lease_token`;
- a bounded `lease_expires_at` time; and
- a durable correlation identifier and attempt event.

The worker renews a live lease while model, email, or export work is in flight.
Workflow execution copies the token to `workflow_runs.execution_fence`. Every
worker-owned write transaction locks and validates the current job and run
fence before writing. Recovery increments the token before making work
available again. Completion and failure also compare owner, token, status, and
expiry. A stale result is discarded and cannot write a step, artifact, context
proposal, post, approval state, or phase transition.

Provider calls remain outside database transactions. Delivery is at least once;
database completion is idempotent and fenced, but an uncertain external
provider acknowledgement can still produce a rare duplicate provider charge.

Workers bound total and model concurrency in-process. Queue admission is
serialized briefly with a transaction advisory lock and enforces global depth,
per-account active work, daily account token reservation, and—when model prices
are configured—an estimated daily spend ceiling. Claim ordering favors auth
email, then accounts with fewer running jobs, then older work.

## Consequences

- Horizontal workers can safely reclaim expired work without accepting late
  database results from the previous attempt.
- Lease renewal and recovery add writes to the high-churn queue table and must
  be monitored for contention and dead tuples.
- The model provider cannot be made exactly once; provider idempotency and
  reconciliation should be adopted when supported.
- A worker that cannot renew does not extend or complete its attempt.
- Pre-M6 workers must be drained before migration `010` is deployed. The new
  lease constraint deliberately prevents an old worker from claiming without a
  token and expiry. API replicas may overlap because the migration is additive
  and supplies insertion defaults.
- PostgreSQL remains the appropriate queue until measured contention, latency,
  or independent scaling requirements justify a separate broker.

## Rejected alternatives

- **Rely only on `locked_at`.** A timestamp does not prevent a late worker from
  committing after a reclaim.
- **Hold a database transaction during the provider call.** This consumes
  connections and locks for an unbounded external operation.
- **Assume exactly-once provider execution.** A network acknowledgement can be
  lost after the provider has accepted or completed work.
- **Add Redis or a managed broker immediately.** It adds an operational system
  without removing the need for database transition fencing.
