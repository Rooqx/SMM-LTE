# Database and queue

## Ownership

PostgreSQL is authoritative for:

- Better Auth users, provider accounts, sessions, verification tokens, JWKS keys, and rate limits;
- personal organizations and owner memberships;
- service API keys, workspaces, context, runs, steps, approvals, artifacts, usage, jobs, and audit events;
- durable workflow/phase/step state, conversations, messages, summaries, pending questions, answers, and immutable context revisions;
- immutable recipe definitions, complete trusted skill bundles, and exact run-to-context release pins.
- exact review-thread revisions, immutable artifact lineage, and structured final-post revisions.
- owner preferences, publication command receipts, publication versions, and
  product-facing history read models.
- one pinned Phase-1 interview authority plus versioned guided-interview
  sessions, option sets, answer provenance, and immutable supersession history.

Obsidian remains an export view, not a second database.

## Data-access approach

Application persistence uses `pg`, parameterized SQL, and scoped repository or store modules. SQL is kept behind these boundaries rather than embedded in route handlers or orchestration services. Explicit SQL is intentional because correctness depends on visible transaction boundaries, lock order, queue-claim semantics, PostgreSQL-specific constraints and indexes, and atomic multi-table state transitions.

The project does not currently use a general-purpose ORM. Adding one across the whole backend would not remove the specialized SQL and would introduce a second abstraction and potentially a second migration authority. A future bounded ORM pilot is allowed if it baselines the existing schema, begins with low-risk CRUD, preserves the current constraints and transaction behavior, and passes concurrency and query-plan checks. [ADR 0012](./decisions/0012-explicit-postgresql-over-general-purpose-orm.md) records the complete rationale and reassessment criteria.

## Authentication invariants

- User email uniqueness is case-insensitive.
- Better Auth adapter columns use the exact quoted camel-case names expected by Better Auth 1.7.7.
- One `account_memberships.user_id` row gives a user one personal account.
- One unique `organization_id` gives a personal account one owner.
- The first verified request locks by user ID, rechecks the user/session, and creates the organization, membership, and audit event atomically.
- Sessions and memberships are read on every Fastify user request; JWT claims do not replace database authorization.
- Auth-email idempotency keys are unique. Pending/retryable jobs retain the delivery payload; completed or dead jobs retain only non-secret type/idempotency/disposal metadata.

The narrow membership uniqueness constraints can be changed additively when team support becomes a real requirement. Workspace ownership already points to organizations and does not need to be rewritten.

## Workflow-memory invariants

- Workspace creation writes the workspace, recipe `1.0.0` workflow, phase-1 instance, active conversation, and audit event in one transaction.
- Composite foreign keys carry `workspace_id` (and phase/workflow IDs where needed), preventing relationships from crossing accounts' workspaces at the database layer.
- Partial unique indexes allow one active phase, one active conversation, one pending question, and one running orchestration transition per workspace/workflow.
- Message ordinals are unique per workspace and allocated while locking the active conversation. Summaries declare a versioned inclusive ordinal range; the repository verifies that every source message exists.
- Question answers target one exact question row/version. The same workspace-scoped idempotency key replays only when its SHA-256 request hash matches; different material input conflicts.
- Migration `017` adds `pending_questions.selection_mode` with a `single` default for existing questions. Multi-select answers are validated against that stored mode and the exact option IDs before the answer is recorded.
- `workspace_context_revisions` is append-only history. The existing `workspace_context` row is the canonical read model and points to its exact approved revision through a composite foreign key.
- Workers can load an allowlisted set of approved revision IDs. They do not infer historical content from a later canonical row.
- Prompt retrieval loads the newest summary and only a bounded post-summary message window; full messages remain authoritative for audit.
- Runtime action projections and exact bounded tool results are appended under the active conversation lock. Large artifact bodies stay in run/artifact rows.
- Answer submission and the resumed run use separate durable idempotency keys linked by the committed answer ID, so a process failure between them is safely replayable.
- Phase transitions update `workspaces`, complete the old `phase_instances` row, create the next active phase, and advance `workflow_instances` in one transaction.

## Recipe and bundle invariants

- `recipe_versions` identifies one phase definition by suite, suite version, phase, recipe ID, and definition hash.
- `skill_bundles` stores the exact trusted orchestrator and bridge text; `skill_bundle_entries` stores all 44 exact skill texts and hashes.
- A new run stores a complete all-or-nothing release pin. Composite foreign keys verify that its recipe/phase and bundle/skill/hash combination exists.
- `workflow_run_context_revisions` captures every current canonical revision in the enqueue transaction. Later context approvals cannot alter a queued run's prompt inputs.
- Registration is idempotent but never overwrites a same-version row. Startup verifies persisted counts and hashes against source-controlled definitions. Execution validates and loads the exact pinned recipe definition rather than substituting the current process recipe.
- Foreign keys use `ON DELETE RESTRICT`, so even terminal audit records prevent accidental release deletion. No automatic release garbage collector exists; future retirement requires an explicit retention policy and checked operator procedure.

## Guided-interview invariants

- `interview_authorities` gives each workspace exactly one Phase-1 authority:
  `legacy` or `guided`. Existing Phase-1 run/question history pins legacy; the
  application never dual-writes both paths implicitly.
