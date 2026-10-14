# Final backend architecture and readiness audit

Status: M7 internal audit and reconciliation complete. M1 and M6 retain named
external verification gates, so production release is not yet approved. Use
`map.md` and the milestone audit files for the evidence ledger.

Audit date: 2026-10-09.

## Verdict

The target architecture in `backend-implementation-context.md` is sound for the intended product if its mandatory controls are implemented and verified. It is intentionally simpler than a generic agent framework: PostgreSQL owns state, typed recipes own workflow, the backend selects mandatory skills, the LLM can request only allowlisted optional skills, and all authoritative changes pass through validated runtime transitions.

The codebase is **internally implemented through M6, reconciled in M7, but is not production-approved**. M4 added controlled LLM actions and bounded memory; M5 added exact-revision review, artifacts, and structured final posts; M6 added fenced leases, backpressure, observability, recovery controls, and operational runbooks. Live Google/email/proxy/browser acceptance, production-like soak/query-plan evidence, managed PITR/restore, live alerts, capacity approval, and hosting rollout/rollback rehearsal remain external gates.

## Audit scope

The final pass reviewed:

- Authentication, sessions, Google OAuth, identity propagation, and future token rotation.
- Single-owner isolation and future team migration.
- Object-level and property-level authorization.
- Phase state, skill selection, optional LLM routing, tools, approvals, and revisions.
- Prompt injection, structured outputs, side effects, model limits, quality, and cost.
- PostgreSQL schema, transactions, indexing, timeouts, pagination, pooling, and maintenance.
- Queue delivery, retries, concurrency, leases, dead jobs, backpressure, and fairness.
- API compatibility, migrations, deployment, rollback, and mixed-version operation.
- Logging, metrics, alerts, incident response, backups, restore drills, RTO, and RPO.
- Dependencies, secrets, lockfiles, provider boundaries, and test strategy.
- Request/response field authorization, stored-content rendering safety, transactional email, API compatibility, and timezone correctness.
- Long-term maintainability, vector-search triggers, and avoidance of premature infrastructure.

## Critical implementation blockers

These must be resolved before the redesigned product can be considered production ready.

| ID | Blocker | Why it matters | Required resolution |
| --- | --- | --- | --- |
| C1 | M1 identity backend is implemented; live providers and frontend wiring remain | Production identity still needs Google/email/proxy/browser acceptance | Complete the documented staging acceptance and separate frontend migration without restoring the shared password |
| C2 | **Closed in M3:** human continuation contains no skill/completion controls | The separate raw contract is service-only and absent from the browser BFF | Keep frontend migration separate and preserve this boundary |
| C3 | **Closed internally in M3/M6:** recipe, bundle, skill, root instructions, context, and model identity are pinned; release evaluations run in CI | A real provider/model canary and safe future version retirement still need operational evidence | Preserve old versions while referenced; rehearse the provider canary and implement garbage collection only with reference/retention proof |
| C4 | **Closed in M4/M5:** all six recipes, adaptive questions, controlled optional actions, and exact review transitions are implemented | The runtime—not the model/client—owns transitions | Preserve the typed recipe/action boundary |
| C5 | **Closed in M5:** review decisions target the exact immutable run revision and concurrent decisions have one winner | A stale tab cannot approve a successor silently | Preserve exact-revision locking and conflict behavior |

## High-priority production gates

| ID | Gate | Acceptance evidence |
| --- | --- | --- |
| H1 | Session and OAuth hardening | Cookie/origin/CSRF tests, revocation tests, account-linking tests, sensitive-action freshness, and key-rotation procedure |
| H2 | Account isolation | Repository and route tests proving a user/service cannot read or mutate another account's object or properties |
| H3 | Queue correctness | Crash/retry/redelivery/concurrency tests showing one committed transition and no duplicate artifacts/context promotion |
| H4 | Backpressure and resource controls | Configured request, queue, worker, provider, database, token, and spend limits with saturation tests |
| H5 | Database performance | Cursor pagination, production-like query plans, appropriate indexes, bounded pools/timeouts, and monitored autovacuum/slow queries |
| H6 | Recovery | Declared SLO/RTO/RPO, encrypted backups/PITR as required, and a successful isolated restore drill |
| H7 | Safe deployment | Expand/migrate/contract migration test, mixed-version compatibility, recipe/bundle readiness checks, and rollback runbook |
| H8 | Model release quality | Regression evaluation thresholds for routing, structured output, brand fidelity, platform behavior, safety, and cost |
| H9 | Operational detection | Correlation IDs, metrics, actionable alerts, dead-job recovery, and incident runbooks |
| H10 | Supply chain | Frozen `pnpm` installs, supported Node version, dependency/secret scanning, and prompt security updates |
| H11 | Data/API boundaries | Allowlisted mutations, minimal response DTOs, stored-content sanitization, versioned contracts, and timezone/DST fixtures |
| H12 | Version lifecycle | Retained old recipes/bundles, immutable context revisions, safe version garbage collection, proxy-header tests, and request-bound idempotency semantics |
| H13 | Attempt and input integrity | Renewable fenced leases, stale/cancelled-result rejection, bounded tool-result snapshots, and timezone-correct editorial dates |

