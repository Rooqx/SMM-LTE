# M9.6–M9.7 Frontend Guided Interview and Final Rollout Audit

Last updated: 2026-10-12.  
Status: **VERIFY** (implementation, integration, accessibility, typecheck, contract tests, and full regression complete; live production PostgreSQL p95 telemetry and live browser E2E session gates open).

> Final reconciliation and newer test counts are recorded in
> [`m9-final-audit.md`](./m9-final-audit.md).

---

## 1. Executive Summary

Milestones **M9.6** (*Variant B Frontend Guided Interview & Real-Time Progress*) and **M9.7** (*Final Audit and Rollout*) transition Phase 1 brand intake from an asynchronous LLM-dependent chat loop into a fast, deterministic, accessible, option-first briefing interface. The Today page serves as the single source of truth for orchestration without delegating canonical authority to client storage.

### Core Deliverables Completed:
1. **BFF Route Policy Allowlist (`client/src/lib/server/smm-route-policy.ts`):**
   - Explicit pattern matching for `POST v1/workspaces/:id/interview/start`, `GET v1/workspaces/:id/interview`, `POST v1/workspaces/:id/interview/answers`, `POST v1/workspaces/:id/interview/options/:id/present`, `POST v1/workspaces/:id/interview/options/prefetch`, and `GET v1/workspaces/:id/runs/:id/events`.
   - Rejects unauthenticated, mismatched, or out-of-scope paths.
2. **Contracts & API Client (`client/src/lib/contracts.ts` & `client/src/lib/api.ts`):**
   - Exact schema synchronization with backend Fastify routes and PostgreSQL 012 domain definitions.
   - Discriminated union handling for `GuidedInterviewState` (`authority: "guided"`) and `LegacyInterviewState` (`authority: "legacy"`).
   - Server-Sent Events client (`api.connectRunEvents`) with content-free status updates and automatic cleanup.
3. **Deterministic Presentation Selector (`client/src/lib/today-selector.ts`):**
   - Added `"interview"` moment kind to `TodayPresentationState`.
   - Pinned question projection with progress percentage and question counters.
   - Contextual briefing-complete copy advancing Phase 1 directly to synthesis.
4. **Variant B Guided Briefing UI (`client/src/components/studio/today/TodayInterviewView.tsx`):**
   - Accessible option cards with 1–9 number badges and keyboard shortcuts.
   - Support for `single`, `multiple`, `single_with_text`, and `multiple_with_text` answer modes.
   - "Something else" custom textarea with validation.
   - Minimum and maximum selection bounds enforcement.
   - Non-blocking interaction audit event via `api.markOptionSetPresented`.
   - Disclosures for plain-language examples and purpose explanation ("Why I'm asking").
5. **Remote State Coordination & SSE Progress (`useTodayController.ts`, `TodayThinkingView.tsx`, `TodayPage.tsx`):**
   - Optimistic version checks (`expectedSessionVersion`) with HTTP 409 conflict banners and state refetching.
   - Real-time SSE stage streaming (`queued`, `loading_context`, `generating`, `validating`) in `TodayThinkingView` with screen-reader live announcements (`aria-live="polite"`).
   - Bounded exponential backoff polling fallback whenever SSE is unavailable.

---

## 2. Iterative Senior Engineering Audit Loop

As required by the senior software engineering review standard, a 5-pass strict audit was performed across all authored files.

### Pass 1: Architecture, Protocol & Invariant Enforcement
- **Invariant: Backend as Single Authority.** Canonical interview state is never cached in `localStorage` or `sessionStorage`. All questions, progress counters, and session versions are derived from the backend projection.
- **Invariant: Option Set Immutability.** Once a user interacts with a question (either by selecting an option or typing), the current option set is locked (`hasInteractedRef`) and never dynamically swapped underneath the user by background prefetch responses.
- **Invariant: Fallback Instant Availability.** Curated fallbacks render immediately with zero delay. Users are never presented with an error or blocked if AI option suggestions are delayed or unavailable.
- **Invariant: Content-Free Progress.** SSE run events report only coarse stages (`loading_context`, `generating`, `validating`), preventing internal prompts, provider diagnostics, or raw tokens from leaking to the browser.

### Pass 2: Security & Tenant Isolation
- **BFF Isolation:** All interview and progress endpoints are strictly routed through the BFF proxy, requiring active session cookies and tenant scoping (`workspaceId`).
- **Input Validation:** User-provided text is bounded to 1,000 characters in the UI and validated against 10,000 characters in the contract.
- **Sensitive Data Scrubbing:** Error states and query strings persist only opaque UUIDs (`?run=<uuid>`), never containing prompts, answers, or credentials.
- **Idempotency Keys:** Mutating requests generate cryptographic UUIDs (`crypto.randomUUID()`) to prevent double-submission on network jitter or rapid clicks.

