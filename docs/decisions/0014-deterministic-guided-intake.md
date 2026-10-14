# ADR 0014: Deterministic guided intake with non-blocking AI option assistance

Date: 2026-10-11

## Status

Accepted and implemented through M9.7. Local regressions and contract checks pass;
production-like PostgreSQL/provider measurements, staging browser E2E, and rollout
acceptance remain verification gates rather than shipped-performance claims.

## Context

The existing adaptive-question path uses the primary orchestration model to
decide the next action after most answers. A production-like test demonstrated
correct questions, but also 40–90 second provider waits, a provider connection
failure, malformed-action risk, and a roughly 5.3-second synchronous dispatch.
The design also leaves beginners facing marketing concepts they may not know how
to express.

Static frontend-only forms would be fast but would duplicate workflow rules,
weaken resume/version guarantees, and still impose cognitive load. Calling even
a small model synchronously before every question would retain a fragile network
dependency in the critical interaction path.

## Decision

Keep Phase 1 question identity, order, branching, required fields, and completion
rules deterministic, versioned, and backend-owned. The frontend preloads and
renders that projection for immediate interaction while the backend validates
and persists every transition.

After the account type and a plain-language “Tell me what you do” answer provide
minimal context, a bounded small-model option assistant may generate personalized
choices, examples, and explanations for known question IDs. Suggestions are
prefetched/batched, strictly validated, cached by versioned confirmed inputs,
and always backed by reviewed deterministic fallbacks. They are non-authoritative
and never block interview progress.

Compile accepted answers with a pure versioned application function into a
concise, factual, provenance-preserving intake packet. Enqueue the durable
primary-model worker only when the interview is complete. The packet replaces
the repeated model interview in the first social-context step, then the existing
six mandatory Phase 1 recipe steps continue with their pinned skill, context,
artifact, permission, and review contracts. Consolidating those steps is outside
this decision and requires a separately evaluated recipe/ADR change.

## Consequences

- Basic question progression remains available during model/provider outages.
- The product reduces blank-form cognitive load without letting a model control
  workflow truth.
- Most Phase 1 interviews no longer require a primary-model call per question;
  primary calls are reserved for the six existing mandatory recipe steps and
  explicit revisions. Optional small-model work can be prefetched and replaced
  by fallbacks.
- Questionnaire, option-set, compiler, prompt, and provider versions require
  explicit schemas, persistence, migration, evaluation, and retention rules.
- The frontend becomes more responsive but does not become the canonical workflow
  engine.
- The durable worker remains necessary for expensive generation and revisions.
- Preserving shown options and answer provenance adds storage, but makes resume,
  audit, evaluation, and later debugging materially safer.

## Rejected alternatives

- **Keep the primary model in every interview turn.** Too slow, expensive, and
  failure-prone for ordinary UI progression.
- **Put the canonical questionnaire only in the frontend.** Breaks trusted
  versioning, multi-device resume, and server validation.
- **Call a small model synchronously before every question.** Moves rather than
  removes the latency and availability dependency.
- **Use a second LLM as the intake compiler.** Normalization is deterministic
  application work; another model introduces cost and inconsistency.
- **Use only a static form.** Fast, but insufficiently helpful for beginners and
  contrary to the guided autopilot experience.
- **Remove workers and hold the HTTP request open for Phase 1 synthesis.** Loses
  durable retry, recovery, fencing, and independent scaling.

## Revisit when

Reconsider batching, model routing, or the small-model boundary when measured
option relevance, latency, cost, fallback frequency, or provider reliability
misses the M9 acceptance targets. Do not replace deterministic workflow authority
unless a later decision provides equal or stronger versioning, auditability,
security, and failure behavior.
