# Backend TODO and file map

Last updated: 2026-10-14.

## Adaptive-question reliability follow-up (2026-10-14)

| Area | Status | Evidence / remaining gate |
| --- | --- | --- |
| Multi-select adaptive answers | VERIFY | Migration `017_question_selection_mode.sql` applied to configured PostgreSQL; backend/client contracts and UI updated; focused types, build, and tests pass. Disposable-database integration test added but not run against the live database. |
| Duplicate continuation conflict | VERIFY | Client reconciles `workspace_busy` against authoritative workflow state and avoids a second continue while an answer/run is active. Live user replay remains to verify. |
| Repeated skill clarifications | VERIFY | Once required context is present, a skill gets at most two adaptive questions per phase instance; provider no longer sees `ask_user` afterward. Existing guided intake remains separate. Live profile-optimizer replay remains to verify. |

This is the tracking entry point for the backend adjustment. Update it in the same change whenever a listed file is created, substantially changed, verified, or deliberately replaced.

Backend scope includes server-only authentication/BFF modules under the Astro `client/` tree because of the repository layout. It does not include frontend page/component redesign; orchestration and domain logic remain under `backend/`.

## Status legend

- `DONE-DOC`: documentation is complete for the current agreed scope; this does not mean the feature is implemented.
- `EXISTING`: working baseline file that predates the new implementation.
- `PENDING`: implementation has not started.
- `IN-PROGRESS`: actively being changed and not ready for review.
- `VERIFY`: implementation exists but required tests/audit evidence are incomplete.
- `DONE`: implemented, tested, documented, and accepted against the definition of done.
- `BLOCKED`: cannot safely continue without a named decision or external dependency.
- `EXTERNAL-PENDING`: implementation can proceed with safe development substitutes, but production verification requires an owner/hosting credential or decision.

Only use `DONE` when code, migrations, tests, and documentation agree. Never mark a source file done merely because its intended design is documented.

## TODO-folder documents

