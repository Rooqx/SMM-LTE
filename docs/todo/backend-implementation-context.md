# Backend implementation context and completion contract

Status: planned M1-M6 implementation and the M7 internal audit are complete;
named follow-up and external production gates remain open.

Last reviewed: 2026-10-11.

Implementation note (2026-10-09): M2 through M5 and the M7 internal audit are complete. M6 is internally implemented and verified, but remains `VERIFY` for production-like soak/query-plan evidence, managed PITR/restore, live alert wiring, and hosting rollout/rollback rehearsal. M1 remains `VERIFY` for external Google/email/proxy/browser acceptance. `map.md` and the milestone audit documents are the authoritative evidence ledger; M7 completion is not a production-release approval.

Follow-up note (2026-10-11): production-like browser testing exposed an
unacceptably slow and failure-sensitive Phase 1 question path. The agreed M9
replacement—backend-owned deterministic questions, non-blocking personalized
options, a pure intake compiler, reduced primary-model use, and matching frontend
work—is specified separately in
[`backend-speed-reliability-implementation-context.md`](./backend-speed-reliability-implementation-context.md).
That document adds work; it does not retroactively change the implementation
status recorded here.

This is the authoritative handoff for the next backend implementation cycle. It records the product intent, decisions already agreed with the project owner, current implementation gaps, implementation order, security boundaries, tests, and completion criteria. A future engineer or agent must read this document together with `ORCHESTRATOR.md`, `BRIDGE_CONFIG.md`, and the existing backend documentation before changing the backend.

## 1. Scope and constraints

This document covers the backend only. Frontend redesign is a separate task, although the backend contracts described here are designed to support the intended simple, guided UI.

“Backend” includes server-only Astro backend-for-frontend code required to terminate Better Auth sessions and call Fastify. In this repository that code physically lives under `client/src/lib/server/` and `client/src/pages/api/`, but it must contain no browser UI behavior and must never expose its secrets to client bundles. All orchestration/domain logic remains in `backend/`.

Locked constraints:

- The product is an **autopilot social-media-management agent** that should behave like a capable human social media manager.
- PostgreSQL is the authoritative application database.
- The LLM is stateless between calls; the application is stateful.
- The application runtime, not the LLM, owns authorization, persistence, phase transitions, approval gates, retries, and side effects.
- The backend chooses mandatory skills. The LLM may request only optional skills that the current phase explicitly allows.
- Core skills remain source-controlled `SKILL.md` files.
- No separate vector database is required initially.
- No Docker setup will be introduced.
- Use `pnpm` for package installation and project scripts when this work is implemented. Existing documentation that still says `npm` should be updated during implementation.
- Keep the implementation simple and product-specific. Do not build a generic visual workflow system, BPMN engine, or user-defined workflow language.
- The initial product has one owner per account. There are no invitations, teams, or user-facing organization controls yet.
- Preserve a clean migration path to team accounts without moving every workspace later.

## 2. Product outcome

A user signs up with email/password or Google, creates a workspace, and is taken directly into guided work. The backend automatically starts or resumes the correct phase. It asks adaptive questions, generates a reviewable output, accepts approval or revision instructions, saves approved information, and continues through the six-phase SMM lifecycle.

The user should not need to know skill names, prompt files, context keys, run IDs, or orchestration internals.

The six phases are:

1. Discovery and onboarding.
2. Strategy and calendar.
3. Creative production.
4. Quality control and scoring.
5. Repurposing and distribution.
6. Analytics and feedback, which loops back to phase 2.

The intended progression remains the authoritative transition contract from `ORCHESTRATOR.md`:

| Phase | Completion gate | Next phase |
| --- | --- | --- |
| 1. Onboarding | Approve brand voice and audience blueprint | 2 |
| 2. Strategy and calendar | Approve weekly topics, hooks, and formats | 3 |
| 3. Creative production | Automatic after all required drafting steps succeed | 4 |
| 4. QC and scoring | Approve final drafts | 5 |
| 5. Repurposing | Approve repurposed batch | 6 |
| 6. Analytics and feedback | Approve strategy calibration | 2 |

## 3. What exists today

The current backend already provides a strong base:

- Fastify API and a separate worker process.
- PostgreSQL persistence and a PostgreSQL-backed queue.
- Tenant-scoped service API keys.
- Workspaces with a current phase and status.
- Skill discovery from numbered phase folders.
- Skill metadata validation and content hashing.
- Cross-phase skill rejection during enqueue and execution.
- Prompt compilation from the root orchestrator, bridge instructions, one selected skill, and phase-filtered workspace context.
- Strict model-output validation with Zod.
- Draft artifacts and proposed context updates.
- Approval and rejection records.
- Retry, stale-lock recovery, idempotency, audit events, and model-usage records.
- Optional one-way Obsidian export.
- A provider boundary with mock and OpenAI implementations.

Important current limitation: the API caller submits `skillName` and `completePhase`. The backend confirms that the skill belongs to the current phase, but it does not determine whether that skill is the correct next skill inside the phase. It also does not yet enforce every prerequisite, required step, output contract, or revision loop described below.

Additional current limitations that the implementation must not overlook:

- The skill registry is loaded once in each API/worker process; skill changes require a process restart.
- API and worker processes can temporarily have different skill/orchestrator files during a mixed deployment.
- A queued run primarily identifies a skill by name. The worker resolves that name from its current registry, so deployment changes between enqueue and execution are not yet pinned strongly enough.
- Prompt snapshots record the version that was actually compiled, but do not prove that it is the version intended when the request was enqueued.
- `ORCHESTRATOR.md` and `BRIDGE_CONFIG.md` are cached per process and are not currently pinned as one immutable release bundle with the run.
- The existing phase table defines gates and next phases, but not the complete ordered recipe within each phase.
- Authentication is currently service-key oriented, and the frontend's shared access password is not a real user identity system.

## 4. Target system boundaries

```text
Browser
  |
  | Secure HttpOnly session cookie
  v
Astro backend-for-frontend / Better Auth
  |
  | Very short-lived, signed internal user assertion
  v
Fastify API
  |-- authorization and account isolation
  |-- SMM phase controller
  |-- memory/context assembler
  |-- recipe and skill registry
  |-- artifact and post queries
  |
  +----------> PostgreSQL (authoritative state and queue)
  |
  `----------> Worker(s) ----> LLM provider
                         `---> future approved connectors
```

The browser must never receive the backend service key, a Google client secret, a database credential, or a long-lived application refresh token.

## 5. Authentication and identity

### 5.1 Authentication library

Use Better Auth, self-hosted against the existing PostgreSQL database.

Required sign-in methods:

- Email and password.
- Google sign-in.

Required account features:

- Email verification before normal product use.
- Forgot-password and password-reset flow.
- Sign out.
- Session listing/revocation when supported by the selected Better Auth integration.
- Safe account linking so a verified Google identity and password identity for the same person do not silently create conflicting owners.
- Generic public errors for login, registration, verification, and reset requests to reduce account enumeration.

Use Better Auth's reviewed password hashing and verification path rather than creating a custom password store. Configure a documented password policy that balances strength and usability, and ensure reset/verification tokens are single-purpose, short-lived, and invalidated after successful use. Email delivery must sit behind a small server-side adapter so changing email providers does not change authentication-domain code. Delivery failures must not create a half-provisioned owner account.

Verification/reset email requests should be durably recorded or enqueued when reliability requires it, with deduplication, bounded retries, and abuse limits. A pending unverified auth identity may exist, but the personal account/workspace must not be provisioned until the verification/account-provisioning transaction succeeds. Resend must be safe and must not create another owner.

Google OAuth configuration must use exact environment-specific callback URLs and Better Auth's state/nonce/PKCE protections. Request only identity scopes needed for sign-in. Do not request Google Drive, Calendar, posting, or offline scopes as part of ordinary login.

Better Auth is free and MIT-licensed when self-hosted. Its optional managed infrastructure is not required. External costs may still exist for PostgreSQL hosting, email delivery, domain/TLS, LLM use, and future third-party APIs.

### 5.2 Browser session design

Use Better Auth's database-backed opaque session and a cookie with production-safe properties:

- `HttpOnly`.
- `Secure` in production.
- Host-only unless a reviewed deployment topology requires otherwise.
- An intentional `SameSite` policy compatible with the Google callback while protecting normal mutations.
- A bounded absolute expiration.
- A bounded idle/update period.
- Revocable from the database.

Keep Better Auth's cookie session cache disabled initially so revocation is checked against authoritative server state. If measured database load later justifies enabling it, document the maximum revocation delay, keep the cache lifetime short, and bypass the cache for approvals, password/account changes, session management, and other sensitive operations.

