# M3 typed recipes and immutable bundles audit

Date: 2026-10-08.

## Outcome

M3 is implemented for the agreed backend scope. Six typed recipes control mandatory ordering, all 44 skills are explicitly classified, human continuation is backend-selected, and every new run pins the exact trusted release and canonical context revisions it will use. No frontend page/component redesign, Docker work, vector database, publishing connector, or generic workflow engine was added.

## Implemented boundaries

- `orchestration/recipes/` contains six version `1.0.0` recipes and validates lifecycle metadata, step order, classification completeness, phase ownership, attempt bounds, and optional allowlists.
- Classification totals are 18 mandatory, 16 optional, 4 internal, and 6 unsupported. The phase inventory remains 6/8/14/6/4/6.
- `POST /v1/workspaces/:id/continue` accepts only a user principal and idempotency key. It selects the first mandatory step without an accepted output and sets phase completion only for the final mandatory step.
- The raw `/runs` route requires a service principal and is absent from the Astro BFF allowlist.
- Startup hashes and stores the exact orchestrator, bridge, and 44 skill files plus the six recipe definitions. Same-version registration is idempotent and fails if persisted hashes differ.
- Enqueue records recipe suite/ID/version, bundle version, skill hash, root hashes, and the exact current context-revision IDs in one transaction.
- Execution loads pinned bundle text and context revisions. Missing or mismatched content fails explicitly instead of falling back to a newer release.
- `/ready` checks the database and the complete active recipe/skill release.
- Database foreign keys and an all-or-nothing check reject partial pins or invalid recipe/skill combinations. `ON DELETE RESTRICT` protects every referenced release.

## Audit findings fixed during review

1. Removed parallel `query()` calls on one checked-out `pg` client. Registration queries are sequential, eliminating the pg 9 deprecation and making transactional ordering explicit.
2. Removed uniqueness on `(bundle_version, content_hash)`, which would have rejected two legitimate skills with identical content.
3. Removed a recipe uniqueness rule that would have prevented separate suites from reusing a recipe ID/version.
4. Removed unused release columns from the separate M2 `orchestration_steps` table; `workflow_runs` is the execution aggregate that owns these pins.
5. Added an all-or-nothing database constraint so a run is either a legacy unpinned row or has every required M3 pin.
6. Added release-aware readiness rather than treating `SELECT 1` as sufficient compatibility evidence.
7. Added human-route coverage proving user sessions cannot call the raw arbitrary-skill endpoint.
8. Added a real mixed-version test that executes a run using older recipe/bundle records and verifies the old root instructions remain retrievable.
9. Updated stale M2 tests and cleanup so release versions and queued jobs do not contaminate later integration cases.
10. Restored already-applied migration `007` byte-for-byte and moved the final integrity refinement into forward-only migration `008`, preserving checksum discipline.

## Verification evidence

- Clean PostgreSQL 16 migrations `001` through `007`: pass with the complete integration suite.
- Full migrations `001` through `008`: pass in an isolated schema inside a rolled-back PostgreSQL transaction; `008` leaves the complete-pin constraint present and removes all three unused transitional columns.
- Backend typecheck: pass.
- Backend production build: pass.
- Backend automated suite: 11 files, 30 tests, all pass against the disposable clean database.
- Skill audit: 44 skills load; findings are existing informational compatibility references only.
- Mixed current/old recipe and bundle registration/execution: pass.
- Exact enqueue-time context revision after a newer canonical update: pass.
- Backend and Astro server/client dependency audits: no known vulnerabilities at the high-severity threshold.
- Astro server/client regression: 69 files with zero diagnostics, 9 unit files/26 tests passed, 1 database-integration file/2 tests skipped because the disposable database had already been removed, and the production server build passed. Earlier database-backed client integration evidence remains recorded under M1/M2.
- Browser end-to-end testing: not run, per the owner's explicit backend-only instruction.

## Security, scale, and maintainability review

- Authorization: human and service execution surfaces are separate; account-scoped workspace lookup precedes enqueue.
- Injection boundary: recipes and skills are trusted source inputs; workspace data remains untrusted prompt data; model output remains locally validated.
- Concurrency: workspace locking, one-active-run constraints, transactional job creation, and idempotency rules remain intact.
- Rolling releases: queued work stores full executable trusted text and exact context IDs; readiness detects an incomplete current release.
- Horizontal scale: registries are immutable per process and durable coordination stays in PostgreSQL. No new in-memory workflow authority was introduced.
- Database scale: release registration is startup work, ordinary enqueue uses indexed keys, and run execution reads one bundle entry plus its root record.
- Simplicity: recipes are data structures with one validator, not a rules language. The existing queue, provider, and store abstractions remain in place.
- Comments: comments explain trust, compatibility, concurrency, and non-obvious PostgreSQL behavior; routine code is left self-explanatory.
- Documentation: architecture, API, database, features, operations, testing, ADR, TODO map, and backend README are synchronized.

## Honest limits and later work

- Optional skills are classified and allowlisted, but model-requested optional actions wait for M4's strict action schema.
- Required context/output declarations are recipe metadata; M4 must enforce them through the memory assembler and controlled tools.
- The current approval tables are not yet the full exact-revision review/revise model. That is M5.
- Old queued runs can execute their pinned bundle. A future release that introduces an older in-progress workflow recipe must also retain that source recipe definition until the workflow is drained or migrated.
- No automated release deletion exists. This is safer than premature garbage collection; an operator policy and retention window are required first.
- Model/provider configuration is recorded at execution, not pinned by M3. Provider budgets/evaluations remain M4/M6 work.
- Frontend components are intentionally unchanged. A separate frontend task must switch its orchestration call to the new `continue` contract.
- The configured local development database received additive migrations through `007` during this task. Its recorded `007` checksum matches source. Migration `008` was not applied automatically because it drops three never-used columns; run the normal reviewed migration command when ready.

## Verdict

M3 meets its backend definition of done and is suitable as the routing/pinning foundation for M4. It is not a production-readiness verdict for the whole platform: external M1 acceptance, controlled model actions/memory, exact revision workflows, artifact/final-post models, queue fencing/backpressure, load/recovery tests, monitoring, and staging rollout gates remain open.