| File | Purpose | Status | Notes |
| --- | --- | --- | --- |
| [`map.md`](./map.md) | Central tracker and continuation map | DONE-DOC | Update on every backend implementation change |
| [`backend-implementation-context.md`](./backend-implementation-context.md) | Authoritative decisions, target design, sequence, tests, and completion/scalability checklists | DONE-DOC | Re-audited for security, scale, performance, reliability, operations, and maintainability |
| [`final-readiness-audit.md`](./final-readiness-audit.md) | Final senior architecture audit, blockers, production gates, and verdict | DONE-DOC | Target architecture approved; current implementation not production-approved |
| [`m1-auth-audit.md`](./m1-auth-audit.md) | M1 implementation/security/scalability audit and evidence | DONE-DOC | Internal checks pass; Google, email gateway, proxy, and browser acceptance remain external |
| [`m2-workflow-memory-audit.md`](./m2-workflow-memory-audit.md) | M2 persistence/migration/concurrency/exact-revision audit | DONE-DOC | Internal PostgreSQL checks pass; production rehearsal remains M6 |
| [`m3-recipes-and-bundles-audit.md`](./m3-recipes-and-bundles-audit.md) | M3 recipes, release pins, mixed versions, and strict code audit | DONE-DOC | Internal recipe/release checks pass; model actions and production rehearsal remain later milestones |
| [`m4-memory-and-actions-audit.md`](./m4-memory-and-actions-audit.md) | M4 bounded memory, model actions, tools, adaptive questions, and strict code audit | DONE-DOC | Clean full regression, build, dependency, and Astro server-boundary checks pass |
| [`m5-review-content-audit.md`](./m5-review-content-audit.md) | M5 exact review revisions, immutable content lineage, post queries, and strict code audit | DONE-DOC | Clean/upgrade migrations, concurrency, query, build, dependency, and server-boundary checks pass |
| [`m6-operational-hardening-audit.md`](./m6-operational-hardening-audit.md) | M6 fenced queue, backpressure, observability, recovery, performance, and strict code audit | DONE-DOC | Internal implementation/checks pass; production-like soak, managed PITR/restore, alert wiring, and hosting rehearsal remain external |
| [`m7-final-backend-audit.md`](./m7-final-backend-audit.md) | M7 source, test, migration, security, scalability, and documentation reconciliation | DONE-DOC | Internal audit passes; production approval remains gated by the named M1/M6 external evidence |
| [`m8-product-contracts-audit.md`](./m8-product-contracts-audit.md) | M8 product reads, owner commands, migration, client contract, and strict audit | DONE-DOC | Clean `001`–`011`, 64 backend tests, client checks/build, and remaining connector boundaries recorded |
| [`backend-speed-reliability-implementation-context.md`](./backend-speed-reliability-implementation-context.md) | M9 guided-intake speed/reliability decisions, backend/frontend work, tests, targets, and definition of done | VERIFY | M9.0–M9.7 implemented; production-like PostgreSQL/provider/browser evidence remains |
| [`m9-final-audit.md`](./m9-final-audit.md) | M9 all-milestone final audit, fixes, evidence, and residual gates | DONE-DOC | Local source/contracts/regressions reconciled; external gates explicit |
| [`m9-m0-m1-audit.md`](./m9-m0-m1-audit.md) | M9.0–M9.1 implementation and repeated rigorous audit evidence | DONE-DOC | Internal checks clean; external PostgreSQL/provider/load/dependency-advisory gates recorded |
| [`backend-speed-reliability-map.md`](./backend-speed-reliability-map.md) | M9 milestone, source-boundary, evidence, and continuation tracker | DONE-DOC | Update with every M9 code, migration, contract, test, and documentation change |
| [`backend-speed-reliability-plan-audit.md`](./backend-speed-reliability-plan-audit.md) | M9 senior architecture/security/reliability/UX/performance plan audit | DONE-DOC | Plan approved; implementation and production evidence remain pending |
| [`recurring-content-implementation-context.md`](./recurring-content-implementation-context.md) | Low-friction interview and recurring-content implementation contract/final audit | DONE-DOC | R0–R6 implemented; local static/unit gates pass and remaining database/browser acceptance is explicit |
| [`recurring-content-map.md`](./recurring-content-map.md) | R0–R6 source, milestone and evidence tracker | DONE-DOC | Backend/client suites, lint, Astro check, builds and secret scan recorded |

## Existing documentation to update during implementation

| File | Current role | Status | Required completion work |
| --- | --- | --- | --- |
| [`../README.md`](../README.md) | Documentation index | DONE-DOC | Keep TODO links correct |
| [`../architecture.md`](../architecture.md) | Current implemented architecture | DONE | M1-M6 identity, persistence, routing, fencing, backpressure, observability, review, and content boundaries synchronized |
| [`../security.md`](../security.md) | Current service-key, user-session, assertion, email, and prompt security model | DONE | M1 security behavior and staging gates synchronized |
| [`../database.md`](../database.md) | Current schema, transaction, and queue behavior | DONE | Auth, workflow memory, release pins, exact review/content lineage, fenced leases, and migration evidence synchronized |
| [`../api.md`](../api.md) | Current API and browser-boundary contract | DONE | Continue/answer/revise/approval/artifact/post and service-only compatibility contracts documented |
| [`../features.md`](../features.md) | Implemented/deferred feature inventory | DONE | M6 backend behavior is distinguished from deferred frontend, connectors, and external production gates |
| [`../operations.md`](../operations.md) | Non-Docker operation guide | DONE | Auth/email/Google/JWKS/runtime, M6 deployment/worker-drain, metrics, and production gates documented |
| [`../testing.md`](../testing.md) | Automated verification and deferred E2E guide | DONE | M1-M6 automated scope and complete deferred auth-to-phase-6/recovery scenario documented; browser E2E not executed |
| [`../decisions/`](../decisions/) | Architecture decision records | DONE-DOC | ADRs 0007-0014 cover implemented foundations and guided intake |

## ADR implementation plan

Create each ADR with the milestone that makes its design executable, so the decision record and the shipped behavior cannot drift independently.

