# Backend speed and guided-intake implementation map

Last updated: 2026-10-13.

Status: implementation and local final audit complete at `VERIFY`; external
production-like evidence gates remain open.

Update this tracker in the same change as every M9 implementation, migration,
test, contract, or documentation change. Status meanings are inherited from
[`map.md`](./map.md); `DONE-DOC` records design only and never implies shipped
behavior.

## Source-of-truth documents

| File | Purpose | Status |
| --- | --- | --- |
| [`backend-speed-reliability-implementation-context.md`](./backend-speed-reliability-implementation-context.md) | Authoritative agreed M9 behavior, boundaries, sequence, and acceptance criteria | DONE-DOC |
| [`backend-speed-reliability-plan-audit.md`](./backend-speed-reliability-plan-audit.md) | Strict architecture, security, reliability, UX, performance, and status-honesty audit | DONE-DOC |
| [`m9-m0-m1-audit.md`](./m9-m0-m1-audit.md) | M9.0–M9.1 implementation, repeated audit findings/fixes, verification evidence, and open external gates | DONE-DOC |
| [`m9-m4-m5-audit.md`](./m9-m4-m5-audit.md) | M9.4–M9.5 implementation, repeated senior engineering audit findings/fixes, verification evidence, and open external gates | DONE-DOC |
| [`m9-m6-m7-audit.md`](./m9-m6-m7-audit.md) | M9.6–M9.7 implementation, repeated senior engineering audit findings/fixes, verification evidence, and open external gates | DONE-DOC |
| [`m9-final-audit.md`](./m9-final-audit.md) | Final all-milestone reconciliation, fixes, fresh evidence, and residual gates | DONE-DOC |
| [`../decisions/0014-deterministic-guided-intake.md`](../decisions/0014-deterministic-guided-intake.md) | Accepted architectural decision and rejected alternatives | DONE-DOC / ACCEPTED |
| [`map.md`](./map.md) | Main backend tracker and milestone ledger | DONE-DOC |
| [`frontend-redesign-map.md`](./frontend-redesign-map.md) | Frontend F8 contract and implementation tracking | DONE-DOC |

## Milestone tracker

| Milestone | Status | Required evidence |
| --- | --- | --- |
| M9.0 Baseline and budgets | VERIFY | Content-free correlated stages, metrics, direct-provider/query-plan capture commands, and explicit budgets are implemented; production-like evidence bundle remains open |
| M9.1 Questionnaire domain | VERIFY | Versioned definitions, migration, fallbacks, one-authority transition, durable provenance, and mixed-version/resume/isolation/concurrency tests are implemented; PostgreSQL execution evidence must pass before `DONE` |
| M9.2 Fast interview and compiler | VERIFY | Transactional answer/next-question API, deterministic branching/completeness tests, pure compiler fixtures passing; live PostgreSQL p95 evidence remains open before `DONE` |
| M9.3 Option assistant | VERIFY | Strict adapter/schema, batch-aware prefetch/cache/deduplication, timeout/fallback tests, content-free outcome/token/cost metrics, and relevance/safety evaluations pass; external live model telemetry remains open before `DONE` |
| M9.4 Phase 1 recipe integration | VERIFY | Compiled-intake consumption in social context, smaller pinned prompts, conversation pruning, all six mandatory skills preserved, structured-output evaluations, honest review compatibility; production LLM telemetry pending |
| M9.5 Progress and operations | VERIFY | SSE/reconnect/polling fallback, content-free events, metrics, per-process tenant saturation (429), durable PostgreSQL stage synchrony; cross-replica edge budget and production p95 evidence pending |
| M9.6 Frontend guided interview | VERIFY | Variant B desktop/mobile UI, option-first/custom/help modes, keyboard shortcuts, resume/conflict/accessibility tests, SSE thinking progress integration implemented and verified; live production browser E2E session evidence remains open |
| M9.7 Final audit and rollout | VERIFY | Full regression passed across backend and client, strict multi-pass audit completed, zero type errors, BFF security and conflicts verified; rollout-flag staging exercise and production-like p95 bundle remain open |

