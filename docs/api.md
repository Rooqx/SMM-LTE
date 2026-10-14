# HTTP API

## Browser boundary

The browser talks only to Astro on its own origin:

- `/api/auth/*` is the Better Auth handler for registration, verification, sign-in, recovery, Google OAuth, session management, and sign-out.
- `/api/smm/*` is an allowlisted backend-for-frontend proxy.

Astro validates the HttpOnly session and creates a short-lived Fastify assertion for each proxied request. `/api/auth/token` is deliberately not public. Browser code must never call Fastify directly or receive a service key.

The Astro client uses these product contracts through the same-origin BFF. Live
Google, email-delivery, and browser acceptance still require deployment
credentials and remain separate from local contract verification.

## Fastify authentication

Every `/v1/*` endpoint accepts `Authorization: Bearer` with one of two credentials:

- a short-lived Better Auth user assertion from Astro; or
- a scoped `smm_...` service key for controlled machine clients.

Responses use JSON. Errors have the form:

```json
{"error":{"code":"not_found","message":"Workspace was not found"}}
```

Fastify accepts a safe `X-Request-Id` or generates one, returns it on every response, and persists it through runs/jobs/steps. Astro forwards the same opaque ID. Request IDs are for correlation, never authentication.

## Existing endpoints

| Method | Path | Scope | Purpose |
| --- | --- | --- | --- |
| `GET` | `/health` | public | Process liveness |
| `GET` | `/ready` | public | Database, expected migration, active recipe/skill release, and non-secret feature diagnostics |
| `GET` | `/metrics` | dedicated metrics bearer | Aggregate Prometheus operational metrics; disabled when no token is configured |
| `GET` | `/v1/skills` | `skills:read` | List skill metadata |
| `POST` | `/v1/workspaces` | `workspaces:write` | Atomically create a workspace, phase-1 workflow, and active conversation |
| `GET` | `/v1/workspaces` | `workspaces:read` | Cursor-list the caller's workspaces (`limit`, `cursor`) |
| `GET` | `/v1/workspaces/:id` | `workspaces:read` | Read one account-scoped workspace |
| `PATCH` | `/v1/workspaces/:id` | verified user + `workspaces:write` | Version-check and update owner-visible workspace fields |
| `GET` | `/v1/account/preferences` | verified user + `workspaces:read` | Read or initialize the owner's durable preferences |
| `PUT` | `/v1/account/preferences` | verified user + `workspaces:write` | Replace preferences at an expected version |
| `GET` | `/v1/workspaces/:id/context` | `workspaces:read` | Cursor-list canonical context (`limit`, `cursor`) |
| `GET` | `/v1/workspaces/:id/context/history` | verified user + `workspaces:read` | Cursor-list immutable context revisions, optionally filtered by exact key |
| `PUT` | `/v1/workspaces/:id/context` | `workspaces:write` | Upsert one context key |
| `POST` | `/v1/workspaces/:id/continue` | verified user + `runs:execute` | Queue the next mandatory recipe step; accepts only an idempotency key |
| `POST` | `/v1/workspaces/:id/content-cycles` | verified user + `runs:execute` | Idempotently start the next week, an extra-post batch, or an explicit strategy refresh using approved memory |
| `GET` | `/v1/workspaces/:id/workflow` | verified user + `workspaces:read` | Read the durable phase and current pending question |
| `POST` | `/v1/workspaces/:id/interview/start` | verified user + `workspaces:write` | Start or resume the pinned guided intake authority |
| `GET` | `/v1/workspaces/:id/interview` | verified user + `workspaces:read` | Read the authoritative guided interview projection |
| `POST` | `/v1/workspaces/:id/interview/answers` | verified user + `workspaces:write` | Idempotently submit a version-checked guided answer and receive the next projection |
| `POST` | `/v1/workspaces/:id/interview/options/:optionSetId/present` | verified user + `workspaces:write` | Mark an exact option set presented or interacted with |
| `POST` | `/v1/workspaces/:id/interview/options/prefetch` | verified user + `workspaces:write` | Request optional durable personalized choices; returns `queued` or truthful `fallback` |
| `GET` | `/v1/workspaces/:id/runs` | verified user + `workspaces:read` | Cursor-list bounded run history |
| `GET` | `/v1/activity` | verified user + `workspaces:read` | Cursor-list account audit activity, optionally scoped to a workspace |
| `POST` | `/v1/workspaces/:id/questions/:questionId/answer` | verified user + `runs:execute` | Answer the exact question version and idempotently queue the resumed step |
| `POST` | `/v1/workspaces/:id/runs` | service principal + `runs:execute` | Compatibility-only low-level skill run |
| `GET` | `/v1/runs/:id` | `workspaces:read` | Read output, artifacts, and approvals |
| `GET` | `/v1/workspaces/:id/runs/:runId/events` | verified user + `workspaces:read` | Stream coarse content-free SSE progress with durable replay |
| `POST` | `/v1/runs/:id/approve` | verified user + `runs:approve` | Accept current drafts/proposals |
| `POST` | `/v1/runs/:id/reject` | verified user + `runs:approve` | Reject current drafts/proposals |
| `POST` | `/v1/runs/:id/revise` | verified user + `runs:approve` | Reject the exact revision with instructions and queue its pinned successor |
| `GET` | `/v1/workspaces/:id/artifacts` | `workspaces:read` | Cursor-list account-scoped artifact revisions |
| `GET` | `/v1/artifacts/:artifactId` | `workspaces:read` | Read one exact artifact revision |
| `GET` | `/v1/workspaces/:id/final-posts` | `workspaces:read` | Cursor-list/filter flat or grouped structured posts |
| `GET` | `/v1/final-posts/:postId` | `workspaces:read` | Read one exact structured post revision |
| `POST` | `/v1/final-posts/:postId/publication` | verified user + `runs:approve` | Idempotently apply a version-checked publication-state transition |
| `POST` | `/v1/workspaces/:id/exports/obsidian` | `exports:write` | Compatibility synchronous export on a process with the vault mounted |
| `POST` | `/v1/workspaces/:id/exports/obsidian/jobs` | `exports:write` | Idempotently enqueue a durable export for a vault-mounted worker |
| `GET` | `/v1/workspaces/:id/exports/obsidian/jobs` | verified user + `workspaces:read` | Cursor-list workspace export jobs |
| `GET` | `/v1/exports/obsidian/jobs/:jobId` | verified user + `workspaces:read` | Read one account-scoped export job |