Require a fresh/revalidated session for sensitive actions such as changing credentials, linking an identity, revoking other sessions, deleting/exporting account data, rotating service keys, or approving actions that will eventually publish content. Do not trust an old page load as proof of freshness.

Do not store an auth token in `localStorage` or `sessionStorage`.

Do not create a browser-visible access-token/refresh-token pair for this first-party web application. This avoids a second token lifecycle and reduces replay and storage risk.

### 5.3 Astro-to-Fastify identity

The Astro server validates the Better Auth session and obtains or creates a very short-lived signed identity assertion for Fastify. The assertion:

- Is created server-side and never exposed to browser JavaScript.
- Has a short expiration target, initially 30–60 seconds.
- Contains only required claims such as subject/user ID, internal account ID, session ID, issuer, audience, issued-at, expiry, and a unique token ID.
- Is verified by Fastify using an asymmetric public key/JWKS or another equally reviewable signing boundary.
- Has no refresh token. Astro obtains a fresh assertion from the still-valid Better Auth session when required.
- Is never logged.

Validation must pin accepted algorithms and enforce issuer, audience, expiry, issued-at/not-before where present, and a small documented clock-skew allowance. Signing keys require an overlap-based rotation procedure. If replay prevention beyond the short lifetime becomes necessary for high-risk operations, bind the assertion to the Better Auth session and/or record one-time token IDs for those operations rather than extending assertion lifetime.

Avoid inventing a custom cryptographic protocol. Prefer Better Auth's supported JWT/JWKS service integration if it meets these claims and lifetime requirements.

When deployed behind a reverse proxy, trust forwarded host/protocol/client-IP headers only from explicitly configured proxy hops. Do not enable broad proxy-header trust merely to make OAuth redirects or IP rate limits work. Use a fixed production base URL where practical and test that attacker-supplied forwarding headers cannot alter callback origins, secure-cookie behavior, audit source addresses, or rate-limit identity.

### 5.4 Future refresh tokens

Application refresh tokens are deferred until a real non-cookie client exists, such as a mobile application, public developer API, or third-party OAuth client.

If they are added later:

- Access tokens must be short-lived.
- Refresh tokens must be stored hashed at rest.
- Every successful refresh must rotate the refresh token.
- The consumed token must immediately become unusable.
- Reuse of an older token must revoke the token family and create a security event.
- Logout, password reset, security-sensitive password changes, and account compromise actions must revoke related token families.

Google provider tokens are different from application sessions. Google refresh tokens are not needed for sign-in alone. Do not request offline Google access until the product needs a Google API. Google controls rotation of its own refresh tokens.

### 5.5 Single-owner accounts with a future team path

The initial user experience is single-owner:

- One authenticated user owns an account.
- That account can own multiple workspaces.
- No invitations, teams, role picker, or organization settings are exposed.
- The only effective human role is `owner`.

Internally, retain the existing organization/account isolation boundary. Treat each organization as a hidden **personal account** and create it automatically when a user completes registration. Add an explicit membership/ownership record linking the Better Auth user to that account.

Initial database constraints should enforce one owner per personal account and prevent one user from accidentally acquiring multiple personal accounts through race conditions. Design those constraints so team support later requires an additive membership change or dropping a narrow uniqueness constraint—not rewriting workspace foreign keys.

Do not enable Better Auth's organization/team feature merely for future speculation. The application can add team behavior when the product needs it.

### 5.6 Authentication versus service authorization

Keep service API keys for CLI tools, controlled integrations, and future machine clients that call protected HTTP APIs. They must not represent human approval actions. The database-backed worker should use its scoped database/provider credentials and should not receive an HTTP service key unless it genuinely calls a protected HTTP endpoint.

Fastify should accept a typed principal:

- `user`: verified Better Auth user plus account ownership.
- `service`: existing scoped API key.

Routes explicitly declare which principal kinds and permissions they accept. Human audit records store the stable user ID and session/request correlation; service actions store the API key ID, never the plaintext token.

Every resource query must remain account-scoped. A valid user ID is not sufficient authorization to access an arbitrary workspace ID.

Treat the signed assertion's account ID as a signed routing claim, not permanent proof that ownership is still active. Fastify must verify current account ownership/membership for sensitive mutations and whenever revocation freshness requires it. A revoked session, disabled user, or removed membership must stop approvals and other sensitive actions even if a very short-lived assertion has not yet reached its expiry.

## 6. Phase and skill engine

### 6.1 Core responsibility

Build a focused, deterministic SMM phase controller. Do not build a generic workflow language.

The controller receives an intent such as:

- Start or continue the workspace.
- Submit an answer.
- Request a revision.
- Approve an output.
- Retry a failed step.

The controller examines authoritative state and returns or enqueues the single correct next action. The normal client contract must no longer require a raw `skillName` or a caller-controlled `completePhase` flag.

The old low-level run endpoint may remain temporarily for trusted/internal compatibility, but it must not be the normal browser path and must remain strictly authorized.

### 6.2 Phase recipes

Each phase has a code-defined, typed, versioned recipe. A recipe declares:

- Phase number and purpose.
- Ordered mandatory steps.
- Explicit optional branches.
- Skill used by each step.
- Preconditions and required context keys.
- Accepted user intents.
- Input schema.
- Output schema.
- Context keys the step may propose updating.
- Artifact kinds the step may propose creating.
- Whether the step may repeat.
- Maximum attempts or loop count.
- Approval gate, if any.
- Completion condition.
- Legal next steps and next phase.

Recipes initially live in source-controlled TypeScript so they are readable, type-checked, reviewed, and tested. Do not put editable core workflow definitions in the database and do not invent a YAML/domain-specific workflow language.

The database stores recipe IDs and immutable versions used by workflow instances. Deployments may add a recipe version but must not silently reinterpret a workflow already in progress.

### 6.2.1 Initial recipe map

The first recipe implementation must be derived from the root orchestrator and the actual skill contracts. This table captures the approved primary routing intent; implementation must confirm the exact registered skill names and explicit order instead of guessing from filenames.

The registry audit on 2026-10-07 loaded 44 skills: phase counts were 6, 8, 14, 6, 4, and 6 respectively. It reported informational legacy context-path and host-specific `AskUserQuestion` references but no registry-loading failure. This inventory validates the need for recipe-level classification; it does not mean all 44 skills are approved for automatic invocation.

| Phase | Primary skill responsibilities/candidates | Runtime completion rule |
| --- | --- | --- |
| 1 | Voice building, customer/audience research, positioning/competitor profiling, and profile optimization | Required brand blueprint fields exist and the exact blueprint revision is approved |
| 2 | Content matrix, campaign backlog, platform strategy/cadence, and sprint calendar | Required 5–7 topics/hooks/formats and calendar are approved |
| 3 | Hook generation, post writing, thread/carousel writing, and short-form video scripting | Every required platform-native draft for the approved sprint passes its output contract |
| 4 | Post scoring, copy editing, formatting, and pinned-comment generation | Corrected final-post batch is approved |
| 5 | Content repurposing and applicable derivative/newsletter transformations | Repurposed batch is approved |
| 6 | Performance/pattern analysis, analytics reporting, and strategy calibration proposals | Strategy calibration is approved, then the workflow starts a new phase-2 sprint |

The recipe audit must classify every discovered `SKILL.md` as one of:

- A mandatory recipe step.
- An allowed optional/supporting skill for one or more steps in its own phase.
- An internal/manual skill that is not exposed to the autopilot workflow.
- Unsupported until a required connector or contract exists.

No discovered skill should become callable merely because its folder number matches the phase.

### 6.3 Mandatory versus optional skill selection

The backend selects mandatory skills whenever state makes the next action deterministic. Do not spend another model call asking the LLM to choose an obvious next step.

The LLM may request an optional skill only when the active recipe exposes more than one legitimate branch requiring judgment. It returns a strict structured request containing:

- Requested skill ID from the provided allowlist.
- A concise reason.
- Structured proposed inputs.

The runtime validates:

- The skill belongs to the current phase.
- The current recipe and step allow it.
- Its preconditions and required context are present.
- It has not exceeded invocation, loop, cost, or time limits.
- It does not require an unavailable connector.
- It does not bypass an approval or phase transition.

The LLM only requests the skill; the runtime resolves and executes it. A rejected request produces a safe deterministic fallback or a bounded error, not an uncontrolled retry loop.

### 6.4 Skills versus tools

Use these terms consistently:

- A **skill** is a source-controlled instruction module describing how the model performs a specialized SMM task.
- A **tool** is a runtime function that retrieves data or performs a permitted action.

Examples of data tools:

