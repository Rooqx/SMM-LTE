# ADR 0007: Better Auth sessions and personal owner accounts

- Status: accepted
- Date: 2026-10-07

## Decision

Self-host Better Auth on the existing PostgreSQL database for browser users. Use verified email/password or Google sign-in, revocable HttpOnly server-side sessions, and one idempotently provisioned personal organization with one owner membership per user.

The Astro server exchanges the session for a 60-second EdDSA assertion. Fastify verifies that assertion through Better Auth's JWKS endpoint, then re-checks the user, session, verification state, and membership in PostgreSQL. The assertion never chooses the organization. Existing hashed service keys remain a separate machine principal.

Verification and password-reset messages enter the existing PostgreSQL queue
and are delivered by the worker through the email-provider boundary. Resend is
the recommended hosted adapter and a provider-neutral HTTPS webhook remains
available. The browser receives neither a service key nor an
access/refresh-token pair.

## Why

This gives the web product normal account recovery, Google sign-in, revocation, individual audit attribution, and tenant isolation without building a custom OAuth server or putting long-lived bearer credentials in browser storage. Personal ownership keeps the initial product simple while the membership table provides a clean future migration point for teams.

## Consequences

- Astro and Fastify must agree on issuer and audience configuration.
- PostgreSQL is required for auth sessions, identities, rate limits, JWKS keys, personal membership, and email delivery.
- Production requires HTTPS, a strong Better Auth secret, Google credentials if Google is enabled, and a transactional email gateway.
- ADR 0006 still applies to machine integrations; service keys are not browser identities.
