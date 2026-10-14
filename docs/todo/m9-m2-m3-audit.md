# M9.2 & M9.3 Implementation and Iterative Engineering Audit

Last updated: 2026-10-12.

> Superseded where necessary by [`m9-final-audit.md`](./m9-final-audit.md).
> The final pass replaced direct/fire-and-forget option dispatch with an awaited
> durable queue write; it still never awaits provider/model execution.

**Audit Scope:**
- **Milestone M9.2**: Fast interview application service, synchronous answer transition path, pure programmatic brand-intake compiler, deterministic branching, and lossless provenance.
- **Milestone M9.3**: Option assistant adapter, bounded small-model suggestions, LRU cache with PostgreSQL persistence, asynchronous prefetch queue worker, and multi-sector evaluation benchmark.

---

## 1. Architectural Invariants Enforced

1. **Pure Programmatic Compiler (`compiler.ts`):**
   - **Zero Hallucination**: Programmatic conversion only; does not invent metrics, revenues, follower counts, or scientific/legal guarantees.
   - **Lossless Provenance**: Pinned recording of options shown to the user, selections made, and exact raw custom text.
   - **Deterministic Active Branch Isolation**: Branch conditions are strictly evaluated against active root answers (`isQuestionApplicable`). Downstream questions from inactive branches (e.g., if a user switches from `client_business` to `company_business`) are excluded from progress, question projection, and the compiled brand intake packet.
   - **Explicit Uncertainty Tracking**: Unselected or uncertain dimensions (`not_sure`, `none_known`) are mapped to `unknownFields` and marked uncertain.

2. **Synchronous Fast Answer Path (`service.ts`):**
   - **p95 <= 500 ms target**: Synchronous answer submission records the answer, projects next question progression, and awaits only bounded durable prefetch admission—not LLM/provider execution. Production-like p95 evidence remains open.
   - **Backend Branch Authority**: Question progression is evaluated strictly by the backend.
   - **Optimistic Concurrency & Idempotency**: Answers verify `expectedSessionVersion` and use `idempotencyKey` + `requestHash` checking to safely handle concurrent double-clicks and replays.
   - **Atomic State Transitions**: Transitions, audit logging, option set association, and intake packet compilation occur atomically within PostgreSQL database transactions.

3. **Bounded Option Assistant (`options/`):**
   - **Non-blocking & Removable**: Small model suggestions are strictly non-blocking. Curated fallback choices render immediately whenever generation times out (5s), fails, or is missing.
   - **Option In-Use Invariant**: Model suggestions never overwrite options once user interaction has begun (`interaction_started_at`).
   - **Bounded Outputs**: Strict Zod schemas enforce plain copy (max 240 chars per label, max 500 chars per description), no HTML markup (`<` or `>`), and 2–4 options per question.
   - **Tenant-Scoped Caching**: Suggestions are hashed by tenant, questionnaire version, prompt version, model name, and confirmed answers hash, and cached in an in-memory LRU layer backed by PostgreSQL.

---

## 2. Iterative Multi-Pass Senior Audit Findings & Fixes

### Pass 1: Semantic Edge Cases & Schema Robustness

- **Finding 1.1 (`submitAnswer` Simulated Selected Options):**
  - *Issue*: In `InterviewService.submitAnswer`, the simulated answer row used for immediate branching evaluation had `selected_options: []`. When an answer was submitted for the final question, `compileBrandIntake` compiled an intake packet with empty selected options for that final question before saving to `interview_sessions.compiled_intake`.
  - *Fix*: Mapped `input.selectedOptionIds` against `currentState.optionSets` and `targetDef.fallbackOptions` so that `simulatedAnswer.selected_options` contains full option metadata (`id`, `label`, `description`).
  - *Verification*: Added unit tests verifying `simulatedAnswer` and `intakePacket` contain full option metadata on completion.

- **Finding 1.2 (`saveAnswer` State Transition Constraint Violation):**
  - *Issue*: In `InterviewStore.saveAnswer`, `compiled_intake` in the SQL `UPDATE` statement was set using `CASE WHEN $7::text IS NOT NULL THEN $7::jsonb ELSE compiled_intake END`. If an interview transitioned from `completed` back to `in_progress` (e.g. an earlier answer was revised), `compiled_intake` retained its previous value. This violated the check constraint `compiled_intake IS NULL OR (status = 'completed' ...)`.
  - *Fix*: Updated the SQL update expression to:
    ```sql
    completed_at = CASE WHEN $5 = 'completed' THEN COALESCE($6, now()) ELSE NULL END,
    compiled_intake = CASE WHEN $5 = 'completed' THEN $7::jsonb ELSE NULL END,
    ```
    ensuring `compiled_intake` and `completed_at` reset to `NULL` whenever `status` is not `'completed'`.
  - *Verification*: Migration 013 and store tests pass cleanly.

- **Finding 1.3 (Branch Switching Inactive Answer Leakage):**
  - *Issue*: If a user answered `client_business` and `client_approval`, then later switched `promotion_target` to `company_business`, the historical answer for `client_approval` remained in `activeAnswers`. Without branch gating, `getAns("client_approval")` in `compileBrandIntake` would still retrieve it, polluting `accountOffer.clientApproval` and `unknownFields`.
  - *Fix*: Gated `getAns(questionId)` with `applicableSet = new Set(applicableQuestions.map((q) => q.id))`. If a question is not applicable in the active branch, `getAns` returns `undefined`.
  - *Verification*: Added unit test `does not leak inactive branch answers or unknown fields when branch changes` in `tests/interview-compiler.test.ts`.