- `get_brand_context`.
- `get_current_phase_state`.
- `get_recent_posts`.
- `get_posts_by_campaign`.
- `get_high_performing_posts`.
- `search_artifacts`.

Future external actions such as publishing or analytics import are tools/connectors, not skills. They require separate authorization and failure handling.

During execution the model receives:

- The one active skill's complete instructions.
- A small manifest of optional skills currently allowed, not their full contents.
- Only the tools available in this step.
- Only relevant workspace memory.

Never load every skill into one prompt.

### 6.5 Skill bundle and execution pinning

At build or startup, generate an immutable skill-bundle manifest containing:

- Bundle/release version or hash.
- Skill name and stable ID.
- Phase.
- Relative source path.
- Content hash.
- Purpose/description.
- Required context keys.
- Expected output contract identifier.
- Required capabilities/connectors.
- Root orchestrator hash.
- Bridge configuration hash.

When work is enqueued, persist:

- Recipe ID and version.
- Skill bundle version.
- Exact skill ID and content hash.
- Orchestrator and bridge hashes.
- Context versions selected for the call.
- Model provider and configuration relevant to reproducibility.

The worker must execute the pinned version. It must not silently resolve a queued skill name to newer content. If the pinned bundle cannot be loaded, fail with an actionable deployment error.

API and worker readiness should expose or compare bundle/recipe compatibility so a mixed deployment cannot silently run different instructions.

Pinning requires retention, not only hashes. Store or ship the immutable trusted bundle content needed to execute each referenced version, excluding user/workspace prompt data. Keep old recipe implementations registered and old skill/orchestrator/bridge bundles retrievable while any queued, running, retryable, approval-waiting, or resumable workflow references them. Remove a version only after a checked query proves there are no live references and the operational retention window has elapsed. A hash with no retrievable content is audit evidence, not an executable pin.

Recipe versions contain runtime logic and must not be loaded as untrusted executable code from the database. Retain supported versioned recipe definitions in the deployed application, or deliberately drain/migrate compatible workflows before removing their code. Skill bundles are trusted text/data and may be retained as signed/reviewed release artifacts or immutable database rows if access and integrity are controlled.

During a rolling deployment, each worker must advertise or know the recipe/bundle versions it supports and claim only compatible jobs. Keep at least one compatible worker available for every live version, or deliberately pause/drain those workflows. An unsupported job remains queued with an alert; it is never executed using a “closest” version.

### 6.6 LLM action contract

Replace an ambiguous free-form next action with a discriminated, strictly validated action union. Target action categories include:

- `ask_user`: one question, optional explanatory text, two or more suggested options when appropriate, and permission for a custom answer.
- `request_tool`: one currently allowed tool and validated arguments.
- `request_optional_skill`: one currently allowed skill and validated inputs.
- `propose_output`: draft artifacts and/or staged context changes.
- `request_approval`: identifies the recipe gate and reviewable revision.
- `complete_step`: reports contract completion; the runtime decides the actual transition.
- `cannot_continue`: a bounded, user-actionable missing-input or unsupported-capability result.

Use strict JSON/schema enforcement supported by the provider and validate again with application schemas. A model response never mutates state merely because it claims success.

Limit autonomous chains by step count, total model calls, tokens, elapsed time, and optional-skill depth. One malformed or looping model must not monopolize a worker.

### 6.7 Question generation

Do not hardcode every onboarding sentence. The recipe defines the information requirements and permitted answer shape. The LLM phrases an adaptive question based on missing information and prior answers.

Question requirements:

- Ask one focused question at a time unless batching is clearly easier for the user.
- Explain why the current phase needs it when useful.
- Provide simple suggested options when possible.
- Always permit the user to provide their own answer.
- Do not ask again for information already present and sufficiently reliable.
- Do not invent facts to fill required context.
- Persist each answer immediately before producing the next question.

### 6.8 Approval and revision

For every gated output:

- Present the exact revision being reviewed.
- `approve` promotes only that revision's allowed context proposals and advances only if the recipe says the phase is complete.
- `request_revision` records the user's instructions, preserves the rejected revision, generates a new revision, and returns to review.
- A stale approval request against an older revision must fail with a conflict instead of approving the newest output accidentally.
- Rejection never deletes history.
- The model cannot approve its own work.

Phase 3 may transition automatically only after every required creative-production step and output contract succeeds. The backend—not a client flag or the model—determines that completion.

## 7. Phase behavior required by the product

### Phase 1: Discovery and onboarding

- Starts automatically for a newly created workspace.
- Supports fast-track input using pasted past posts or a public URL when an approved fetch capability exists.
- Supports a guided interview when fast-track material is absent.
- Determines missing voice, audience, positioning, offer, goals, platforms, and profile information.
- Uses adaptive questions rather than a rigid questionnaire.
- Produces a consolidated onboarding/brand blueprint for review.
- On approval, saves canonical brand context and the approved artifact, then advances to phase 2.
- On revision, records instructions and generates a new reviewable revision.

### Phase 2: Strategy and calendar

- Builds the broader content matrix/campaign backlog before full drafting.
- Produces the 5–7 topic hooks and formats for the next sprint.
- Produces platform cadence and a 7-day working calendar.
- Requires approval of the weekly topics/hooks/formats before phase 3.
- Preserves the two-tier model: monthly/broad topic planning first, full copy only for the approved weekly selection.

### Phase 3: Creative production

- Uses the approved sprint, brand context, and platform constraints.
- Produces platform-native copy rather than identical cross-platform text.
- Supports hooks, posts, threads, carousels, and short-form video scripts where the recipe requires them.
- Produces all required drafts for the active sprint.
- Automatically advances to phase 4 only after required production contracts succeed.

### Phase 4: Quality control and scoring

- Scores and edits drafts using the project's quality rubric.
- Applies anti-slop vocabulary and formatting constraints.
- Generates pinned first comments where required.
- Preserves both original and corrected revisions.
- Requires final-post approval before phase 5.

### Phase 5: Repurposing and distribution

- Turns approved pillar material into native derivatives.
- Avoids simple copy-and-paste duplication between platforms.
- Produces a reviewable repurposed batch.
- Requires human approval before phase 6.
- Actual social publishing and scheduling remain separate future connectors unless explicitly implemented and authorized.

### Phase 6: Analytics and feedback

- Accepts connector-supplied analytics or a validated CSV/manual metric fallback.
- Identifies winning patterns and proposed strategic adjustments.
- Treats analytics and imported text as untrusted data.
- Requires approval before changing durable strategy memory.
- Loops back to phase 2 for the next sprint.

## 8. State and memory architecture

### 8.1 Core rule

The **application is stateful; the LLM is stateless**.

Do not rely on a provider conversation ID, provider-hosted thread, model cache, or a single long prompt as the source of truth. Provider state may be used as a replaceable optimization later, but PostgreSQL remains authoritative.

Every model request is assembled from a controlled snapshot. This allows recovery, auditing, provider changes, deterministic authorization, and bounded context.

### 8.2 Memory categories

#### Workflow memory

Exact operational state:

- Active phase and recipe version.
- Active step and status.
- Pending question.
- Submitted answers.
- Completed and failed skills.
- Remaining prerequisites.
- Approval gate and revision under review.
- Retry and loop counters.

This is relational state and must never depend on vector similarity.

#### Brand memory

Approved reusable facts:

- Voice and banned language.
- Audience and pain points.
- Positioning and offers.
- Goals and constraints.
- Platform/profile settings.
- Strategy, content matrix, cadence, and current sprint.

Brand context is versioned. Model proposals remain staged until the applicable approval rule promotes them. Rejected content must not contaminate canonical memory.

Versioning must retain immutable history. A current `workspace_context` pointer/row alone is insufficient because queued or retried steps must load the exact revisions pinned at enqueue. Add immutable context revision records (or an equivalent append-only history) and make the canonical current value point to a specific approved revision. Workers load pinned revision IDs; they never reconstruct old context from a newer row plus a version number.

The initial canonical key vocabulary remains compatible with the existing compiler and bridge:

- `brand.voice`.
- `brand.audience`.
- `brand.positioning`.
- `brand.profile_funnels`.
- `social.context`.
- `strategy.content_matrix`.
- `strategy.campaign_backlog`.
- `strategy.platform_cadence`.
- `calendar.current_sprint`.
- Namespaced `analytics.*` records for approved analytical memory.

Recipe contracts, rather than ad hoc model output, determine which keys a step can read or propose changing. Legacy file names such as `voice.md`, `about-me.md`, and `.agents/product-marketing.md` remain compatibility aliases and must not create duplicate canonical records.

#### Conversation memory

Persist:

