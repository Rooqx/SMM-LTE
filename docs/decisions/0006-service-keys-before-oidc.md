# ADR 0006: Tenant-scoped service keys before browser identity

- Status: accepted
- Date: 2026-10-06

## Decision

Use hashed, revocable, expiring, scoped organization service keys for the first API. Provision them through a local bootstrap command, not an unauthenticated HTTP endpoint.

## Why

This securely supports server integrations and local operation without pretending to be end-user authentication. A browser product needs OIDC, sessions, membership, and account recovery as a separate identity subsystem.

## Consequences

Do not put service keys in browser storage. Add an OIDC-backed BFF before exposing a consumer web UI.
