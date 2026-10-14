# Testing and verification

## Automated checks

Backend:

```bash
cd backend
pnpm install --frozen-lockfile
pnpm run skills:audit
pnpm run typecheck
pnpm test
pnpm run build
pnpm audit --audit-level high
pnpm run security:scan
pnpm run eval:release
```

Astro server/client regression:

```bash
cd client
pnpm install --frozen-lockfile
pnpm run check
pnpm test
pnpm run build
pnpm audit --audit-level high
```

Do not run browser end-to-end tests as part of the backend implementation task. The project owner or a later agent can follow the scenario below.

## PostgreSQL integration

Use a dedicated disposable database and set `TEST_DATABASE_URL`; never point tests at development or production data.
Set `DATABASE_SSL` to match the disposable server (normally `false` for a
local non-TLS instance) so a developer `.env` cannot silently change the test
transport.

```bash
export TEST_DATABASE_URL='postgresql://test-user@127.0.0.1:5432/smm_test'
cd backend && pnpm test
cd ../client && pnpm test
```

The automated M1 coverage verifies clean migrations, concurrent one-owner provisioning, user account isolation, session revocation, service-key isolation, Better Auth registration and verification gating, session cookie creation, internal assertion generation, browser denial of the assertion endpoint, password-reset queuing, email payload validation/priority/disposal, workflow idempotency, staged output, approval, and stale recovery.

M2 coverage verifies clean and seeded legacy migrations; atomic phase-1 initialization; database-enforced workspace ownership; concurrent monotonic messages; valid summary boundaries; one pending question; exact-version, request-hashed answer idempotency; one-winner answer races; immutable context lineage; concurrent context updates; and exact pinned-revision retrieval. See `todo/m2-workflow-memory-audit.md` for the recorded evidence and limits.

M3 coverage verifies six complete recipes; all 44 skill classifications; mandatory ordering; optional allowlist rejection; startup failure for incomplete classification; deterministic human continuation; denial of raw skill selection to user principals; complete release pins; immutable enqueue-time context; active-release readiness; unsupported-skill rejection; and execution from an older recipe/bundle while the current release is also installed. See `todo/m3-recipes-and-bundles-audit.md` for evidence and limits.

M4 coverage verifies the strict action union and provider envelope; relevant-context selection; missing/oversized context behavior; bounded post-summary conversation; complete prompt limits; UTF-8 tool-result bounds; denied tools; exact tool-result persistence; pinned optional-skill execution; adaptive question persistence; exact-version answer/replay and automatic resume; call/token accounting; phase-3 automatic transition; and the approved phase-6-to-2 cycle. See `todo/m4-memory-and-actions-audit.md` for evidence and limits.

M5 coverage verifies a pristine `001`–`009` migration chain and a seeded `001`–`008` upgrade; legacy run/artifact lineage backfill; exact revision requests and idempotent replay; stale approval rejection; one-winner concurrent decisions; no context promotion on rejection; exact winning-revision promotion; pinned revision execution input; artifact and final-post parentage; date changes within one logical post lineage; stable keyset pagination while newer rows arrive; account-scoped status/platform/campaign/date/full-text filters; grouped output; malformed cursor rejection; and local-date/DST fixtures independent of server timezone. See `todo/m5-review-content-audit.md` for evidence and limits.

M6 coverage verifies a pristine `001`–`010` chain and populated `001`–`009` upgrade; renewable monotonic leases; stale-worker fencing before step/artifact transitions; bounded global/per-account admission; conservative daily token/spend reservation; account-fair claiming; correlation across run/job/step; idempotent durable export jobs; migration-aware readiness; aggregate content-free metrics; provider error classification; pagination caps; dead-job controls; and the earlier M1–M5 regressions. See `todo/m6-operational-hardening-audit.md` for recorded evidence and the external production gates.

M7 repeats the complete disposable-PostgreSQL backend and Astro server-boundary
regressions, type/build checks, deterministic release evaluation, skill audit,
dependency and secret scans, source/API/migration inventory, and documentation
link reconciliation. It classifies every remaining completion item without
mistaking local checks for live-provider or production-scale acceptance. See
`todo/m7-final-backend-audit.md` for the final internal verdict and open gates.

M8 coverage verifies a pristine `001`–`011` migration chain, account/workspace
isolation, active-run recovery, bounded and malformed run/activity/context/export
history cursors, optimistic workspace/preference conflicts, exact Obsidian job
reads, publication transition rules, idempotent replay, changed-material key
rejection, no-op confirmation without a version bump, and audit attribution.
The clean regression passed 21 backend files and 64 tests. The client contract
and Variant B reconciliation passed lint, a 132-file zero-diagnostic Astro
check, 127 tests with 2 skips, and the production build. Browser E2E remained
explicitly deferred.

M9.0–M9.1 coverage verifies the immutable questionnaire catalog, retained
version pins, ordered branch references, beginner-facing reviewed fallbacks,
content-free bounded performance metrics, and error-safe trace behavior.
PostgreSQL integration coverage additionally exercises concurrent one-authority
selection, legacy-path pinning, mixed-version resume, account isolation,
application-assigned model option IDs, provenance, idempotent answer replay,
optimistic conflicts, supersession history, and one-winner answer races. These
database tests skip unless `TEST_DATABASE_URL` points to a dedicated disposable
database; a skipped run cannot promote M9.1 from `VERIFY` to `DONE`.

