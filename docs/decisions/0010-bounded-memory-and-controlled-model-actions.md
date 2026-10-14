# ADR 0010: bounded memory and controlled model actions

Date: 2026-10-08

## Status

Accepted and implemented for M4.

## Context

The model needs relevant brand state, recent conversation, optional skills, and selected prior artifacts. Giving it unrestricted database access, unlimited chat history, arbitrary tool calls, or provider-owned memory would make execution difficult to secure, reproduce, and scale.

## Decision

- The LLM remains stateless. PostgreSQL remains the durable memory authority.
- Prompt memory contains only the active step's exact pinned canonical context, the newest versioned conversation summary, and a bounded recent-message window after that summary.
- Required context is never silently truncated. Oversized required memory or a complete oversized user prompt fails closed.
- Every model response contains one locally validated discriminated action.
- The runtime owns tool execution, optional-skill dispatch, persistence, approvals, and phase transitions.
- Tools and optional skills are allowed per recipe step. M4 exposes one read-only tool for bounded approved-artifact retrieval.
- Runs have explicit action-count, token, duration, optional-depth, prompt, memory, and tool-result budgets.
- Tool results and policy rejections are persisted with their query/result metadata and provider usage. Large generated bodies stay in artifact/run storage; conversation memory receives a compact projection.
- No vector database is introduced. Exact relational retrieval comes first; semantic retrieval requires a measured use case and evaluation.

## Consequences

The runtime is deterministic at its security boundary and can horizontally scale around PostgreSQL. Provider substitution remains possible. The model cannot invent permissions or mutate state directly. Long histories require explicit summaries, and adding a tool requires a typed action, a recipe allowlist, a bounded implementation, and tests rather than prompt text alone.