- User messages.
- Assistant messages.
- Structured actions.
- Tool/skill requests and results.
- Phase/step association.
- Timestamps and actor.
- Token/model metadata where useful.
- Exact tool/function results, connector version/source identifiers, and retrieval query/filter metadata used by a step, subject to data-minimization and retention rules.

For a call, select recent relevant turns plus a versioned summary of older conversation. Preserve full messages for audit, but do not resend an unlimited history to the model.

Summaries are derived data. They may be regenerated and must link to the range of messages summarized. They must not silently replace authoritative user answers.

#### Content and performance memory

Store generated content with searchable structured metadata:

- Campaign/sprint.
- Week and date/day.
- Platform.
- Topic and content pillar.
- Content format.
- Draft, review, approval, or rejection status.
- Revision lineage.
- Publication status when connectors exist.
- Performance data and capture time.

### 8.3 Retrieval order

Use the least complex reliable retrieval method:

1. Exact relational lookup for workflow, approval, brand, calendar, ownership, and status.
2. Indexed metadata queries for recent posts, campaign, week, platform, and performance.
3. PostgreSQL full-text search for keyword/content discovery.
4. `pgvector` in the same PostgreSQL database only after semantic-retrieval use cases and evaluation demonstrate value.
5. A separate vector service only if measured corpus size, latency, availability, or operational needs eventually justify it.

Do not add a standalone vector database now.

Potential future semantic use cases include finding similar past posts, detecting repeated themes, retrieving related customer research, and finding relevant historical feedback. Vector results are retrieval candidates, not authoritative facts.

### 8.4 Context assembly

The memory assembler selects only what the active recipe permits and needs:

- Active skill and task.
- Required canonical context keys and versions.
- Current phase/step summary.
- Recent relevant conversation.
- Older conversation summary if required.
- Relevant posts or analytics retrieved through explicit tools.
- Current user input.

Apply token/character budgets per section. Prefer concise structured data and accepted summaries. Do not truncate in a way that silently removes a required constraint; fail or summarize intentionally.

All workspace context, previous content, URLs, imported files, analytics, and retrieved text remain untrusted prompt data. They never become developer instructions.

## 9. Artifact, context, and final-post model

### 9.1 Artifacts

Artifacts are the reviewable history of everything generated by the AI, including onboarding blueprints, strategies, calendars, drafts, scorecards, repurposed batches, and analytics reports.

Artifacts require immutable revision lineage:

- Stable logical artifact ID.
- Revision number or revision ID.
- Parent revision where applicable.
- Run/step that created it.
- Recipe and skill versions.
- Draft/approved/rejected/superseded status.
- User revision instructions.
- Creation and decision attribution.

Never overwrite an approved or rejected revision in place.

### 9.2 Canonical context

Canonical brand context is the approved operational memory used on future generations. It is not merely another artifact view.

Approval may promote explicitly permitted context changes from the reviewed artifact revision. The promotion and approval must occur in one transaction.

### 9.3 Final posts

Approved final posts should be represented as structured content records, not filesystem folders. Required grouping metadata supports:

```text
Sprint/Week 1
  Monday
    LinkedIn
    X
    Instagram
  Tuesday
    ...
```

The API must also support low-friction flat queries so the frontend can show all posts without opening folders:

- Current week/sprint.
- Today's posts.
- Platform.
- Approval/status.
- Campaign.
- Search.

Each final post should expose copy-ready content, platform, date/day, format, title/topic, pinned comment where relevant, current revision, and approval status.

Calendar and grouping rules must be timezone-safe. For events with an actual time, store the absolute instant in UTC plus the workspace's validated IANA timezone. For date-only editorial plans, store an explicit local calendar date and workspace timezone rather than inventing a midnight UTC instant. Define the week-start rule (Monday by default for the agreed workflow) and derive labels consistently. Test daylight-saving transitions and timezone changes where applicable; never infer scheduling day from the API server's local timezone.

### 9.4 Filesystem and Obsidian boundary

Normal hosted execution persists canonical context, conversations, artifacts, and posts in PostgreSQL. The LLM does not write `about-me.md`, `voice.md`, post files, or any other server file.

The existing Obsidian integration remains an optional, one-way export of approved database state into a private vault. Obsidian is not runtime memory, is not required for orchestration, and must not be watched for bidirectional changes. Export failure must not roll back an already committed approval; it should be observable and safely retryable as a separate operation.

## 10. Database evolution

Use additive numbered migrations. Never edit an already-applied migration.

The implementation should introduce or adapt the following concepts. Exact names may change only if the resulting ownership and constraints remain equally clear:

- Better Auth's required user, account/provider, session, and verification tables, created through reviewed migrations.
- `account_memberships` or equivalent linking a Better Auth user to the existing organization/personal-account row with role `owner`.
- A uniqueness strategy enforcing the initial one-owner-per-account product rule without preventing a safe future migration to team membership.
- `workflow_instances` or an equivalent durable phase-cycle/session record.
- `phase_instances` or equivalent records for each attempt at a lifecycle phase.
- `step_instances` or an evolution of `workflow_steps` that records recipe step ID, recipe version, pinned bundle/skill versions, attempts, and transitions.
- Immutable `workspace_context_revisions` or equivalent history, with canonical context pointing to approved revision IDs.
- `conversations` and `messages` associated with workspace and phase/step.
- `conversation_summaries` with source message boundaries and version.
- Explicit pending-question/user-answer state or event records.
- Artifact revision lineage and review attribution.
- Structured content/final-post records and platform/date/campaign indexes.
- Optional outbox/event records if needed to atomically publish domain events after state changes.

Continue to use the existing organization foreign key for account isolation. Every new workspace-owned table must either carry the account boundary directly or join through a workspace in a way that cannot bypass scoped repository methods.

Database invariants should enforce what is practical:

- At most one active orchestration transition per workspace.
- Unique idempotency scope for retried client actions.
- Exactly one pending review revision for a gate when appropriate.
- Legal status values.
- Foreign-key integrity for revisions and decisions.
- Monotonic per-workspace message and step ordering where ordering matters.
- Conditional/optimistic updates against expected workspace or workflow version.

## 11. API direction

The simple frontend should consume product-oriented endpoints rather than low-level skill execution.

Target capabilities:

- Get authenticated user/account summary.
- Create/list/get/archive workspaces owned by the current account.
- Get a workspace's current phase, purpose, progress, pending action, and latest review item.
- Start or continue the correct phase.
- Submit an answer to the exact pending question.
- Approve an exact output revision.
- Request revision of an exact output revision with required instructions.
- List/get artifacts and their revision history.
- List/get final posts with week/day/platform/status filters.
- Retry a retryable failed action safely.

Mutation requests require idempotency keys where network retry could duplicate work. Responses should use stable machine-readable error codes and safe human-readable messages.

Bind each idempotency key to the authenticated account, route/operation, target resource, and a canonical request hash. Reusing the same key with the same request returns the original outcome; reusing it with different material input returns a conflict. Define retention/expiry long enough to cover realistic client and worker retries, and prevent expired-key reuse from colliding with still-live workflow effects.

Never accept an account/organization ID from the browser as proof of ownership. Resolve it from the authenticated principal and verify resource ownership in repository queries.

Use optimistic concurrency or revision identifiers for answers, approvals, and revision requests so stale browser tabs cannot mutate newer workflow state.

Use allowlisted request DTOs and explicit response DTOs. Never spread arbitrary request objects into database updates, and never serialize internal rows wholesale. Exclude token/provider details, internal prompt snapshots, secret references, private account identifiers not required by the client, and operational error details. Keep the public API under an explicit version such as `/v1`; make breaking contract changes through a documented compatibility/deprecation plan.

## 12. Security requirements

### Identity and session security

- Generate high-entropy Better Auth secrets outside source control.
- Support non-destructive secret rotation where the library permits it.
- Configure exact trusted origins; do not leave localhost origins enabled in production.
- Keep CSRF and origin/fetch-metadata protections enabled.
- Rate-limit sign-in, registration, password reset, verification resend, and Google callback abuse at the trusted edge and application layer where appropriate.
- Do not reveal whether an email exists in password-reset responses.
- Require verified email before workspace creation or other normal product mutations.
- Regenerate/revoke sessions after security-sensitive credential changes as supported.
- Store only required identity data.
- Never log passwords, cookies, authorization headers, verification tokens, Google tokens, internal assertions, or reset links.

### Authorization and isolation

