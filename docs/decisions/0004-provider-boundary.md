# ADR 0004: Keep a narrow LLM provider boundary

- Status: accepted
- Date: 2026-10-06

## Decision

The orchestration service calls an `LlmProvider` interface that accepts developer and user messages and returns one validated domain result. OpenAI and deterministic mock adapters implement it.

## Why

Workflow, persistence, approvals, and tests should not depend on one SDK. The narrow contract also makes model calls easy to simulate.

## Consequences

Provider-specific features remain inside adapters. Adding another provider requires matching the same schema and operational limits, not changing orchestration logic.
