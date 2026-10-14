# Senior Engineering Audit: Milestones M9.4 and M9.5

Last updated: 2026-10-12.
Status: VERIFY (Pending live PostgreSQL p95 and external LLM telemetry).

> Superseded where necessary by [`m9-final-audit.md`](./m9-final-audit.md).
> The final pass prevents pre-commit in-memory delivery, bounds replay, preserves
> bigint IDs as strings, and records that SSE quotas are per process unless the
> deployment edge imposes a cross-replica limit.

---

## 1. Executive Summary & Architectural Invariants

This audit document details the implementation, rigorous multi-pass senior engineering review, and verification evidence for milestones **M9.4 (Phase 1 Recipe Integration)** and **M9.5 (Run Progress and Operations)** in accordance with [ADR 0014](../decisions/0014-deterministic-guided-intake.md), [backend-speed-reliability-implementation-context.md](./backend-speed-reliability-implementation-context.md), and [backend-speed-reliability-map.md](./backend-speed-reliability-map.md).

### Non-Negotiable Invariants Upheld
1. **Zero Content Leakage (ADR 0014)**:
   - All progress events streamed over Server-Sent Events (SSE) or returned via bounded polling fallback (`GET /v1/runs/:runId`) are strictly coarse and content-free:
     $$\text{Payload} \in \{\text{id}, \text{runId}, \text{workspaceId}, \text{phase}, \text{skillName}, \text{stage}, \text{occurredAt}\}$$
   - Zero raw user inputs, zero model prompts, zero token counts, and zero output artifacts are ever exposed across the SSE stream or unauthenticated channels.
2. **PostgreSQL as Authoritative Source of Truth**:
   - No vector database, Redis, or client-owned workflow state.
   - `workflow_runs.progress_stage` and table `workflow_run_progress_events` are maintained authoritatively in PostgreSQL.
   - In-memory dispatch occurs only for service-owned transactions after commit;
     caller-owned transactions become visible through durable polling after commit.
3. **Mandatory Phase 1 Recipe Preservation**:
   - Preserves all 6 mandatory Phase 1 recipe steps:
     1. `capture-social-context` (`social-media-context-sms`)
     2. `research-niche` (`niche-research`)
     3. `research-customers` (`customer-research`)
     4. `profile-competitors` (`competitor-profiling`)
     5. `build-voice` (`voice-builder`)
     6. `optimize-profile` (`profile-optimizer`)
   - Strict runtime permissions (`context_updates`, `artifact_kinds`, `approvalGate: "brand_onboarding"`) remain fully intact.
4. **Tenant Isolation & Saturation Protection**:
   - Every database query for state, historical events, or runs filters by both `workspace_id` and `workspaces.organization_id`.
   - Max 20 concurrent SSE streams per organization per API process; acquiring a
     21st local stream throws `429`. A deployment-wide edge limit is still required.
   - Bounded polling fallback (`GET /v1/runs/:runId`) provides continuous progress visibility if SSE is blocked by client proxies.

---

## 2. Implemented Components

### 2.1 Database Schema & Migration (`014_run_progress_and_operations.sql`)
- Added column `progress_stage` to `workflow_runs` with check constraint:
  `CHECK (progress_stage IN ('queued', 'loading_context', 'generating', 'validating', 'ready', 'waiting_approval', 'waiting_input', 'failed', 'cancelled'))`.
- Created table `workflow_run_progress_events` with monotonic `bigint GENERATED ALWAYS AS IDENTITY` primary key.
- Created compound indexes:
  - `workflow_run_progress_events_run_id_idx ON (run_id, id ASC)` for reconnect replay queries.
  - `workflow_run_progress_events_workspace_id_idx ON (workspace_id, occurred_at DESC)` for workspace activity audits.

### 2.2 Run Progress Service (`backend/src/orchestration/progress.ts`)
- Manages coarse stage progression and zero-latency local dispatch via `EventEmitter`.
- Enforces organization-scoped saturation limits (`acquireConnection`, `releaseConnection`, `getActiveConnections`).
- Provides `recordStage` for atomic insertion into `workflow_run_progress_events` and update of `workflow_runs.progress_stage`.
- Provides `listEventsForRun` supporting `afterEventId` replay filters for reconnecting clients.
- Provides `getCurrentRunState` with authoritative stage projection and terminal status.

