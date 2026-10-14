# M9.7 final speed and reliability audit

Date: 2026-10-13

Status: `VERIFY`. All M9 milestones are implemented and the local source,
contract, type, and regression checks pass. This status does not claim
production-like latency, live-provider quality/cost, or staging browser evidence.

## Scope and verdict

This audit reconciled M9.0–M9.7 against the implementation context, ADR 0014,
milestone audit records, backend source/migrations/tests, Astro contracts, and
current architecture/feature/operations documentation. The intended boundary is
preserved: deterministic backend-owned interviewing is the critical path;
personalized options are optional durable work; the compiler is application code;
the existing six-step Phase 1 recipe remains pinned and worker-executed.

No known local correctness blocker remains after the fixes below. Promotion to
`DONE` is still blocked by the external evidence listed at the end.

## Confirmed findings and fixes

| Severity | Finding | Correction |
| --- | --- | --- |
| High | Option prefetch inserted directly into `job_queue`, bypassing queue-owned admission, and an optional constructor path could launch untracked in-process provider work. | Added queue-owned transactional admission with global/account bounds and tenant/session/version validation; removed fire-and-forget generation. |
| High | Option jobs had equal effective claim priority and retryable `failed` jobs were absent from the dedupe index. | Added explicit lowest claim priority and migration `015` retry-safe deduplication across queued/running/failed states. |
| High | Progress events created inside caller transactions were emitted before commit, so a rolled-back state could be shown over SSE. | Pool-owned calls now publish only after commit; caller-owned transactions rely on durable cross-process polling after commit. |
| High | Progress-event foreign keys did not prove that `run_id` belonged to the same `workspace_id`. | Migration `015` replaces the independent run FK with the existing composite run/workspace relationship. |
| High | Compiler output used wall-clock time by default, contradicting replay determinism. | Default `compiledAt` now derives from immutable answer timestamps; an explicit injected clock remains available for fixtures. |
| High | The documented server-controlled rollout flag did not exist. | Added `GUIDED_INTAKE_ENABLED`; it controls only new authority selection and never strands already-pinned guided sessions. |
| Medium | Model output accepted extra question keys and option generation could target inactive branches or a mismatched questionnaire version. | Enforced exact target-key coverage, active-branch filtering, deduped bounded targets, and pinned-version checks. |
| Medium | Provider error bodies could be included in logged exception messages. | Provider failures now expose only bounded HTTP status metadata. |
| Medium | The cache hash omitted the organization dimension stated by the design. | Added `organizationId` to the versioned cache key. |
| Medium | Option description limits disagreed between prompt, schema, store, and audit docs. | Unified the limit at 500 characters. |
| Medium | SSE bigint identities were coerced to JavaScript numbers and initial replay was unbounded. | Event IDs are decimal strings end-to-end; replay is capped and preserves ascending delivery. |
| Medium | SSE setup hijacked the response before the historical database read, weakening normal error handling. | All fallible setup reads now finish before stream takeover. |
| Medium | Small-model name, timeout, and cache TTL were hard-coded. | Added bounded server configuration in `config.ts` and `.env.example`. |
| High | Option jobs were not counted against worker model concurrency and expired PostgreSQL cache rows had no scheduled cleanup. | Counted primary and option calls under the shared model ceiling; worker recovery now prunes indexed expired cache rows. |
| High | Option cache/deduplication identity used only the answer snapshot, so one requested question batch could suppress or poison a different batch for the same answers. | Added the canonical target-question set to cache identity and migration `016` changes durable deduplication to the batch-aware idempotency key. |
| Medium | Option-job account admission counted only jobs carrying an explicit organization payload, omitting primary workflow jobs whose organization is reached through the run. | Admission now resolves both job shapes through the same run/workspace-or-payload organization expression. |
| Medium | Invalid structured model output could surface provider-generated field values through a schema exception logged by the worker. | Parsing/schema failures now produce a fixed content-free operational error; exact target coverage remains separately validated. |
| Medium | The option adapter discarded provider usage and exposed no cache-hit/fallback/cost counters, despite the implementation contract requiring those measurements. | Provider token metadata now feeds content-free authenticated metrics; generation, cache-hit, fallback, token, and separately configured option-model cost counters are exported. |
| High | The primary OpenAI adapter printed rejected action envelopes and raw provider SDK diagnostics to stderr, which could expose user-derived content. | Removed raw provider/error logging; only fixed classified errors reach the already-sanitized worker boundary, with regression coverage. |
| Medium | The Today controller synchronously reset presentation state from React effects, which triggered hook lint failures and made progress state easier to leak across run changes. | Replaced mirrored state with run-scoped derived state and keyed interview remounts; the full client regression now passes with hook lint enabled. |
| Test reliability | Two async Today assertions depended on Testing Library's one-second default wait and became flaky under a memory-constrained host even though the query completed correctly. | Gave only those server-state assertions a bounded five-second wait; the behavior remains asynchronous and the full suite passes. |
| Documentation | Authoritative/current-state docs still said M9.2+ was not implemented, while some audit prose implied production completion. | Reconciled the M9 context/map, ADR, architecture, features, operations, database, and main tracker to honest `VERIFY` status. |

