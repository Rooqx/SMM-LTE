# Queue and dead-job runbook

## Inspect

Use authenticated metrics for depth, age, attempt outcomes, and pool pressure.
List dead jobs without exposing payload bodies:

```bash
cd backend
pnpm run jobs -- list-dead 50
```

Correlate `correlation_id`, job ID, run ID, and structured worker logs. Inspect
the referenced run and audit history with read-only SQL. Do not copy auth email
payloads, prompts, tokens, or user content into tickets or chat.

## Classify

- Permanent policy/schema/payload failures require a code, recipe, or data fix.
- Provider timeouts, `429`, and server errors are retryable within the bounded
  attempt limit and jittered backoff.
- A lease recovery means the prior worker stopped renewing; investigate worker,
  database, event-loop, and provider latency.
- A lease-lost event is expected when stale work returns after a reclaim; its
  database result must be absent.
- Terminal auth email bodies are disposed and cannot be manually retried. Issue
  a new verification/reset request instead.

## Retry

Only retry after the cause is corrected and the run/workspace is still safe:

```bash
cd backend
pnpm run jobs -- retry-dead JOB_UUID
```

The command locks the exact dead job, refuses disposed auth mail, fences the old
attempt, and requeues a failed workflow run. Never update queue status manually.
If the workspace is active, archived, superseded, or otherwise inconsistent,
stop and repair through a reviewed forward operation.

## Provider acknowledgement uncertainty

If a provider accepted a request but the worker lost the acknowledgement, first
use the provider response/idempotency lookup when available. Do not claim
exactly-once billing. Database artifacts and transitions remain fenced; a rare
duplicate external charge may require reconciliation.