### 2.3 Phase 1 Recipe Intake Consumption (`backend/src/orchestration/service.ts`)
- `OrchestrationService.enqueueNext`:
  - When queuing Phase 1 step 1 (`social-media-context-sms`), queries `interviewStore`.
  - If interview is `in_progress`, blocks continuation with `conflict("interview_in_progress", ...)`.
  - If interview is `completed`, retrieves `compiled_intake` and passes it in `payload: { compiled_intake }`.
- `OrchestrationService.execute`:
  - Records stage `generating` before prompt compilation and LLM call.
  - Records stage `validating` after model returns prior to structured action validation.

### 2.4 Prompt Compiler Optimization (`backend/src/skills/prompt-compiler.ts`)
- Injects `# Guided brand intake synthesis directives` directing the model to directly synthesize `social-context` and update `social.context` without asking redundant interview questions.
- Prunes redundant empty conversation history when `compiled_intake` is present, reducing prompt character count while maintaining deterministic hash snapshots.
- Sets `snapshot.messageOrdinals: []` when conversation is pruned to maintain strict audit integrity.

### 2.5 State Synchrony & Operations (`backend/src/db/store.ts` & `backend/src/db/jobs.ts`)
- `Store`: Synchronizes `progress_stage` in `enqueueRun` (`queued`), `beginRun` (`loading_context`), `finishRunAwaitingInput` (`waiting_input`), `finishRunBlocked` (`failed`), `finishRun` (`ready` or `waiting_approval`), and `decideRunOutput` (`ready` on approval, `failed` on rejection).
- `JobQueue`: Synchronizes `progress_stage` and records progress events in `fail` (`failed` on dead, `queued` on retry), `recoverExpiredJobs` (`failed` on exhausted, `queued` on recovery), and `retryDeadJob` (`queued`).

### 2.6 Server-Sent Events HTTP Endpoint (`backend/src/http/routes.ts`)
- Implemented `GET /v1/workspaces/:workspaceId/runs/:runId/events` and alias `GET /v1/runs/:runId/events`.
- Stream takeover via `reply.hijack()` with standard SSE headers (`text/event-stream`, `no-cache`, `no-transform`, `keep-alive`, `X-Accel-Buffering: no`).
- Reconnection support via `Last-Event-ID` header and `?lastEventId=` query parameter.
- 15-second keepalive ping comments (`: keepalive\n\n`).
- 1.5-second background database polling fallback for cross-process event synchronization.
- Automatic clean stream termination when a terminal stage (`ready`, `waiting_approval`, `waiting_input`, `failed`, `cancelled`) is reached.

### 2.7 Observability & Metrics (`backend/src/observability/metrics.ts`)
- Added tracking and Prometheus rendering with `# HELP` and `# TYPE` for:
  - `smm_sse_connections_opened_total` (counter)
  - `smm_sse_connections_closed_total` (counter)
  - `smm_sse_events_emitted_total` (counter)
  - `smm_run_progress_events_24h_total{stage="..."}` (counter)

---

## 3. Iterative Senior Engineering Audit Loop Findings & Fixes

During rigorous code review from a 20-year software engineering perspective, the following issues were identified and systematically resolved:

### Loop 1: Domain & Schema Contract Alignment in Tests
- **Finding**: Initial test assertions in `tests/phase1-intake-integration.test.ts` assumed `approvalGate: "brand-foundation"` and guessed questionnaire IDs (`business_category`, `primary_platforms`) instead of the canonical domain values in `workflow.ts` (`approvalGate: "brand_onboarding"`) and `definitions.ts` (`business_description`, `platform_priorities`).
- **Fix**: Aligned all test mock fixtures and assertions with canonical questionnaire definitions and workflow phase definitions. Verified test suite execution: 4/4 passing.

### Loop 2: SSE Setup Connection Quota Leak Prevention
- **Finding**: In `handleRunEventsStream`, `acquireConnection(organizationId)` was called before fetching historical events. If `listEventsForRun` threw an unhandled database exception (e.g., query timeout or disconnect), the connection count for that organization would remain incremented until socket close.
- **Fix**: Wrapped the historical event replay and stream initialization in a `try ... catch (error) { cleanup(); throw error; }` block. Guarantees that `releaseConnection` and metric decrement are invoked even if setup throws.

### Loop 3: Fastify Raw Response Hijacking
- **Finding**: `handleRunEventsStream` called `reply.raw.setHeader` and `reply.raw.flushHeaders` without invoking `reply.hijack()`. In Fastify, bypassing `reply.hijack()` on raw streaming responses can lead to conflicting lifecycle hooks or premature response closure.
- **Fix**: Added `reply.hijack()` immediately after `reply.raw.flushHeaders()`, cleanly transferring socket ownership to the SSE handler.