| Planned decision | Milestone | Relationship to existing ADRs |
| --- | --- | --- |
| Better Auth, personal owner accounts, and the browser-to-Fastify identity boundary | M1 | Supplements ADR 0006: service keys remain machine-only principals while browser users use secure Better Auth sessions |
| Durable application-owned workflow and conversation memory | M2 | Expands ADR 0001 with retention, bounded context assembly, and exact revision semantics |
| Typed phase recipes and immutable skill-bundle pinning | M3 | Expands ADRs 0003 and 0004 with backend-controlled routing and reproducible execution inputs |
| Bounded memory and controlled model actions | M4 | Implements ADR 0010 with step-scoped retrieval, strict actions, tools, budgets, and no vector database |
| Run-scoped review revisions and structured final posts | M5 | ADR 0011 keeps approval exact, history immutable, and hosted post views relational rather than filesystem-backed |
| Explicit PostgreSQL repositories instead of a general-purpose ORM | Cross-cutting | ADR 0012 preserves visible lock/transaction semantics and one migration authority while allowing a bounded future pilot |
| Deterministic guided intake with non-blocking AI option assistance | M9 | Proposed ADR 0014 keeps workflow truth in application code, uses fallback-backed personalized options to reduce cognitive load, and reserves the durable primary-model worker for synthesis |
| Recurring content and low-friction interview choices | R0-R6 | ADR 0015 caps suggestions at four plus first-class custom text and separates next-week, extra-post, and strategy-refresh commands from onboarding |
| Calendar-owned scheduled-post completeness | Follow-up | ADR 0016 makes approved dated slots the definition of done for Phase 3/4; local verification passed, live provider and browser acceptance pending |

See [calendar-completeness-audit.md](./calendar-completeness-audit.md) for the
implementation checklist, verification evidence, and residual risks.

## Implementation file map

Paths marked “new/equivalent” are suggested boundaries, not permission to create unnecessary files. An implementer may choose an equally clear name but must update this map.