## Planned backend file boundaries

Names are proposed boundaries, not instructions to create empty abstractions.
Equivalent cohesive names are acceptable if this map is updated.

| Workstream | Proposed/current area | Status | Done when |
| --- | --- | --- | --- |
| Baseline instrumentation | `backend/src/observability/`, HTTP and orchestration stages, baseline CLIs | VERIFY | Implemented; production-like trace/query-plan/provider evidence remains |
| Questionnaire domain | `backend/src/interview/definitions.ts`, migration `012` | VERIFY | Implemented and unit-tested; PostgreSQL evidence remains |
| Interview persistence | `backend/src/db/interview-store.ts`, migration `012` | VERIFY | Implemented with sessions, options, answers, provenance, supersession, pins, and tenant locks; PostgreSQL evidence remains |
| Fast interview service | `backend/src/interview/service.ts`, routes | VERIFY | Idempotent answer returns authoritative next question without primary LLM/worker; tested |
| Option assistant | `backend/src/interview/options/` plus provider adapter | VERIFY | Strict bounded batched suggestions, LRU cache, invalidation, timeout, and fallback work; tested |
| Intake compiler | `backend/src/interview/compiler.ts` | VERIFY | Pure versioned factual `brand-intake` output passes fixtures/property tests and active branch isolation |
| Phase 1 integration | orchestration recipes/service/compiler/provider contracts | VERIFY | One durable synthesis consumes intake without weakening release pins or approval; tested |
| Progress events | API/BFF SSE route, run-event projection, metrics | VERIFY | Reconnect-safe content-free events with bounded polling fallback and tenant limits; tested |
| Database performance | relevant stores/migration indexes/query plans | VERIFY | Query shapes reviewed; production-like p95 and plans remain open |

## Planned frontend file boundaries

| Workstream | Proposed/current area | Status | Done when |
| --- | --- | --- | --- |
| Contracts and API | `client/src/lib/{contracts,api}.ts`, BFF route policy | VERIFY | Strict versioned interview/option/progress schemas match backend; tested |
| Today controller | `client/src/components/studio/today/useTodayController.ts` | VERIFY | Prefetch, submit, resume, conflict, fallback, and SSE ownership are separated cleanly; tested |
| Guided interview UI | `client/src/components/studio/today/TodayInterviewView.tsx` | VERIFY | Plain-language examples, number badges, keyboard shortcuts, and all server-declared answer modes match Variant B; tested |
| Accessibility/resilience | focused tests, live regions, focus, offline/error states | VERIFY | Keyboard/mobile/screen-reader/reduced-motion and fallback behavior pass (ARIA radiogroup, group, alert, live); tested |
| Documentation/E2E | `docs/todo/m9-m6-m7-audit.md` | VERIFY | Comprehensive multi-pass audit, architecture verification, and production rollout criteria documented |

## Locked implementation order

1. Measure before changing behavior.
2. Ship questionnaire persistence and fallbacks before the option assistant.
3. Ship deterministic answer/next-question and compiler before changing Phase 1.
4. Add the option assistant as a removable enhancement, never as a prerequisite.
5. Adapt primary synthesis without deleting legacy recovery until migration is safe.
6. Add frontend behavior against stable versioned contracts.
7. Add SSE after canonical state/reconnect semantics are tested.
8. Roll out behind one server flag with metrics and rollback criteria.

## Audit rules

- Do not mark any row `DONE` using mock-only evidence.
- Record measured before/after latency, provider/model, prompt size, token count,
  database location, dataset shape, and test concurrency.
- Preserve raw user answers and old questionnaire versions through migration.
- Treat option relevance and cognitive simplicity as evaluation requirements, not
  subjective implementation claims.
- Re-run backend/client regression, migration, security, dependency, and browser
  checks before M9.7 closes.
