# Frontend redesign implementation map

**Status:** F0-F7 internally complete; F8 guided-interview integration is planned and pending  
**Last reviewed:** 2026-10-11  
**Authority:** [`frontend-redesign-implementation-context.md`](./frontend-redesign-implementation-context.md)  
**Audit:** [`frontend-redesign-plan-audit.md`](./frontend-redesign-plan-audit.md)  
**Final implementation audit:** [`f7-final-frontend-audit.md`](./f7-final-frontend-audit.md)

This tracker is the operational map for the Variant B frontend redesign. It
must be updated before and after each implementation milestone so status is
based on evidence rather than memory.

## Status legend

- `PENDING` — approved but not started.
- `IN-PROGRESS` — actively being changed; not safe to call complete.
- `VERIFY` — implementation exists but one or more required checks remain.
- `BLOCKED` — cannot proceed without a named decision or external input.
- `DONE` — implementation and all internal evidence for the row pass.
- `EXTERNAL-PENDING` — code is complete but the evidence requires credentials,
  hosting, production infrastructure, or owner-led browser acceptance.
- `OWNER-PENDING` — implementation cannot be finalized without an explicit
  owner asset or product decision; the fallback remains usable and documented.
- `RETAIN` — existing boundary remains valid and must survive the redesign.
- `REMOVE/REDIRECT` — legacy product behavior must not remain a primary path.

## Locked decisions

| Decision | Status | Notes |
| --- | --- | --- |
| Variant B — Guided Briefing is the selected design | DONE | Layout, icons, hierarchy, interactions, desktop/mobile behavior, and copy intent are the visual contract |
| Current client palette replaces the prototype palette | DONE | Only pre-authorized design change; use semantic tokens |
| Default product identity is configurable as “Rasm” | DONE | No component-local app name, logo, tagline, or metadata |
| Today is the central orchestration control surface | DONE | Strategy, calendar, production, review, and final-post moments appear in the guided journey |
| Backend controls skills and phase transitions | DONE | Human UI must not call low-level `createRun` or expose a skill picker |
| PostgreSQL remains canonical; Obsidian is export-only | DONE | Prefer durable export job endpoint |
| Astro SSR + focused React islands + same-origin BFF | DONE | Do not convert to a client-only SPA |
| pnpm and no Docker | DONE | Use pinned package manager/runtime |
| Full browser E2E execution is deferred until explicitly requested | DONE | Tests and manual procedure still must be prepared |

## Milestone tracker

| Milestone | Status | Required evidence |
| --- | --- | --- |
| F0. Baseline and contract reconciliation | DONE | Frozen-install clean; 0 vulns; check (72 files, 0 errors); test (11 files, 43 passed, 2 skipped); build (16.3s, 0 errors, ~872 KB JS catalogued); eslint toolchain in CI (0 errors); typed contracts & API client complete; 8 Variant B Today fixtures created & tested; Section 8.4 interface decisions recorded |
| F1. Foundations and authenticated shell | DONE | Central config (product, nav, phases, copy, SEO) with tests; Better Auth UI (LoginForm, /login page, auth-client); exact responsive AppShell with desktop header, PhaseProgressStrip (Phases 1-6), MobileNavDock (4 items, touch targets, safe area), WorkspaceSwitcher, CreateWorkspace modal; check (83 files, 0 errors, 0 warnings); test (13 files, 53 passed, 2 skipped); lint (0 errors); build (13.10s, 0 errors) |
| F2. Today orchestration | DONE | Backend review status, authoritative active-run recovery, honest copy, idempotency lifetime, Phase 4/6 states, query ownership, and identity/workspace isolation are implemented and verified. |
| F3. Library | DONE | Fast/Folders/Needs review built & verified; responsive spotlight layout (1.2fr / minmax(220px, .8fr)); useInfiniteQuery cursor pagination; backend search query; grouped sprint/week/day accordions; review queue with approve/revise/reject and HTTP 409 conflict recovery; metadata-derived revision lineage; honest page-scoped counts; URL filter state sync; /library.astro with SSR redirects from /artifacts and /approvals; check (106 files, 0 errors); test (16 files, 83 passed, 2 skipped); lint (0 errors); build (30.28s, 0 errors) |
| F4. Brand | DONE | Strict audit removed derived area versions and incomplete counts, exposed source provenance, restored browser history, and kept missing timestamps/history/improvement honest. 12 focused tests pass; lint/check/build passed after the F3 cursor correction. Public history/improvement contracts remain separately blocked. |
| F5. You and settings | DONE | Real Better Auth identity/methods/sessions, registration/recovery/reset, secure revocation/sign-out, disabled non-durable preferences, timezone read, and durable queued Obsidian export are implemented. Focused tests, full 113-test suite, lint, 136-file check, and production build pass. Live Google/email acceptance remains external. |
| F6. Quality hardening | VERIFY | Internal accessibility, performance, metadata, private-cache, cancellation, CSP/security, dependency, redaction, lint/check/test/build gates pass. Cross-browser/visual, deployed CSP/CWV, provider, and exact deployment-secret evidence remain explicitly external. |
| F7. Final audit and handoff | DONE | Source/prototype/context/backend/map reconciliation complete; findings fixed; docs current; every residual item classified honestly; lint/check/test/build/install/audit/budget gates pass |
| Post-F7. Installable PWA | DONE | Manifest, generated icons, privacy-safe service worker/offline fallback, You-page install guide, middleware allowlist, focused tests, documentation, and production build pass; device installation remains external acceptance |
| Post-F7. Variant B strict parity | DONE | Authenticated desktop/mobile shell, phase journey, Work scenes, coach rail, Library, Brand, You, typography, spacing, radii, controls, and icons reconciled to the approved prototype while retaining only the authorized client palette; lint, 132-file check, 127 tests, and production build pass; browser screenshot acceptance remains external |
| F8. Guided interview speed/reliability integration | PENDING | Versioned backend interview contracts; beginner-friendly option-first/custom/help states; non-blocking personalized-option prefetch and fallback; resume/conflict/offline/SSE behavior; desktop/mobile/accessibility and real-service E2E evidence |

