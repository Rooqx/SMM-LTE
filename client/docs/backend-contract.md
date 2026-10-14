# Browser/backend contract

The Astro BFF exposes only the Fastify routes required by the owner-facing
product. The backend remains authoritative for authorization, skill selection,
phase transitions, workflow state, output staging, and approval effects.

## Allowed product routes

| Method | Route | Product use |
| --- | --- | --- |
| `GET` | `/health`, `/ready` | Protected diagnostics only |
| `GET`, `POST` | `/v1/workspaces` | Cursor-paginated selection and creation |
| `GET` | `/v1/workspaces/:id` | Exact workspace read |
| `PATCH` | `/v1/workspaces/:id` | Version-checked workspace owner update |
| `GET`, `PUT` | `/v1/account/preferences` | Durable, version-checked owner preferences |
| `GET` | `/v1/workspaces/:id/workflow` | Today phase, cycle, and pending question |
| `GET` | `/v1/workspaces/:id/runs` | Bounded run history |
| `GET` | `/v1/activity` | Bounded account/workspace audit activity |
| `POST` | `/v1/workspaces/:id/continue` | Backend-selected next step |
| `POST` | `/v1/workspaces/:id/questions/:id/answer` | Versioned option/custom answer |
| `GET` | `/v1/runs/:id` | Known-run status and review output |
| `POST` | `/v1/runs/:id/approve` | Approve the current output revision |
| `POST` | `/v1/runs/:id/reject` | Reject the current output revision |
| `POST` | `/v1/runs/:id/revise` | Idempotent, version-checked revision request |
| `GET` | `/v1/workspaces/:id/context` | Cursor-paginated approved Brand memory |
| `GET` | `/v1/workspaces/:id/context/history` | Bounded immutable Brand revisions |
| `GET` | `/v1/workspaces/:id/artifacts` | Cursor-paginated artifact/review inventory |
| `GET` | `/v1/artifacts/:id` | Exact artifact detail |
| `GET` | `/v1/workspaces/:id/final-posts` | Filtered flat/grouped post inventory |
| `GET` | `/v1/final-posts/:id` | Exact final-post detail |
| `POST` | `/v1/final-posts/:id/publication` | Idempotent, versioned publication-state command |
| `POST` | `/v1/workspaces/:id/exports/obsidian/jobs` | Durable idempotent export enqueue |
| `GET` | `/v1/workspaces/:id/exports/obsidian/jobs` | Bounded export-job history |
| `GET` | `/v1/exports/obsidian/jobs/:id` | Exact export-job status |

Better Auth account operations remain same-origin under `/api/auth/*`. Browser
JavaScript never receives the EdDSA Fastify assertion.

## Explicitly blocked browser capabilities

- raw skill listing or execution;
- direct `POST /v1/workspaces/:id/runs` enqueue;
- direct context writes;
- synchronous Obsidian filesystem export;
- arbitrary upstream paths or methods.

This is a security and product boundary: Today asks the backend to continue,
and the backend decides which allowed skill and phase action is correct.

## State and concurrency semantics

- The question answer includes the exact backend question version.
- Continue, answer, revise, and export mutations use idempotency keys. The same
  user intent retains its key after timeouts, throttling, or server failures;
  changed input receives a new key.
- Review revision requests include the expected review revision. HTTP 409 is a
  stale-state signal; the client refreshes authoritative run/workflow data.
- Approval may apply context, approve artifacts, and advance a gated phase, so
  Today invalidates workflow, run, context, artifact, final-post, and workspace
  caches as applicable.
- A run UUID in the Today URL is a resume pointer, not authority. Its fetched
  `workspace_id` must match the selected workspace.
- Workflow state exposes the current active run, so a fresh authenticated tab
  can recover queued/running/review work without client storage.
- Generated output remains pending until the backend decision succeeds.
- Workspace, preference, and publication mutations compare explicit versions.
  Publication retries also reuse the same idempotency key.

## Remaining contract gaps shown honestly

| Missing contract | Current product behavior |
| --- | --- |
| Notification decisions/unread state | Audit activity is history, not a notification inbox; the shell states notifications are unavailable and routes action back to Today |
| Guided Brand-area improvement intent | Brand links back to Today; it never chooses a skill or writes context |
| External social publishing | Publication commands track approved state transitions; no third-party scheduler/publisher is implied |

## Recommended backend evolution

1. Add a dedicated notification decision/unread contract only when the product
   needs an inbox separate from Today.
2. Add a backend-controlled Brand improvement intent if direct area-specific
   coaching becomes necessary.
3. Add external publishing connectors behind durable outbox jobs and provider
   idempotency; keep publication state separate from connector delivery.
4. Keep the current normalized error envelope, explicit versions, cursor pages,
   and idempotency requirements. Consider server-sent run events only after the
   read models are stable.
