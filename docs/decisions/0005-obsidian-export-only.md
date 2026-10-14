# ADR 0005: Obsidian is export-only

- Status: accepted
- Date: 2026-10-06

## Decision

Support one-way export of approved PostgreSQL data into a private Obsidian vault. Do not watch the vault or import edits automatically.

## Why

Obsidian is excellent for reading, linking, and manual review, but simultaneous application and human edits require a conflict model. Last-write-wins would risk silent loss.

## Consequences

Vault edits are not canonical. A future bidirectional design must add identity, version comparison, conflict review, and an explicit sync protocol.
