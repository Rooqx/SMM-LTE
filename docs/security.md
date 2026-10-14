# Security model

## Human authentication

Better Auth is self-hosted on the existing PostgreSQL database. It provides:

- email/password registration with a 6-to-128-character password policy;
- generic duplicate-registration and password-reset behavior;
- one-hour, single-use email-verification links;
- 30-minute, single-use password-reset links;
- revocation of all sessions after a successful password reset;
- optional Google sign-in only when both Google credentials are configured;
- encrypted OAuth tokens and database-backed OAuth state;
- database-backed rate limits for sign-in, sign-up, reset, and verification resend;
- a 30-day revocable session, daily idle refresh, and a ten-minute freshness window.

Cookies are `HttpOnly`, `SameSite=Lax`, path `/`, and `Secure` in production. Production auth and every trusted origin must use HTTPS. Cookie session caching is intentionally disabled, so revocation is checked against PostgreSQL.

The Astro auth boundary replaces browser-supplied forwarding headers with the server-observed client address, uses a fixed base URL, and relies on Better Auth's exact-origin checks for mutations. No application access/refresh-token pair exists, and no auth credential belongs in `localStorage` or `sessionStorage`.

## Astro-to-Fastify identity

Astro obtains a 60-second Ed25519 assertion with an explicit issuer and audience. The network-accessible `/api/auth/token` endpoint returns `404`; only server code calls the token API directly. Fastify accepts only `EdDSA`, requires standard time/issuer/audience claims, allows five seconds of clock skew, bounds token age, and limits token size.

JWT account claims are not trusted for authorization. Every user request rechecks the authoritative verified user, active session, and owner membership. First access provisions exactly one personal account under a transaction and per-user advisory lock. Revoking the session immediately blocks Fastify access even if an issued assertion has not expired.

## Service authorization

The bootstrap CLI creates a random `smm_...` service key. PostgreSQL stores only its SHA-256 digest, prefix, scopes, expiry, revocation, and throttled last-use metadata. Service keys are for CLI tools and controlled machine clients, not browsers or human approvals.

Every `/v1/*` request resolves to a typed `user` or `service` principal. Route scopes and organization-filtered SQL both apply. Another account's identifier returns `404` rather than confirming its existence. Audit rows store stable user-derived or API-key identifiers, never plaintext credentials.

Durable workflow repositories require both workspace and organization ID for browser/API reads. Composite foreign keys additionally bind workflows, phases, steps, conversations, messages, questions, answers, runs, and context revisions to one workspace. Exact question versions plus request hashes reject stale or materially changed retries; audit metadata excludes raw answer content.

Human approve/reject/revise routes require a verified user principal; service keys and model actions cannot make a human decision. The exact run ID identifies the reviewed revision. Workspace/run locks, pending/latest-thread checks, and same-workspace parent foreign keys prevent stale, cross-account, or simultaneous decisions from mutating a newer revision. Revision idempotency binds the key to the target run and instructions.

## Auth email security

Verification and reset messages are committed to PostgreSQL before the auth
request returns. The worker validates a strict payload and calls either the
native Resend adapter or the provider-neutral HTTPS webhook with a bearer
credential, timeout, and idempotency header. Provider-specific response rules
classify retryable versus permanent failures; a Resend `409` is not considered
proof of delivery. Completed and dead jobs remove recipients and action links
from their payloads. Production must select one provider and supply its full
server-side configuration.

Operators must still apply a retention policy to verification rows, sessions, rate-limit rows, completed jobs, and audit data. Database backups contain authentication material and must be encrypted and access-controlled.

## Prompt, API, and secret safety

- Only repository-controlled text enters the developer message.
- User/context content stays in the untrusted user message.
- Model output must match a strict, bounded schema and remains staged until approval.
- One locally validated discriminated action is accepted per model call; provider-side JSON schema is defense in depth, not the trust boundary.
- Tools, optional skills, artifact kinds, and context keys are denied unless the exact pinned recipe step allowlists them.
- The only current model tool is an account-scoped, read-only, row-limited and UTF-8-byte-limited approved-artifact query.
- Required context is never silently truncated. Oversized memory or prompts fail closed, and calls/tokens/time/depth are bounded.
- Conversation/tool data remains untrusted user-message content; retrieved text can never become developer instructions.
- Request bodies, run input, upstream responses, model time, retries, tokens, context, artifacts, and arrays are bounded.
- Artifact/post list fields and filters are allowlisted, parameterized, and capped. Opaque cursors are locally decoded and validated before any database cast.
- Generated content remains data. API responses use JSON and explicit projections; frontend rendering must continue to escape/sanitize model Markdown rather than injecting raw HTML.
- CORS is disabled unless an explicit allowlist is configured.
- Security and no-cache headers are emitted on responses.
- Authorization headers are redacted from Fastify logs; secrets and action URLs must never be added to application logs.
- Production requires HTTPS auth/JWKS/email URLs and secrets supplied through the host secret manager.
- Trust proxy hops only when the exact proxy topology is known and tested.

Google OAuth, the real email gateway, edge rate limiting, secret rotation, and proxy behavior require staging verification with production-like credentials before release.

Operational logs redact authorization, cookies, tokens, secrets, passwords, prompts, content, and payload fields. Correlation records contain opaque IDs only. `/metrics` is disabled without `METRICS_BEARER_TOKEN`, returns `404` for invalid credentials, and exposes aggregate operational values rather than tenant identifiers or content. The token must be distinct from user sessions and service API keys and reachable only through the private monitoring path.

Queue completion is an authorization decision: owner, fencing token, status, and unexpired lease must all match. Workflow writes additionally validate the run execution fence inside the same transaction. Account queue/token/spend admission is enforced server-side and cannot be overridden by model output or browser fields.