## Fresh verification evidence

| Check | Result |
| --- | --- |
| Backend TypeScript | PASS — 0 errors |
| Backend production build/migration copy | PASS |
| Backend source secret scan | PASS — no known secret patterns found |
| Backend/client dependency advisories | PASS — no known vulnerabilities at the configured high-severity threshold |
| Focused interview/option suites | PASS — 3 files / 24 tests |
| Full backend regression | PASS — 21 files / 88 tests |
| PostgreSQL-gated backend tests | SKIPPED — 10 files / 39 tests; no disposable `TEST_DATABASE_URL` used |
| Client ESLint, including React Hooks rules | PASS — 0 findings |
| Astro diagnostic | PASS — 136 files, 0 errors/warnings/hints |
| Astro production server build | PASS |
| Full client regression | PASS — 24 files / 152 tests |
| Client skipped tests | 1 file / 2 tests explicitly skipped |
| Documentation relative links | PASS — 54 Markdown files, 0 broken links |

## Scalability and reliability conclusions

- API replicas remain stateless; PostgreSQL owns interview, queue, compiler,
  progress, run, artifact, and approval truth.
- Optional option work is bounded and lower priority than authentication,
  primary workflow execution, and exports. Provider failure cannot block a
  fallback-backed interview.
- SSE is a notification optimization. Durable replay/polling is authoritative.
  The connection quota is process-local; deployment must also impose an edge or
  host-wide connection budget across replicas.
- Migrations `015`–`016` are forward-only and readiness now requires `016`.
  They must be rehearsed against a restored production-like database before
  deployment.
- No Redis, vector database, Docker dependency, general workflow engine, or
  frontend-owned canonical questionnaire was introduced.

## External gates before `DONE`

1. Apply migrations `001`–`016` to a disposable PostgreSQL 16+ database and run
   all 39 gated integration tests, including concurrent interview/queue/progress
   behavior.
2. Capture production-like answer/read/dispatch p50/p95/p99 and query plans;
   demonstrate the documented 300/500 ms synchronous budgets under concurrency.
3. Run the live configured option model and primary model; record latency,
   invalid/fallback rate, prompt/tokens, verified price, cost, and relevance/bias
   evaluation evidence.
4. Run the documented staging browser E2E across first visit, refresh/resume,
   conflict, provider outage, synthesis, revision, approval, mobile, and
   offline/SSE reconnect paths.
5. Exercise `GUIDED_INTAKE_ENABLED` rollback/reenable behavior and approve edge
   SSE limits, monitoring, alerting, retention, backup/PITR, and rollout criteria.