## 2026-10-09 implementation reconciliation

The milestone summary was checked against the current source, focused tests,
client contracts, and backend run lifecycle. File presence and passing mocked
tests are not sufficient evidence of a completed milestone.

| Finding | Evidence | Required disposition |
| --- | --- | --- |
| F0 and F1 are fully completed milestones | Source present and recorded baseline, configuration, auth UI, shell, and contract checks remain consistent | Keep `DONE` |
| F2 real backend review contract implemented | `today-selector.ts`, fixtures, and `TodayPage.tsx` use `waiting_approval` with `output_status: "pending"` matching backend run lifecycle | Marked `DONE` |
| F2 refresh-safe run recovery implemented | Removed `sessionStorage` and artifact guessing; prefers the workflow active-run projection and validates any linkable `?run=` UUID through an authoritative backend read and workspace ownership check. | Marked `DONE` |
| F2 elimination of invented facts | Removed fake duration labels/timers, raw internal `skill_name` identifiers, and placeholder purposes; labels sourced from `PHASES_CONFIG` | Marked `DONE` |
| F2 Six-Phase cycle coverage complete | Added dedicated presentation views and tests for Phase 4 (QC scorecard review in `TodayQcView.tsx`) and Phase 6 (cycle completion & return to Phase 2) | Marked `DONE` |
| F3 implementation and verification complete | Fast/Folders/Review views, working cursor load-more, exact metadata revision lineage, backend search, honest counts, URL state sync, 409 conflict handling, exactOptionalPropertyTypes cursor typing, and 9 passing tests verified | Marked `DONE` |

## Current-to-target route map

| Current route/file area | Target | Status | Done when |
| --- | --- | --- | --- |
| `client/src/pages/index.astro` + `TodayEntry` | Today `/` | DONE | Central guided work surface renders authoritative next action with TodayPage and StudioFrame |
| `client/src/pages/workflow.astro` | Redirect to Today | DONE | No duplicate phase-control experience remains; clean SSR redirect to / |
| `client/src/pages/artifacts.astro` | Library `/library` | DONE | Route redirects to /library preserving search params without breaking safe deep links |
| `client/src/pages/approvals.astro` | Library Needs review / Today review | DONE | Route redirects to /library?view=review preserving search params |
| `client/src/pages/context.astro` | Brand `/brand` | DONE | `/brand` renders approved memory; `/context` preserves query parameters and redirects to `/brand` |
| `client/src/pages/settings.astro` | You `/you` | DONE | `/you` uses real account/session data; `/settings` preserves its query and redirects with 303 |
| `client/src/pages/skills/[name].astro` | Remove from human navigation | DONE | Legacy bookmarks redirect to Today; browser API and allowlist expose no skill listing or raw run creation |
| `client/src/pages/runs/[id].astro` | Protected detail/diagnostic deep link | DONE | Protected diagnostic remains available without becoming a primary workflow or linking to skill execution |
| `client/src/pages/login.astro` | Better Auth entry | DONE | Email/password, Google sign-in trigger, validation, accessible error alerts, and configurable identity |
| `client/src/pages/api/auth/[...all].ts` | Better Auth server boundary | RETAIN | Existing secure handler remains covered by tests |
| `client/src/pages/api/smm/[...path].ts` | Same-origin BFF | RETAIN | Allowlist, session assertion, bounds, timeout, and normalized errors remain intact |

## Source implementation map

Paths marked “planned/equivalent” describe responsibilities. Update this map if
a clearer filename is selected; do not create files solely to satisfy the table.

