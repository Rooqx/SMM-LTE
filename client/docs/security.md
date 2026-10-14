# Client server security model

## Implemented server controls

- Better Auth owns password hashing, email verification, recovery, Google OAuth, database sessions, and database abuse limits.
- Session cookies are `HttpOnly`, `SameSite=Lax`, path `/`, and `Secure` in production.
- Production auth and every extra trusted origin must use HTTPS.
- The Astro middleware checks the authoritative session and requires verified email for protected application routes.
- The BFF obtains a 60-second EdDSA assertion directly on the server and never uses a browser service key.
- The public `/api/auth/token` path is blocked so browser JavaScript cannot retrieve the Fastify assertion.
- Browser mutations must pass same-origin checks and use JSON.
- `/api/smm/*` uses an explicit method/path allowlist, 512 KiB request limit, 4 MiB response limit, and 20-second upstream timeout.
- Server configuration is schema-validated, cached, and never exposed through `PUBLIC_*` variables.
- Security headers and `no-store` apply to success, authentication failure, and redirect responses.
- Markdown rendering does not enable raw HTML, and filenames are normalized before download.

## Identity boundary

Astro passes a signed user/session assertion to Fastify. Fastify then rechecks the verified user, session expiry/revocation, and personal-account membership in PostgreSQL. JWT contents do not choose the account.

There is no application access/refresh-token pair. Do not put a session token, assertion, service key, Google secret, database credential, or email credential in local/session storage, browser code, test traces, or client-visible environment variables.

The account UI may hold Better Auth session tokens transiently in memory to
identify the current session and submit revocation commands. Tokens are never
rendered, logged, persisted, or sent outside the same-origin Better Auth API.
Account queries are keyed by user ID. Secure sign-out cancels outstanding
queries, clears private query data, removes any residual identifiers left by
retired client versions, then redirects after server-side sign-out succeeds.

The browser product allowlist excludes raw skill listing/execution, direct run
creation, context writes, and synchronous filesystem export. A Today `run` URL
parameter must be a canonical UUID and the returned run must belong to the
selected workspace before it can affect presentation state.

## Deployment notes

- Use a high-entropy `BETTER_AUTH_SECRET` from the host secret manager.
- Use a fixed HTTPS `BETTER_AUTH_URL` and exact trusted origins.
- Configure Google credentials as a pair and register the exact environment callback URL.
- Ensure Astro's observed client address comes only through the reviewed proxy topology.
- Budget Astro's database pool together with API and worker pools.
- Keep edge-distributed abuse controls in addition to Better Auth's database rules.
- Astro emits hashes for generated script/style resources. Middleware enforces
  frame/form/object/base restrictions without an `unsafe-inline` exception.
  Recheck the final header/meta combination at the deployed TLS origin before
  release; do not weaken it to accommodate third-party scripts.
- Public browser source maps are disabled. Observability is content-free by
  default and may correlate normalized failures only with a bounded request ID.

## Deliberately pending

- Live Google sign-in/linking requires configured OAuth credentials and an exact
  production callback origin.
- Verification and recovery delivery require the configured transactional email
  worker/provider.
- Preference and workspace updates use owner-only routes with optimistic
  versions; stale clients must refresh instead of overwriting newer state.
- Obsidian completion state comes only from the exact account-scoped job-status
  read; job IDs are opaque lookup keys, never authorization.
