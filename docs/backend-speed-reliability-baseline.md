# M9 backend speed and reliability baseline

Last updated: 2026-10-11.

Status: instrumentation and reproducible capture tooling are implemented;
production-like measurements remain a deployment gate.

## Accepted budgets

These budgets are release boundaries, not UI-spinner targets:

| Boundary | Budget | Measurement notes |
| --- | --- | --- |
| Cached questionnaire/current-question read | p95 <= 300 ms | Same target region as PostgreSQL; no provider call |
| Answer plus authoritative next question | p95 <= 500 ms | Includes authorization, transaction, validation, and projection |
| Durable synthesis dispatch | p95 <= 500 ms | Ends only after run, release pins, context pins, job, workspace state, and audit commit |
| Queue start under normal capacity | p95 <= 2 s | Measured from durable job creation to fenced worker start |
| Option-assistant background call | p95 <= 5 s | Never blocks navigation; fallback is immediate |
| Primary provider call | p95 <= 90 s; p99 <= 120 s | Must be re-accepted for the exact provider/model/prompt release |
| Primary provider error rate | < 2% over a representative window | Timeout, connection, invalid-output, and provider errors counted |
| End-to-end six-step Phase 1 generation | p95 <= 12 min | Excludes time waiting for human answers/review |

Account admission remains bounded by
`MAX_ORGANIZATION_MODEL_TOKENS_PER_DAY`,
`MAX_ORGANIZATION_ESTIMATED_COST_MICRO_USD_PER_DAY`, and the per-run token
ceiling. A release record must state verified input/output prices; zero-valued
pricing configuration means cost evidence is unavailable, never that calls are
free.

## Content-free correlated stages

The API and worker emit aggregate Prometheus measurements and sampled structured
logs for a closed stage set: HTTP request, authentication, database read,
enqueue transaction, queue-start delay, worker-start transaction, context load,
prompt build, step creation, provider call, local output validation, and result
commit. Logs contain correlation/run/workspace identifiers, durations, provider
labels, and prompt character counts only. They do not contain prompts, answers,
tokens, credentials, provider payloads, or model output.

`PERFORMANCE_TRACE_SAMPLE_RATE` controls successful structured-log sampling.
Aggregate metrics include every observation, and failed stages are always
logged. Keep the rate low enough that logging does not become the measured
bottleneck.

## Reproducible evidence capture

Run schema migration and ordinary quality checks first. Then capture:

```bash
cd backend
pnpm run baseline:plans > ../artifacts/m9-query-plans.json
LLM_PROVIDER=openai BASELINE_BENCHMARK_RUNS=10 \
  pnpm run baseline:provider > ../artifacts/m9-provider-baseline.json
```

The provider command makes real billable calls and intentionally disables SDK
retries so one sample means one provider attempt. It prints only model identity,
prompt character counts, latency percentiles, and token counts. The query-plan
command is read-only and uses `EXPLAIN` without `ANALYZE`; it records PostgreSQL
version and coarse table counts so plans are not detached from dataset shape.

For synchronous API load evidence, use `pnpm run load:soak` against the deployed
API and record the route, region, database region/version, dataset shape, cache
state, concurrency, duration, request/error totals, and p50/p95/p99. Do not mix
provider time into answer-path latency, and do not infer provider latency from
worker end-to-end time.

## Initial observation that triggered M9

The production-like browser investigation recorded ordinary authenticated reads
around 0.5–0.65 seconds, a synchronous continue request around 5.3 seconds, and
primary provider calls around 40–90 seconds with one connection failure. Those
figures explain the work but are not final acceptance evidence: the original run
did not capture every required dataset, region, prompt, token, concurrency, and
percentile field.

## Release evidence record

Do not promote M9.0 from `VERIFY` until one evidence bundle records all of:

- commit/release identifier and timestamp;
- API, worker, database, and provider regions;
- PostgreSQL version, table counts, and relevant query plans;
- exact provider/model, timeout/retry policy, and verified pricing date;
- prompt developer/user characters and provider-reported token counts;
- cold/warm cache state, concurrency, duration, sample count, and error rate;
- p50/p95/p99 for each synchronous route and correlated stage;
- queue-start, provider, validation, and commit distributions separately;
- daily/per-run token and cost budget decisions plus the approver;
- any breached budget, remediation, and rerun link.

Localhost, mock-provider, or single-request figures are useful regression signals
but cannot close this production-like evidence gate.