| Workstream | Current/planned source | Status | Acceptance |
| --- | --- | --- | --- |
| Package/runtime baseline | `client/package.json`, `client/pnpm-lock.yaml`, Astro config | RETAIN | Node/pnpm remain pinned; no unnecessary dependency or second icon/state library |
| Product configuration | `client/src/config/product.ts` | DONE | Name, short name, tagline, logo/favicon refs, support links, Better Auth app name, auth email identity, login and page metadata have one typed owner |
| Navigation configuration | `client/src/config/navigation.ts` | DONE | Exact Today/Library/Brand/You routes and Lucide icons are centralized |
| Phase display metadata | `client/src/config/phases.ts` | DONE | Friendly labels/purposes only; backend phase/cycle/status remain authoritative; no transition or skill-routing logic |
| Shared product copy | `client/src/config/ui-copy.ts` | DONE | Repeated/volatile wording is centralized without a monolithic string dump |
| SEO configuration | `client/src/config/seo.ts`, `BaseLayout.astro` | DONE | No hardcoded Signal Studio metadata; private routes noindex and leak no user content |
| Brand assets | central `PRODUCT_CONFIG` text/spark fallback; future `client/public/brand/` | OWNER-PENDING | Current fallback is centralized and accessible; final logo/favicon assets require owner input |
| Design tokens | `client/src/styles/global.css` | DONE | Current ink/acid palette, Inter, radii, elevation, focus, safe-area mobile variables, touch targets, and breakpoints active |
| Lint/format quality gate | `client/eslint.config.js`, `.github/workflows/quality.yml` | DONE | ESLint 9 + TypeScript-ESLint + eslint-plugin-astro + eslint-plugin-react-hooks + eslint-plugin-jsx-a11y passing with 0 errors; CI quality workflow updated |
| Base UI primitives | `client/src/components/ui/*` | DONE | Focused primitives passed semantic/accessibility audit; no premature universal component API was introduced |
| App shell | `client/src/components/studio/AppShell.tsx`, `PhaseProgressStrip.tsx`, `MobileNavDock.tsx` | DONE | Variant B desktop header + 6-phase indicator on Today + mobile header + mobile dock + notification flyout + profile menu |
| Workspace switch/create | `WorkspaceSwitcher.tsx`, `CreateWorkspace.tsx`, shell selection logic | DONE | Validated creation selects workspace and enters onboarding immediately |
| Authentication UI | `client/src/components/auth/*`, `client/src/lib/auth-client.ts`, `/login`, `/register`, `/forgot-password`, `/reset-password` | DONE | Better Auth registration, sign-in, Google, verification resend, generic recovery, reset, correct autocomplete, validation, and safe redirects replace the shared-password UI |
| Session/server auth | `client/src/lib/server/{auth,config,database}.ts`, middleware | RETAIN | HttpOnly session and protected routes remain server-enforced |
| API allowlist | `client/src/lib/server/smm-route-policy.ts` | RETAIN | Product endpoints remain allowlisted; service-only raw run endpoint stays blocked |
| API schemas | `client/src/lib/contracts.ts` | DONE | Strict Zod schemas cover workflow/question/pages/lineage/posts/export jobs/auth session/preferences/structured cards and reject malformed payloads |
| API client | `client/src/lib/api.ts` | DONE | Product methods replace human `createRun`; query params encoded safely; errors normalized; typed coverage for all BFF routes |
| Query keys/invalidation | `client/src/lib/query-keys.ts` | DONE | Stable workspace/filter keys (`studioQueryKeys`), abort signals, bounded cache, polling, identity clearing on logout, and mutation invalidation are explicit |
| UI state | local React component state | DONE | Retired global store and dependency removed; remote/workflow/session data remains in TanStack Query or the backend |
| Today selector/model | `client/src/lib/today-selector.ts` | DONE | Backend state maps to a fail-closed discriminated UI state with real `waiting_approval` + `output_status: "pending"` contract and 6-phase cycle moments |
| Today page | `client/src/components/studio/TodayPage.tsx`, `today/useTodayController.ts` | DONE | Declarative prototype moments are separated from query/mutation/idempotency policy; backend selection and validated linkable run UUID remain authoritative |
| Adaptive question | `client/src/components/studio/today/TodayQuestionView.tsx` | DONE | One backend question; described options; custom answer; exact version/idempotency; keyboard/a11y |
| Work status/resume | run query and workflow selector | DONE | Preserved URLs resume a validated, workspace-owned run via backend read; client storage truth is removed. Discovery from a new URL is blocked on a backend projection. |
| Step progress/activity | Today progress and activity components | DONE | Honest bounded backend projection without fake step counts or synthetic progress; phase labels sourced from config |
| Structured rich-card data | Today/Brand/calendar presentation adapters | DONE | Versioned discriminated backend data exists for fields the prototype renders; safe fallback |
| Brand completeness score | Brand strength summary | RESOLVED-F0 | Percentage omitted under registered exception PX-005; no client fake scores |
| Phase 4/6 presentation | `TodayQcView.tsx`, cycle complete card | DONE | Phase 4 QC scorecard review with pass/fail badges; Phase 6 cycle completion visibly returns to Phase 2 strategy |
| Notifications | shell notification control | RESOLVED-F0 | Explicit unavailable state is rendered; Today remains the real action surface until a bounded notification contract exists |
| Review/revision | `client/src/components/studio/today/TodayReviewView.tsx` | DONE | Real `waiting_approval` contract, exact run/revision approve/reject/revise and stale HTTP 409 conflict recovery |
| Library Fast view | Library components | DONE | Next useful post, search/filters, copy confirmation, bounded cursor data and error states verified |
| Library next/summary projection | Fast view and weekly summary | RESOLVED-F0 | Timezone-correct ascending next-post and aggregate facts are backend-bounded or labels remain explicitly page-scoped |
| Library Folders | Library components | DONE | Backend grouped sprint/week/day/platform view; no fake filesystem or unbounded grouping |
| Library Needs review | Library components | DONE | Current revision summaries, safe review actions and stale-conflict recovery verified |
| Brand | `BrandPage.tsx`, `brand/*`, `brand-presenter.ts`, `/brand` | DONE | Friendly approved memory, per-source provenance, safe Markdown, honest cursor counts, URL history, responsive list/detail, and guided Today entry point verified |
| Brand history/improvement | Brand detail actions | VERIFY | Bounded per-key revision history is implemented; backend-controlled area-specific improvement remains an honest Today handoff |
| You | `AccountPage.tsx`, `account/*`, `AccountEntry.tsx`, `/you` | DONE | Real identity/methods/sessions and secure actions; unsupported preferences/updates disabled; infrastructure dashboard removed; internal tests/check/build pass |
| Preferences/workspace updates | You controls | DONE | Durable version-checked preferences and workspace timezone updates are wired to account-scoped product contracts |
| Obsidian export | `AccountWorkspacePanel.tsx`, typed API contract | DONE | Durable idempotent enqueue plus exact account-scoped job polling reports terminal status honestly |
| Publication completion | Today/Library post action | VERIFY | Versioned idempotent status command exists; third-party social publishing remains a separate connector and the UI makes no false delivery claim |
| Error/loading/offline | feedback primitives + route states | DONE | Primary surfaces cover loading, empty, normalized recoverable errors and stale conflicts; permission/terminal errors fail closed |
| Responsive behavior | shell and every page | VERIFY | CSS breakpoints, safe areas, dock clearance, long-title wrapping and touch targets are implemented; real browser/zoom evidence is external |
| Motion | CSS/native progress | DONE | Runtime motion dependency removed; reduced-motion fallback and no animation-driven truth |
| Markdown | `react-markdown`, `remark-gfm` | RETAIN | Raw HTML disabled; safe links; generated content never passed to `innerHTML` |
| Private cache isolation | `session-security.ts`, abortable query functions, scoped query keys | DONE | Secure logout cancels and clears queries plus transient workflow IDs; reads consume abort signals; focused tests pass |
| Security headers/CSP | `astro.config.mjs`, `security-headers.ts`, middleware | VERIFY | Hashed Astro resource policy plus enforced frame/form/object/base header and regression tests pass; deployed header observation remains external |
| Locale/timezone formatting | `lib/utils.ts`, Today greeting, account/Brand/run displays | DONE | `Intl` uses explicit workspace IANA timezone with deterministic UTC/English fallback; tests cross a date boundary |
| Client observability | normalized `ApiError`, request IDs, redacted server logging | DONE | Codes/request IDs aid support while logs and public builds exclude content/source maps; external telemetry remains intentionally unapproved |
| Performance budgets | `client/docs/quality-hardening.md`, build output, bounded queries | VERIFY | Raw JS budgets and query memory bounds pass locally; compressed/deployed CWV evidence remains external |
| Unit/component tests | current `*.test.tsx`, accessibility helper | DONE | Presentation states, forms, mutations, pagination, conflicts, cancellation, headers, accessibility and config pass |
| Visual tests | deterministic fixtures + documented screenshot matrix | EXTERNAL-PENDING | Approved moments require owner-authorized Chromium/Firefox/WebKit desktop/mobile execution |
| Browser E2E | quarantined scaffold + `client/docs/e2e-testing.md` | EXTERNAL-PENDING | Retired shared-cookie harness removed; Better Auth fixture migration and execution deliberately deferred |
| Client documentation | `client/docs/*` | DONE | Architecture, features, security, quality, backend contract and E2E handoff reflect the implementation/evidence boundary |

