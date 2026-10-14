# M7 final backend audit and reconciliation

Audit date: 2026-10-09  
Scope: Fastify backend, PostgreSQL schema and queue, worker, model boundary,
server-only Astro authentication/BFF boundary, tests, CI, and engineering
documentation. Frontend UI changes and browser end-to-end execution were
explicitly excluded.

## Verdict

M7 is **complete as an internal audit and reconciliation milestone**. The
implemented backend through M6 is coherent, builds cleanly, and passes fresh
unit, integration, release-evaluation, dependency, secret, migration, and
server-boundary checks. No backend source defect was found that required a code
change during M7.

This is not a production-release approval. M1 still needs live Google, email,
public proxy/TLS, and browser acceptance. M6 still needs production-like
volume/soak evidence, managed PITR and a timed restore, live alert delivery,
capacity approval, and a hosting rollout/rollback rehearsal. The incomplete
items listed below remain deliberately open rather than being converted into
paper compliance.

## What was reconciled

- The source inventory, ten migrations, twenty backend test files, ten Astro
  test files, package scripts, CI workflow, API capability list, milestone map,
  ADRs, runbooks, and M1-M6 audit records were compared.
- The authoritative checklist was updated from its pre-implementation M1 state
  to the behavior now implemented and locally evidenced.
- Locally verified controls and external production acceptance are recorded
  separately. An internal pass does not imply that a third-party provider,
  public proxy, managed database, monitoring service, or production volume has
  been exercised.
- PostgreSQL remains authoritative; APIs and workers remain stateless; the LLM
  remains stateless between calls; typed recipes and the runtime retain control
  of phase transitions, approval, persistence, retries, and side effects.
- No Docker dependency, general-purpose ORM, vector database, Redis queue,
  generic workflow engine, team-management surface, or publishing connector
  was introduced.

## Fresh verification evidence

| Check | Result | Evidence and limit |
| --- | --- | --- |
| Backend typecheck | PASS | `pnpm run typecheck` completed with no TypeScript diagnostics |
| Fresh PostgreSQL regression | PASS | Disposable PostgreSQL 16 database; migrations `001`-`010`; 20 files and 61 tests passed |
| Backend build | PASS | Production TypeScript build and migration copy completed |
| Release evaluation | PASS | 5 files and 15 deterministic recipe/registry/action/compiler/memory tests passed |
| Skill registry audit | PASS WITH INFO | 44 skills; phase counts 6/8/14/6/4/6; only documented legacy-path and host-question references |
| Secret scan | PASS | No known secret pattern found in source-controlled project files |
| Backend dependency audit | PASS | No known vulnerability at the configured high-severity threshold |
| Astro diagnostics | PASS | 69 files; zero errors, warnings, or hints |
| Astro server-boundary regression | PASS | Separate migrated PostgreSQL database; 10 files and 28 tests passed |
| Astro production build | PASS | Node server output built successfully |
| Astro dependency audit | PASS | No known vulnerability at the configured high-severity threshold |
| Documentation links | PASS | 42 Markdown files checked; no broken relative local links |
| Browser E2E | NOT RUN | Deliberately deferred to the complete procedure in `docs/testing.md` |

The first disposable-database command inherited `DATABASE_SSL=true` from the
developer environment while the isolated local server did not offer TLS. That
run stopped with one harness-configuration failure after 19 files/57 tests had
passed. The database was recreated, `DATABASE_SSL=false` was set explicitly,
and the authoritative clean run passed all 20 files/61 tests. No application
source change was needed.

## Definition-of-done reconciliation

