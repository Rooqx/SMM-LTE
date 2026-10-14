# Frontend redesign plan — rigorous senior audit

**Audit date:** 2026-10-09  
**Scope:** planning documents, approved Variant B prototype, current `client/`
architecture, implemented backend product API, security boundary, tests, and CI  
**Implementation changes:** none  
**Verdict:** **PASS WITH PRE-IMPLEMENTATION BLOCKERS**

The redesigned plan is coherent, secure in direction, and aligned with the
approved Guided Briefing product vision. It is not yet safe to begin visual
implementation beyond F0 because several prototype capabilities lack durable or
structured backend contracts. Those gaps are now explicit and cannot be replaced
with fixtures, Markdown parsing, guessed progress, or browser-only state.

## 1. Evidence audited

- Approved prototype
  `autopilot-smm-briefing-variant-b.html`, SHA-256
  `d0d1baafbdcd6b1a69eab89484104ba761f36786fc31377800639e294181de76`.
- [`frontend-redesign-implementation-context.md`](./frontend-redesign-implementation-context.md).
- [`frontend-redesign-map.md`](./frontend-redesign-map.md).
- Backend HTTP routes, orchestration/workflow schemas, content store, final-post
  grouping, approval/revision contracts, and durable export enqueue.
- Astro middleware, Better Auth setup, BFF route allowlist/proxy behavior,
  client API schemas, current components, Zustand/query ownership, global CSS,
  Playwright configuration/tests, client documentation, and CI workflow.
