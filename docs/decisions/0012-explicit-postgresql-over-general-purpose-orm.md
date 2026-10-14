# ADR 0012: Use explicit PostgreSQL repositories instead of a general-purpose ORM

Date: 2026-10-08

## Status

Accepted for the current backend.

## Context

PostgreSQL is not only a persistence target in this system. It is also the
coordination boundary for workflow execution, job claiming, approvals,
revisions, immutable context pins, and content lineage. Correctness depends on
database behavior that must remain visible during implementation and review,
including:

- explicit transaction and row-lock ordering;
- `FOR UPDATE SKIP LOCKED` queue claims and PostgreSQL advisory locks;
- partial unique indexes and composite foreign keys that enforce workspace and
  lineage boundaries;
- generated full-text-search data, GIN indexes, JSONB constraints, and keyset
  pagination;
- atomic writes across runs, jobs, approvals, audit events, context revisions,
  artifacts, and final posts; and
- forward-only, checksum-verified SQL migrations with controlled data
  backfills.

A general-purpose ORM improves routine CRUD ergonomics, generated application
types, and onboarding for conventional entity relationships. It does not remove
the need for the PostgreSQL-specific operations above. A full ORM conversion
would therefore retain substantial raw SQL while adding another query and
migration abstraction around the most sensitive transaction paths.

## Decision

Use `pg` (`node-postgres`), parameterized SQL, and narrowly scoped repository or
store modules as the backend data-access layer. Keep transaction boundaries,
lock ordering, database constraints, and query shape explicit. SQL migrations
remain the sole authority for application schema changes.

This is not a project-wide prohibition on ORMs. An ORM may be evaluated later
for a bounded, low-risk area when it measurably reduces complexity. It must not
silently take ownership of the existing schema or replace correctness-critical
SQL merely for consistency. Queue claims, workflow transitions, approvals,
revisions, and other lock-sensitive operations remain explicit unless a future
decision demonstrates equivalent behavior with tests and query-plan evidence.

Any future trial must:

1. introspect and baseline the existing schema without recreating or dropping
   it;
2. choose one migration authority rather than operating two uncoordinated
   migration histories;
3. begin with one simple, low-risk repository;
4. preserve workspace isolation, constraints, transaction semantics, and
   parameterized input handling;
5. compare generated SQL and query plans on representative data; and
6. pass the existing concurrency, migration, integration, security, and
   performance checks before its scope expands.

## Consequences

- PostgreSQL concurrency and integrity behavior remains apparent in code review
  and can be tested directly.
- The runtime has one database abstraction and one migration authority.
- Repository interfaces keep SQL out of HTTP and orchestration layers, so the
  application is not coupled to ad hoc queries throughout the codebase.
- Engineers must understand PostgreSQL transactions, locks, indexes, and query
  plans; the data layer receives less automatic CRUD generation.
- Compile-time application typing ends at the validated repository boundary;
  database constraints and integration tests remain essential.
- Repetitive simple CRUD is accepted where introducing and operating a second
  abstraction would cost more than it removes.
- A later incremental migration remains possible because callers depend on
  repository behavior rather than on `pg` throughout the application.

## Rejected alternatives

- **Convert the complete backend to an ORM now.** This rewrites mature,
  tested persistence code while still requiring raw SQL escape hatches for core
  coordination behavior.
- **Use an ORM and custom SQL everywhere in parallel.** Without a narrow
  boundary, this creates two data-access models and risks conflicting schema
  and transaction assumptions.
- **Use ORM-generated migrations alongside the current migration runner.** Two
  independent schema histories make rollout, checksum verification, and
  rollback reasoning less reliable.
- **Ban ORMs permanently.** Future product areas may consist mainly of ordinary
  CRUD and could benefit from one; the decision should be revisited using
  evidence rather than ideology.

## Revisit when

Reconsider this decision when most new database work is ordinary CRUD, SQL
maintenance becomes a measured delivery bottleneck, a chosen tool can represent
the required PostgreSQL behavior without obscuring it, or the repository
boundaries permit a small production pilot. Convenience alone is not enough;
the replacement must make the system simpler while preserving its observable
correctness and operational characteristics.
