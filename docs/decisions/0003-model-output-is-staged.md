# ADR 0003: Model output is staged

- Status: accepted
- Date: 2026-10-06

## Decision

Persist model-generated artifacts as drafts and keep context changes inside the run output until an authenticated approve action applies them.

## Why

Schema-valid model output can still be wrong or maliciously influenced. Separating generation from canonical mutation preserves human control and an auditable diff boundary.

## Consequences

Clients must expose pending output and approval. Only approved artifacts appear in Obsidian exports. Phase gates and output acceptance share one decision endpoint but remain explicit in stored state.