- [WCAG 2.2](https://www.w3.org/TR/WCAG22/),
  [OWASP DOM XSS guidance](https://cheatsheetseries.owasp.org/cheatsheets/DOM_based_XSS_Prevention_Cheat_Sheet.html),
  [OWASP CSP guidance](https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html),
  [Astro islands guidance](https://docs.astro.build/en/concepts/islands/),
  [Core Web Vitals thresholds](https://web.dev/articles/defining-core-web-vitals-thresholds),
  and [Google noindex guidance](https://developers.google.com/search/docs/crawling-indexing/block-indexing).

No frontend source, backend source, database, dependency, or browser state was
changed by this audit.

## 2. Audit method

The review used five traceability passes:

1. **Prototype → product contract:** every visible screen, action, icon,
   responsive transformation, and status claim was classified.
2. **Product contract → backend:** every dynamic value and mutation was mapped
   to an implemented endpoint, a browser capability, or an explicit gap.
3. **Plan → current source:** legacy routes, hardcoded identity, stale contracts,
   auth boundaries, state ownership, tests, and CI were reconciled.
4. **Senior quality review:** security, privacy, accessibility, HCI, performance,
   reliability, scalability, type safety, comments, observability, SEO,
   internationalization, dependency hygiene, and operability were checked.
5. **Evidence honesty:** implementation, browser, external-provider, and
   production claims were kept `NOT RUN`, `BLOCKED`, or `EXTERNAL-PENDING` where
   proof does not exist.

Severity means:

- `P0` — unsafe architecture or data exposure; blocks all implementation.
- `P1` — correctness/security/accessibility contract missing; resolve in F0 or
  before the affected feature.
- `P2` — maintainability, performance, or acceptance gap; resolve before F6/F7.
- `P3` — documentation clarity or low-risk refinement.

## 3. Findings and corrections

| ID | Severity | Finding | Correction made to the plan | Residual status |
| --- | --- | --- | --- | --- |
| FE-AUD-001 | P1 | `GET /workflow` does not expose the active/review run, so refresh-safe Today resumption cannot be built durably | Active-run projection/endpoint is an explicit F0 blocker; query cache is only immediate feedback | BLOCKED |
| FE-AUD-002 | P1 | The prototype requires structured Brand facts, calendar cells, and review summaries, while current context/artifact metadata is generic JSON/Markdown | Added a versioned discriminated presentation-data contract; prose parsing is prohibited | BLOCKED |
| FE-AUD-003 | P1 | Prototype step percentages, activity, partial post counts, notifications, and brand score are not authoritative backend data | Each is a named interface gap; indeterminate/unavailable presentation requires a registered exception | BLOCKED |
| FE-AUD-004 | P1 | Context history, arbitrary Brand improvement, workspace updates, preferences, publication completion, review inbox completeness, and export-job status lack complete product APIs | Added a full product-interface gap register and map rows with bounded, account-scoped requirements | BLOCKED |
| FE-AUD-005 | P1 | The prototype uses inert progress buttons, button-based navigation, non-semantic folder rows, button-like choices, incomplete switches, and an app-wide live region | Added mandatory appearance-preserving link/progress/radio/disclosure/switch/scoped-live-region corrections | PLAN FIXED; implementation pending |
| FE-AUD-006 | P1 | Private TanStack Query data could survive logout/identity change or flash after a late workspace request if not explicitly cleared/cancelled | Added abort-signal propagation, workspace-scoped keys, request cancellation, and full authenticated-cache clearing rules/tests | PLAN FIXED; implementation pending |
| FE-AUD-007 | P1 | Existing CSP permits inline scripts/styles and the original plan did not define a migration path | Added report-only → nonce/hash enforcement, retained security headers, documented exceptions, and CSP test requirements | VERIFY during F6/deployment |
| FE-AUD-008 | P1 | “Signal Studio” is hardcoded in Better Auth, auth emails, login, page metadata, and shell—not only visible components | Expanded the server-safe product configuration contract across auth/email/metadata/UI | PLAN FIXED; implementation pending |
| FE-AUD-009 | P1 | Existing Playwright setup proves the retired shared-password/skill-picker flow and contains obsolete environment names | Marked it invalid redesign evidence and required replacement without restoring browser secrets/raw run access | PLAN FIXED; rewrite pending |
| FE-AUD-010 | P1 | Prototype absolute mobile dock can obscure content/focus and ignores safe-area insets | Added mandatory equivalent viewport positioning, content clearance, focus-not-obscured, and safe-area checks | PLAN FIXED; implementation pending |
| FE-AUD-011 | P2 | Exact prototype geometry/responsive transformations were stated generally but not durably enumerated | Added header/content/grid/card/dock/breakpoint/motion measurements and page-specific mobile transformations | PLAN FIXED |
| FE-AUD-012 | P2 | Prototype supporting text reaches 8–9 px; blindly copying it may produce poor real-device readability | Added a measured contrast/zoom/reflow/device gate; any adjustment remains a recorded exception | VERIFY during F1/F6 |
| FE-AUD-013 | P2 | Acid serves both primary and success roles under the required existing palette; white foreground would be unsafe | Added semantic tonal roles, redundant icon/copy/shape signals, and dark ink on acid-filled controls | PLAN FIXED; contrast tests pending |
| FE-AUD-014 | P2 | Performance targets lacked p75 field semantics, lab limitations, bounded query retention, cancellation, and hydration ownership | Added p75 CWV, TBT-as-lab-proxy, bounded query pages/cache, single hydration ownership, and no double-fetch rule | PLAN FIXED; evidence pending |
| FE-AUD-015 | P2 | Comment quality, lint/format enforcement, exhaustive state typing, and CI expectations were underspecified | Added strict TypeScript, exhaustive unions, one maintained lint/format/a11y stack, targeted TSDoc/comment rules, and frozen-pnpm CI gates | PLAN FIXED; tooling pending |
| FE-AUD-016 | P2 | Security review omitted authenticated response caching, unsafe DOM/style sinks, trace/source-map redaction, and dependency permission/license review | Added no-store/shared-cache rules, untrusted-data sinks, artifact redaction, source-map decision, and supply-chain checks | PLAN FIXED; evidence pending |
| FE-AUD-017 | P2 | Accessibility review omitted focus obscuration, forced colors, text spacing, accessible authentication, control states, and manual-test limits | Added the missing WCAG/HCI checks and clarified that axe cannot replace manual testing | PLAN FIXED; evidence pending |
| FE-AUD-018 | P2 | Locale/timezone formatting and cross-browser/real-device evidence were not explicit | Added `Intl`/IANA rules plus Chromium/Firefox/WebKit and real-device evidence separation | PLAN FIXED; evidence pending |
| FE-AUD-019 | P2 | Clipboard, 401/403/409/429, request abort, privacy-safe observability, and error-boundary behavior were incomplete | Added feature detection, error classification, `Retry-After`, route error isolation, request/release correlation, and redaction | PLAN FIXED; implementation pending |
| FE-AUD-020 | P3 | Private-app SEO could be misunderstood as a security mechanism | Clarified authorization vs `noindex`, meta/header defense in depth, and robots.txt limitations | PLAN FIXED |
| FE-AUD-021 | P1 | The eight-scene prototype omits dedicated Phase 4 and Phase 6 states, and the backend cycles Phase 6 to Phase 2 | Added PX-010, typed Phase 4/6 fixture requirements, cycle-aware presentation states, and a prohibition on false terminal completion | BLOCKED pending contracts/owner visual acceptance |
| FE-AUD-022 | P1 | A descending cursor page cannot prove the timezone-correct “next to publish” item or complete weekly totals | Added a bounded ascending next-post/aggregate requirement and page-scoped fallback language | BLOCKED |

No P0 issue was found in the plan because it correctly preserves the HttpOnly
Better Auth session, same-origin BFF, backend-owned orchestration, PostgreSQL
authority, and browser prohibition on raw skill execution. P1 blockers remain
because the missing product projections are backend/interface work, not defects
that documentation can truthfully mark complete.

## 4. Prototype alignment verdict

The plan now records:

- the exact eight Today moments;
- explicit completion rules for the omitted Phase 4 and Phase 6 states plus the
  Phase 6 → Phase 2 planning cycle;
- all Library, Brand, and You views;
- all six display phases and their labels;
- exact primary Lucide mappings;
- desktop/mobile header, phase strip, content width, coach rail, mission card,
  calendar, Library, Brand, account, dock, breakpoint, and motion geometry;
- desktop-only coach rail and page-specific mobile transformations;
- every visible action and its backend/browser owner;
- the current client palette as the only product-level visual substitution; and
- mandatory semantic/responsive corrections that preserve appearance.

The plan does **not** authorize visual improvisation. Demo tooling, fixtures,
fake identity, static timers/counts, and simulated transitions remain excluded
because they are not product UI or backend truth. Owner-reported prototype
mistakes remain open under PX-005 until described concretely.

## 5. Backend alignment verdict

The plan correctly uses the human product flow:

```text
GET workflow
  -> POST continue
  -> GET known run / GET workflow
  -> POST exact-version question answer (when asked)
  -> GET known run
  -> approve | reject | revise exact review revision
  -> refetch workflow/context/artifacts/final-posts
```

It explicitly forbids the human UI from calling the service-only raw run route
or choosing skills. It preserves exact review revision, idempotency, cursor
pagination, BFF allowlisting, account scoping, and backend-owned phase routing.

The remaining backend blockers are consolidated in the implementation context's
section 8.4 and the map's contract reconciliation table. UI implementation must
not disguise them with localStorage, generated fixtures, Markdown parsing,
unbounded scans, or optimistic durable claims.

## 6. Senior frontend quality verdict

| Quality area | Plan result | Implementation evidence |
| --- | --- | --- |
| Clean architecture | PASS | PENDING |
| Type safety/contracts | PASS WITH F0 WORK | PENDING |
| Comments/documentation | PASS | PENDING source review |
| Security/privacy | PASS WITH CSP/CACHE GATES | PENDING |
| Accessibility/HCI | PASS WITH PX-008 VERIFY | PENDING |
| Responsive fidelity | PASS | PENDING visual/device evidence |
| Performance/optimization | PASS | PENDING baseline, budgets, p75 deployment evidence |
| Reliability/idempotency | PASS | PENDING fault/race tests |
| Scalability | PASS | PENDING bounded-query/load evidence |
| SEO/private indexing | PASS | PENDING header/metadata verification |
| Testing/CI | PASS WITH TOOLING/E2E REWRITE | PENDING |
| Observability/redaction | PASS | PENDING implementation/deployment evidence |
| Internationalization/timezone | PASS | PENDING tests |

“PASS” here means the plan contains the correct constraint; it is not evidence
that the current frontend implements it.

## 7. Required order after this audit

1. Start F0 only and record a fresh frozen-install/check/test/build/bundle
   baseline.
2. Establish lint/format/JSX-accessibility CI gates.
3. Complete strict frontend schemas and remove human dependence on `createRun`.
4. Review and implement the smallest backend projections needed for active-run
   resume and structured Today/Brand/calendar/review data.
5. Resolve every remaining product-interface gap through a real bounded contract
   or a documented owner-approved unavailable/omission exception.
6. Freeze deterministic prototype fixtures/screenshots, including semantic and
   safe-area corrections.
7. Only then begin F1 visual foundations and proceed one milestone at a time.

## 8. Final audit conclusion

The documentation is now suitable as a senior-engineering continuation contract.
It is aligned with the prototype's visual/product intent and the backend's
implemented security/orchestration model, while being explicit about the places
where the two do not yet meet. The correct next action is F0 contract work—not
premature page implementation.