## Backend contract reconciliation

| Contract | Backend | Current client | Redesign action | Status |
| --- | --- | --- | --- | --- |
| Workspace cursor page | Implemented | Accepts array/envelope but drops cursor | Add typed page + pagination strategy | DONE |
| Workflow state | Implemented | Missing | Add strict schema/query | DONE |
| Pending adaptive question | Implemented | Old static question shape | Add exact backend shape and answer union | DONE |
| M9 deterministic guided interview | Planned in ADR 0014/M9 context | Current Today depends on adaptive model-produced questions | Add versioned interview projection, all declared answer modes, prefetch/fallback, resume/conflict handling, and SSE with polling fallback | PENDING-F8 |
| Backend-selected continue | Implemented | Missing | Add product mutation; remove human skill-run path | DONE |
| Active run after refresh | Implemented in workflow projection | Recovers projection or validates a known-run URL | Prefer the backend projection; preserve deep-link ownership validation | DONE |
| Step progress/activity | Only phase and known-run status are exposed | Incomplete | Resolved for F0: honest bounded projection without fake step counts or synthetic progress | RESOLVED-F0 |
| Structured Brand/calendar/review cards | Generic context `data` and artifact `metadata/content` | No versioned view contract | Added versioned discriminated presentation schemas with safe Markdown fallback | DONE |
| Per-post production progress | Aggregate run state only | Missing | Resolved for F0: bounded batch presentation or indeterminate bar; fake percentages forbidden | RESOLVED-F0 |
| Brand completeness score | No authoritative score | Missing | Resolved for F0: percentage omitted under registered exception PX-005; no client fake scores | RESOLVED-F0 |
| Phase 4/6 rich state and cycles | Workflow exposes phase/cycle; prototype omits dedicated scenes | Generic/incomplete | Resolved for F0: reuse mission/review grammar; cycle visibly loops to Phase 2; QC schema defined | RESOLVED-F0 |
| Notifications | No product feed/read contract | Missing | Resolved for F0: control explicitly states that notifications are unavailable and routes real action to Today | RESOLVED-F0 |
| Run output/review lineage | Implemented | Partial legacy schema | Add review thread/revision/supersession/final posts | DONE |
| Approve/reject | Implemented | Basic | Preserve exact run; improve conflict/invalidation handling | DONE |
| Revise | Implemented | Missing | Add expected revision + instructions + idempotency | DONE |
| Artifact cursor/filter/history | Implemented | Missing list method | Add typed pages, filters and exact item | DONE |
| Final-post flat/grouped queries | Implemented | Missing | Add typed filters/groups/item methods | DONE |
| Next post and weekly aggregates | Descending bounded pages only | Missing | Resolved for F0: page-scoped facts labeled honestly without synthetic aggregate claims | RESOLVED-F0 |
| Final-post publication mutation | Versioned/idempotent state command implemented | Typed client method available | Keep external connector delivery distinct from product publication state | DONE-CONTRACT |
| Context cursor page | Implemented | Drops cursor | Add page/query; Brand selector | DONE |
| Context revision history/improvement intent | Bounded history read implemented; area intent remains absent | Per-key history panel; improve links to Today | Use read-only history and keep orchestration-owned improvement | DONE WITH INTENT GAP |
| Durable Obsidian export job | Enqueue and exact/list status reads implemented | Durable enqueue plus exact-job polling | Report authoritative job lifecycle only | DONE |
| Account/workspace preferences and updates | Versioned owner contracts implemented | Account and workspace controls wired | Refresh on optimistic conflict | DONE |
| Better Auth session flows | Server implemented; live external gates remain | Shared-password-era UI incomplete | Server contracts & schemas in place; Better Auth React client, LoginForm, and login page implemented for F1 (live OAuth/email credentials remain EXTERNAL-PENDING) | DONE |