### Pass 3: Code Cleanliness, Typing & Modularity
- **Zero `any`:** All contracts, hooks, and components are strictly typed with zero compiler bypasses.
- **Strict Optional Properties:** Full compliance with TypeScript `exactOptionalPropertyTypes: true` across all component props and API payloads (e.g., using `string | undefined` and conditional spreads instead of assigning literal `undefined`).
- **Component Decomposition:** Clear boundary separation between declarative presentation (`TodayInterviewView`), reactive data management (`useTodayController`), and deterministic state selection (`today-selector`).

### Pass 4: Accessibility & User Experience (WCAG AA/AAA)
- **Keyboard Navigation:** Users can press keys `1` through `9` to instantly toggle options. Keyboard shortcuts are disabled while typing inside input or textarea elements.
- **ARIA Semantics:** Single-select options render inside `role="radiogroup"`; multi-select options render inside `role="group"`. Validation alerts use `role="alert"` with `aria-describedby` associations.
- **Screen Reader Announcements:** The thinking view progress updates announce dynamically via `aria-live="polite"`.
- **Focus Rings:** Distinct, high-contrast focus rings (`focus-visible:ring-acid-400`) ensure visible focus states across all interactive elements.

### Pass 5: Regression & Verification Testing
- **Client Route Policy:** `src/lib/server/smm-route-policy.test.ts` — **2 passed**.
- **Today Selector:** `src/lib/today-selector.test.ts` — **20 passed**.
- **Guided Interview Component:** `src/components/studio/today/TodayInterviewView.test.tsx` — **8 passed**.
- **Today Page Integration:** `src/components/studio/TodayPage.test.tsx` — **17 passed**.
- **Contracts Schema:** `src/lib/contracts.test.ts` — **15 passed**.
- **API Client:** `src/lib/api.test.ts` — **11 passed**.
- **Total Client Test Suite:** 24 test suites passed, **152 tests passed**, 2 skipped (live PG).
- **Client Diagnostic Check:** `astro check` — **0 errors, 0 warnings, 0 hints across 136 files**.
- **Production Client Build:** `astro build` — **Completed successfully in 3.65s**.
- **Backend Test Suite:** 21 test suites passed, **82 tests passed**, 10 skipped (live PG).
- **Backend Typecheck:** `tsc -p tsconfig.json --noEmit` — **0 errors**.

---

## 3. Issues Identified and Remediated During Audit Loop

| Issue Identified | Severity | Root Cause | Remediation Applied |
| --- | --- | --- | --- |
| Route policy rejection for option presentation | High | `smm-route-policy.ts` allowlist lacked routes for option present and prefetch | Added regex patterns for `/interview/options/:id/present` and `/interview/options/prefetch` to allowlist and test suite. |
| Discriminated union typing error in `TodayPage.tsx` | Medium | `state.payload.interview` is a union of `GuidedInterviewState` and `LegacyInterviewState` | Added `interview.authority === "guided"` guard before accessing `session` and `currentQuestion`. |
| `exactOptionalPropertyTypes` incompatibility | Medium | Passing `customText: undefined` in object literal rejected under strict tsconfig | Refactored prop types to `string | undefined` and applied conditional property spread `...(text ? { customText: text } : {})`. |
| Mock omission in `TodayPage.test.tsx` | Medium | `vi.mock("@/lib/api")` lacked `connectRunEvents` and `getInterviewState` | Added mock implementations in `TodayPage.test.tsx` and added defensive `typeof api.connectRunEvents === "function"` guard in controller. |
| Heading/legend selector ambiguity in test | Low | Both `TodayMissionCard` heading and `TodayInterviewView` legend contained identical prompt text | Replaced ambiguous `findByText` with semantic `findByRole("heading", { name: ... })` in test. |
| Validation order for multi-select minimum bounds | Low | General empty check took precedence over specific minimum selection count | Reordered validation logic to check `totalSelected < minimumSelections` first to output clearer count messages. |

---

## 4. Status Honesty Rule & Open Operational Gates

Per ADR 0014 and the engineering status honesty rule, milestones **M9.6** and **M9.7** are designated as **`VERIFY`** rather than `DONE`.

### Open Operational Gates for Final Promotion:
1. **Live PostgreSQL p95 Telemetry:** Run answer transaction latency benchmarks against a production-like PostgreSQL cluster in the target deployment region (target: p95 <= 500 ms).
2. **Live Option Assistant Telemetry:** Verify background suggestion generation latency (target: p95 <= 5,000 ms) without answer disruption under real provider load.
3. **End-to-End Browser Session Verification:** Execute full multi-question interview resume across devices and browser refresh in staging environment behind the server-controlled feature flag.