| Workstream | Current/proposed files | Status | Done when |
| --- | --- | --- | --- |
| Package/runtime baseline | `backend/package.json`, `backend/pnpm-lock.yaml`, `backend/.node-version`, backend README/config examples | DONE | Frozen install passed with pnpm 11.15.1; Node 22 is pinned; CLI help and operator documentation use pnpm; the high-severity dependency audit is clean |
| Better Auth server integration | `client/src/lib/server/{auth,config,database}.ts`, `client/src/pages/api/auth/[...all].ts`, middleware/tests | VERIFY | Email/password and DB-backed assertions pass; live Google/browser acceptance requires external credentials and later frontend wiring |
| Auth email delivery | `client/src/lib/server/auth-email.ts`, `backend/src/email/delivery.ts`, queue/worker/config/tests | VERIFY | Durable/deduplicated/prioritized delivery, native Resend plus webhook adapters, provider-specific retry semantics, and secret disposal pass; live domain/inbox acceptance remains external |
| Fastify human identity | `backend/src/auth/{principals,user-identity,guards,fastify.d.ts}`, routes/tests | DONE | User/service principals, EdDSA verification, authoritative revocation/membership, audit attribution, and tenant isolation pass |
| Configuration | `backend/src/config.ts`, Astro server config/env examples | DONE | Secrets, HTTPS origins, issuer/audience, proxy limits, pools, and timeouts are explicit and tested |
| Auth/account migrations | `backend/src/db/migrations/004_better_auth.sql`, `005_personal_accounts_and_auth_email.sql` | DONE | Clean PostgreSQL 16 migration and schema-backed integration tests pass |
| Account/workspace repositories | `backend/src/auth/user-identity.ts`, existing account-scoped store/routes | DONE | Concurrent one-owner provisioning, revocation, and cross-account denial pass |
| Workflow persistence | `backend/src/db/migrations/006_durable_workflow_memory.sql`, `backend/src/db/{workflow-store,context-revisions,audit}.ts`, `store.ts`, `container.ts` | DONE | Clean and seeded upgrades, isolation, concurrency, idempotency, type/build, regression, documentation, and security audits pass |
| Typed recipes | `backend/src/domain/workflow.ts`, `backend/src/orchestration/recipes/` | DONE | Six recipes validate and all 44 skills have one explicit classification |
| Skill bundle pinning | `backend/src/skills/registry.ts`, `backend/src/skills/release-store.ts`, `backend/src/skills/prompt-compiler.ts`, migration/startup code | DONE | Exact release/context pins, old bundle retrieval, deletion protection, readiness, and mixed-version tests pass |
| Orchestration service | `backend/src/orchestration/service.ts`, worker modules | DONE | Human `continue` selects the next mandatory step; raw selection is service-only |
| LLM action contracts | `backend/src/domain/schemas.ts`, `backend/src/llm/provider.ts`, provider adapters | DONE | Strict discriminated actions, local validation, allowlists, policy errors, and call/token/time/depth budgets pass clean regression |
| Memory assembler/tools | `backend/src/memory/assembler.ts`, `backend/src/tools/registry.ts`, stores/compiler | DONE | Exact pinned context, bounded summary/messages, UTF-8-bounded approved-artifact retrieval, and durable tool results pass clean regression |
| Approval/revision model | `backend/src/db/{review-store,store}.ts`, `backend/src/orchestration/service.ts`, migration `009`, tests | DONE | Exact-revision approve/revise/promote transactions, idempotency, lineage, and stale/concurrency conflicts pass |
| Artifact/final-post model | `backend/src/{domain/schemas.ts,db/content-store.ts,http/routes.ts}`, migration `009`, tests | DONE | Immutable revision lineage and cursor-paginated/grouped week/day/platform/campaign/status/search queries pass |
| Product-oriented HTTP API | `backend/src/http/routes.ts`, `backend/src/db/product-store.ts`, `client/src/lib/{api,contracts}.ts`, `client/src/lib/server/smm-route-policy.ts` | DONE | Guided workflow plus active-run/history/preferences/workspace/export/publication contracts are account-scoped, typed, tested, and wired |
| Product contract schema | `backend/src/db/migrations/011_product_contracts.sql`, `backend/src/db/schema.ts`, integration tests | DONE | Additive owner preferences, publication version/receipts, history indexes, migration readiness, clean regression, and audit pass |
| Queue/backpressure | `backend/src/db/jobs.ts`, worker entry/config, migration `010`, job CLI/tests | VERIFY | Fair bounded admission/concurrency, renewable fencing, late-result denial, retries/recovery, and dead-job controls pass; deployed least-privilege roles and production-volume saturation remain external |
| Observability/readiness | `backend/src/{app,observability,db/schema}.ts`, correlation plumbing, metrics/tests/runbooks | VERIFY | Correlation, content-free authenticated metrics, migration/release readiness, and runbooks pass; monitoring/alert delivery requires hosting integration |
| Obsidian export hardening | `backend/src/obsidian/exporter.ts`, queue/routes/policy/tests | DONE | One-way exports are bounded, path-contained, atomic, durable, retryable, and deduplicated |
| Automated tests | Backend and Astro server suites, provider/error tests, load/security/evaluation scripts | VERIFY | Clean migration/regression, focused fencing/recovery, builds, scans, local load and logical restore pass; production-like soak/PITR/rollback/alert drills remain external |
| Guided-intake speed and reliability | `backend/src/interview/`, migrations `012`–`016`, Phase 1 integration, progress events, matching client contracts/UI/tests | VERIFY | Local implementation/regressions pass; production-like latency/provider/browser evidence remains |
| Recurring content and five-path interview UX | `backend/src/{interview,db,orchestration,http}/`, `client/src/{components/studio/today,lib}/`, tests and ADR 0015 | VERIFY | Implementation and local gates pass; disposable-PostgreSQL and live browser acceptance remain |

## External production prerequisites

| Requirement | Status | Needed for |
| --- | --- | --- |
| Production public origin/domain and TLS termination | EXTERNAL-PENDING | Secure cookies, exact trusted origins, Google callbacks, and proxy validation |
| Google OAuth web client ID/secret and approved redirect URI | EXTERNAL-PENDING | Production Google sign-in |
| Transactional email provider, verified sender/domain, and credentials | EXTERNAL-PENDING | Verification and password-reset delivery |
| Production PostgreSQL service/role details and encrypted backup/PITR capability | EXTERNAL-PENDING | Production persistence and recovery validation |
| Host secret-manager entries and rotation ownership | EXTERNAL-PENDING | Better Auth, Google, email, database, assertion-signing, and model-provider secrets |
| Agreed production SLO, RTO, RPO, retention, and spend limits | EXTERNAL-PENDING | Capacity, alerts, recovery tests, and release approval |