## Prototype screen inventory

| Area/moment | Desktop | Mobile | Status |
| --- | --- | --- | --- |
| Today — first visit/orientation | DONE | DONE | View renders friendly orientation welcome; creates run or advances workflow via backend action |
| Today — adaptive question | DONE | DONE | View handles option selection, custom answer, version validation, and idempotency key |
| Today — agent working | DONE | DONE | View handles active runs with honest phase copy, authoritative `?run=` param, and auto-polling |
| Today — review brand foundation | DONE | DONE | View handles `waiting_approval` with `output_status: "pending"`, approve/revise mutations, and conflict handling |
| Today — approved/moving to strategy | DONE | DONE | View renders transition moment and triggers continuation mutation with idempotency |
| Today — strategy/calendar review | DONE | DONE | View renders structured calendar presentation, posts overview, approve and revise actions |
| Today — production status | DONE | DONE | View renders batch status without fake progress; generates draft posts |
| Today — final posts ready | DONE | DONE | View renders platform posts with copy feedback and review actions |
| Today — Phase 4 quality-control state | DONE | DONE | `TodayQcView.tsx` renders scorecard, pass/fail status, warnings, and revision requests |
| Today — Phase 6 cycle complete | DONE | DONE | View renders cycle completion card and triggers return to Phase 2 strategy for next cycle |
| Library — Fast view | DONE | DONE | Built with spotlight post, cursor pagination, search/platform filters, copy gesture, and responsive layout |
| Library — Folders | DONE | DONE | Built with grouped sprint/week/day accordions and deliverables section |
| Library — Needs review | DONE | DONE | Built with review queue, approve/reject/revise actions, and HTTP 409 conflict banner |
| Brand — overview/detail/history/improve | DONE | DONE | Shared responsive implementation is internally verified; bounded protected history is readable and improvement returns to Today without mutating context |
| You — account/preferences/export/workspace | DONE | DONE | Responsive real-account implementation and secure actions pass internal verification; live provider acceptance remains an external gate |
| Shell — navigation/workspace/progress/account | DONE | DONE | Variant B responsive header, bounded workspace chooser, Today phase strip, account disclosure, and four-item mobile dock are implemented |