| Area | Status | Reconciled result |
| --- | --- | --- |
| Product workflow | INTERNAL-PASS | New workspaces start phase 1; one pending action is exposed; six phases, phase 6 to 2 loop, review, revision, artifacts, and posts are runtime-owned |
| Authentication core | INTERNAL-PASS | PostgreSQL Better Auth, opaque cookies, email/password lifecycle, short EdDSA assertions, current session/membership checks, personal owner provisioning, user/service separation, and redaction pass source and automated review |
| Authentication providers/edge | EXTERNAL-PENDING | Live Google, real email delivery, public TLS/proxy behavior, linking, distributed abuse controls, and browser acceptance require staging inputs |
| Recipe and skill engine | INTERNAL-PASS | Six typed recipes, 44 explicit classifications, deterministic mandatory routing, allowlisted optional requests, bounded actions, and exact immutable release pins pass |
| Version retirement | OPEN | Old versions are retained and protected while referenced; automated garbage collection must not be added until database-reference and retention checks are implemented |
| Memory and content | INTERNAL-PASS | Bounded relational memory, immutable context/artifact/post revisions, exact retrieval, safe Markdown rendering boundary, timezone grouping, and non-authoritative Obsidian export pass |
| Retry and concurrency safety | INTERNAL-PASS WITH FOLLOW-UP | Queue/run/answer/revision/export paths bind retry identity and reject conflicting reuse; fenced jobs and exact review winners pass. Do not automatically retry workspace creation or direct compatibility mutations until their explicit idempotency contract is added |
| Operations | INTERNAL-PASS | Bounded pools/timeouts/concurrency/admission/spend, readiness, metrics, dead-job tools, local load smoke, logical restore procedure, CI scans, and runbooks exist |
| Production performance/recovery | EXTERNAL-PENDING | Production-like query plans, autovacuum behavior, soak, managed PITR, approved RTO/RPO, live alerts, and total replica connection budget remain unproven |
| Deployment/model release | INTERNAL-PASS WITH EXTERNAL GATE | Additive migrations, release readiness, retained bundles, rollback instructions, and deterministic evaluations pass; real mixed-version rollout, JWKS overlap, provider canary, and hosting rollback remain external |
| Security verification | PARTIAL | Session revocation, account isolation, action allowlists, limits, redaction, output schemas, and non-executable Markdown are tested. The complete browser CSRF/linking and stored-content prompt-injection corpus remains an external/follow-up gate |
| Documentation | PASS | Current architecture, security, database, API, operations, testing, ADR, runbook, milestone, and audit documents agree with source and preserve explicit limitations |

## Senior engineering assessment

### Security

The trust boundaries remain narrow and understandable. Browser credentials end
at Better Auth; the browser cannot obtain the service key or internal JWT; the
BFF has an explicit route capability list; Fastify revalidates user, session,
membership, account scope, scopes, and principal kind; and model output is
schema-validated before it can propose an action. SQL values are parameterized,
filesystem export paths are contained, logs and metrics avoid content-bearing
labels, and stored Markdown is rendered without raw HTML execution.

Remaining provider, proxy, CSRF, account-linking, secret-rotation, and
prompt-injection risks need the named staging/browser tests. They are not
correctly solved by adding more authentication code locally.

### Scalability and performance

The current modular monolith is the appropriate level of complexity. Stateless
API/worker replicas coordinate through PostgreSQL; cursor pagination, bounded
prompt assembly, fair queue admission, per-account/global concurrency, spend
ceilings, and explicit pool budgets prevent accidental unbounded growth. Redis,
a separate vector service, microservices, or a workflow DSL would add
operational cost without current evidence of need.

Replica count must remain a capacity decision because each process owns a pool.
Before production scale is claimed, run the documented multi-route load and
soak tests against representative volume and review query plans, locks, pool
waits, table churn, index growth, and autovacuum.

### Reliability

Transactions own authoritative state changes and never span model or filesystem
calls. Queue delivery is at-least-once with renewable fenced leases, bounded
retries, late-result denial, and durable audit events. Immutable version pins
allow queued and delayed work to keep its intended instructions. Logical local
restore evidence validates the procedure, but only the selected managed
database can prove PITR and the approved recovery objectives.

### Maintainability

Responsibilities remain separated into small auth, recipe, registry, memory,
tool, orchestration, queue, content, provider, and export modules. Comments
primarily explain security, concurrency, and lifecycle invariants. Explicit SQL
keeps lock and transaction behavior reviewable, and ADR 0012 records why a
general-purpose ORM was not introduced. Future work should preserve these
boundaries and resist turning recipes into a generic rules engine.

## Open gates after M7

1. Complete the M1 live Google, email-provider, public proxy/TLS, linking, and
   browser acceptance scenarios.
2. Run the full stored-context/imported-analytics/prior-post/tool-result prompt
   injection and mutation-limit security corpus.
3. Add safe bundle/version retirement only when retention policy requires it;
   deletion must prove that no live, retryable, approval-waiting, or resumable
   workflow references the version.
4. Complete production-like query-plan, autovacuum, capacity, saturation, and
   soak evidence with the intended replica/pool topology.
5. Approve SLO, RTO, RPO, retention, and spend budgets; enable managed encrypted
   backups/PITR and pass a timed restore.
6. Connect and fire production alerts, then rehearse staged mixed-version
   rollout, model/provider canary, worker drain, forward-fix, and rollback.
7. Execute the separately documented browser E2E suite. This remains outside
   the backend-only implementation task.

## Final decision

**M7 decision: DONE.** The final internal backend audit and documentation/source
reconciliation are complete.

**Production decision: NOT APPROVED YET.** M1 and M6 remain `VERIFY` until their
external evidence gates pass. No remaining item justifies speculative backend
infrastructure; the next work is acceptance and operational evidence.
