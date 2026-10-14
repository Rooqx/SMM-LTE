# SMM Orchestrator engineering guide

This folder is the engineering and review map for the hosted orchestration
backend and its web client.

- [`features.md`](./features.md): implemented behavior and intended use cases.
- [`architecture.md`](./architecture.md): components, trust boundaries, and execution flow.
- [`security.md`](./security.md): tenant isolation, authentication, prompt safety, and production controls.
- [`database.md`](./database.md): schema ownership, transactions, migrations, and queue behavior.
- [`api.md`](./api.md): endpoint contract and example requests.
- [`operations.md`](./operations.md): local and hosted deployment without Docker.
- [`testing.md`](./testing.md): verification strategy and commands.
- [`backend-speed-reliability-baseline.md`](./backend-speed-reliability-baseline.md): M9 latency/cost budgets, content-free stage telemetry, and reproducible evidence capture.
- [`todo/map.md`](./todo/map.md): backend implementation tracker and continuation map.
- [`todo/backend-implementation-context.md`](./todo/backend-implementation-context.md): approved backend roadmap, handoff context, completion audit, and scalability checklist.
- [`todo/backend-speed-reliability-implementation-context.md`](./todo/backend-speed-reliability-implementation-context.md): implemented M9 deterministic guided interview, non-blocking personalized options, programmatic intake compiler, prompt/latency work, and cross-stack acceptance contract.
- [`todo/backend-speed-reliability-map.md`](./todo/backend-speed-reliability-map.md): M9 backend/frontend file map, implementation order, evidence requirements, and milestone tracker.
- [`todo/recurring-content-implementation-context.md`](./todo/recurring-content-implementation-context.md): implemented interview-choice and recurring-content contract, boundaries, and final audit.
- [`todo/recurring-content-map.md`](./todo/recurring-content-map.md): R0–R6 implementation tracker and verification evidence.
- [`todo/m9-final-audit.md`](./todo/m9-final-audit.md): final M9 source/document reconciliation, fixes, fresh regression evidence, and external gates.
- [`todo/backend-speed-reliability-plan-audit.md`](./todo/backend-speed-reliability-plan-audit.md): rigorous architecture, security, reliability, UX, performance, and status audit of the M9 plan.
- [`todo/frontend-redesign-implementation-context.md`](./todo/frontend-redesign-implementation-context.md): approved Variant B frontend contract, architecture, backend integration, quality gates, milestones, and final audit checklists.
- [`todo/frontend-redesign-map.md`](./todo/frontend-redesign-map.md): frontend redesign file map, milestone tracker, prototype discrepancy log, API reconciliation, and verification evidence.
- [`todo/frontend-redesign-plan-audit.md`](./todo/frontend-redesign-plan-audit.md): rigorous prototype/backend traceability and senior security, accessibility, performance, scalability, maintainability, and evidence audit of the frontend plan.
- [`todo/final-readiness-audit.md`](./todo/final-readiness-audit.md): final senior architecture audit, blockers, production gates, and verdict.
- [`todo/m1-auth-audit.md`](./todo/m1-auth-audit.md): M1 code/security/scalability audit, evidence, and remaining external gates.
- [`todo/m2-workflow-memory-audit.md`](./todo/m2-workflow-memory-audit.md): M2 migration, persistence, concurrency, and exact-revision audit.
- [`todo/m3-recipes-and-bundles-audit.md`](./todo/m3-recipes-and-bundles-audit.md): M3 recipe routing, release pinning, mixed-version, and senior implementation audit.
- [`todo/m4-memory-and-actions-audit.md`](./todo/m4-memory-and-actions-audit.md): M4 bounded memory, model actions, tools, adaptive questions, and senior implementation audit.
- [`todo/m5-review-content-audit.md`](./todo/m5-review-content-audit.md): M5 exact review revisions, immutable content lineage, final-post queries, and senior implementation audit.
- [`todo/m6-operational-hardening-audit.md`](./todo/m6-operational-hardening-audit.md): M6 queue fencing, admission, observability, recovery, performance, and production-evidence audit.
- [`todo/m7-final-backend-audit.md`](./todo/m7-final-backend-audit.md): M7 final source, test, migration, security, scalability, and documentation reconciliation.
- [`todo/m8-product-contracts-audit.md`](./todo/m8-product-contracts-audit.md): M8 active-run/history/preferences/workspace/export/publication contract audit and evidence.
- [`todo/variant-b-parity-audit.md`](./todo/variant-b-parity-audit.md): strict desktop/mobile prototype reconciliation, authorized differences, responsive checks, and evidence.
- [`decisions/`](./decisions/): short architectural decision records (ADRs),
  including [ADR 0012](./decisions/0012-explicit-postgresql-over-general-purpose-orm.md),
  which explains why the backend uses explicit PostgreSQL repositories instead
  of a general-purpose ORM, and proposed
  [ADR 0014](./decisions/0014-deterministic-guided-intake.md), which records the
  planned deterministic-interview and non-blocking option-assistant boundary,
  and [ADR 0015](./decisions/0015-recurring-content-and-interview-choice-model.md),
  which records the recurring-cycle and five-path interview decision.
- [`runbooks/production-readiness.md`](./runbooks/production-readiness.md): capacity, SLO/RTO/RPO, backup/restore, deployment, alerts, retention, load, and soak procedure.
- [`runbooks/jobs.md`](./runbooks/jobs.md): dead-job inspection, classification, and safe retry.
- [`runbooks/incidents.md`](./runbooks/incidents.md): security, provider, database, and release incident response.

The root Markdown skill directories remain the domain instruction library. The code under `backend/` is the application runtime and is intentionally independent from any single model provider.
