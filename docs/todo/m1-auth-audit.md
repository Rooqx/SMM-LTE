# M1 authentication and personal-account audit

Date: 2026-10-08.

Scope: backend and server-only Astro code for Better Auth, personal ownership, Astro-to-Fastify identity, durable auth email, migrations, and regression tests. Frontend UI migration and browser E2E execution were explicitly excluded.

## Verdict

The M1 implementation is internally reviewable and its available automated checks pass. It is not production-accepted until Google OAuth, the real email gateway, public TLS/proxy behavior, secret management, and browser E2E are verified in staging.

## Requirement reconciliation

| Requirement | Result | Evidence or limit |
| --- | --- | --- |
| Self-host Better Auth on PostgreSQL | PASS | Better Auth 1.7.7, direct `pg` adapter, migrations `004`/`005` |
| Email/password, verification, reset | PASS | Real PostgreSQL integration covers registration, verification gate, sign-in, cookie, reset queue |
| Google sign-in and safe linking | IMPLEMENTED / EXTERNAL-PENDING | Provider enabled only with credential pair; encrypted tokens, DB state, verified trusted provider, same-email policy; live OAuth needs credentials |
| Secure revocable cookie session | PASS | HttpOnly, Lax, Secure in production, DB session, cache disabled, bounded expiry/update/freshness |
| No browser access/refresh pair | PASS | None implemented |
| Internal assertion server-only | PASS | Public `/api/auth/token` blocked and tested; BFF uses direct server API |
| Assertion validation | PASS | EdDSA-only, issuer, audience, required time claims, max age, size bound, skew, JWKS cache timeout |
| Authoritative revocation/membership check | PASS | Every user request checks verified user, active session, and membership; database test covers revocation |
| One personal owner under concurrency | PASS | Transaction, advisory lock, two uniqueness constraints; eight concurrent attempts tested |
| Future team migration path | PASS | Workspaces retain organization FK; membership constraints are narrow and documented |
| Separate user/service principals | PASS | Discriminated principal type, scoped routes, stable audit actors |
| Human-only approval/rejection | PASS | Approval guard rejects service principals; integration expects `403` |
| Account isolation | PASS | User and service cross-account API tests return `404` |
| Durable provider-neutral auth email | PASS | Queue commit, dedupe, strict schema, timeout, idempotency header, retry classification |
| Auth-email secret retention | PASS | Terminal jobs remove recipient, subject, body, and action link; database tested |
| Enumeration/abuse controls | PASS WITH STAGING CHECK | Better Auth generic duplicate/reset behavior and DB rate rules; distributed edge behavior needs staging |
| Exact production origins/HTTPS | PASS | Config rejects HTTP auth or additional trusted origins in production |
| No frontend redesign | PASS | No page/component/layout/style code changed for M1 |

## Senior engineering audit

### Security

- The first audit found Better Auth's JWT plugin network endpoint would expose the internal assertion. The Astro boundary now returns `404` for that endpoint while retaining direct server use.
- Better Auth JSON DTOs are recursively stripped of session/provider credential fields before they cross the browser boundary; cookie preservation and token absence are integration-tested.
- The first real database run found an audit-insert parameter inferred as both UUID and text. The query now pins the parameter as UUID and explicitly casts its text representation.
- The dependency audit found two critical `tinypool` advisories and a high-severity `braces` path in client tooling. Vitest/coverage were upgraded to 5.0.3, the unused parser was removed, and both package trees now audit clean.
- Service keys previously retained access to approval routes. Those routes now require a verified user principal, and the service-key denial is integration-tested.
- Browser forwarding headers are not trusted by the auth handler. Production origins and security-sensitive URLs require HTTPS.
- Claims never select an account. Queries re-derive current membership from PostgreSQL.
- OAuth credentials, email credentials, database credentials, session tokens, assertions, and reset links are absent from application responses/logging paths controlled by this code.

### Reliability and scalability

- Auth, API, and worker processes use bounded reusable pools and explicit network/database timeouts.
- Personal-account provisioning is idempotent under concurrent retries.
- Email requests are durable before response, retryable, deduplicated, and prioritized over the LLM backlog.
- Stateless API/BFF instances and PostgreSQL-backed state allow horizontal scaling. Production must budget total pool connections and add edge-distributed abuse control.
- JWKS rotation has a 30-day interval and seven-day overlap. Rolling deployment behavior remains a staging release gate.

### Maintainability and simplicity

- Better Auth owns password hashing, OAuth, verification, reset, session, and JWT key mechanics; application code does not reimplement them.
- Authentication, database pool, email queueing, identity verification, principal typing, and provider delivery have separate small modules.
- Comments explain security/concurrency reasons rather than restating syntax.
- The provider-neutral email boundary avoids coupling domain code to a vendor SDK.
- Exact pinned security-critical package versions and lockfiles make this milestone reproducible.

## Verification evidence

- Backend TypeScript: pass.
- Astro diagnostics: 67 files, zero errors/warnings/hints.
- Clean PostgreSQL 16 migration plus backend suite: 8 files, 17 tests passed.
- Better Auth plus client/server regression suite: 9 files, 26 tests passed.
- Browser E2E: not run by explicit instruction; complete procedure is in `docs/testing.md`.
- Live Google OAuth and real email delivery: external pending.

## Remaining gates

1. Configure production-like Google and email credentials in staging.
2. Wire the frontend forms/controls in a separate frontend task.
3. Run the documented browser, proxy, linking, and provider-failure scenarios.
4. Define production retention, SLO, RTO, RPO, backup restore, alerts, and connection budget.
5. Continue M2 without weakening the M1 identity/account boundary.