## Prototype exception/discrepancy log

| ID | Description | Status | Resolution/evidence |
| --- | --- | --- | --- |
| PX-001 | Translate prototype colors to current client palette | APPROVED | Implementation context section 4.1 |
| PX-002 | Omit demo-only scene/viewport/variant/tweak controls | APPROVED | They are outside the product window |
| PX-003 | Replace fixtures/timers/fake user with real backend/session data | APPROVED | Presentation remains visually faithful |
| PX-004 | Replace simulated scene transitions with backend-derived state | APPROVED | Backend is authoritative |
| PX-005 | Owner-reported minor prototype mistakes | OWNER-PENDING | Add each concrete correction before changing corresponding UI |
| PX-006 | Exact Lucide version mismatch, if encountered | NOT ENCOUNTERED | Record icon and approved substitute before closing |
| PX-007 | Inert/mis-semantic buttons, folders, choices, switches and app-wide live region | MANDATORY | Preserve appearance; correct link/progress/radio/disclosure/switch/live-region semantics |
| PX-008 | Supporting labels as small as 8–9 px | VERIFY | Retain only after dark-palette contrast, 200% zoom/reflow and real-device readability pass |
| PX-009 | Demo-window absolute mobile dock | MANDATORY | Preserve geometry with safe-area viewport positioning and unobscured focus/content |
| PX-010 | No dedicated Phase 4 or Phase 6 prototype scene | VERIFY | Existing mission/status/review grammar implements both and Phase 6 → Phase 2; owner browser visual acceptance remains external |

## Verification evidence

Do not copy backend M7 results into this table as redesign evidence. Record fresh
frontend results after work begins.

