# M5 review, revision, artifact, and final-post audit

Status: DONE (internal implementation and verification)

Reviewed: 2026-10-08

## Outcome

M5 implements the backend review loop and content read model described by `backend-implementation-context.md` sections 6.8, 9, 11, 16, and 17.

One run is one exact review revision. Revision requests retain the rejected revision, record instructions and attribution, copy exact release/context pins, queue a successor, and return that successor to review. Approval promotes only the exact run's allowed context proposals and advances only when that run was the recipe's phase-completing step. Artifact and final-post revisions are append-only and account scoped.

## Implemented boundaries

- Migration `009_review_revisions_and_final_posts.sql` adds review-thread identity, monotonic review numbers, same-thread parent constraints, artifact lineage/attribution, structured final posts, and query indexes.
- `ReviewStore` owns idempotent revision transitions and exact prior-revision retrieval.
- `Store` retains worker completion and atomic decision/promotion transactions.
- `ContentStore` owns bounded, account-scoped artifact/post reads and opaque cursor validation.
- Strict model actions optionally carry validated structured final posts. Only a step allowed to create `final-post-batch` may emit them, and a matching review artifact is required.
- Fastify exposes exact revise, artifact, and final-post routes. Responses omit provider/prompt/release internals. Astro's server-only allowlist exposes those product routes but still blocks raw browser skill selection.
- ADR 0011 records why run-scoped revisions and relational final posts were selected.

## Requirement audit

| Requirement | Result | Evidence |
| --- | --- | --- |
| Present/approve exact revision | PASS | Run ID + `review_revision`; pending/latest checks under workspace lock |
| Stale/superseded approval conflicts | PASS | Older run is rejected and newer-thread check fails closed |
| Revision preserves history and instructions | PASS | Old run/artifacts/posts retained as rejected; successor links through `supersedes_run_id`/parent IDs |
| Model cannot approve itself | PASS | Approve/reject/revise routes require verified user principal; action union has no approval mutation |
| Context promotion is exact and atomic | PASS | Only `run.output.context_updates` are appended inside the decision transaction |
| Recipe completion owns phase advance | PASS | Only `waiting_approval` phase-completing runs advance; caller cannot set this on human endpoints |
| Immutable artifact lineage | PASS | Logical ID, revision/version, parent, source run/release join, status, instructions, creation/decision attribution |
| Structured final posts | PASS | First-class rows for copy, calendar/grouping/filter metadata, pinned comment, review/publication state, lineage |
| Flat and grouped retrieval | PASS | Same bounded page returns flat items; optional grouped sprint/week/day projection |
| Cursor pagination/filter/search | PASS | Stable keyset plus status/platform/sprint/week/campaign/date/full-text filters; max 100 |
| Timezone-safe editorial days | PASS | PostgreSQL `date`, timezone snapshot, ISO weekday derived from date; DST fixtures |
| Account isolation | PASS | Every public content query joins workspace ownership; exact object reads use the same scope |
| Idempotent revision request | PASS | Workspace-scoped key replays only for the same target/instructions; changed material conflicts |
| One concurrency winner | PASS | Workspace/run locks and conditional pending status; concurrent decision test |

## Verification evidence

- Pristine PostgreSQL 16 database, migrations `001`–`009`: 18 backend files, 51 tests passed.
- Seeded pre-M5 schema, migrations `001`–`008` then `009`: legacy run/artifact lineage backfill passed without history loss.
- Backend typecheck: passed.
- Backend production build and migration-copy step: passed.
- Skill audit: 44 skills, expected phase counts 6/8/14/6/4/6; legacy-path/host-question notices remain informational compatibility items.
- Astro check: 69 files, zero errors/warnings/hints.
- Astro server tests with PostgreSQL: 10 files, 28 tests passed.
- Astro production server build: passed.
- Backend and client `pnpm audit --audit-level high`: no known vulnerabilities.
- Browser end-to-end tests: not run, per the explicit backend-only constraint. `docs/testing.md` remains the handoff procedure.

## Senior engineering audit and fixes made

The audit found and corrected:

1. A missing `(artifact_id, workspace_id)` uniqueness constraint required by the final-post source foreign key.
2. An incorrect legacy review-thread backfill order: PostgreSQL had applied the UUID default before the update. Migration 009 now backfills existing rows to their run ID before setting the default for new rows.
3. Final-post lineage originally included the date in identity lookup, which would break lineage when revision instructions move a post. Stable identity now uses logical key plus platform; date remains revisable metadata.
4. Opaque cursors originally relied on PostgreSQL casts for malformed values. The content repository now validates UUID/timestamp/date shape and returns a safe `invalid_cursor` response.
5. M5 initially made the general store too large. Read-only content queries and revision transitions were extracted into focused repositories with single responsibilities.
6. Public run responses previously serialized the internal row. Product routes now project an explicit allowlist and omit provider, prompt, release-hash, and idempotency internals.
7. Structured metadata and total model action size now have local bounds before database persistence.
8. The full-suite test helper assumed global queue order. It now targets jobs by run ID, removing a cross-suite concurrency assumption.

## Scalability and remaining risks

The design scales horizontally because all coordination is PostgreSQL-backed, API/worker processes remain stateless, list endpoints are bounded, and filter shapes are indexed. Revision transactions are short and never include an LLM/network call. Workspace-level serialization deliberately favors correctness; it may limit throughput for one unusually busy workspace but does not globally serialize accounts.

M5 is not a production-readiness claim. M6 still owns worker lease renewal/fencing and late-result safety, backpressure/fairness, metrics/alerts, load and soak evidence, query plans against production-like volume, restore/rollback drills, retention automation, and hardened retryable Obsidian export. Live Google/email/proxy acceptance remains an external M1 gate. Publishing/scheduling connectors remain out of scope.
