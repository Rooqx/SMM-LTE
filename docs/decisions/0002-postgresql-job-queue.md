# ADR 0002: Use the existing database for the first durable queue

- Status: accepted
- Date: 2026-10-06

## Decision

Use a PostgreSQL job table claimed with `FOR UPDATE SKIP LOCKED`, bounded attempts, backoff, stale-lock recovery, and idempotent terminal-run handling.

## Why

It gives the initial service one operational datastore and preserves atomic enqueue with workflow state. This is simpler and safer at the expected starting scale than introducing a second broker immediately.

## Consequences

Long model calls occur outside transactions. Delivery is at least once, so completion paths must be idempotent. Reassess a dedicated broker when queue volume, scheduling, fan-out, or isolation needs exceed PostgreSQL's operational envelope.
