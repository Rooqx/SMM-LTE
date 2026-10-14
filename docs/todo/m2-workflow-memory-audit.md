# M2 durable workflow-memory audit

- Audit date: 2026-10-08
- Scope: backend persistence only; no frontend component or page changes
- Verdict: internally verified for M2 scope

## Implemented

- Migration `006_durable_workflow_memory.sql` adds workflow, phase, orchestration-step, conversation, message, summary, pending-question, answer, and immutable context-revision state.
- Workspace creation atomically creates phase 1, one active conversation, and its audit record.
- Composite foreign keys prevent cross-workspace links even if repository code is bypassed.
- Conversation row locks allocate gap-free, monotonically increasing message ordinals under concurrency.
- Pending questions have one winner per workspace. Answers target the exact question/version, validate option/custom input, append the answer message atomically, and bind idempotency to the request hash.
- Summaries require every message in their declared source range to exist.
- Canonical context updates append approved immutable revisions and move an exact pointer. Old revision IDs remain loadable after newer updates.
- `WorkflowStore` keeps these capabilities internal until product-oriented M3+ services and DTOs are implemented.

## Review findings fixed

1. Replaced ID-only relationships with composite workflow/workspace/phase foreign keys.
2. Added the missing run-to-step workspace constraint.
3. Explicitly encoded array/scalar JSON before PostgreSQL writes.
4. Removed caller-controlled answer display text; persisted text now derives from the selected option or validated custom answer.
5. Standardized workspace-before-child lock ordering for run decisions.
6. Added an immediate deferred-constraint check before altering workflow nullability during a data-bearing legacy upgrade. An empty-database migration did not reveal this PostgreSQL trigger-event edge case.
7. Removed a mistaken question-key/version uniqueness rule so a recipe can ask a question again in a later attempt while retaining prior history.

## Automated evidence

Against a disposable PostgreSQL 16 instance:

- Clean migrations `001` through `006`: pass.
- Legacy schema/data upgrade through `006`: pass, including workflow/phase/conversation and current-context revision backfill.
- M2 integration suite: 5 tests pass.
- Complete backend suite: 9 files and 22 tests pass.
- Backend type-check and production build: pass.
- Astro server/auth regression suite: 9 files and 26 tests pass; no browser E2E was run.
- Backend and Astro dependency audits at high severity: no known vulnerabilities.
- Skill audit: 44 skills load; existing legacy-reference findings remain informational and are assigned to M3 classification.
- Concurrent message ordering: 20 simultaneous appends produce ordinals 1–20 exactly once.
- Concurrent answer race: one answer wins and one receives a stale conflict.
- Concurrent context writes: revisions 3–7 are serialized and the original pinned revision remains unchanged.
- Cross-account repository reads and cross-workspace database relationships are denied.

## Deliberately deferred

- Typed six-phase recipes and real immutable bundle versions (`legacy-v1` is an explicit transitional marker).
- Product-facing continue/answer/revise/approve endpoints.
- Prompt memory assembly and bounded retrieval policy.
- Artifact/final-post immutable lineage, queue fencing, performance/load tests, and production migration/restore rehearsal.

These are tracked in `map.md`; none is implied complete by this M2 verdict.

The disposable PostgreSQL databases and cluster used for this audit were stopped and removed after verification; no user or development data was touched.