## Security conclusions

The selected authentication approach remains appropriate:

- Use Better Auth's database-backed opaque session in a secure HttpOnly cookie.
- Keep session caching disabled initially for immediate database-backed revocation; reconsider only after measurement.
- Do not issue a browser access/refresh-token pair for the first-party web application.
- Use only short-lived, server-side identity assertions between Astro and Fastify.
- If non-cookie clients later require refresh tokens, rotate them on every use and revoke the family on reuse.
- Do not request Google offline/API scopes merely for login.
- Keep service API keys for machine use, not human approval attribution.

Residual security risk cannot be removed completely. Session theft, dependency vulnerabilities, prompt injection, malicious imported content, account-linking mistakes, and authorization regressions require layered controls, tests, monitoring, and prompt patching. The plan now defines those layers without claiming the authentication library alone makes the system secure.

## Scalability and performance conclusions

PostgreSQL is sufficient for the initial and foreseeable product when used deliberately:

- API and worker processes stay stateless and scale horizontally.
- The PostgreSQL queue remains appropriate until measured contention or isolation requirements justify another system.
- Exact relational/metadata/full-text retrieval should come before `pgvector`.
- Cursor pagination and selective content loading prevent unbounded memory and response growth.
- Total connection pools must remain below the database connection budget as replicas increase.
- Worker/model concurrency and per-account cost budgets provide backpressure.
- High-churn queue, message, step, and event tables require autovacuum and index monitoring.

No separate vector database, Redis queue, microservice split, or multi-region topology is justified now. Those are future responses to measured limits, not prerequisites.

## Reliability conclusions

The design uses the correct durability boundary: PostgreSQL transactions own state transitions, while external model calls happen outside transactions. At-least-once job delivery plus idempotent completion is the honest contract.

One unavoidable edge remains: the model provider may complete and bill a request just before the worker loses the response. Local state can remain idempotent, but exactly-once external billing cannot be guaranteed without provider support. The system must record/reconcile provider response identifiers when possible and document the possibility of a rare duplicate charge.

Reliability is not accepted until recovery objectives and restore evidence exist. Health endpoints and backups alone do not prove recovery.

## Maintainability conclusions

The architecture should remain manageable if these boundaries are preserved:

- Recipes remain typed, source-controlled, product-specific, and mostly linear.
- Each skill has a contract and one explicit recipe classification.
- The frontend sends user intents, not workflow internals.
- The LLM proposes optional routes but never owns transitions.
- Provider-specific code stays behind an adapter.
- Core prompts/skills are not edited live in the database.
- Every material behavior change is versioned, evaluated, and auditable.

The largest maintainability threat is turning the recipe system into a generic rules engine. If adding an ordinary skill begins requiring changes across auth, queue, database, frontend, and provider code, stop and simplify before adding more abstraction.

## Strict post-write document findings

The follow-up audit identified five defects in the written plan and corrected them:

| Finding | Severity | Problem in the earlier text | Correction |
| --- | --- | --- | --- |
| D1 | High | Hash/version pinning did not say how old recipe logic and trusted skill text survive deployment | Require retained versioned recipe definitions and retrievable immutable bundles until no live/retryable reference remains |
| D2 | High | Context “version pinning” did not require historical context rows | Require immutable context revisions and enqueue-time revision IDs that workers load exactly |
| D3 | Medium | Version capture could be read as a promise of deterministic LLM replay | State that runs are auditable and best-effort replayable; provider/model nondeterminism prevents guaranteed byte-identical output |
| D4 | Medium | “Backend-only” conflicted with Better Auth code living under the Astro `client/` tree | Define the Astro server-only BFF/auth edge as backend scope while keeping all orchestration/domain logic in Fastify |
| D5 | Medium | Forwarded-header trust and idempotency-key payload binding were implicit | Require explicit trusted proxies and bind idempotency keys to account, operation, resource, and canonical request hash |
| D6 | High | The text unnecessarily assigned service API keys to the direct-database worker | Remove the worker from the service-key use case unless it actually becomes an HTTP client; keep credentials least-privileged by boundary |
| D7 | High | A signed account claim could be misread as sufficient authorization until JWT expiry | Require current session/user/account checks for sensitive mutations so revocation or ownership change takes effect promptly |
| D8 | High | Stale-lock recovery lacked a required fencing token | Require renewable leases and attempt/fencing checks so a timed-out, cancelled, or superseded worker cannot commit late results |
| D9 | Medium | Tool/retrieval inputs were not explicitly preserved with the model step | Persist bounded result snapshots and source/query/version metadata for audit and best-effort replay |
| D10 | Medium | UTC guidance did not distinguish true instants from date-only editorial plans | Store date-only local dates with IANA timezone and week-start rules; use UTC only for actual instants |

## Final audit changes applied to the plan

The final pass updated `backend-implementation-context.md` with requirements that were previously implicit:

- Immediate session-revocation semantics and sensitive-action session freshness.
- Identity assertion algorithm/claim validation, clock skew, replay considerations, and key rotation.
- Queue admission, fair-use controls, bounded concurrency, connection budgets, and spend ceilings.
- Cursor pagination, index/query-plan review, database timeouts, pool monitoring, and autovacuum expectations.
- SLO, RTO, RPO, encrypted backups/PITR, and restore drills.
- Mixed-version deployment, bounded migrations, forward-fix/rollback strategy, and coarse feature flags.
- Frozen lockfiles, dependency and secret scanning, security-update policy, and environment-scoped secret rotation.
- Model/prompt/skill regression evaluations, staged rollout, content-safety behavior, and cost controls.
- Provider acknowledgement-loss and potential duplicate-billing behavior.
- Performance, soak, recovery, and rolling-deployment tests.
- Mass-assignment/response-exposure controls, stored Markdown safety, durable email provisioning/resend, API compatibility, and timezone/DST rules.
- Old-version retention/garbage collection, immutable context history, honest replay guarantees, server-only Astro scope, trusted proxies, and request-bound idempotency.
- Least-privilege worker credentials and authoritative revocation/membership checks behind short-lived identity assertions.
- Fenced worker leases, auditable tool-result snapshots, and correct date-only versus instant timezone semantics.

## Final release decision checklist

Do not declare the backend complete until every item below is evidenced, not merely coded.

- [ ] All critical blockers C1–C5 are closed.
- [ ] High-priority gates H1–H13 have linked test/runbook evidence.
- [x] No browser secret, service key, access token, or refresh token is stored in web storage.
- [x] Cross-account and stale-revision tests pass.
- [x] Phase recipes choose every mandatory skill and reject illegal optional requests at the registry boundary; controlled model actions pass.
- [x] Queue crash/retry/fencing tests show idempotent committed state.
- [ ] Production-like load stays within latency, pool, queue, and spend budgets.
- [ ] Backup restore meets the declared RTO/RPO.
- [ ] Mixed-version deployment and rollback have been rehearsed.
- [x] Deterministic local model/skill release evaluations pass; the real-provider canary remains external.
- [x] Source audit and automated secret/logging controls find no credentials or unnecessary sensitive prompt content.
- [x] Documentation and `map.md` match the actual files and test results.

## Audit result

**Architecture decision: proceed.**

**M7 internal audit decision: complete.** Source, migrations, tests, CI, API boundaries, documentation, and milestone status were reconciled on 2026-10-09; see `m7-final-backend-audit.md`.

**Production decision: not yet approved.** External verification items remain open in `map.md` and the completion checklist in `backend-implementation-context.md`.

Current detailed evidence is maintained in `map.md` and the M1–M7 audit files. The 2026-10-09 M7 pass repeated a fresh PostgreSQL `001`–`010` regression (20 files/61 tests), Astro server-boundary regression (10 files/28 tests), diagnostics, builds, release evaluations, skill audit, dependency/secret scans, and documentation-link reconciliation. Production-like soak, managed PITR/restore, live alerts, hosting rollout, live Google/email/proxy acceptance, and browser E2E remain deliberately external/deferred.
