# M8 product-contract completion audit

**Status:** internally complete  
**Audited:** 2026-10-10  
**Scope:** backend product contracts, Astro BFF/client reconciliation, and
database migration `011`

## Outcome

M8 closes the concrete contracts that the owner-facing product was previously
forced to represent as unavailable. It does not add a generic workflow engine,
team tenancy, vector storage, or a third-party social publisher.

## Implemented boundaries

| Concern | Implementation | Audit result |
| --- | --- | --- |
| Active work recovery | Workflow state returns the account-scoped queued/running/approval-waiting run | PASS — client verifies workspace ownership and needs no browser-stored source of truth |
| Run and activity history | Bounded keyset reads scoped by workspace/account | PASS — malformed cursors fail closed and limits are capped |
| Context history | Immutable revisions, optional exact-key filter, bounded cursor | PASS — Brand reads one selected key at a time; no unbounded request fan-out |
| Preferences | One owner row, full version-checked replacement | PASS — stale updates return conflict and writes are audited |
| Workspace updates | Allowlisted owner fields with expected workspace version | PASS — lock, account scope, audit, and stale conflict are explicit |
| Obsidian jobs | Workspace list and exact job status reads | PASS — organization is derived from the principal, not request data |
| Publication state | Approved-post-only transition machine, optimistic version, idempotency receipt | PASS — changed material conflicts; same-state confirmation does not inflate the version |
| Browser exposure | Exact method/path allowlist and strict Zod responses | PASS — raw skill execution and direct context mutation remain blocked |

## Security and reliability review

- Every query carries the authenticated organization and, where applicable,
  workspace boundary. Cross-account absence is returned without leaking row
  existence.
- Owner-only mutations use the existing verified-user guard and scope checks.
- Parameterized SQL is isolated in `ProductStore`; route handlers perform only
  validation, authorization orchestration, and response mapping.
- Mutations lock the current row and compare an explicit positive version.
- Publication idempotency uses an account-scoped advisory lock plus a SHA-256
  material request hash and bounded stored response.
- Audit entries contain identifiers, status, version, and changed-field names;
  they do not copy generated post bodies or secrets.
- Keyset cursors validate timestamp and UUID/integer shape before reaching SQL.
- Migration `011` is additive. The API readiness target is `011`, preventing a
  newly deployed API from serving against an older schema.

## Verification evidence

- Clean PostgreSQL 16 migration `001`–`011`: pass.
- Complete backend regression: 21 files, 64 tests passed.
- Backend typecheck: pass.
- Astro/client strict check after contract and Variant B reconciliation: 132
  files, zero errors/warnings/hints.
- Client suite: 22 files passed, 1 skipped; 127 tests passed, 2 skipped.
- Client production server build: pass.
- Browser E2E: not run, by explicit owner request; the documented later
  procedure remains authoritative.

## Residual boundaries

- Audit activity is not a notification/unread inbox. The shell continues to
  state that notifications are unavailable.
- “Improve in Today” delegates to backend-controlled orchestration; there is no
  arbitrary Brand skill or context-write endpoint.
- Publication status is an application record, not evidence that LinkedIn, X,
  Instagram, or another provider accepted a post. External connectors require
  a durable outbox/provider integration and a new approved scope.
- M1 live Google/email/proxy acceptance and M6 production-scale soak,
  backup/PITR, alerts, and rollout rehearsals remain external gates.

## Verdict

The M8 contract layer is simple enough to review, explicit about concurrency,
secure at the account boundary, and extensible without changing the six-phase
orchestration model. It is complete for local/internal acceptance. Production
approval still depends on the named M1/M6 external evidence.
