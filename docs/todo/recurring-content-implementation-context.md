# Recurring content and low-friction interview implementation

Status: VERIFY (implementation and local gates pass; database/browser acceptance remains)

## Product outcome

Rasm must collect a useful brand brief without making a non-technical owner
invent every answer, then reuse the approved brand memory for future content.
Onboarding is performed once; a new week or an extra batch must not restart it.

## Interview contract

- Every question exposes no more than five answer paths: up to four concise,
  personalized suggestions plus one always-visible custom text field.
- Custom text is a first-class answer. It may be submitted alone or together
  with selected suggestions.
- Multi-select questions allow every applicable suggestion to be selected.
  They expose `Select all` only when all suggestions can be true together.
- Exclusive questions remain single-select.
- Questionnaire releases are immutable. These rules ship in a new version;
  already-started interviews remain pinned to their original release.
- AI suggestions are optional and bounded. Reviewed fallbacks appear
  immediately and use the same four-suggestion limit.

## Continuation modes

### Start next week

Reuse approved brand context, approved strategy and prior content history. Ask
only for temporary changes (offers, announcements, priorities, events or
campaigns), including an explicit `Nothing changed` path. Begin a new dated
planning cycle and retain prior weeks in Library.

### Create extra posts

Create an unscheduled batch using existing brand and strategy. Accept only the
topic, platforms, quantity, target publication date and temporary campaign
instructions. The command must be idempotent and must not mutate foundational
brand context.

### Refresh strategy

Start a new planning cycle only when goals, audience, offer or positioning have
materially changed. This is deliberately separate from normal weekly work.

## Engineering boundaries

- Backend owns selection bounds, cycle transitions and command validation.
- Browser callers never select raw skills.
- Commands are organization-scoped, same-origin, idempotent and auditable.
- Only one active generation command may mutate a workspace at a time.
- Existing approved artifacts and final posts remain immutable history.
- Library grouping continues to use structured `week`, `local_date` and
  `platform` fields rather than filesystem folders.
- New cycles must scope completed skills to the active phase instance/cycle;
  accepted work from a prior cycle must never skip the new cycle.

## Verification

- Questionnaire definition tests cover four suggestions, custom input and
  select-all eligibility.
- Component tests cover custom-only, combined, unrestricted multi-select and
  select-all behavior.
- API/database tests cover tenant isolation, idempotent replay, invalid state,
  cycle scoping and preservation of approved brand context.
- Client typecheck, unit tests and production build pass.
- Backend typecheck, unit/integration tests and production build pass.

## Final implementation audit — 2026-10-13

The shipped intake release is immutable `1.1.0`; existing sessions remain
pinned to their original definition. The runtime exposes no raw skill choice to
the browser. Recurring commands use the authenticated organization, an
idempotency receipt, a workspace transaction and an advisory lock. Normal and
extra batches require approved prior posts and a completed content phase, so a
new command cannot silently abandon unfinished work. Strategy refresh remains
the explicit material-change path.

The current command is stored as approved, cycle-scoped operational context.
It is injected into phases 2–4, while prompt rules preserve unaffected approved
brand/strategy memory and prevent temporary campaign instructions from being
promoted into foundational brand context. Accepted-skill lookup is scoped to
the active phase-instance start, preventing an older cycle from skipping work.

No migration was required: the implementation reuses context revisions,
phase-instance cycles, final-post metadata and command receipts already owned
by the schema. Library grouping remains a relational projection over structured
`week`, `local_date` and `platform` fields.

Automated evidence is recorded in
[`recurring-content-map.md`](./recurring-content-map.md). Live provider/browser
acceptance and a database-backed integration run remain deployment checks, not
claims made by the local suite.