M9.2–M9.7 local coverage verifies deterministic compilation and branching,
strict option-provider schemas and failure fallback, durable low-priority option
admission, all six pinned Phase 1 steps, content-free durable progress, Astro
contracts/accessibility, and build integrity. The fresh final counts and the
still-open PostgreSQL/provider/browser gates are recorded in
[`todo/m9-final-audit.md`](./todo/m9-final-audit.md).

The HTTP load runner is intentionally dependency-free and bounded. Run it only against an authorized staging environment, then follow the multi-hour soak, query-plan, autovacuum, restore, and evidence procedure in `runbooks/production-readiness.md`. Local smoke evidence is not a substitute for production-like volume.

## Deferred end-to-end procedure

Prepare a staging domain with HTTPS, a new database, a test Google OAuth client, an inbox you control, the real email gateway, the mock LLM for deterministic checks, and API/worker logs with secret redaction. Record timestamps and IDs, never passwords or tokens.

### 1. Email account lifecycle

1. Register a new email/password user.
2. Confirm the response does not create a usable session before verification and the verification message arrives once.
3. Repeat registration and resend calls; confirm generic responses, rate limiting, and no duplicate owner account.
4. Open the verification link once, then confirm reuse/expiry fails.
5. Sign in, inspect the cookie flags, sign out, and confirm the old session is rejected.
6. Request a reset for existing and nonexistent emails; compare public responses and approximate timing.
7. Reset the password, confirm the link is single-use, the old password fails, and all prior sessions are revoked.

### 2. Google and account linking

1. Sign in with a verified Google address that has no local account; confirm only identity scopes are requested.
2. Confirm exactly one user, one personal account, and one owner membership exist.
3. Exercise the reviewed same-email linking order for password-first and Google-first accounts.
4. Confirm an unverified or mismatched email cannot silently take over/link another owner.
5. Revoke Google consent and confirm ordinary application session behavior matches the documented policy.

### 3. Identity and isolation

1. Confirm browser calls to `/api/auth/token` return `404`.
2. Confirm browser storage contains no service key, assertion, access token, or refresh token.
3. Create two users/accounts and one workspace in each.
4. Attempt every ID-based read/mutation across accounts; expect `404` or the documented denial.
5. Revoke a session directly through session management while a page is open; the next sensitive API call must fail.
6. Send spoofed forwarding headers through the public proxy; callback origin, cookie security, rate-limit identity, and audit IP must remain correct.

### 4. Guided workflow, phases, and revisions

The backend contracts in this section are implemented through M5 and the guided
frontend now consumes them. Browser execution remains a separate, explicitly
deferred task; follow [`../client/docs/e2e-testing.md`](../client/docs/e2e-testing.md):

1. Create a workspace and confirm phase 1/onboarding starts exactly once.
2. Answer adaptive questions using both suggested and custom answers; refresh between steps and verify durable resume.
3. Review onboarding output, request a revision, confirm history remains, then approve the exact current revision.
4. Confirm approved brand details appear in canonical brand context and as an immutable artifact revision.
5. Repeat review/revision/approval through phase 2.
6. Confirm phase 3 advances automatically only after all mandatory creation steps succeed.
7. Confirm phase 4 and phase 5 wait for the correct approvals.
8. Complete phase 6 and confirm approved calibration loops to phase 2.
9. Attempt stale, simultaneous, replayed, cross-phase, arbitrary-skill, and over-budget actions; verify one valid winner and safe errors.

Adaptive-question follow-up (manual acceptance, not yet run): open an AI-generated `multiple` question, select two suggestions and write an additional answer, then submit and confirm all three appear in the saved conversation. Confirm `Select all` is available only on compatible multi-select questions; an exclusive question stays radio/single-choice. Submit an answer and immediately try the Today continuation control: it must show the active run or next question, not a false `workspace_busy` banner. In a workspace where a skill has already asked two questions and required context exists, answer the latest question and confirm the next run produces its contracted artifact rather than asking a third clarification. Existing questions created before migration `017` remain single-choice by default.

### 5. Artifacts, final posts, and recovery

1. Verify artifact lineage and approved/canonical status after revisions.
2. Query final posts by sprint/week, date/day, platform, campaign, and status; compare flat and folder-style views.
3. Verify timezone and DST fixtures determine day/week grouping, not server local time.
4. Stop a worker during model execution, let the lease expire, restart it, and confirm recovery does not duplicate output.
5. Deploy different old/new recipe or skill bundles; confirm readiness prevents unsafe mismatch and pinned work continues with the intended version.
6. Simulate email gateway timeout, `429`, permanent `4xx`, and uncertain acknowledgement; confirm bounded retry, idempotency, terminal disposal, and operator visibility.

### 6. Release evidence

Attach sanitized results for automated checks, Google/email acceptance, cross-account denials, proxy tests, load/soak behavior, migration rehearsal, backup restore, rollback, and alert firing. Any failed security/isolation assertion blocks production release.