- **Finding 1.4 (`descriptionText` Schema Violation on Empty Input):**
  - *Issue*: In `compiler.ts`, `descriptionText: z.string().min(1).max(10000)`. If `descAns.custom_text` was empty string or whitespace and category was missing, `""` failed Zod validation with a schema error.
  - *Fix*: Fallback logic in `compiler.ts` checks `const text = descAns.custom_text?.trim() || category?.label || "";` and defaults to `"Unspecified"` if empty.
  - *Verification*: Verified across permutation fixtures in compiler test suite.

- **Finding 1.5 (Compiled Intake Size Limit):**
  - *Issue*: Migration 013 initially restricted `compiled_intake` to `octet_length <= 100000` (100 KB). Lawful users providing extensive answers across 10+ questions could exceed 100 KB.
  - *Fix*: Increased check constraint limit to `500000` (500 KB) in `013_guided_intake_compiler_and_options.sql`.

### Pass 2: Concurrency, Memory & Adapter Resilience

- **Finding 2.1 (Cache LRU Eviction & Re-Ordering):**
  - *Issue*: In `InterviewOptionCache`, accessing a cached item in memory did not update its position in the `Map` insertion order. Also, re-inserting an existing key could evict an older key before updating the map.
  - *Fix*: In `get()`, re-inserted cache hits (`delete(key)` then `set(key, cached)`) to keep most-recently-used order. In `#putMemory()`, deleted existing key before performing size check and insertion.
  - *Verification*: Added unit test `LRU cache maintains and refreshes most-recently-used entry order` in `tests/interview-options-service.test.ts`.

- **Finding 2.2 (OpenAI Adapter AbortSignal & Code-Fence Stripping):**
  - *Issue*: In `OpenAIOptionAssistantAdapter`, if an caller's `AbortSignal` was already aborted, the request was still initiated. Additionally, models that output markdown fences (` ```json `) caused `JSON.parse` syntax errors. Furthermore, if a model returned 5 items, Zod rejected the entire batch instead of truncating.
  - *Fix*: Checked `options?.signal?.aborted` upfront, added event listener cleanup in `finally`, stripped markdown fences, and capped extra suggestions to the schema maximum (4) via `arr.slice(0, 4)`.
  - *Verification*: Added unit test `OpenAI adapter strips markdown code fences and caps suggestions to 4 items` in `tests/interview-options-service.test.ts`.

- **Finding 2.3 (Non-Printable Control Characters in Prompts):**
  - *Issue*: Malformed text containing ASCII control characters (`\u0000-\u0008`, `\u000B-\u000C`, etc.) could cause invalid JSON payloads when sent to the OpenAI API.
  - *Fix*: Added `sanitize` helper in `backend/src/interview/options/prompt.ts` stripping control characters from user text before prompt assembly.
  - *Verification*: Verified in `tests/interview-evaluations.test.ts`.

### Pass 3: Verification & Zero Issues

- **Finding 3.1 (Documentation & Type Strictness):**
  - Preserved `exactOptionalPropertyTypes` compatibility across all modules.
  - Verified no client-owned state, vector DB, or Redis dependencies were introduced.
  - Verified zero compile errors (`tsc -p tsconfig.json --noEmit` exits with code 0).
  - All 27 unit, property, and evaluation tests across 4 test suites pass cleanly.

---

## 3. Verification Evidence

### Test Suite Execution
- `tests/interview-compiler.test.ts`: **6 passed** (branching, incomplete state, lossless provenance, unknown fields, permutation fixtures, branch change isolation).
- `tests/interview-service.test.ts`: **7 passed** (start/resume projection, legacy authority, company branching, client branching, idempotency, completion & packet compilation, non-applicable rejection).
- `tests/interview-options-service.test.ts`: **9 passed** (prompt builder, mock adapter, timeout/failure simulation, cache key computation, LRU cache memory & eviction, graceful fallback on provider failure, preservation of active user interactions, markdown code-fence stripping, suggestion slicing).
- `tests/interview-evaluations.test.ts`: **5 passed** (multi-sector relevance benchmark, plain copy simplicity, hallucination avoidance, prompt injection resistance, 100% deterministic fallback availability).

### Full Regression Suite
- **19 passed files**, 68 passed tests, 10 integration suites safely skipped (awaiting live external PostgreSQL container).
- Zero TypeScript compilation errors (`tsc -p tsconfig.json --noEmit`).
- Distribution build succeeded (`pnpm build`).

---

## 4. Open External Verification Gates

In strict accordance with status-honesty rules, M9.2 and M9.3 are marked **`VERIFY`** (not `DONE`) until:
1. Production-like PostgreSQL environment is available to run `tests/interview-store.integration.test.ts` with concurrent transactional load measuring p95 <= 500 ms SLA.
2. Live OpenAI API key is supplied to execute live token latency and quality benchmarks under production network conditions.
