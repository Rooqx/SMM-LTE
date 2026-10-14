# M4 bounded memory and controlled actions audit

Date: 2026-10-08.

## Outcome

M4 is implemented for the agreed backend scope. The application assembles deterministic bounded memory, validates one strict model action per call, permits only step-scoped tools and optional skills, persists adaptive questions and runtime results, and resumes the correct recipe step after an idempotent answer. No frontend component redesign, Docker setup, vector database, publishing connector, or generic workflow framework was added.

## Implemented boundaries

- `LlmActionSchema` is a strict discriminated union for `ask_user`, `request_tool`, `request_optional_skill`, `propose_output`, `request_approval`, `complete_step`, and `cannot_continue`.
- OpenAI receives a strict JSON-schema envelope. Every provider result is validated locally again; provider-side structured output is not a trust boundary.
- The memory assembler selects only exact pinned context keys required by the active recipe step, reports missing keys, combines the latest versioned summary with a bounded post-summary message window, and reports omissions explicitly.
- Required context and compiled user prompts fail closed when over budget. There is no silent removal of required constraints.
- The only M4 tool is `list_approved_artifacts`. It is account/workspace scoped, read-only, recipe-allowlisted, limited to 20 rows/10 kinds, newest-first, and UTF-8 byte bounded.
- Optional skills must be on the exact pinned recipe step's allowlist and are loaded from the exact pinned skill bundle. They cannot recursively request tools, questions, approvals, or more optional skills.
- Every run is bounded by model calls, provider-reported tokens, elapsed duration, optional depth, prompt size, memory sections, and tool-result bytes.
- Questions, answers, action projections, exact bounded tool results, policy rejections, and provider usage are durable. Answer replay uses the existing request hash and then derives a stable run idempotency key from the committed answer ID.
- `GET /v1/workspaces/:workspaceId/workflow` exposes resumable workflow/question state to verified users. `POST /v1/workspaces/:workspaceId/questions/:questionId/answer` validates the exact question version, persists the answer, and queues the correct recipe step. The Astro server allowlist exposes only those product contracts; raw skill selection stays service-only.
- Compatibility and durable phase state now advance together. Phase 3 advances automatically only after its final declared output, and approved phase 6 creates phase 2 in a new cycle.

## Audit findings fixed during review

1. Wrapped the provider action union in a root JSON-schema object; the original root `oneOf` layout conflicted with strict `additionalProperties` behavior.
2. Made approval actions carry the exact reviewable artifacts/context proposals instead of an empty message-only projection.
3. Added local recipe/tool/output permission checks and classified deterministic policy violations as permanent job failures.
4. Preserved provider usage for over-budget and denied actions before failing the job.
5. Prevented continuation while a question is pending and made answer/resume idempotent across process failure and retries.
6. Persisted tool requests, exact bounded results, optional-skill actions, terminal actions, and policy errors into durable conversation memory.
7. Kept large artifact content out of conversation rows by storing compact descriptors there and the full body in run/artifact records.
8. Changed tool bounds from character counts to UTF-8 bytes and used binary-search truncation for multi-byte content.
9. Loaded the exact pinned recipe definition at execution instead of consulting only the current in-process recipe.
10. Synchronized `workspaces.current_phase`, `workflow_instances`, and `phase_instances` in the same transition transaction, including the phase-6-to-2 cycle increment.
11. Added row-count guards to terminal step/run updates so stale workers cannot silently claim a successful commit.
12. Corrected test isolation for queue rows, which intentionally do not have a run foreign key.
13. Corrected mixed-version continuation so an already-active older phase resumes from its durable recipe definition; newly transitioned phases deliberately adopt the current recipe release.

## Verification evidence

- Strict action, memory, prompt-budget, recipe, and tool unit tests: pass.
- Focused PostgreSQL M4 integration: adaptive ask/answer/resume, tool result persistence, optional pinned skill execution, usage accounting, denied tools, phase-3 automatic transition, and phase-6 approval loop all pass.
- Existing workflow-memory integration: five tests pass, including bounded post-summary retrieval.
- Backend TypeScript check: pass.
- Astro server route-policy test: pass; no page/component code changed.
- Full clean-database regression: 15 files/46 tests pass with migrations `001`-`008`; backend typecheck, 44-skill audit, and production build pass.
- Astro server boundary: 69 files/zero diagnostics, 10 files/28 tests, and the production server build pass on a separate migrated disposable database.
- Backend and Astro dependency scans report no known vulnerabilities at the high-severity threshold.
- Browser end-to-end testing was not run, following the owner's backend-only instruction.

## Security, scale, and maintainability review

- Authorization: all memory/tool queries carry both workspace and account identity; another account's IDs do not become retrieval inputs.
- Prompt injection: trusted instructions stay in the developer message; context, messages, tool results, and run input stay explicitly untrusted in the user message.
- Least capability: model requests are data, never direct calls. Unknown actions, tools, skills, context keys, and artifact kinds fail closed.
- Cost/availability: calls, tokens, time, depth, prompt, memory, result size, provider timeout, and retries are bounded. Production monetary budgets still require approved pricing/SLO inputs in M6.
- Reproducibility: continuation honors the active durable recipe version, and each run loads its pinned recipe, skill bundle, roots, skill text, and context revisions. Runtime tool snapshots store query/result metadata.
- Horizontal scale: no process-local conversation authority or vector service was added; transactions and row locks remain in PostgreSQL.
- Simplicity: one product-specific action union, one small tool registry, and one memory assembler replace a generic agent framework.
- Comments: comments explain trust boundaries, byte limits, lock order, phase synchronization, and retry/idempotency reasoning; routine syntax is not narrated.

## Honest limits and later work

- M5 still owns immutable artifact revision lineage, exact revision/revision-request semantics, stale approval conflicts, and structured final-post queries.
- M6 still owns renewable/fenced worker leases, admission/backpressure, load/soak tests, formal spend thresholds, metrics/alerts, restore/rollback rehearsals, and production SLO/RTO/RPO acceptance.
- Conversation summaries can be stored, validated, and consumed, but automated summary scheduling/compaction policy remains an operational enhancement; full history remains authoritative.
- The controlled artifact tool is deliberately narrow. Analytics, URL fetch, publishing, scheduling, and media tools require separate connector contracts and authorization.
- Vector search remains deferred until exact/metadata/full-text retrieval is measured and insufficient.
- The server contracts are ready for the future simplified UI, but no frontend page/component behavior was implemented in M4.

## Verdict

M4 meets its backend definition of done and is suitable as the controlled reasoning/memory foundation for M5. This is not a whole-product production-readiness verdict; external M1 acceptance and M5-M7 gates remain open.
