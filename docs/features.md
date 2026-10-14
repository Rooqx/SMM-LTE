# Features and use cases

## Primary use case

The target product is an autopilot social-media-management agent that guides one owner through discovery, strategy, creation, quality control, repurposing, and analytics feedback. Each `SKILL.md` remains a source-controlled instruction module; application code owns security, state, phase transitions, approvals, and side effects.

## Implemented backend foundation

- Self-hosted Better Auth with email/password, verification, recovery, optional Google sign-in, revocable database sessions, and database abuse limits.
- One hidden personal account and owner membership provisioned safely under concurrency.
- Separate typed human and machine principals with account-scoped authorization.
- Short-lived EdDSA Astro-to-Fastify assertions that are unavailable to browser JavaScript.
- Durable, deduplicated verification/reset email work through a provider-neutral worker adapter.
- Phase-scoped skill discovery and cross-phase rejection.
- PostgreSQL persistence for workspaces, context, runs, steps, usage, approvals, artifacts, jobs, and audit events.
- Durable per-workspace workflow/phase state, ordered conversation messages, bounded summaries, exact pending questions/answers, and immutable canonical-context history.
- Atomic phase-1 initialization for every new workspace and safe legacy-workspace/context backfill.
- Typed, validated recipes for all six phases with deterministic mandatory-step selection.
- Explicit classification of all 44 skills: 18 mandatory, 16 optional, 4 internal, and 6 unsupported.
- A human `continue` intent that does not allow browser callers to choose skills or declare a phase complete.
- Immutable skill bundles and exact recipe, skill, orchestrator, bridge, and context-revision pins for queued work.
- Mixed-version execution that retrieves old trusted bundle content instead of silently substituting the current files.
- Strict single-action model contracts with locally enforced recipe permissions.
- Bounded step-scoped memory from exact pinned context, versioned summaries, and recent post-summary messages.
- Adaptive one-question-at-a-time onboarding with suggested answers, custom answers, exact-version/idempotent submission, and automatic recipe resumption.
- Adaptive skill questions now declare single- or multi-select semantics. Compatible suggestions can be combined with an always-visible written answer; exclusive questions remain single-choice. After two clarifications per skill/phase when required context is present, the skill must draft its deliverable from known facts instead of interviewing indefinitely.
- Controlled optional skills loaded from the pinned bundle and one read-only bounded approved-artifact tool.
- Explicit call, token, duration, depth, prompt, memory, and tool-result limits with durable usage/rejection records.
- Transactionally synchronized compatibility and durable phase transitions, including phase 3 automatic advance and the phase 6-to-2 cycle.
- Bounded jittered retries, renewable fenced leases, late-result rejection, active-run concurrency control, and request idempotency.
- Global/per-account queue admission, daily account token and configured spend ceilings, fair account claim ordering, and bounded worker/model/HTTP/database concurrency.
- End-to-end request/run/job/step/provider correlation, migration-aware readiness, structured redacted logs, and authenticated aggregate Prometheus metrics.
- Staged model artifacts and context proposals promoted only after authenticated approval.
- Exact review-thread revisions with stale/conflicting decision rejection and one-winner approval/revision concurrency.
- Idempotent revision requests that retain rejected output, copy exact recipe/skill/context pins, and feed instructions plus the prior output into the successor run.
- Immutable artifact lineage with stable logical IDs, parent revisions, attribution, decision status, and revision instructions.
- Structured final-post revisions with copy-ready content, pinned comments, sprint/week/local-date/timezone/platform/campaign/topic/pillar/format metadata, publication state, and revision lineage.
- Active-run recovery in workflow state plus bounded run, audit-activity, and
  immutable context-history reads.
- Durable version-checked owner preferences and workspace updates.
- Account-scoped Obsidian export-job history/status and an idempotent,
  versioned final-post publication-state command.
- Bounded cursor pagination and account-scoped artifact/final-post filters, full-text post search, exact-item reads, and grouped sprint/week/day projections.
- Deterministic mock and OpenAI Responses provider implementations.
- One-way bounded/atomic approved Markdown export to Obsidian, plus a durable idempotent export-job contract for hosted workers.
- Low-friction guided intake release `1.1.0` with four bounded personalized
  suggestions, an always-visible first-class written answer, compatible
  option-plus-text answers, and semantic `Select all` support.
- New guided intake release `1.2.0` asks only four owner-specific essentials;
  earlier interview sessions stay pinned to their original release.
- Approved calendar rows now define backend-owned post slots. Phase 3 saves
  drafts in batches of up to three and Today shows actual drafted/scheduled
  counts. Phase 4 refuses to offer an incomplete final batch for approval.
- Explicit recurring-content actions for starting the next week, creating an
  on-demand batch, or deliberately refreshing strategy. Normal continuation
  reuses approved brand/strategy memory and retains prior weeks in Library.
- The Today review-deliverable panels render AI-authored Markdown as readable
  headings, lists, emphasis, tables, and links. Raw HTML and remote images are
  not rendered; the stored deliverable remains unchanged.
- Today review panels for brand, calendar, and quality deliverables keep long
  drafts in a bounded, keyboard-scrollable area with a full-screen mobile/
  expanded desktop reading view. Markdown drafts also offer a quick skim made
  only from their existing paragraph and headings, never a generated summary.
  Approval and revision controls remain outside the scroll area and continue to
  act on the complete stored deliverable; this is a client-only presentation
  change with no new backend state or API contract.

## Implemented at verification status

- M9 guided-intake speed and reliability: backend-owned versioned questions,
  beginner-friendly option-first interviewing, non-blocking small-model option
  personalization with deterministic fallbacks, a programmatic factual intake
  compiler, reduced Phase 1 primary-model calls/prompts, and live progress
  delivery. The agreed behavior and frontend work are tracked in
  [`todo/backend-speed-reliability-implementation-context.md`](./todo/backend-speed-reliability-implementation-context.md);
  implementation is complete locally; production-like latency/provider and browser
  rollout evidence remains open.

## Intentionally pending
- Frontend forms and controls wired to the new Better Auth endpoints. This milestone changed server/backend code only.
- Live Google OAuth and transactional-email-provider acceptance, which require deployment credentials.
- Publishing and scheduling connectors, media/object storage, bidirectional Obsidian sync, and team management.
- Production monitoring/alert-system wiring, production-like load/soak evidence, managed encrypted backup/PITR restore evidence, and owner acceptance of the proposed SLO/RTO/RPO.

The implemented list deliberately does not claim that the existing frontend already provides the intended autopilot experience.