- Guided authority and session rows pin a source-controlled questionnaire ID and
  semantic version through a composite foreign key. Older releases remain in
  the code catalog while sessions reference them.
- One partial unique index permits one in-progress guided session per workspace.
  Workspace and session row locks serialize authority selection, session start,
  option replacement, and answers across API replicas.
- Option sets preserve origin, canonical application-assigned IDs, content hash,
  bounded options, and model/provider/prompt-version provenance where applicable.
  Presentation and first-interaction timestamps distinguish prefetched options
  from choices the user actually saw or touched. A partial unique index permits
  one active set per session/question, and interacted sets cannot be replaced.
- Every answer references the exact option set shown, stores selected IDs and
  labels plus exact custom text, binds an idempotency key to a request hash, and
  records the resulting session version.
- Editing an answer appends a new row and marks the predecessor superseded;
  active-answer uniqueness prevents two concurrent winners.
- All repository reads and writes join or lock through the account-scoped
  workspace. Resume uses one repeatable-read snapshot so session, options, and
  answers cannot come from different moments.

## Review and content invariants

- `workflow_runs.review_thread_id` is stable across a requested revision; `review_revision` is monotonic inside that workspace/thread and `supersedes_run_id` is constrained to the same workspace/thread.
- The run ID is the exact review-revision identifier. Decision transactions lock the workspace first, then the run, reject non-pending or older thread members, and produce one winner under simultaneous approve/revise requests.
- A revision request rejects the reviewed run and its draft children, records instructions and attribution, copies the exact release/context pins, writes the successor run and job, and marks the workspace running in one transaction.
- Approval promotes only the reviewed run's allowed context proposals. Context revision append, artifact/post decision, approval row, run decision, phase transition, and audit event share the transaction.
- `artifacts.logical_id` and `final_posts.logical_id` remain stable. Composite parent foreign keys require the same workspace and logical identity; revision numbers are unique within that lineage.
- Approved predecessors become `superseded` only when a newer revision is approved. Rejected and superseded rows are retained.
- Final posts store an editorial `date` plus the validated workspace IANA timezone snapshot; they do not invent a UTC midnight. ISO weekday is derived from the date itself.
- Final-post pagination uses `(local_date, created_at, id)` keysets. Indexes cover the cursor, status, platform, sprint/week, campaign, and generated full-text document. Every public page is capped at 100 rows.

## Queue lifecycle

```text
queued -> running -> completed
              |
              +-> failed -> running (retry)
              |
              `-> dead (permanent error or attempt limit)
```

Claims use `FOR UPDATE SKIP LOCKED`. Each claim receives a unique owner, renewable expiry, and monotonically increasing token. Workflow runs copy that token as their execution fence; every worker-owned persistence transaction validates the live job/run fence. Recovery locks an expired attempt, increments its token, and atomically reconciles the run before another claim. Late completion/failure from the old owner is rejected. Attempt outcomes are recorded without storing prompt or payload bodies.

Auth email is a small priority class so activation and recovery are not trapped behind an LLM backlog. Other claims favor accounts with fewer running jobs before creation time. Retry delay is bounded exponential backoff with jitter. Email provider requests carry the same idempotency key across retries. Dead jobs are listed/retried through the operator CLI; terminal auth email bodies are deliberately disposed and cannot be replayed.

The existing workflow transaction boundaries remain unchanged: enqueue, completion, approval, and stale recovery each keep related state and audit mutations together. Model calls and email calls happen outside database transactions and therefore rely on idempotent delivery plus terminal-state handling.

## Product-contract invariants

- One `account_preferences` row belongs to the personal organization and its
  owner. Updates require the current positive version.
- Workspace owner updates lock the account-scoped workspace and compare its
  current version before changing the allowlisted name or timezone fields.
- Product read models use bounded keyset cursors and preserve organization and
  workspace scope in every query.
- `final_posts.publication_version` protects concurrent publication-state
  decisions independently of immutable content revision lineage.
- `product_command_receipts` binds an account/idempotency key to one command,
  request hash, and bounded response. Reusing a key for changed material is a
  conflict.
- A same-state publication confirmation does not increment the publication
  version; a real transition increments once and both cases are auditable.

## Connections and timeouts

Astro reuses one bounded auth pool across hot reloads. Fastify and workers use their own bounded pools. Statement, query, connect, idle, provider, and assertion-JWKS timeouts prevent indefinite resource retention. Deployment sizing must keep the combined maximum below the database connection budget.

## Migrations

Run `pnpm run migrate` before a release. Migrations are serialized by an advisory lock and each applied file's SHA-256 checksum is recorded. Never edit an already deployed migration; add a new numbered migration.

Migrations `004`–`011` establish authentication, durable workflow memory, release pins, exact review/content lineage, fenced operations, and product contracts. Migration `012` adds one-authority guided-interview state and immutable answer provenance; `013` adds compiled intake, option cache, and durable option jobs; `014` adds run progress; `015` enforces run/workspace progress integrity and retry-safe option-job deduplication; `016` makes deduplication batch-aware and tightens option-job identifiers; `017` adds adaptive question selection mode with a safe single-choice default. Production-volume rehearsal remains an explicit verification gate. Drain pre-M6 workers before `010`, and apply all migrations through `017` before deploying code whose readiness target expects current state.