| Check | Result | Date | Scope/limits |
| --- | --- | --- | --- |
| Redesign implementation context exists and is internally linked | PASS | 2026-10-09 | Planning documentation only |
| Existing client/source/backend contract inventory reviewed | PASS | 2026-10-09 | Static read; no frontend changes or test execution |
| Approved prototype identity recorded | PASS | 2026-10-09 | SHA-256 `d0d1baafbdcd6b1a69eab89484104ba761f36786fc31377800639e294181de76`; external prototype is an audit input, not a runtime dependency |
| Rigorous prototype/backend/engineering-plan audit | PASS WITH BLOCKERS | 2026-10-09 | Traceability, exact geometry, semantic corrections, structured-view gaps, cache isolation, CSP, performance, accessibility, E2E and code-quality requirements reconciled; implementation evidence remains absent |
| UI implementation | PASS INTERNALLY (F0-F7 DONE; external gates remain) | 2026-10-10 | Final source/prototype/backend/documentation reconciliation complete; see F7 audit |
| F2 focused tests | PASS | 2026-10-10 | 3 test files, 36 tests passed: `TodayPage.test.tsx` (15 tests), `today-selector.test.ts` (13 tests), `today-moments.test.ts` (8 tests) |
| F2 focused lint | PASS | 2026-10-10 | `eslint .` passes with 0 errors across all client source files |
| F2 project check | PASS | 2026-10-10 | Astro check (136 files, 0 errors, 0 warnings, 0 hints) with strict `exactOptionalPropertyTypes: true` |
| F2 production build | PASS | 2026-10-10 | Astro standalone Node SSR production build completed cleanly in 8.65s with 0 errors |
| F4 focused tests | PASS | 2026-10-09 | 2 files, 12 presenter/component tests passed; includes grouping, fallback visibility, safe Markdown/image handling, pagination/count honesty, URL and popstate restoration, empty state, and honest unavailable actions |
| F4 full non-browser suite | PASS | 2026-10-09 | 17 files passed, 1 skipped; 95 tests passed, 2 skipped |
| F4 lint | PASS | 2026-10-09 | Full `pnpm run lint` and focused F4 ESLint pass with 0 errors |
| F4 project check/build | PASS | 2026-10-09 | Astro check (117 files, 0 errors) and Astro build completed cleanly in 10.67s with 0 errors after resolving F3 exactOptionalPropertyTypes cursor contract |
| F5 focused tests | PASS | 2026-10-10 | 3 files, 9 account/auth/session-security tests passed; real identity/method/session rendering, confirmation, queued export, anti-enumeration recovery, validation, private-state clearing, and failed sign-out behavior covered |
| F5 focused lint | PASS | 2026-10-10 | Account, auth, AppShell, session-security, and route files pass ESLint with 0 errors |
| F5 full non-browser suite | PASS | 2026-10-10 | Resource-bounded single-worker run: 20 files passed, 1 integration file skipped; 113 tests passed, 2 skipped. No browser E2E was run. |
| F5 project check | PASS | 2026-10-10 | Astro checked 136 files with 0 errors, 0 warnings, and 0 hints after removing two stale unused declarations. |
| F5 production build | PASS | 2026-10-10 | Astro standalone Node server build completed successfully in 9.44s. |
| F6 accessibility and interaction tests | PASS | 2026-10-10 | Axe DOM checks cover dialog/menu/tabs/generated questions; keyboard menu/tab behavior, focus trap/restore, native radios and error associations pass |
| F6 full non-browser suite | PASS | 2026-10-10 | 22 files passed, 1 integration file skipped; 123 tests passed and 2 skipped |
| F6 lint | PASS | 2026-10-10 | Full ESLint pass completed with 0 errors |
| F6 project check | PASS | 2026-10-10 | Astro checked 140 files with 0 errors, 0 warnings, and 0 hints |
| F6 production build and budget | PASS | 2026-10-10 | Standalone build passed; browser JS 810,459 raw bytes, largest chunk 212,939 bytes, no source maps; both documented budgets pass |
| F6 frozen install / supply-chain policy | PASS | 2026-10-10 | pnpm frozen lockfile remained up to date; 854 lock entries passed configured supply-chain policies |
| F6 dependency advisory audit | PASS | 2026-10-10 | `pnpm audit --audit-level moderate`: no known vulnerabilities |
| F7 full non-browser suite | PASS | 2026-10-10 | Final source state: 20 files passed, 1 integration file skipped; 123 tests passed and 2 skipped. Browser E2E was not run. |
| F7 lint | PASS | 2026-10-10 | Full ESLint pass completed with 0 errors after all audit fixes. |
| F7 project check | PASS | 2026-10-10 | Astro checked 124 files with 0 errors, 0 warnings, and 0 hints; reduced count reflects intentional legacy-code removal. |
| F7 production build and budget | PASS | 2026-10-10 | Standalone Node build passed in 10.85s; browser JS 803,791 raw bytes, largest chunk 212,939 bytes, no source maps. |
| F7 frozen install / supply-chain policy | PASS | 2026-10-10 | Frozen pnpm install verified 853 lock entries and reported the installation already up to date. |
| F7 dependency advisory audit | PASS | 2026-10-10 | `pnpm audit --audit-level moderate`: no known vulnerabilities. |
| F7 implementation audit | PASS WITH EXTERNAL GATES | 2026-10-10 | Prototype hash, routes, API policy, backend contracts, state ownership, source, tests, performance, accessibility, security, scalability, comments, and documentation reconciled; see `f7-final-frontend-audit.md`. |
| Post-F7 PWA implementation | PASS WITH DEVICE GATE | 2026-10-10 | ESLint 0 errors; Astro check 131 files with 0 findings; 22 test files passed plus 1 skipped, 126 tests passed plus 2 skipped; build passed in 8.60s; all public PWA assets emitted; 806,916 raw JS bytes, largest chunk 212,939 bytes, no source maps. Browser/device installation was not run. |
| `pnpm install --frozen-lockfile` | PASS | 2026-10-09 | Frozen lockfile verified clean in 2.6s |
| `pnpm run check` | PASS | 2026-10-09 | 83 files checked, 0 errors, 0 warnings, 0 hints |
| `pnpm run test` | PASS | 2026-10-09 | 13 test files (12 passed, 1 skipped integration test), 53 unit/component/contract tests passed, 2 skipped |
| `pnpm run build` | PASS | 2026-10-09 | Astro SSR production build completed cleanly in 13.10s; 0 errors |
| `pnpm run lint` | PASS | 2026-10-09 | ESLint 9 + TypeScript-ESLint + eslint-plugin-astro + eslint-plugin-react-hooks + eslint-plugin-jsx-a11y: 0 errors |
| Dependency audit | PASS | 2026-10-09 | 0 vulnerabilities found (`pnpm audit`) |
| Built-client secret scan | PASS WITH DEPLOYMENT LIMIT | 2026-10-10 | No private-key/database URL/obsolete shared-secret format or source map in browser output; exact real-value comparison requires secrets present in deployment environment |
| Automated accessibility checks | PASS | 2026-10-10 | Four key axe component checks pass; semantic ESLint and keyboard-focused unit coverage pass |
| Visual regression/fidelity checks | EXTERNAL-PENDING | — | Browser execution explicitly deferred; deterministic breakpoints and evidence procedure documented |
| Browser E2E | EXTERNAL-PENDING | — | Retired shared-cookie harness quarantined; Better Auth migration and execution explicitly deferred |
| Live email/Google authentication | EXTERNAL-PENDING | — | Requires configured provider credentials and public callback origin |
| Production performance/CWV | EXTERNAL-PENDING | — | Requires representative deployed environment and traffic/device profile |

