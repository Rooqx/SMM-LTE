# ADR 0015: Resend transactional-email adapter

## Status

Accepted.

## Decision

Use Resend as the recommended hosted provider for verification and
password-reset email. Keep the provider-specific call behind the existing
`EmailDeliveryService`, PostgreSQL job queue, and worker. Retain the generic
HTTPS webhook adapter as an explicit alternative.

The Resend adapter sends plain-text auth mail to `POST /emails`, attaches the
queue's stable idempotency key, and records the message kind as a Resend tag.
It treats `408`, `409`, `429`, and `5xx` as retryable. Other `4xx` responses are
permanent. In particular, a Resend `409` is never treated as proof of delivery:
it can represent either concurrent use or a conflicting payload.

## Rationale

- Resend supplies a small transactional-email API and supports idempotency
  keys, matching the queue's at-least-once worker model.
- Keeping vendor logic at the delivery boundary prevents Better Auth, routes,
  and queue records from depending on a Resend SDK or response schema.
- Direct provider support removes the operational cost of hosting a separate
  gateway for the normal deployment while preserving the webhook escape hatch.
- The API key remains server-only, and terminal jobs continue disposing of
  recipients, message bodies, and live action links under the existing policy.

## Configuration

```env
EMAIL_PROVIDER=resend
RESEND_API_KEY=re_replace_me
AUTH_EMAIL_FROM=noreply@example.com
AUTH_EMAIL_TIMEOUT_MS=10000
```

Production must use a Resend-verified sending domain and store the API key in
the hosting platform's secret manager. The worker process must be running for
queued email to leave PostgreSQL.

## Consequences

- Resend credentials can be added without frontend, Better Auth, database, or
  workflow changes.
- Switching providers remains localized to the email-delivery boundary.
- Live domain/DNS, inbox delivery, bounce, and rate-limit acceptance remain a
  deployment test and cannot be proven by repository tests.
