# ADR 0011: Run-scoped review revisions and structured final posts

Status: accepted

Date: 2026-10-08

## Context

The application already staged model output on a run, but it did not identify a stable review thread, create an explicit successor after revision instructions, preserve artifact parentage, or expose posts as queryable content. A stale browser action also needed to fail rather than accidentally act on whichever output was newest.

Markdown folders are useful as an export view, but they are not a safe authoritative model for hosted filtering, approval, lineage, pagination, or calendar behavior.

## Decision

Treat each `workflow_run` as one immutable review revision. Add a stable `review_thread_id`, monotonic `review_revision`, optional same-thread `supersedes_run_id`, and revision instructions. The exact run ID in a decision URL is the review-revision identifier.

`request_revision` is distinct from terminal rejection. It rejects and retains the current revision, records instructions, and creates a queued successor in one workspace-locked transaction. The successor copies the original recipe, skill-bundle/content, orchestrator/bridge, and immutable context pins. The model receives the previous output and instructions as untrusted revision input.

Approval and revision serialize on the workspace aggregate. Approval succeeds only for a pending latest member of its review thread. It promotes that run's permitted context proposals and applies all decisions/phase movement atomically. The model cannot invoke either human action.

Artifacts and final posts are append-only revisions with stable logical IDs and same-lineage parent foreign keys. Final posts are first-class PostgreSQL records containing copy, pinned comment, sprint/week, local editorial date, timezone snapshot, platform, campaign, topic/pillar, format, review status, and reserved publication status. APIs use bounded keyset pagination and fixed allowlisted filters; grouped views are projections over the same rows.

Obsidian remains a one-way export and is never read as runtime state.

## Consequences

- Stale and simultaneous decisions fail safely with one winner.
- Rejected content and prior approved revisions remain auditable.
- A revised post can change its date while retaining its logical identity.
- Canonical context cannot contain a mixture of proposals from different review revisions.
- Flat and folder-style post experiences need no filesystem synchronization.
- Revision prompts can grow with a very large prior output; the existing prompt budget intentionally fails oversized calls instead of silently dropping the content to be fixed.
- Publishing connectors, timed schedules, queue fencing, retention automation, and load/recovery evidence remain separate work.

## Rejected alternatives

- Updating an artifact or post row in place: loses evidence and makes stale decisions ambiguous.
- Treating the newest run as the approval target: lets an old page approve content the user never reviewed.
- Storing final posts only inside Markdown/JSON artifacts: makes filtering, lineage, and calendar grouping fragile.
- Making Obsidian or server files authoritative: breaks horizontal scaling and transactional approval.
- Introducing a generic workflow/revision engine: adds complexity without improving the fixed SMM lifecycle.