## External inputs and production gates

| Input/gate | Status | Impact |
| --- | --- | --- |
| Concrete list of the owner's minor prototype corrections | OWNER-PENDING | Exact affected components cannot be corrected without guessing; other planning can continue |
| Final logo/favicon assets, if different from prototype spark | OWNER-PENDING | Configurable fallback can be built; brand sign-off remains open |
| Final production name/tagline | DONE | Rasm identity and tagline are centralized in product configuration |
| Public production origin/TLS | EXTERNAL-PENDING | Secure cookies, canonical metadata, Google callback and final CSP verification |
| Google OAuth credentials | EXTERNAL-PENDING | Live Google sign-in acceptance |
| Transactional email credentials/domain | EXTERNAL-PENDING | Live verification/recovery acceptance |
| Analytics provider/consent decision | NOT APPROVED | Do not install or send telemetry yet |
| Browser/device acceptance by owner | EXTERNAL-PENDING | Final visual/interaction sign-off |

## Tracker update rules

1. Before editing a mapped source area, set its row and milestone to
   `IN-PROGRESS`.
2. Add every material new file to the source map or update the mapped boundary.
3. Record prototype discrepancies before deviating. PX-001 through PX-004 are
   approved product adaptations; PX-007 and PX-009 are mandatory non-visual
   semantic/responsive corrections. PX-005, PX-006, PX-008, and PX-010 remain
   conditional or require owner evidence.
4. A row moves to `VERIFY` when code exists but required evidence is incomplete.
5. A row moves to `DONE` only when its acceptance criteria and internal tests
   pass.
6. Do not turn missing backend state into client-side guesses. Mark the exact
   contract `BLOCKED` and resolve it through a reviewed backend change.
7. Preserve external gates as `EXTERNAL-PENDING`; local mocks do not prove live
   OAuth, email, hosting, production performance, or owner acceptance.
8. Keep historical evidence and superseded decisions visible rather than
   deleting them to shorten the file.
9. At F7, reconcile this table with `rg --files client`, route definitions,
   imports, tests, build output, and documentation.

## Current continuation instruction

Milestones **F0-F5** are complete. **F6** is complete for all internal quality
gates with its named browser/deployment gates still external. **F7** is complete
for the final implementation audit and handoff. **F8** is newly planned and has
not started; it tracks the frontend half of M9 without changing the historical
F0–F7 evidence.

Milestone F2 has been completely resolved:
- Reconciled Today with real backend review contract (`waiting_approval` with `output_status: "pending"`).
- Removed client-owned `sessionStorage` workflow truth and artifact guessing; wired linkable `?run=` parameter recovery and workspace isolation.
- Eliminated all fake duration labels, countdown timers, and raw internal skill names.
- Added full Six-Phase cycle handling: Phase 4 QC scorecard review (`TodayQcView.tsx`) and Phase 6 cycle completion returning to Phase 2 strategy.
- Verified with 36 focused unit and moment tests, clean ESLint (0 errors), strict `astro check` (0 errors across 136 files), and clean production build.

F6's internal hardening work and F7's source/prototype/backend/documentation
audit are complete. F7 removed the obsolete human skill runner and dead legacy
surfaces, narrowed the browser capability boundary, corrected Today state
precedence and idempotency handling, bounded remaining lists, split Today's
controller from its view, and reconciled all client documentation.

Browser/visual acceptance, deployed CSP/Core Web Vitals, live Google/email,
final brand assets, owner-specific prototype corrections, and exact
deployment-secret comparison remain external by design. Follow
`client/docs/e2e-testing.md` when browser execution is authorized.

For F8, first read
[`backend-speed-reliability-implementation-context.md`](./backend-speed-reliability-implementation-context.md)
and [`backend-speed-reliability-map.md`](./backend-speed-reliability-map.md).
Do not implement personalized options as frontend-only workflow truth or make
the interview wait on a model response when curated fallbacks are available.
