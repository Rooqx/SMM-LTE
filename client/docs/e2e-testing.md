# End-to-end testing handoff

Browser execution is intentionally deferred at the owner's request. This is the
handoff for a later engineer or agent; no browser result is claimed by F6/F7.

## Safety warning

The retired harness created an `smm_session` cookie with obsolete
`SMM_API_KEY`/`CLIENT_ACCESS_PASSWORD` settings. F6 removed those embedded
credentials and replaced the old scenario with an explicit skipped handoff.
There is intentionally no runnable browser acceptance suite until the Better
Auth fixture below is implemented. Do not restore the retired shortcut.

Never use production data, production OAuth credentials, a real Obsidian vault,
or uncapped model/provider credentials. Failed traces, screenshots, videos, and
HTML reports can contain private content; store them in a restricted location
and scan them before sharing.

## Test lanes

Keep two explicit lanes instead of mixing mocked UI evidence with live-system
acceptance:

1. **Deterministic visual/interaction lane** — create a real test-only Better
   Auth session in a disposable database, then intercept only `/api/smm/*` with
   strict fixtures for all eight Today moments and secondary pages.
2. **Live integration lane** — use disposable PostgreSQL, Fastify, worker, mock
   LLM, Astro, a controlled email inbox, and test Google OAuth credentials. Do
   not intercept application APIs in this lane.

## Completed harness safety work

The hand-built HMAC cookie helper, obsolete shared-secret environment values,
and fake shared-cookie scenario were removed. The remaining skipped file is a
quarantined handoff marker; it is not evidence of browser acceptance.

## Required work before execution

1. Add a global setup that provisions a unique verified owner through a
   test-only fixture boundary or Better Auth's real HTTP flow. Save an encrypted
   or ephemeral Playwright `storageState`; never commit it.
2. Provide test-only `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`,
   API assertion keys, and backend/worker configuration through the process
   environment. Keep them out of config source and reports.
3. Apply migrations to a newly created disposable database and seed only the
   account/workspace records required by each project.
4. Update backend mocks to the current workflow, pending-question, review
   revision, artifacts, grouped final-posts, sessions, and export-job schemas.
   Unmatched requests must fail the test instead of returning a permissive
   fallback.
5. Use projects for Chromium, Firefox, and WebKit at desktop plus a narrow mobile
   viewport. Avoid browser-channel assumptions such as requiring local Chrome.
6. Set trace/video to `retain-on-failure` only in the restricted artifact
   directory. Add teardown that removes storage state and the disposable DB.

## Minimum deterministic scenarios

- Unauthenticated product routes redirect to `/login`; protected API calls
  return the normalized `401` envelope.
- Registration, login, recovery, and reset forms have correct labels,
  autocomplete, generic account-enumeration-safe errors, and hostile `next`
  values remain local.
- First workspace creation opens onboarding automatically. The dialog traps and
  restores focus and survives keyboard-only operation.
- Today renders every deterministic moment, from welcome and adaptive question
  through production/QC, final posts, and the Phase 6-to-2 cycle.
- Suggested and custom generated answers send the exact question/version and
  one idempotency key. Refreshing a preserved validated `?run=` URL resumes via
  the backend run read; a new URL does not claim to discover an in-flight run.
- Approve/reject/revise handles the exact review revision; a stale `409` is
  announced and refreshes current state.
- Library Fast, Folders, and Needs review cover filters, cursor load-more, copy
  confirmation, grouped disclosures, empty/error states, and the page-retention
  boundary.
- Brand shows canonical source provenance and safe Markdown. You lists methods
  and sessions, requires confirmation for revocation, securely signs out, and
  reports Obsidian export as queued only.
- Workspace switching and logout cannot display the previous identity's cached
  data. In-flight reads are aborted.
- Legacy skill URLs redirect to Today; raw skill listing/run creation and
  direct context writes remain blocked by the browser route allowlist.
- Axe reports no serious/critical violations on every primary surface. Keyboard
  focus remains visible and unobscured by the sticky header/mobile dock.
- Screenshots at `390×844` and `1440×1000` compare deterministic fixtures; mask
  names, email addresses, request IDs, and timestamps.
- Manifest resources load before authentication, installation uses the native
  browser prompt when available, and standalone launch returns to Today after
  authentication.
- Offline navigation shows only the generic offline page. Service-worker cache
  inspection must contain no authenticated HTML, API response, workflow state,
  generated post, or account data before or after sign-out.

## Live security and isolation scenarios

- Verified and unverified email lifecycle, single-use verification/reset links,
  rate limits, session-cookie flags, revocation, and generic recovery responses.
- Google-first/password-first linking according to the approved policy, with
  exact callback origins and minimum scopes.
- Two owners cannot read or mutate each other's workspace, run, question,
  artifact, post, session, or export-job identifiers.
- `/api/auth/token` remains unavailable to the browser; browser storage and
  bundles contain no assertion, service key, session credential, reset link, or
  database URL.
- Cross-origin mutations and spoofed forwarding headers fail safely. Deployed
  headers include enforced CSP, HSTS, no-store, frame denial, nosniff,
  referrer/permissions policy, COOP, and CORP.
- Worker interruption, lease recovery, idempotent replay, stale decisions, and
  concurrent actions produce one valid winner without duplicate output.

## Suggested execution order

After migration, run the non-browser gates first:

```bash
pnpm install --frozen-lockfile
pnpm run lint
pnpm run check
pnpm test
pnpm run build
pnpm audit --audit-level moderate
```

Then start the isolated backend, worker, and dependencies and run the browser
projects. Use `pnpm test:e2e -- --project=<project>` for one project and only run
the whole matrix after a smoke project succeeds. Record exact commit, browser
versions, environment, timestamps, sanitized failures, and whether the lane was
mocked or live.

The broader backend and production procedure remains in
[`../../docs/testing.md`](../../docs/testing.md).
