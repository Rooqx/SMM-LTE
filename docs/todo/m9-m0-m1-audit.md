# M9.0–M9.1 implementation and audit record

Date: 2026-10-11.

Status: `DONE-DOC` for this audit record. M9.0 and M9.1 remain `VERIFY`
because production-like measurements and disposable-PostgreSQL execution were
not available in this environment.

## Scope delivered

- Content-free, correlation-aware HTTP/auth/database/answer/enqueue/queue-start/
  worker/context/prompt/provider/validation/commit timing stages.
- Prometheus stage histograms suitable for percentile calculation, prompt-size
  aggregates, provider/model latency logs, and deterministic log sampling.
- Read-only query-plan capture and intentional billable direct-provider
  benchmark commands, plus explicit synchronous/provider/cost budgets.
- Immutable, source-controlled `phase-1-brand-intake` questionnaire releases,
  including a retained older version used to prove mixed-deployment pinning.
- Beginner-facing reviewed questions, examples, branches, answer modes,
  selection bounds, required custom text, and complete fallback choices.
- Additive migration `012` for one interview authority, pinned sessions, bounded
  option provenance, application-owned model option IDs, exact shown-option
  references, presentation/interaction state, idempotency, optimistic versions,
  and immutable supersession.
- A tenant-scoped interview store with workspace/session locking and
  repeatable-read resume projections.

M9.2 fast APIs, canonical progression/completeness, and intake compilation are
deliberately not included. The new store is not exposed as a browser workflow.

## Repeated audit findings and fixes

### Pass 1

- Made the option-set link mandatory for every answer so custom answers retain
  the choices shown to the user.
- Prevented non-model rows from carrying false provider/model provenance.
- Made resume state one repeatable-read snapshot rather than three independently
  timed reads.
- Required curated-origin options to hash exactly to the pinned reviewed catalog.
- Encoded the required plain-language business description as a domain rule.
- Removed a raw model-action error log and classified invalid structured output
  as a failed validation stage.

### Pass 2

- Added selection minimums, option-plus-text mode enforcement, explicit expiry
  validation, UUID validation, and plain-text/markup/control-character checks.
- Added per-option `requiresCustomText` so “Something else” cannot become a
  content-free pseudo-answer.
- Preserved exact idempotent response versions and strengthened database
  constraints for session/authority and answer/option ownership.
- Propagated the durable job correlation ID into worker-start timing and added
  database/answer stages for the existing synchronous path.

### Pass 3

- Found and fixed a canonicalization defect that recognized but then dropped
  `requiresCustomText`; a focused pure unit test now protects the hash and rule.
- Required model option sets to carry an expiry while retaining their immutable
  provenance for audit.
- Added fixed histogram buckets; count/sum/max alone could not support the p95
  and p99 budgets required by M9.0.
- Reconciled readiness, migration, milestone, architecture, database, testing,
  and main tracker documentation.

### Pass 4

- Added explicit presentation and first-interaction timestamps after the clean
  review found that generated/prefetched options were not distinguishable from
  options actually shown. Replacement now stops once interaction begins, and
  answer persistence marks the exact referenced set as shown/touched.

### Final clean pass

No further actionable source, schema-design, security-boundary, privacy-log,
concurrency, version-pinning, or status-honesty issue was found within the
implemented M9.0–M9.1 scope.

## Verification evidence

| Check | Result |
| --- | --- |
| TypeScript/build and migration copy | PASS |
| Backend test run | PASS — 15 files / 41 tests |
| PostgreSQL-dependent tests | SKIPPED — 10 files / 39 tests; no disposable `TEST_DATABASE_URL` |
| Focused questionnaire/option/performance tests | PASS |
| Release evaluation | PASS — 5 files / 16 tests |
| Secret scan | PASS — no known secret patterns |
| Skill registry audit | PASS — 44 skills; informational legacy references only |
| Dependency advisory lookup | NOT RUN — registry access failed in the sandbox and elevated export of dependency metadata was not authorized |
| Direct-provider benchmark | NOT RUN — real provider credentials/cost authorization unavailable |
| Production-like query plans/load | NOT RUN — authorized target database/hosting unavailable |

## Open gates

1. Run migration `012` plus `interview-store.integration.test.ts` on a dedicated
   disposable PostgreSQL 16+ database. Do not use the configured remote
   development/production database for tests.
2. Capture production-like dataset/query-plan evidence with
   `pnpm run baseline:plans`.
3. Intentionally authorize and run the billable provider benchmark for the exact
   production model, then record tokens, pricing, latency, and errors.
4. Run the staging load/soak protocol and confirm the accepted percentile
   budgets before changing M9.0 or M9.1 to `DONE`.
5. Run the package advisory lookup only after authorization to send dependency
   metadata to the npm advisory service.