- A user may access only the personal account attached to their active session.
- Every object-ID endpoint performs object-level authorization.
- Another account's identifier returns a non-enumerating response.
- Human approvals require a user principal and are attributed to the user.
- Service keys use least-privilege scopes and remain revocable/expiring.
- Sensitive human mutations re-check current session/user/account authorization rather than trusting a still-unexpired assertion alone.
- Administrative and migration database permissions should be separated from runtime permissions in production when practical.
- Writable fields are allowlisted per operation to prevent property-level authorization and mass-assignment defects.
- Public response schemas expose only fields required by the caller.

Application-scoped repository queries and authorization tests remain the primary isolation mechanism initially. PostgreSQL row-level security is optional defense in depth, not a substitute for application authorization. Introduce it only with a deliberate connection/session-variable design and tests proving pooled connections cannot leak account context.

### LLM and tool security

- Repository-owned orchestrator/bridge/skill text is developer instruction.
- User content, retrieved memory, analytics, URLs, connector results, and prior generated content are untrusted data.
- Strictly validate model outputs, function names, and arguments.
- The model cannot make canonical writes, approve content, advance phases, or call arbitrary URLs.
- Tool availability is scoped to the recipe step.
- Side-effecting tools require explicit runtime authorization and idempotency.
- Future URL-fetch tools require SSRF protections, redirect limits, response-size limits, content-type controls, timeouts, and private-network blocking.
- Apply limits to model calls, output sizes, artifacts, context updates, optional-skill depth, and total workflow cost.
- Redact secrets and minimize personal data in prompts and logs.
- Treat generated Markdown/HTML as untrusted stored content. Return it as data, apply correct content types, and require sanitization/escaping at the rendering boundary; never render raw model HTML or execute embedded script/URL instructions.
- Do not construct filesystem paths, SQL identifiers, shell commands, connector destinations, or tool names directly from model/user text. Resolve stable allowlisted IDs through runtime-owned mappings.

## 13. Reliability, concurrency, and scalability

Keep API and worker processes stateless. PostgreSQL remains the coordination point.

Required behavior:

- Horizontally scalable API instances.
- Horizontally scalable workers claiming jobs with safe row locking.
- At-least-once delivery with idempotent execution and completion.
- One winning transition for a workspace step.
- Durable jobs committed with the state that created them.
- Bounded exponential retry for transient failures.
- Dead-letter state and an operational recovery path.
- Stale-lock recovery that keeps queue and workflow state consistent.
- Provider timeouts and retry classification.
- Graceful shutdown that stops claiming work and safely releases or expires in-flight leases.
- Readiness checks for database connectivity, migrations, recipe registry, skill bundle, and critical configuration.
- No deployment may silently execute a different skill version from the one pinned to a queued step.

Use database transactions for each state transition, but never hold a transaction open across an LLM or external network call. Record intent/running state, perform the external call, then commit a conditional completion transaction.

Every claimed job/step attempt must carry a unique lease owner and monotonically changing attempt/fencing token. Long model/tool calls renew their lease within bounded limits. Completion updates compare the current attempt/fencing token and expected run status/version; a late result from a timed-out, cancelled, or superseded worker is discarded/quarantined and cannot commit artifacts, context, approval state, or phase transitions.

An LLM call can succeed while the worker loses the response before committing it. Exactly-once billing cannot be guaranteed across that network boundary. Use provider idempotency/retrieval capabilities where available, persist provider response IDs promptly, reconcile uncertain outcomes when possible, and make artifact/state completion idempotent. Document that a rare duplicate provider charge can remain possible rather than falsely claiming exactly-once external execution.

### 13.1 Backpressure, quotas, and fairness

- Bound HTTP concurrency, request body size, queue admission, worker concurrency, model-call concurrency, and database pool size.
- Calculate the total database connection budget across all API, worker, migration, and operational processes before increasing replica counts.
- Apply per-account/workspace concurrency and spend limits so one owner or runaway loop cannot exhaust shared capacity.
- Use fair job ordering or per-account admission controls when volume makes starvation possible.
- Respect provider rate-limit headers where available and add jitter to retry backoff.
- Reject or delay work predictably when saturated; do not accumulate an unbounded in-memory queue.
- Expose queue age, oldest job, admission rejection, and rate-limit metrics.

### 13.2 Database performance

- Every list endpoint uses stable cursor pagination with a maximum page size; never return an unbounded artifact, message, post, event, or metric collection.
- Add indexes from measured query shapes, including account/workspace ownership, workflow status, pending jobs, conversation order, artifact lineage, and final-post filters.
- Prevent N+1 query patterns in workspace dashboards and prompt assembly.
- Use application/role-level `statement_timeout`, `lock_timeout`, and `idle_in_transaction_session_timeout` values appropriate to API, worker, and migration workloads.
- Keep transactions short and establish a consistent lock acquisition order for multi-row transitions.
- Monitor slow queries, pool wait time, lock waits, dead tuples, index size, and query plans for critical paths.
- Keep autovacuum and planner statistics healthy, especially for high-churn queue, message, step, and event tables.
- Treat large JSONB/text fields deliberately: select metadata for lists and fetch full content only when required.
- Run load and soak tests against realistic conversation/artifact volume before declaring scale readiness.

### 13.3 Availability and recovery objectives

Before production, define measurable service objectives rather than using the word “reliable” without a target:

- Availability/service-level objective for API and orchestration operations.
- Target response latency for synchronous API reads/writes.
- Target queue-start latency for model work.
- Recovery time objective (RTO).
- Recovery point objective (RPO).
- Maximum acceptable authentication outage and email-delivery delay.

Configure encrypted backups and, where required by the RPO, PostgreSQL point-in-time recovery. Run scheduled restore drills into an isolated environment and record the evidence. A backup that has never been restored is not considered verified.

## 14. Observability and operations

Add or preserve:

- Request/correlation IDs across Astro, Fastify, jobs, runs, steps, and provider calls.
- Structured logs with secret and sensitive-content redaction.
- Metrics for request latency/error rates, queue depth and age, worker success/retry/dead counts, model latency, token use, estimated cost, phase duration, approval turnaround, and optional-skill requests.
- Audit events for registration/account creation, workspace mutations, approvals, rejections, context promotion, service-key changes, and security-sensitive session actions.
- Health/readiness endpoints that do not expose secrets.
- A documented dead-job inspection and recovery procedure.
- Migration backup/rollback procedures suitable for non-Docker hosting.
- A documented retention and backup policy for conversations, artifacts, audit events, model usage, and performance metrics before production launch. Destructive account deletion/export requires a separate reviewed workflow and must not be implemented as an unbounded cascade exposed directly to a browser request.
- Alerts tied to actionable thresholds for authentication failure spikes, queue age/depth, dead jobs, database pool exhaustion, elevated error rates, provider failures, and unusual spend.
- An incident-response runbook covering credential leakage, session compromise, account-isolation defects, prompt/tool abuse, provider outage, database recovery, and rollback.

Do not log complete prompts, raw session cookies, or unnecessarily sensitive user content. Prompt snapshots should continue to favor hashes, versions, and selected context identifiers.

### 14.1 Deployment and migration safety

- Use backward-compatible expand/migrate/contract database changes when old and new application versions can overlap.
- Never require a long blocking table rewrite in an ordinary release without a measured maintenance plan.
- Apply bounded migration lock/statement timeouts and fail safely rather than waiting indefinitely.
- Run one migration process per release; API/worker startup verifies the expected migration state but does not race to mutate it.
- Support a rolling or staged deployment in which API and workers reject incompatible recipe/skill bundle versions.
- Define application rollback separately from database rollback; prefer forward-fix migrations after data changes.
- Use feature flags only for coarse, server-controlled rollout and include flag state in diagnostics. Do not use flags to create untestable combinations of workflow semantics.

### 14.2 Dependency and secret hygiene

- Commit and enforce the `pnpm` lockfile; use frozen-lockfile installs in CI/production.
- Pin the supported Node.js major version and test dependency upgrades before release.
- Run type checking, tests, build, skill audit, dependency vulnerability scanning, and secret scanning in CI.
- Review Better Auth and other security-critical release notes and update promptly because only supported versions receive fixes.
- Generate an inventory/SBOM when production governance requires it.
- Keep application, database, Google, email, and model-provider secrets in the host secret manager, scoped by environment.
- Rotate secrets with overlap where supported and document emergency revocation. Never copy production secrets into development or test.

## 15. Provider and model policy

Keep the existing provider interface. Workflow/domain services must not depend directly on OpenAI-specific response objects.

Provider requirements:

- Strict structured output or tool/function schemas when supported.
- Application-side validation in all cases.
- Configured timeouts, output-token limits, and bounded retries.
- Usage capture.
- `store: false` or the strongest applicable no-provider-state setting by default when supported.
- A deterministic mock/fake provider for tests.
- Model name and behavior-affecting configuration recorded with the execution snapshot.
- Per-step and per-account token/cost budgets with a hard ceiling and a user-actionable failure mode.
- An evaluation corpus covering routing, questions, brand fidelity, platform formatting, safety, and structured-output compliance.
- Model/prompt/skill changes must pass regression evaluations before becoming the default; high-risk changes should use a bounded canary or staged rollout.
- Content safety/moderation and refusal handling appropriate to user-supplied and generated social content, without silently discarding legitimate business content.

Do not use provider-hosted conversation state as authoritative memory. If later used for latency or caching, losing it must not lose application state.

Version and hash capture supports attribution, comparison, and best-effort replay; it does not guarantee byte-identical regeneration. External providers can change model implementations behind an identifier, sampling may be nondeterministic, and connector data can change. Record provider fingerprints/revisions when available, preserve all controlled inputs, and describe the result as auditable rather than perfectly reproducible.

## 16. Implementation sequence

Implement in small, reviewable stages:

1. **Baseline and documentation alignment**
   - Confirm migrations and current tests pass.
   - Replace backend `npm` instructions with `pnpm` instructions.
   - Record new architecture decisions in ADRs as implementation choices become concrete.

2. **Better Auth and personal-account ownership**
   - Add reviewed Better Auth migrations/configuration.
   - Implement email/password, verification, reset, and Google sign-in.
   - Create one personal account and owner membership safely and idempotently.
   - Replace the shared frontend access password for normal user authentication.
   - Add the user/service principal boundary in Fastify.

3. **Workflow/recipe persistence**
   - Add workflow/phase/step state and recipe version fields.
   - Add conversation/message/pending-question state.
   - Make workspace creation initialize phase 1 atomically or via a durable job.

4. **Typed phase recipes and skill bundles**
   - Implement recipe definitions and validation.
   - Generate the bundle manifest and pin versions.
   - Make browser-facing continuation intents backend-selected rather than skill-name-selected.

5. **Memory assembler and controlled tools**
   - Implement exact context retrieval, recent conversation, summaries, and content queries.
   - Add step-scoped data tools.
   - Keep semantic/vector retrieval disabled until evaluated.

6. **Review, revision, and promotion**
   - Add exact-revision approval and revision loops.
   - Promote permitted context atomically.
   - Enforce recipe completion instead of caller-controlled `completePhase`.

7. **Artifacts and final posts**
   - Add immutable revision lineage.
   - Add structured final-post records and grouping/filter endpoints.

8. **Hardening and operational readiness**
   - Add concurrency, idempotency, security, failure-recovery, and load tests.
   - Add metrics/readiness and dead-job procedures.
   - Set connection/time-out budgets, pagination limits, SLO/RTO/RPO targets, restore drills, dependency controls, and model-evaluation release gates.
   - Run the final audit checklist in this document.

Do not attempt all phases and all endpoints in a single unreviewable rewrite. Preserve working queue, store, provider, and prompt-safety behavior while evolving the contracts.

## 17. Testing requirements

### Unit tests

- Every legal phase transition and every illegal transition.
- Correct next mandatory skill for every recipe step.
- Optional-skill request accepted only from the current allowlist.
- Cross-phase, out-of-order, repeated, over-budget, or unavailable skill requests rejected.
- Recipe definitions fail startup validation when incomplete or inconsistent.
- Context keys and tools are restricted per step.
- LLM action union validation and size limits.
- Conversation summarization boundaries.
- Memory assembly excludes unapproved or irrelevant context.
- Revision approval applies the exact revision only.
- Rejection does not promote context.
- Phase 3 auto-advances only after all requirements succeed.
- Phase 6 loops to phase 2 only after approval.

### Integration tests with PostgreSQL

- Registration creates exactly one personal account/owner relationship under retries and concurrency.
- Session-derived user cannot access another account's workspace.
- Service key and user principals obey separate permissions.
- Revoking the underlying session/user/account authorization blocks sensitive Fastify mutations even when a previously issued short-lived assertion has not expired.
- Workspace creation starts phase 1 once.
- Duplicate submissions with the same idempotency key do not duplicate messages, jobs, artifacts, or transitions.
- Simultaneous approvals/revisions produce one valid winner.
- Queue redelivery does not duplicate outputs or context promotion.
- Stale jobs recover consistently.
- A stale/superseded worker cannot commit after another worker reclaims the job; lease renewal and fencing-token tests cover timeout, cancellation, and late completion.
- Pinned recipe/skill versions survive a deployment change or fail clearly when unavailable.
- Old recipe and trusted bundle versions remain executable for all live/retryable references and are garbage-collected only after verified safe retirement.
- A queued step loads the exact immutable context revision IDs captured at enqueue even after newer context is approved.
- Tool/retrieval results used by a step are persisted with source/query/version metadata sufficient for audit and best-effort replay.
- Worker and API bundle mismatch fails readiness or execution safely.
- Reusing an idempotency key with different material input returns a conflict rather than replaying or mutating the original operation.
- Cursor pagination remains stable while new rows are inserted.
- Database timeouts, pool exhaustion, and lock contention fail predictably without corrupting workflow state.
- Backpressure prevents one account or recursive workflow from starving unrelated work.
- Workspace calendar/week/day behavior is correct for the configured IANA timezone, including DST boundary fixtures where applicable.

### Security tests

- Cookie flags and origin/CSRF behavior.
- Login/reset enumeration resistance.
- Session revocation.
- Account-linking edge cases.
- Object-level authorization on every ID route.
- Prompt injection in stored context, imported analytics, prior posts, and tool results.
- Invalid/arbitrary function and skill requests.
- Oversized body, prompt, artifact, message, and model output.
- Secrets and cookies absent from logs and responses.
- Mass-assignment attempts cannot change ownership, phase, approval, status, role, provider, version, or other server-owned fields.
- Stored model/user Markdown and metadata cannot become executable HTML/script through API response handling.
- A pooled database connection cannot retain another account's authorization context if row-level security is ever enabled.

### Contract and provider tests

- Mock provider produces deterministic valid actions.
- Malformed, refused, truncated, timed-out, and rate-limited provider responses are classified correctly.
- Structured outputs are still validated locally.
- Provider change does not change workflow-domain contracts.
- A lost/uncertain provider acknowledgement does not duplicate committed artifacts or phase transitions.
- Model/prompt/skill candidates pass the agreed regression-evaluation thresholds before rollout.

### Performance and recovery tests

- Load tests cover realistic concurrent sessions, workspace reads, message history, final-post filtering, and queued model work.
- Soak tests exercise queue churn, retries, database pool behavior, autovacuum-sensitive tables, and worker restarts.
- Critical queries have reviewed `EXPLAIN (ANALYZE, BUFFERS)` evidence against production-like data where safe.
- Backup restoration and point-in-time recovery procedures are exercised in an isolated environment against the declared RTO/RPO.
- Rolling deployment and application rollback are tested with compatible old/new schema and recipe/bundle behavior.

### End-to-end documentation

Do not make browser end-to-end execution a blocker for the implementation agent if the project owner intends to run it separately, but update `docs/testing.md` with a complete manual/automatable scenario covering:

1. Email registration, verification, logout/login, and password reset.
2. Google sign-in and safe account linking.
3. Workspace creation and automatic onboarding start.
4. Adaptive question/answer progression including a custom answer.
5. Onboarding revision and approval.
6. Each subsequent phase, its review gate, and phase 3 automatic transition.
7. Artifact revision history and canonical context promotion.
8. Final-post grouping and flat filtered retrieval.
9. Session revocation and unauthorized cross-account attempts.
10. Worker retry/recovery and a pinned-version deployment scenario.

## 18. Definition of done

The backend adjustment is complete only when all of the following are true:

- Email/password and Google sign-in work through Better Auth.
- Browser auth uses secure server sessions; no auth token is stored in browser storage.
- Normal user requests are attributed to a verified user and isolated to their personal account.
- The product exposes no team-management complexity, while the schema retains a safe team migration path.
- The shared frontend access password and browser use of service API keys are removed from the normal product path.
- New workspaces automatically enter phase 1 and expose one clear next action.
- The frontend no longer selects arbitrary skills or controls phase completion.
- Mandatory skills are selected deterministically by typed recipes.
- Optional LLM skill requests are phase/step allowlisted, bounded, validated, and auditable.
- Every queued execution is pinned to recipe, bundle, skill, orchestrator, bridge, context, and model versions sufficient for audit and safe execution.
- Pinned recipe/bundle/context versions remain retrievable for the complete live-workflow and retry lifetime.
- The LLM remains stateless and PostgreSQL holds workflow, conversation, context, artifact, post, approval, and audit state.
- Exact retrieval works without a separate vector database.
- Approved output is saved as an artifact revision and permitted context is promoted transactionally.
- Rejection/revision preserves history and cannot approve a stale revision.
- Final posts can be queried by sprint/week, day/date, platform, campaign, and status.
- Final-post dates and week/day groupings are derived from the workspace timezone rather than server-local time.
- Existing reliability guarantees are preserved or strengthened.
- List endpoints are bounded and cursor-paginated, and critical query/index behavior is verified against production-like volume.
- Backpressure, concurrency limits, connection budgets, timeouts, and spend ceilings are configured and observable.
- SLO, RTO, and RPO targets are documented; backup restoration has been tested.
- Rolling deployment, migration compatibility, and rollback procedures are verified.
- Model/prompt/skill changes are protected by a regression-evaluation gate.
- Frozen `pnpm` installs and dependency/secret scanning are enforced.
- Unit, integration, security, and provider-contract tests pass.
- Documentation, migrations, examples, and operational procedures reflect the implemented behavior.
- No Docker dependency has been added.
- `pnpm` is the documented package manager.

## 19. Explicitly deferred work

Do not add these merely because they may be useful later:

- Multi-member teams, invitations, or complex role management.
- Browser access/refresh-token flows.
- A mobile/public OAuth server.
- A separate vector database.
- `pgvector` before a measured semantic retrieval need.
- A generic workflow DSL or visual workflow builder.
- User-editable core prompts/skills stored live in the database.
- Bidirectional Obsidian synchronization.
- Automatic social publishing/scheduling without connector-specific design and authorization.
- Media/object storage unless required by an implemented content type.
- Better Auth paid managed infrastructure.

## 20. Implementation audit checklist

Use this checklist during implementation and again before handoff.

M7 reconciliation rule: a checked item has source and local automated evidence.
An unchecked item is an explicit incomplete or external gate, not an item that
was overlooked. Combined requirements remain unchecked when any material part
still needs external acceptance.

### Scope and product behavior

- [x] Implementation remains backend-focused, including only Astro server-side auth/BFF boundaries.
- [x] No Docker files or Docker-only assumptions were added.
- [x] `pnpm` is used and documented.
- [x] New workspace begins guided onboarding automatically.
- [x] The API exposes a single clear pending action to the frontend.
- [x] All six phases and the phase-6-to-phase-2 loop are represented.
- [x] Approval/revision behavior matches the product flow.

### Authentication and authorization

- [x] Better Auth is self-hosted on PostgreSQL.
- [ ] Email/password, verification, reset, and Google sign-in work. Email/password passes locally; live Google acceptance remains external.
- [x] Secure cookie properties and exact trusted origins are configured.
- [x] No token or service key is stored in browser storage.
- [x] No unnecessary browser refresh-token system was created.
- [x] Internal user assertions are short-lived, server-only, audience-bound, and verified.
- [x] Session-cache/revocation behavior is explicit and sensitive actions revalidate session freshness.
- [ ] Assertion algorithms, issuer/audience, clock skew, and key rotation are tested.
- [x] One owner/personal account is created idempotently.
- [x] Team UI and team complexity are absent.
- [x] The schema has a documented additive path to future memberships.
- [x] Every object lookup is account-scoped.
- [x] Request and response DTOs prevent mass assignment and excessive internal-data exposure.
- [x] Human and service principals are distinguished and audited.
- [x] Sensitive human mutations re-check authoritative session/user/account status beyond the assertion claim.
- [ ] Login/reset endpoints resist enumeration and abuse. Local controls pass; distributed edge and browser acceptance remain external.
- [x] Secrets, cookies, tokens, and reset links are redacted.

### Orchestration and skills

- [x] Browser-facing actions do not accept arbitrary `skillName` or `completePhase`.
- [x] Every phase has a typed, validated recipe.
- [x] Every discovered skill is classified as mandatory, optional, internal/manual, or currently unsupported.
- [x] Backend selects all mandatory skills.
- [x] Optional skill requests are exposed only when judgment is useful.
- [x] LLM optional-skill requests are allowlisted and validated by phase and step.
- [x] Skill and tool concepts remain separate.
- [x] Only one full skill is loaded into a model call.
- [x] Tool and optional-skill manifests are scoped to the current step.
- [x] Recipe and bundle versions are immutable and pinned at enqueue.
- [x] Old recipe implementations and trusted bundles remain available until no live workflow/retry can reference them.
- [ ] Bundle/version garbage collection checks database references and retention policy before removal.
- [x] API/worker version mismatch cannot silently execute different instructions.
- [x] LLM actions use a strict discriminated schema.
- [x] Autonomous loops have call, token, time, depth, and configured per-account monetary-spend limits.
- [x] Runtime alone changes phase and canonical state.

### Memory and data

- [x] PostgreSQL is the only authoritative memory.
- [x] Workflow, brand, conversation, artifact, content, and performance memory are separated.
- [x] Full messages are retained while prompts use bounded recent turns/summaries.
- [x] Summaries link to source message boundaries.
- [x] Unapproved model output is excluded from canonical brand memory.
- [x] Canonical context has immutable revision history and workers load pinned revision IDs rather than whichever row is current.
- [x] Exact/metadata/full-text retrieval is implemented before vector retrieval.
- [x] No standalone vector database was introduced.
- [x] Prompt context is phase/step-scoped and bounded.
- [x] Retrieved content remains untrusted data.
- [x] Generated Markdown/HTML is treated as untrusted and cannot execute at a rendering boundary.
- [x] Artifact revisions are immutable and traceable.
- [x] Final posts use structured metadata rather than filesystem paths.
- [x] Calendar/post grouping uses validated IANA timezones and explicit local editorial dates with DST tests.
- [x] Hosted execution never treats server Markdown files or Obsidian as authoritative memory.

### Reliability and operations

- [ ] Every mutation with retry risk is idempotent.
- [x] Implemented idempotency keys are bound to account/operation/resource/request hash and conflicting reuse is rejected.
- [x] Concurrent review actions have one deterministic winner.
- [x] Database transactions never span LLM/network calls.
- [x] Queue delivery remains safe under retries and worker crashes.
- [x] Job claims use lease ownership plus fencing/attempt tokens; stale, cancelled, or superseded workers cannot commit late results.
- [x] Dead jobs are observable and recoverable.
- [x] Readiness checks include migrations, database, recipes, and skill bundle.
- [x] Request/job/run/step correlation is traceable.
- [x] Metrics cover queue, model use/cost, workflow duration, errors, approvals, admission rejection, and database-pool pressure.
- [x] List endpoints are cursor-paginated with enforced maximum page sizes.
- [x] Connection pools, worker/model concurrency, queue admission, and account spend have explicit budgets.
- [x] Statement, lock, idle-transaction, network, and provider timeouts are configured by workload.
- [ ] Critical indexes/query plans and autovacuum behavior are verified at realistic volume.
- [ ] SLO, RTO, and RPO are documented and restore drills meet them.
- [ ] Migrations support mixed-version deployment and bounded locking.
- [x] CI uses frozen `pnpm` installs and runs dependency/secret scanning.
- [ ] Model/prompt/skill releases pass regression evaluations and canary rules where required.
- [x] Operational documentation reflects non-Docker deployment.

### Verification and documentation

- [x] Unit tests cover recipe routing and invalid transitions.
- [x] Integration tests cover auth isolation, concurrency, and idempotency through M5.
- [ ] Security tests cover session, authorization, prompt injection, and limits.
- [x] Provider tests cover malformed, permanent, and transient responses.
- [x] `docs/testing.md` contains the complete deferred E2E procedure.
- [x] ADRs record material deviations or newly locked decisions.
- [x] Current-state documentation does not describe planned behavior as already implemented.

## 21. Scalability and maintainability risk checklist

This checklist answers, before release and during later reviews, whether the chosen architecture is remaining scalable or becoming problematic.

### Healthy indicators

- [x] Adding a normal skill requires only the skill, its contract, recipe placement, and tests—not changes throughout the system.
- [x] Adding an API or worker instance requires no local shared state.
- [x] A deployment cannot alter an already-queued execution silently.
- [x] A rollback or delayed retry can still load every recipe, bundle, and context revision it references.
- [x] A workflow can be reconstructed from database state, version pins, conversation/tool records, queue events, and audit records.
- [x] Most phase transitions are deterministic and easy to explain.
- [x] LLM judgment is confined to content and explicit optional branches.
- [x] Context size stays bounded as conversations and content grow.
- [ ] Database connections, queue admission, worker/model concurrency, and per-account cost remain within measured budgets as replicas grow.
- [ ] Critical list/read paths remain bounded and paginated at production-like volume.
- [x] Queries filter by account/workspace before any future semantic ranking.
- [x] Failure and retry behavior is visible through metrics, structured correlation, queue events, and the job CLI without exposing payload bodies.
- [x] Provider replacement does not require rewriting domain services.
- [x] Team support can be added through membership capability without moving workspaces.

