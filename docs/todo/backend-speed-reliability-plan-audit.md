# M9 speed and guided-intake plan — rigorous architecture audit

Date: 2026-10-11

Status: `DONE-DOC` historical plan audit. Implementation is now `VERIFY`; use
[`m9-final-audit.md`](./m9-final-audit.md) for current findings and evidence.

## 1. Audit scope

This audit reconciles the M9 implementation context and ADR with the existing
backend invariants, PostgreSQL queue/worker design, Phase 1 skill execution,
Variant B Today experience, frontend state rules, and production-like test
observations. It does not claim code, migration, performance, or browser evidence.

## 2. Alignment verdict

The plan is architecturally sound if implemented in its recorded order. It
improves speed without discarding the reliability properties already built:

- normal interview progression becomes synchronous deterministic application
  work;
- optional small-model suggestions reduce cognitive load but have fallbacks and
  no transition authority;
- expensive synthesis remains a durable fenced worker job;
- PostgreSQL remains canonical and the frontend remains a projection;
- model output remains staged and reviewed before context promotion.

## 3. Findings resolved in the documentation

| Finding | Risk | Resolution recorded |
| --- | --- | --- |
| Frontend-only questions could become a second workflow engine | Stale PWA versions, bypassed rules, broken multi-device resume | Backend owns/version-pins definitions; frontend preloads and server-validates transitions |
| A small model before every question would preserve latency coupling | Slow or unavailable provider blocks basic onboarding | Batch/prefetch suggestions; deterministic options render immediately on timeout/failure |
| A “vague” compiler could discard facts and force hallucination | Primary model guesses missing positioning/audience details | Compiler is concise but lossless, factual, provenance-preserving, and explicit about unknowns |
| Late suggestion replacement could invalidate user intent | Options change while the user is reading or after selection | Never replace an option set after interaction begins; changed earlier answers invalidate only untouched future sets |
| SSE could accidentally become workflow truth | Lost connection appears to lose progress | PostgreSQL remains authoritative; SSE is content-free notification with canonical-read reconnect |
| Speed claims lacked a measurable boundary | Optimistic UI hides slow API/provider behavior | M9.0 traces each stage; synchronous p95 and non-blocking option targets are explicit |
| Historical frontend handoff still said implementation had not started | A later agent could redo F0-F7 or misreport status | Frontend context/map now preserve completed history and add a distinct pending F8 |
| “One Phase 1 synthesis job” conflicted with the implemented recipe | It would silently bypass six mandatory skills, release pins, output contracts, and review semantics | M9 now removes model calls from question progression but explicitly preserves all six Phase 1 recipe steps; consolidation requires a later ADR |
| API-side fire-and-forget option generation was underspecified | Process restart could lose work and unbounded calls could starve important jobs | Option generation is a bounded low-priority durable job with cancellation/expiry and separate concurrency/spend controls |
| Generated options can steer inexperienced users | Biased ordering or preselection can become an invented brand decision | No preselection, neutral presentation, escape paths, preserved provenance, and steering/bias evaluation are required |
| A required free-text “Tell me what you do” field could retain blank-form anxiety | Beginners may not know what information or language is expected | It is option-first, includes concrete ordinary-language examples, supports option-plus-text, and never requires professional wording |
| Legacy adaptive questions and the new interview could both appear active | Duplicate/conflicting answers and ambiguous resume behavior | Each workspace has one interview authority; legacy sessions finish safely or use an explicitly tested migration, never implicit dual-write |
| The desired simple Phase 1 review may not match current step-level review semantics | UI could promise one final review while the backend exposes six staged runs | M9 preserves current semantics and explicitly requires a separate contract/ADR before combining or auto-chaining phase review |

## 4. Security and privacy audit

The plan retains account/workspace scoping, BFF origin protections, body/rate
limits, idempotency, optimistic question versions, untrusted-data handling, safe
rendering, content-free logs/events, and server-only provider credentials. The
option assistant receives only minimal interview context and cannot use skills,
tools, connectors, canonical writes, or uncontrolled identifiers.

Implementation must still prove isolation, retention/deletion behavior, cache
scope, prompt-injection resistance, malformed/oversized option rejection, stale
tab conflicts, and absence of sensitive content in logs/metrics.

## 5. Reliability and scalability audit

The design reduces primary-model call volume and keeps external work outside
database transactions. Deterministic fallbacks eliminate the small model as a
single point of failure. Version pins protect unfinished interviews across
deployments. The programmatic compiler is horizontally scalable and replayable.

Remaining decisions must be evidence-driven:

- exact questionnaire and `brand-intake` schemas;
- cache storage/TTL and retention;
- selected small model/provider and fallback policy;
- background prefetch concurrency and per-account cost limits;
- safe query/index changes after baseline plans;
- SSE connection budgets through the chosen host/proxy;
- rollout percentage, rollback trigger, and legacy-session migration window.
- whether a later separately approved recipe should combine or auto-chain any of
  the six Phase 1 skills; M9 deliberately does not make that change.

No Redis, vector database, external broker, or WebSocket is justified by current
evidence.

## 6. UX and accessibility audit

The plan directly addresses blank-form cognitive load with plain language,
examples, personalized choices, “help me choose,” and custom answers. It avoids
pretending that suggestions are facts. It preserves user control at review gates.

F8 must test screen-reader announcements without excessive chatter, focus after
question transitions, selection semantics, multi-select instructions, error
association, 200% zoom/reflow, mobile keyboard/safe-area behavior, reduced
motion, slow/fallback states, and the rule that option updates never disrupt an
active answer.

## 7. Performance audit

The largest expected gain comes from eliminating the primary-model call between
ordinary questions, not from shortening spinners. The plan also requires prompt
reduction, fast durable dispatch, measured database work, background option
generation, cache hits, and SSE/polling load comparison.

M9 may not be marked complete using localhost-only or mock-provider timing. Test
records must identify model/provider, prompt bytes/tokens, database region,
dataset shape, concurrency, cache state, percentile, error rate, and fallback
rate.

## 8. Final plan verdict

Approved as the implementation plan, not as implemented functionality. The
source of truth is
[`backend-speed-reliability-implementation-context.md`](./backend-speed-reliability-implementation-context.md),
and execution/evidence status belongs in
[`backend-speed-reliability-map.md`](./backend-speed-reliability-map.md). Any
implementation that makes option generation blocking, moves canonical workflow
rules into the frontend, loses raw answers, or removes durable synthesis from the
worker conflicts with the approved design and requires a new decision review.