### Loop 4: Socket Write Exception Safety on Abrupt Disconnect
- **Finding**: If a client abruptly closed the TCP connection (sending RST), subsequent calls to `reply.raw.write()` inside `sendEvent` or `keepaliveTimer` could trigger uncaught `ERR_STREAM_DESTROYED` or `EPIPE` exceptions.
- **Fix**: Added guards `if (closed || reply.raw.writableEnded || reply.raw.destroyed) return;` and wrapped `reply.raw.write()` in `try ... catch` blocks that safely trigger `cleanup()`.

### Loop 5: Overlapping Async Polling in Background Timer
- **Finding**: In `handleRunEventsStream`, `pollTimer` used `setInterval(async () => ...)` with a 1500ms delay. If a database query took longer than 1500ms under heavy load, multiple concurrent queries would pile up on the PostgreSQL pool for the same client.
- **Fix**: Introduced `isPolling` boolean guard to ensure no background poll can start while a previous query is in-flight:
  ```ts
  if (closed || isPolling) return;
  isPolling = true;
  try { ... } finally { isPolling = false; }
  ```

### Loop 6: Asynchronous Job Failure Progress Event Disconnect
- **Finding**: When a background job failed, died, or expired in `JobQueue`, `workflow_runs.progress_stage` was updated, but no event was inserted into `workflow_run_progress_events` and no in-memory event was emitted. An active SSE listener would miss the failure transition until manual polling.
- **Fix**: Injected `RunProgressService` into `JobQueue`. Updated `fail`, `recoverExpiredJobs`, and `retryDeadJob` to record stages and broadcast events to all active listeners.

### Loop 7: Operator Approval / Rejection Progress Synchrony
- **Finding**: In `Store.decideRunOutput`, when an operator accepted or rejected a run output, `workflow_runs.status` was updated to `completed` or `rejected`, but `progress_stage` was not updated and no progress event was emitted.
- **Fix**: Updated `workflow_runs.progress_stage` to `'ready'` (on approval) or `'failed'` (on rejection) and recorded the stage via `this.runProgress.recordStage(client, ...)` within the decision transaction.

### Loop 8: Prometheus Metric Standard Compliance
- **Finding**: The newly introduced metrics (`smm_sse_connections_*`, `smm_run_progress_events_24h_total`) lacked standard Prometheus `# HELP` and `# TYPE` annotations in `MetricsService.render()`.
- **Fix**: Added standard `# HELP` and `# TYPE` declarations for each SSE and run progress metric family.

### Loop 9: Prompt Provenance Snapshot Integrity
- **Finding**: When `compiled_intake` was present and conversation messages were pruned from the prompt, `snapshot.messageOrdinals` still contained the ordinals from `memory.recentMessages`, creating a mismatch between the prompt hash and recorded audit metadata.
- **Fix**: Updated `snapshot.messageOrdinals` to evaluate `args.input.compiled_intake ? [] : args.memory.recentMessages.map((m) => m.ordinal)`.

---

## 4. Verification Evidence

### 4.1 TypeScript Static Analysis
- Command: `pnpm --dir backend typecheck` (`tsc -p tsconfig.json --noEmit`)
- Result: **0 errors** (Exit code 0).

### 4.2 Production Build
- Command: `pnpm --dir backend build` (`tsc -p tsconfig.json && node scripts/copy-migrations.mjs`)
- Result: **0 errors** (Exit code 0).

### 4.3 Test Suite Execution
- Command: `pnpm --dir backend test`
- Results:
  - **Test Files**: 21 passed, 10 skipped (for live PG integration tests), 31 total.
  - **Tests**: 82 passed, 39 skipped, 121 total.
  - **Failed**: **0 failed**.
- Dedicated milestone suites:
  - `backend/tests/phase1-intake-integration.test.ts`: **4/4 passed**.
  - `backend/tests/progress-events.test.ts`: **10/10 passed**.

---

## 5. Open External Gates

In accordance with the project's strict status-honesty rule:
- Milestones **M9.4** and **M9.5** remain marked **`VERIFY`** (never `DONE`) until:
  1. Live PostgreSQL p95 query latency benchmarks are gathered under concurrent load with actual PostgreSQL execution plans (`EXPLAIN (ANALYZE, BUFFERS)`).
  2. Live OpenAI provider execution telemetry is recorded verifying prompt token savings in real network conditions.
  3. Client SSE integration (M9.6) is validated end-to-end against live server streams.
