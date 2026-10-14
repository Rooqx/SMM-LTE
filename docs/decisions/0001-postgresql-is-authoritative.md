# ADR 0001: PostgreSQL is authoritative

- Status: accepted
- Date: 2026-10-06

## Decision

Store canonical workflow state, context, approvals, artifacts, identity metadata, and audit history in PostgreSQL. Treat repository files as skill definitions and Obsidian as a one-way read/review export.

## Why

Transactions, constraints, row locks, backups, and tenant-filtered queries are required once concurrent users and workers exist. Markdown files do not provide those properties.

## Consequences

The application requires PostgreSQL. File imports and exports cross an explicit adapter boundary and cannot mutate live state implicitly.