## Milestone tracker

| Milestone | Status | Required evidence |
| --- | --- | --- |
| M0. Baseline verification and ADR plan | DONE | Frozen install, skill audit, typecheck, unit tests, build, dependency audit, package-manager scan, and ADR roadmap completed on 2026-10-07 |
| M1. Better Auth and single-owner personal accounts | VERIFY | Code/docs/database audit complete; live Google, email gateway, proxy, and browser acceptance remain external |
| M2. Durable workflow/conversation/revision state | DONE | Clean/legacy migrations, concurrency/idempotency/revision tests, full regressions, type/build, docs, and dependency audits pass |
| M3. Typed recipes and immutable skill bundles | DONE | Six recipes/44 classifications, deterministic continuation, exact pins, readiness, and mixed-version execution pass |
| M4. Memory assembler and controlled tools | DONE | Clean retrieval/security/budget/PostgreSQL regressions, builds, docs, and dependency audits pass |
| M5. Approval, revision, artifacts, and final posts | DONE | Clean/upgrade migrations; exact revision/concurrency/promotion; lineage; cursor/filter/group/timezone tests; builds/docs/audits |
| M6. Performance, recovery, security, and operational hardening | VERIFY | Internal fencing/backpressure/observability/recovery/build/security/local load-and-restore evidence passes; staging soak, managed PITR/restore, live alerts, capacity approval, and hosting rollout remain external |
| M7. Final backend audit | DONE | Every definition-of-done item was classified; source, migrations, tests, CI, API boundaries, documentation, and residual gates are reconciled in the M7 audit |
| M8. Product contract completion | DONE | Active-run recovery; bounded run/activity/context history; durable preferences/workspace updates; Obsidian job reads; versioned publication commands; client/BFF wiring; clean `001`–`011`; 64 backend tests; docs and audit |
| M9. Guided-intake speed and reliability | VERIFY | M9.0–M9.7 implemented and final-audited; external evidence remains in `backend-speed-reliability-map.md` |

## Tracker update rules

1. Before changing a mapped source area, set its row to `IN-PROGRESS`.
2. Add any new material file to the relevant row or create a new row.
3. After implementation, set `VERIFY` until tests, security review, documentation, and migration review pass.
4. Record blockers plainly; do not work around missing security decisions silently.
5. Set `DONE` only with evidence in the change/commit or linked test/runbook output.
6. Keep completed historical rows; do not delete them merely to make the TODO list shorter.
7. At the final audit, reconcile this map with `rg --files`, migrations, scripts, and test commands so no changed file is omitted.

## Audit evidence recorded