The human `continue` request is deliberately small:

```json
{"idempotencyKey":"workspace-step-1"}
```

It returns only the queued run ID, status, and phase. The backend selects the next mandatory step from the active recipe. Browser sessions cannot call the raw `/runs` contract, and Astro's BFF does not allowlist that path. The low-level request still accepts `skillName` and `completePhase` for authenticated service integrations only; it is not a product UI contract. No generic workflow-state tables are exposed over HTTP.

A recurring-content request is also bounded and retry-safe. Examples:

```json
{"mode":"next_week","weekStart":"2026-10-19","nothingChanged":true,"idempotencyKey":"next-week-2"}
```

```json
{"mode":"extra_posts","topic":"Lagos launch","platforms":["linkedin","x"],"quantity":4,"publicationDate":"2026-10-20","instructions":"Mention the early-access offer","idempotencyKey":"launch-extra-1"}
```

Use `{"mode":"refresh_strategy","changes":"Our audience is now enterprise finance teams","idempotencyKey":"strategy-2"}` only for a material change. Next-week and extra-post commands require approved prior posts and a completed content phase. The response contains the new cycle/week, target phase, and first queued run. Reusing a key with changed material conflicts.

The guided client consumes continue, workflow/pending-question reads,
active-run recovery, exact-version answer/resume, exact-run
approve/reject/revise, context history, artifact lineage, preferences,
workspace updates, Obsidian job reads, and structured final-post queries.
Astro's server-only proxy allowlists these product routes and continues to block
the raw skill-run route.

An answer request is explicit and retry-safe:

```json
{
  "expectedVersion": 1,
  "answer": { "type": "option", "optionId": "generate-leads" },
  "idempotencyKey": "workspace-question-1"
}
```

Use `{ "type": "custom", "text": "..." }` for the user-written option. A successful response includes the committed answer identity and the queued resumed run. Replaying the same material request returns the same answer and run; stale versions or changed material conflict.

Adaptive questions include `selection_mode: "single" | "multiple"` in the workflow response. For `multiple` questions, send `{ "type": "multiple", "optionIds": ["id-a", "id-b"], "text": "Optional own answer" }`. IDs must be unique and belong to that question; text may be omitted. Single-choice questions reject this shape. The guided-intake `/interview/answers` contract is separate and unchanged.

The compatibility context `PUT` appends an approved immutable revision, advances the canonical pointer, and returns `revision_id` with the current value. Product approval promotes only the proposals carried by the exact run in the URL. If a newer member of that review thread exists, the older run cannot be approved.

A revision request is explicit and retry-safe:

```json
{
  "expectedReviewRevision": 1,
  "instructions": "Make the promise more specific and shorten the opening.",
  "idempotencyKey": "review-profile-1"
}
```

The response identifies the queued successor, its stable review thread, revision number, and the run it supersedes. Reusing the same key with the same target/instructions returns that successor; changed material conflicts. Rejection preserves history and does not promote canonical context.

Artifact query parameters are `limit`, `cursor`, `status`, `kind`, `logicalId`, and `search`. Filtering by `logicalId` is the bounded revision-history contract.

Workspace pages return `{ "workspaces": [...], "nextCursor": "..." }`; context pages use `{ "context": [...], "nextCursor": "..." }`. Limits are capped at 100. The Obsidian job endpoint accepts `{ "idempotencyKey": "..." }` and returns `202` with the durable job ID/status. Reusing the same account/key returns the existing job.

Final-post query parameters are `limit`, `cursor`, `status`, `platform`, `sprint`, `week`, `campaign`, `dateFrom`, `dateTo`, `search`, and `view=flat|grouped`. Pages are ordered by local editorial date, creation time, and ID using an opaque cursor. Each row includes copy-ready content, local date, ISO weekday, timezone snapshot, format, pinned comment, approval/publication status, and lineage IDs. `view=grouped` adds sprint/week/day groups while retaining the same bounded `items` page.

Workspace and preference mutations carry `expectedVersion`; stale clients
receive HTTP 409 and must refresh. Publication commands carry both
`expectedVersion` and an `idempotencyKey`. Allowed transitions are
`not_scheduled -> scheduled`, `scheduled -> published|failed|cancelled`,
`failed -> scheduled|cancelled`, and `cancelled -> scheduled`. Published is
terminal. Reconfirming the current state is recorded idempotently without
advancing the version. These status commands record product state only; an
external publishing connector is still a separate integration.

Approval attribution comes from the authenticated principal. Request bodies accept only documented fields; callers cannot provide an audit actor or organization ID.
