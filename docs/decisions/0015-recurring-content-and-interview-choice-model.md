# ADR 0015: Recurring content commands and interview choice model

Status: Accepted

## Decision

Use versioned deterministic questions with at most four AI-assisted suggestions
and one always-visible custom answer. Multi-select limits follow semantic
exclusivity rather than an arbitrary UI cap. Store recurring generation as
explicit backend commands that reuse approved context and create a new scoped
content cycle; do not restart onboarding or model folders as files.

## Why

This reduces cognitive load without making an LLM responsible for interview
order or validation. Explicit continuation modes keep weekly work predictable,
preserve the stable brand foundation and prevent an on-demand post request from
silently rewriting strategy.

## Consequences

- New questionnaire behavior requires a new immutable release.
- The client renders backend selection semantics instead of inventing them.
- Cycle-aware completion queries are mandatory; phase-wide accepted-skill
  queries would incorrectly reuse prior-cycle work.
- Final posts remain relational records grouped as week/day/platform views.