| Check | Result | Scope/limits |
| --- | --- | --- |
| TODO documents exist and are non-empty | PASS | `map.md`, implementation context, final readiness audit, and M1 auth audit |
| Documentation index and relative local links | PASS | No broken relative links found across root and client documentation on 2026-10-08 |
| Old top-level context-document path removed | PASS | Authoritative copy now lives only under `docs/todo/` |
| Implementation status honesty | PASS | M1 remains `VERIFY` for named external gates; only internally verified M1 workstreams are `DONE` |
| Skill registry audit | PASS WITH INFO | `pnpm run skills:audit`: 44 skills; phase counts 6/8/14/6/4/6; informational legacy-path/host-question references only |
| Backend frozen-install/skill/unit/type/build checks | PASS | 2026-10-08: frozen install, 44-skill audit, typecheck, 9 test files/22 tests, and production build passed with pnpm 11.15.1 |
| Dependency vulnerability audit | PASS | 2026-10-08: backend and client report no known vulnerabilities; patched Vitest replaced vulnerable tinypool and an unused vulnerable parser was removed |
| Database migration/integration checks | PASS | 2026-10-08: clean and seeded-legacy PostgreSQL 16 schemas; 9 backend files/22 tests and 9 client/server files/26 tests passed, including auth, isolation, workflow-memory concurrency, idempotency, and exact revisions |
| Client check/test/build regression checks | PASS | 2026-10-08: frozen install; Astro check passed for 67 files with zero diagnostics; 9 files/26 tests passed with PostgreSQL; production server build passed |
| Browser end-to-end tests | NOT RUN | Explicitly deferred to the documented later E2E process |
| M2 focused PostgreSQL checks | PASS | 2026-10-08: clean and seeded legacy migration, ownership constraints, 20-way message ordering, answer race/idempotency, summaries, concurrent immutable context revisions, and pinned lookup; 5 tests |
| Backend regression after M2 | PASS | 2026-10-08: 9 files/22 tests passed against disposable PostgreSQL 16 |
| Astro server regression after M2 | PASS | 2026-10-08: 9 files/26 tests passed; browser E2E intentionally not run |
| M2 dependency/security scan | PASS | 2026-10-08: backend and Astro server report no known high-severity vulnerabilities; targeted secret/TODO scan found no M2 issue |
| M3 clean migration and backend regression | PASS | Clean PostgreSQL 16 `001`-`007` integration: 11 files/30 tests; full `001`-`008` isolated rolled-back schema rehearsal: pass; typecheck and production build pass |
| M3 recipe and skill classification | PASS | Six versioned recipes; all 44 skills classified as 18 mandatory, 16 optional, 4 internal, or 6 unsupported; invalid catalogs/allowlists fail validation |
| M3 pinning and mixed-version execution | PASS | Exact recipe/bundle/skill/root/context pins, release readiness, old bundle retrieval/execution, and unsupported skill rejection pass |
| M3 Astro server boundary regression | PASS | 69 files/zero diagnostics; 9 files/26 tests passed with 1 database integration file/2 tests skipped after disposable DB cleanup; production server build passed |
| M3 dependency audit refresh | PASS | Fresh backend and client scans report no known vulnerabilities at the high-severity threshold |
| Disposable database cleanup | PASS WITH NOTE | Both M3 temporary clusters were stopped and removed. An earlier unscoped command applied additive migrations through `007` to `backend/.env`'s database; its `007` checksum now matches source. `008` remains deliberately unapplied there pending the normal reviewed migration command. No configured database was dropped or truncated. |
| M4 controlled-action unit checks | PASS | Strict action/envelope, prompt budget, relevant memory, UTF-8 tool bounds, recipe permissions, and compiler checks pass |
| M4 focused PostgreSQL checks | PASS | 7 tests: adaptive ask/answer/replay/resume, exact tool snapshot, pinned optional skill, token accounting, denied tool, automatic phase 3 transition, and approved phase 6 cycle |
| M4 clean backend regression | PASS | Fresh PostgreSQL 16 database with migrations `001`-`008`: 15 files/46 tests; typecheck, 44-skill audit, and production build pass |
| M4 Astro server-boundary regression | PASS | 69 files/zero diagnostics; 10 files/28 tests pass on a separate migrated disposable database; production server build passes; no frontend page/component changes |
| M4 dependency audit refresh | PASS | Fresh backend and client scans report no known vulnerabilities at the high-severity threshold |
| M4 browser end-to-end testing | NOT RUN | Explicitly excluded from the backend-only task; the documented later procedure remains authoritative |
| M4 disposable database cleanup | PASS | Both isolated M4 PostgreSQL servers were stopped and their `/tmp` clusters removed; no configured development database was read or mutated |
| M5 pristine migration/backend regression | PASS | Fresh PostgreSQL 16 database with migrations `001`-`009`: 18 files/51 tests; typecheck and production build pass |
| M5 seeded upgrade rehearsal | PASS | Seeded `001`-`008` schema upgraded through `009`; legacy run/artifact identities, parents, status, and history preserved |
| M5 exact review/concurrency checks | PASS | Idempotent revise, stale approval conflict, one-winner simultaneous approval, rejected context isolation, exact winning promotion, and pinned prior-output revision input |
| M5 content query checks | PASS | Artifact/post lineage, changed-date post revision, stable cursor under insert, malformed cursor denial, status/platform/campaign/date/search filters, grouped projection, and DST local-date fixtures |
| M5 Astro server-boundary regression | PASS | 69 files/zero diagnostics; 10 files/28 tests pass with PostgreSQL; production server build passes; no page/component changes |
| M5 dependency audit refresh | PASS | Backend and client report no known vulnerabilities at the high-severity threshold |
| M5 browser end-to-end testing | NOT RUN | Explicitly excluded from the backend-only task; the documented later procedure remains authoritative |
| M6 pristine migration/backend regression | PASS | Final untouched PostgreSQL 16 database with migrations `001`–`010`: 20 files/61 tests; populated `001`–`009` upgrade, all M1–M5 regressions, and final M6 guards pass |
| M6 focused operational checks | PASS | 7 PostgreSQL tests cover stale fencing/correlation, per-account admission, fair claiming/content-free metrics, durable export dedupe, cursor denial, archived retry denial, and populated upgrade |
| M6 backend static/release/security checks | PASS | Typecheck/build; 12 files/31 unit tests; 5 files/15 release evaluations; 44-skill audit; secret scan; backend/client high-severity dependency audits |
| M6 Astro server-boundary regression | PASS | 69 files/zero diagnostics; 9 files/26 tests pass with database tests skipped without a URL; production server build passes; no UI component/page work |
| M6 local restore drill | PASS WITH LIMIT | PostgreSQL custom dump restored migration `010` and representative organization/workspace data; managed encrypted backups, PITR, and timed hosting RTO/RPO remain external |
| M6 local authenticated load smoke | PASS WITH EXPECTED REJECTION | 10 seconds at concurrency 20: 801 requests, 80.1 req/s, p50 178.39 ms, p95 488.68 ms, p99 1162.38 ms; 300 success, 501 expected rate-limit `429`, zero network/`5xx`; not production-like soak evidence |
| M6 browser end-to-end testing | NOT RUN | Explicitly excluded from the backend-only task; the documented later procedure remains authoritative |
| M7 fresh PostgreSQL regression | PASS | Disposable PostgreSQL 16; migrations `001`–`010`; all 20 backend files/61 tests passed after explicitly disabling TLS for the non-TLS local test server |
| M7 Astro server-boundary regression | PASS | Separate migrated PostgreSQL 16 database; all 10 files/28 tests passed; browser E2E remained excluded |
| M7 static/build/release checks | PASS | Backend typecheck/build; Astro 69-file zero-diagnostic check/build; 5 files/15 release evaluations; 44-skill audit; source secret scan |
| M7 dependency audit refresh | PASS | Backend and client report no known vulnerabilities at the high-severity threshold |
| M7 source/document reconciliation | PASS | Source/migration/test/API/CI inventory reconciled; 42 Markdown files have no broken relative links; checklist distinguishes internal passes from external production gates |
| M7 strict senior audit | PASS WITH OPEN GATES | No backend source defect required a code change; version garbage collection, universal retry contracts, full prompt-injection corpus, production volume/PITR/alerts/canary/rollout, and live auth acceptance remain explicit gaps |
| M8 fresh PostgreSQL regression | PASS | Disposable PostgreSQL 16; migrations `001`–`011`; all 21 backend files/64 tests passed |
| M8 product-contract security audit | PASS | Account/workspace scoping, cursor validation, optimistic versions, publication FSM/idempotency/no-op semantics, audit attribution, BFF allowlist, and strict client schemas reviewed |
| M8 client reconciliation | PASS | Variant B contract wiring plus Brand history; ESLint, 132-file zero-diagnostic check, 127 tests with 2 skips, and production build pass |
| M8 browser end-to-end testing | NOT RUN | Explicitly deferred by the owner; documented E2E and device/browser acceptance remain later work |

## Current continuation instruction

M8 is internally complete. M1 and M6 retain their external staging/production
gates. Notification decisions/unread state, Brand-specific improvement intent,
and third-party publishing connectors remain deliberate future scope. Do not
add vector storage, team management, publishing connectors, or a generic
workflow engine without new approval.
