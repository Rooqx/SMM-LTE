# F5 You and settings strict audit

**Date:** 2026-10-10  
**Result:** Implemented and internally verified against available contracts;
live provider acceptance and unsupported update/status contracts remain
external or blocked.

## Implemented

- Better Auth registration, verification resend, email/Google sign-in, generic
  recovery response, token reset, linked methods, password change, session list
  and revocation, and secure sign-out.
- Real authenticated identity and active-session data; no fixture user.
- User-namespaced account query keys and private cache/request clearing during
  sign-out. Session tokens remain transient, never rendered or persisted.
- Correct password-manager autocomplete and same-origin validated return paths.
- Inline confirmation before revoking another session; password changes revoke
  other sessions.
- Durable Obsidian job enqueue with an idempotency key reused across uncertain
  retries. Only the accepted `queued` state is reported.
- `/you` product route and query-preserving `/settings` compatibility redirect.
  The old infrastructure/status dashboard was removed from the product UI.

## Fail-closed limitations

- Autopilot/reminder/theme preferences and workspace/timezone mutation remain
  disabled because their durable authorized contracts do not exist.
- Export running/completed/failed state is not shown because there is no secure
  job-status read endpoint.
- Google and email delivery require deployment credentials and therefore remain
  external acceptance gates.
- Browser E2E and visual/device acceptance remain deliberately deferred by the
  owner; unit, contract, lint, type, and build evidence are tracked in the map.

## Verification

- Focused account/auth/session-security tests: 9 passed.
- Full resource-bounded non-browser suite: 20 files passed, 1 integration file
  skipped; 113 tests passed, 2 skipped.
- ESLint: 0 errors.
- Astro check: 136 files, 0 errors, 0 warnings, 0 hints.
- Production Astro server build: passed.
