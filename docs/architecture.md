# Architecture

## System view

```text
Browser
  | secure HttpOnly Better Auth cookie
  v
Astro server / backend-for-frontend ---- PostgreSQL auth tables
  | 60-second EdDSA user assertion             |
  v                                             | durable auth-email jobs
Fastify API <---- scoped smm_ service keys      v
  |                                        PostgreSQL queue
  | state, authorization, enqueue               |
  v                                             v
PostgreSQL <------------------------------- Worker(s)
  |                                             |
  | canonical state                             v
  `--------------------------------------> LLM / email gateway

Optional one-way export: PostgreSQL -> private Obsidian vault
```

Browser requests use a database-backed Better Auth session. Astro validates the session and obtains a 60-second EdDSA assertion directly from Better Auth; the public `/api/auth/token` route is blocked so browser JavaScript cannot retrieve that assertion. Fastify validates the signature, issuer, audience, age, algorithm, user, verification status, active session, and current personal-account membership.

Service keys remain a separate machine principal for the CLI and controlled integrations. They never represent a human approval. Both principal kinds resolve to an organization before account-scoped queries run.

The API, Astro server, and workers are stateless processes apart from bounded connection pools and safe caches. PostgreSQL coordinates identity, membership, workflow state, and queued work, so each process type can scale horizontally. Capacity planning must budget the sum of all process pools against PostgreSQL's connection limit.

The data-access layer uses `pg`, parameterized SQL, and scoped repository/store modules rather than a general-purpose ORM. This keeps transaction boundaries, lock ordering, PostgreSQL constraints, queue claims, and query plans explicit while preventing SQL from leaking into HTTP or orchestration layers. SQL migrations are the only schema authority. This is a current architectural choice, not a permanent ORM ban; any later ORM trial must be incremental and preserve the database guarantees recorded in [ADR 0012](./decisions/0012-explicit-postgresql-over-general-purpose-orm.md).

The application is stateful; the LLM is stateless. Each workspace owns a durable workflow, current phase instance, active conversation, ordered messages, pending-question state, and immutable canonical-context revisions. Provider conversation state is never authoritative. Six source-controlled recipes select mandatory work deterministically. Every newly queued run pins the recipe release, skill bundle, exact skill content, root orchestrator, bridge instructions, and current immutable context-revision IDs.

For each model call, the memory assembler loads only context keys required by the exact pinned recipe step, the newest versioned conversation summary, and a bounded recent window after that summary. The model returns one strict action. The runtime may answer it by persisting a question, executing one step-allowlisted read tool, invoking one step-allowlisted optional skill from the pinned bundle, staging output, or stopping safely. Model text never performs a transition or side effect by itself.

Continuation honors the recipe version recorded on the active durable phase, which keeps in-progress work stable during rolling releases. Once a phase legally transitions, the new phase records the current recipe release so new work can adopt reviewed changes at a clear boundary.

Each reviewable run is one immutable review revision inside a stable review thread. A revision request rejects—but never deletes—the exact reviewed run, records required instructions, and queues a successor with the same recipe, skill bundle, skill content, instruction hashes, and context-revision pins. The successor receives the prior output as untrusted revision input. Approval locks the workspace aggregate, verifies there is no newer review revision, promotes only that run's permitted context proposals, updates artifact/final-post decisions, and advances the phase in one transaction.

Artifacts and final posts are append-only content revisions. Stable logical IDs and parent pointers preserve lineage while decision status identifies the current approved revision. Final posts are structured relational records with sprint/week/local-date/timezone/platform/campaign/topic/format metadata; the filesystem is not canonical storage. Flat keyset-paginated queries and grouped projections serve the eventual low-friction and folder-style views from the same records.

The human-facing `continue` intent contains no skill name or phase-completion flag. The backend finds accepted mandatory steps and selects the next one. A separate service-principal compatibility endpoint still supports controlled machine callers, but Astro does not expose it to the browser.

## Personal-account boundary

The first verified request creates one hidden personal organization and one owner membership in a transaction. A per-user PostgreSQL advisory lock plus unique constraints makes retries and concurrent first requests idempotent. Workspaces continue to reference organizations, so future team support can expand membership without moving workspace foreign keys.

No team, invitation, or role-management UI is enabled now.

## Trust boundaries

1. Repository-owned orchestrator, bridge, recipe, and skill text are trusted developer instructions.
2. Workspace context, URLs, imported material, and run input are untrusted and are sent in the user message.
3. Model output is untrusted structured data. Zod validates its shape and size.
4. Step-scoped allowlists independently validate model-requested tools, optional skills, artifact kinds, and context keys.
5. The runtime alone writes canonical context, changes phase, exports files, or eventually calls external connectors.
6. JWT claims identify a candidate session; current user, session, and membership rows remain authoritative.
7. Transactional email is an external side effect behind a bounded,
   idempotent adapter. Resend is the recommended hosted provider; the generic
   HTTPS webhook remains an explicit alternative.

## Reliability invariants

- A workspace has at most one queued, running, or approval-waiting run.
- A workspace has one durable workflow, one active phase, one active conversation, at most one pending question, and at most one running orchestration transition.
- Composite foreign keys prevent phases, steps, conversations, messages, questions, answers, runs, and context revisions from crossing workspace boundaries.
- Conversation row locks allocate message ordinals; exact question versions and request hashes protect answers from stale tabs and conflicting idempotency reuse.
- Canonical context points to approved immutable revisions, so a worker can load the exact IDs pinned for its work even after newer approvals.
- All 44 discovered skills have exactly one mandatory, optional, internal, or unsupported classification. Optional skills are legal only on an explicit same-phase step allowlist.
- Bundle and recipe records are content-addressed/hashed and insert-only through the application. A run cannot persist a partial release pin, and foreign keys prevent referenced releases from being deleted.
- Workers load pinned trusted text and pinned context revisions. They fail explicitly when a pinned release is missing or its content hash disagrees.
- Workers also load the exact pinned recipe definition; current deployment permissions cannot silently replace a queued run's permissions.
- Model execution is bounded by calls, tokens, duration, optional depth, prompt/memory size, and UTF-8 tool-result bytes.
- Tool requests/results, optional-skill actions, terminal actions, questions, answers, policy rejections, and usage are durable conversation/run records.
- Enqueue, job creation, workspace status, and audit event commit in one transaction.
- Queue claims use `FOR UPDATE SKIP LOCKED`, unique lease owners, renewable expiries, and monotonic fencing tokens. Every worker-owned workflow write validates and locks the current job/run fence before committing; recovery increments the fence so stale results cannot commit.
- Queue admission bounds global depth, per-account active work, daily model tokens, and configured estimated spend. Workers bound total/model concurrency and favor accounts with fewer running jobs after the auth-email priority class.
- Verification and reset email requests are durable and deduplicated by an application idempotency key.
- Auth-email jobs receive priority over queued LLM work so account activation does not wait behind a backlog.
- Delivered or permanently failed auth-email jobs discard recipient, subject, body, and live action links.
- A stale job recovery updates both the queue item and related workflow state in one transaction.
- Reprocessing a job for a terminal run is a no-op.
- Phase changes conditionally update the compatibility workspace phase and durable workflow/phase instances in the same transaction.
- Exact run IDs plus monotonic review revisions prevent a stale tab from approving a successor accidentally; simultaneous approve/revise requests have one database-locked winner.
- Revision requests copy exact release/context pins, keep rejected output, and use an idempotency key bound to the target run and instructions.
- Artifact and final-post revisions have database-enforced same-workspace/same-lineage parent references. Approval supersedes an older approved member only after the new revision wins.
- Final-post lists use bounded keyset pagination and indexed status/platform/sprint/week/campaign/full-text filters. Editorial dates remain explicit local dates with a workspace-timezone snapshot.
- Correlation IDs flow from Astro/Fastify requests through runs, jobs, steps, and provider request headers. Structured logs redact credentials and content; authenticated metrics expose aggregate request, queue, pool, model, workflow, approval, and optional-skill measurements.
- Readiness checks database connectivity, expected migration `017`, and the complete active recipe/skill release, preventing an API with missing schema/release data from becoming ready.
- Migrations are serialized with an advisory lock and checked by SHA-256 checksum.

M6 implements fenced renewable queue leases, bounded/fair admission and concurrency, correlation, authenticated metrics, migration-aware readiness, durable Obsidian export jobs, provider error classification, and operational runbooks. Production-like load/soak, managed alert wiring, encrypted backup/PITR, and hosting restore evidence remain deployment gates rather than claims made by local code.

M8 keeps small product-facing reads and owner commands in `ProductStore`, not
inside orchestration or route handlers. The store owns account scoping,
keyset-cursor validation, optimistic versions, transactions, audit events, and
idempotency receipts. Workflow state exposes only the active run needed for
safe client recovery; it does not turn the client into a workflow engine.

## Recurring content cycles

After the first approved batch, the owner can issue one of three explicit
commands: next week, extra posts, or refresh strategy. The database transaction
locks the account/key and workspace, validates that stable brand memory exists,
records an idempotent receipt, appends a cycle-scoped `calendar.active_brief`,
and advances the durable phase instance. Next-week and extra-post commands
refuse to replace unfinished content work.

Workers receive the active brief together with bounded approved context. The
prompt compiler treats weekly/campaign fields as temporary and preserves
unaffected foundational context. Completion lookup is scoped to the active
phase-instance start, so accepted work from an earlier cycle cannot satisfy a
new one. Library folders remain a UI projection over immutable relational post
records rather than server filesystem directories.

An approved dated calendar table now supplies deterministic slot identities
for scheduled posts. The writer processes bounded three-slot batches; draft
artifacts carry backend-owned slot metadata and become approved intermediate
inputs without a human click per batch. The formatter must return one
structured final post for each exact slot before the Phase 4 review gate can
open. The owner approves the complete final batch. Today reads live slot
progress from the workflow projection rather than hard-coded platform labels.
See [ADR 0016](./decisions/0016-calendar-owned-post-completeness.md) for parser
limits and live acceptance gates.

## Implemented M9 guided-intake architecture

M9 moves ordinary Phase 1 interview progression onto a versioned,
backend-authoritative deterministic path while allowing the frontend to preload
the projection for immediate interaction. A bounded small-model assistant may
prefetch personalized choices and examples for fixed question IDs, but curated
fallbacks keep that provider outside the critical path.

Accepted answers are normalized by a pure versioned compiler into a factual,
provenance-preserving intake packet. Only then will the existing durable worker
invoke the primary model. The packet replaces model-driven basic interviewing in
the social-context step; the implemented six-step Phase 1 recipe remains intact.
The worker, PostgreSQL queue, release pins, fencing, strict output validation,
step output contracts, and approval boundary remain in place. Same-origin SSE is
implemented for content-free progress notification, with canonical reads and bounded
polling as reconnect and compatibility fallbacks.

Adaptive questions outside the guided intake use an explicit persisted
`selection_mode`. The model may mark a question `multiple` only when all
suggestions can coexist; the server validates selected IDs, uniqueness, custom
text, and the question's mode before committing an answer. A per-skill,
per-phase-instance clarification count removes `ask_user` from the allowed
provider schema after two questions when required context is already present.
The client reconciles a stale `workspace_busy` continuation against the
authoritative workflow state rather than reporting a successful answer as a
failed action. Migration `017_question_selection_mode.sql` preserves existing
pending questions as single-choice.

The implementation remains at `VERIFY` pending production-like evidence. The full contract, targets,
frontend obligations, and evidence requirements live in
[`todo/backend-speed-reliability-implementation-context.md`](./todo/backend-speed-reliability-implementation-context.md)
and accepted [ADR 0014](./decisions/0014-deterministic-guided-intake.md).