### Warning signs requiring redesign or simplification

- [ ] Recipes are becoming an untyped generic rules language.
- [ ] Users or models can edit production recipes/core skills without versioned publishing and rollback.
- [ ] The frontend must understand skill order or phase transition rules.
- [ ] The LLM can select any repository skill or call any tool.
- [ ] Phase completion depends on free-form model text.
- [ ] Provider conversation state becomes the only copy of important history.
- [ ] Complete chat histories or every skill are sent on every call.
- [ ] Vector similarity is used for authorization, workflow state, approvals, or canonical facts.
- [ ] Repeated retries create duplicate artifacts, messages, charges, or transitions.
- [ ] API and workers can run incompatible recipe/skill bundles without detection.
- [ ] Old bundles or recipe code are deleted while queued, retryable, approval-waiting, or resumable workflows still reference them.
- [ ] A single workspace can run conflicting transitions concurrently.
- [ ] A timed-out worker can commit after its job lease has been reclaimed.
- [ ] Adding a skill requires database schema changes unrelated to its output.
- [ ] Audit logs contain secrets, complete prompts, or unnecessary personal data.
- [ ] Optional skill chains can recurse without strict depth and cost limits.
- [ ] Replica count can exceed the database connection budget.
- [ ] A release requires an incompatible schema and application cutover with no rollback window.
- [ ] Reliability is claimed without tested RTO/RPO and restore evidence.
- [ ] Model or prompt changes ship without regression evaluations.

### Scale triggers, not premature infrastructure

Consider `pgvector` only when evaluated exact/full-text retrieval cannot meet a documented semantic-search case. Consider a separate vector service only when measured corpus size, filtered-recall requirements, latency, or operations exceed PostgreSQL's acceptable envelope.

Consider Redis or an external queue only when measured PostgreSQL queue contention, latency, or independent scaling requirements justify the operational cost. The current PostgreSQL queue remains valid until evidence says otherwise.

Consider partitioning or archival when message, artifact, event, or metric tables show measured index/retention pressure. Establish retention and backup requirements before deleting historical records.

Consider multi-region execution only after data residency, failover objectives, and consistency requirements are defined. Do not introduce cross-region complexity speculatively.

## 22. Documentation self-audit performed for this plan

This document was reviewed against the complete agreed backend discussion and the current implementation. The audit specifically checked for commonly missed boundaries:

- Authentication versus authorization.
- Better Auth fees versus external infrastructure costs.
- Cookie sessions versus unnecessary browser refresh tokens.
- Rotation requirements if refresh tokens are introduced later.
- Google provider tokens versus application tokens.
- Single-owner simplicity versus future team migration.
- Current phase checking versus correct within-phase skill ordering.
- Backend-selected mandatory skills versus LLM-requested optional skills.
- Skills versus runtime tools.
- Stateless model versus stateful application.
- Exact PostgreSQL memory versus semantic vector retrieval.
- Conversation summaries and source-message traceability.
- Staged model output versus canonical approved context.
- Exact-revision approval and revision history.
- Version pinning across API, queue, worker, skill, recipe, and prompts.
- Concurrency, idempotency, retry, and dead-job behavior.
- Final-post structured grouping and flat retrieval.
- No-Docker and `pnpm` constraints.
- Deferred E2E documentation.
- Security, observability, and operational completion criteria.

The first audit found and corrected four omissions before this handoff was finalized:

1. It added the initial per-phase skill responsibility map and required classification of every discovered skill, preventing same-phase folder membership from becoming accidental permission.
2. It added the canonical database context-key vocabulary and legacy-alias rule.
3. It made the hosted PostgreSQL-versus-filesystem/Obsidian persistence boundary explicit.
4. It added password/email/OAuth configuration constraints and production data-retention/deletion safeguards.

The final senior-engineering re-audit found and corrected additional omissions:

1. Session cache/revocation semantics, sensitive-action freshness, signed-assertion validation, and signing-key rotation.
2. Queue admission, fair-use backpressure, database/model concurrency, connection budgets, and per-account spend ceilings.
3. Cursor pagination, query/index review, database timeouts, pool monitoring, and autovacuum/large-field performance.
4. Explicit SLO, RTO, and RPO targets plus encrypted backups, point-in-time recovery where required, and evidence-producing restore drills.
5. Mixed-version deployment, expand/migrate/contract migrations, bounded migration locks, application rollback, and bundle compatibility.
6. Dependency, lockfile, secret-scanning, security-update, and secret-rotation controls.
7. Model/prompt/skill regression evaluations, staged rollout, content-safety handling, and cost ceilings.
8. Honest handling of the provider-success/worker-acknowledgement failure window instead of claiming impossible exactly-once external billing.

A final edge-case pass then added explicit requirements for mass-assignment/property-level authorization, minimal response DTOs, stored Markdown/HTML rendering safety, runtime-owned identifier/path mappings, durable email resend/provisioning behavior, API version compatibility, and timezone/DST-correct post grouping.

The strict post-write audit found and corrected five further ambiguities:

1. Immutable version hashes now require retained executable recipe definitions and retrievable trusted bundle content, plus safe garbage-collection rules.
2. Context pinning now requires immutable context revision history and revision-ID lookup, not only an incrementing current-row version.
3. Model execution is described as auditable and best-effort replayable, not falsely guaranteed to reproduce byte-identical output.
4. Backend scope now explicitly includes only Astro's server-side authentication/BFF boundary while keeping orchestration logic in Fastify.
5. Trusted reverse-proxy headers and request-bound idempotency-key semantics are explicit and testable.

The distributed-systems pass added three more corrections:

1. Job recovery now requires renewable leases and fencing/attempt tokens so late stale workers cannot commit.
2. Tool/retrieval results and their source/query metadata are part of the auditable step snapshot.
3. Date-only editorial plans use an explicit local date/timezone/week-start rule, while true instants remain UTC.

No item in this plan should be treated as implemented until verified against code, migrations, tests, and current documentation. If implementation changes an agreed decision, update this file and create or revise the relevant ADR in the same change.

## 23. Primary implementation references

Re-check current versions during implementation; do not copy configuration blindly from secondary articles.

- [Better Auth Astro integration](https://better-auth.com/docs/integrations/astro)
- [Better Auth PostgreSQL adapter](https://better-auth.com/docs/adapters/postgresql)
- [Better Auth session management](https://better-auth.com/docs/concepts/session-management)
- [Better Auth cookie behavior](https://better-auth.com/docs/concepts/cookies)
- [Better Auth security guidance](https://better-auth.com/docs/reference/security)
- [Better Auth JWT/JWKS plugin](https://better-auth.com/docs/plugins/jwt)
- [Better Auth Google provider](https://better-auth.com/docs/authentication/google)
- [Better Auth OAuth provider and refresh-token rotation](https://better-auth.com/docs/plugins/oauth-provider)
- [Better Auth pricing for optional managed infrastructure](https://better-auth.com/pricing)
- [pgvector official project and scaling guidance](https://github.com/pgvector/pgvector)
- [OpenAI API data controls](https://platform.openai.com/docs/models/default-usage-policies-by-endpoint)
- [OWASP API Security Top 10](https://api-security.owasp.org/editions/2023/en/0x11-t10/)
- [OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- [OWASP REST Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html)
- [PostgreSQL client connection timeouts](https://www.postgresql.org/docs/current/runtime-config-client.html)
- [PostgreSQL routine vacuuming](https://www.postgresql.org/docs/current/routine-vacuuming.html)
- [PostgreSQL continuous archiving and point-in-time recovery](https://www.postgresql.org/docs/current/continuous-archiving.html)

## 24. M9 continuation boundary

M9 is the next planned backend/frontend performance milestone. Its implementation
must follow the existing invariants in this document rather than replacing them:

- the backend remains authoritative for workflow state and question versions;
- PostgreSQL persists answers, provenance, compiled intake, and durable work;
- the option assistant is non-authoritative and has deterministic fallbacks;
- the intake compiler is application code and cannot invent facts;
- the primary model and worker remain responsible for expensive synthesis and
  revisions, with release pins, fencing, strict actions, and approval preserved;
- measured traces and production-like evidence are required before speed or
  reliability claims are marked complete.

Use [`backend-speed-reliability-map.md`](./backend-speed-reliability-map.md) as
the live M9 tracker. Do not reopen completed M1–M8 milestones merely to hide M9
work inside historical scope.
