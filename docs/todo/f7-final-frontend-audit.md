# F7 final frontend audit

**Status:** Internal implementation audit complete; external browser/deployment gates pending  
**Date:** 2026-10-10  
**Scope:** client/ and its browser-facing backend contract  
**Authoritative plan:** [frontend-redesign-implementation-context.md](./frontend-redesign-implementation-context.md)  
**Tracker:** [frontend-redesign-map.md](./frontend-redesign-map.md)

## Audit objective

Verify every F0-F6 milestone against the source, the approved Variant B
prototype, the real Fastify contract, and the redesign plan. Fix material
security, correctness, scalability, accessibility, performance,
maintainability, documentation, and product-honesty defects rather than merely
listing them.

This audit does not claim browser E2E, live OAuth/email, deployed CSP/Core Web
Vitals, or owner visual acceptance. Those require external environments or were
explicitly deferred.

## Inputs reconciled

- Approved prototype SHA-256:
  d0d1baafbdcd6b1a69eab89484104ba761f36786fc31377800639e294181de76.
- Frontend redesign context and plan audit.
- Current Astro routes, React components, contracts, query keys, BFF route
  policy, tests, package manifest, lockfile, and client documentation.
- Backend workflow, question, run, approval/revision, context, artifact,
  final-post, authentication, and Obsidian export contracts.

## Milestone reconciliation

| Milestone | Audit result | Evidence boundary |
| --- | --- | --- |
| F0 contract baseline | PASS | Product configuration, strict schemas, API client, BFF allowlist, and prototype fixtures remain present |
| F1 shell/authentication | PASS | Variant B header, workspace creation/switching, phase strip, mobile dock, Better Auth screens, safe redirects, and protected middleware remain intact |
| F2 Today orchestration | PASS AFTER FIXES | Correct backend-selected flow, six phases, safe run resume, review concurrency, idempotency, honest output, and workspace isolation |
| F3 Library | PASS AFTER FIXES | Fast/Folders/Needs review now use bounded cursor queries, server search, page-scoped counts, visible copy/action errors, and stale conflict recovery |
| F4 Brand | PASS | Approved canonical context, provenance, unknown-key visibility, safe Markdown, and bounded pagination remain intact; unsupported history is honest |
| F5 You/account | PASS | Better Auth identity/session controls and durable export enqueue remain intact; unsupported settings and job status remain unavailable |
| F6 hardening | PASS INTERNALLY | Static accessibility, CSP/privacy, cache isolation, source-map and raw-JS budgets remain internal gates; real-browser/deployment gates remain external |
| F7 final audit | PASS AFTER FIXES | Dead legacy product paths removed, documents reconciled, route policy narrowed, core Today component split by responsibility, and evidence classified honestly |

## Findings and resolutions

| ID | Severity | Finding | Resolution |
| --- | --- | --- | --- |
| F7-01 | High | Legacy raw skill execution remained reachable through a protected browser route/API surface, violating backend-owned skill selection | Skill deep links now redirect to Today; raw skill listing/run creation were removed from the browser client and BFF allowlist; negative policy tests cover the boundary |
| F7-02 | High | Today selection could let retained Phase 5 posts or an old approved run hide the actual current workflow phase | Selector precedence now follows current workflow/run truth; regressions cover Phase 6, retained posts, and already-advanced workflows |
| F7-03 | High | A fetched run URL could influence Today without proving workspace ownership | Run parameters accept canonical UUIDs only and fetched runs fail closed unless workspace_id matches the selected workspace |
| F7-04 | High | Continue, answer, and revision retries could create duplicate intent after uncertain failures | Each unchanged intent retains its idempotency key for timeout, throttle, network, and 5xx uncertainty; deterministic rejection or changed input resets it |
| F7-05 | Medium | Today mixed orchestration policy, query lifecycle, URL state, mutations, and a large presentation tree in one component | Extracted useTodayController.ts; TodayPage.tsx is now a declarative phase view and shared continuation controls remove duplication |
| F7-06 | Medium | Workspace, grouped Library, artifact, and review collections risked unbounded or first-page-only behavior | Converted to cursor useInfiniteQuery, retained at most ten pages, deduplicated grouped output, and added honest load-more/page-limit states |
| F7-07 | Medium | Phase/workspace/Brand data could remain stale after run completion or decisions | Central query keys and explicit invalidation now refresh every affected backend projection |
| F7-08 | Medium | Polling retried at a fixed interval and could pressure a degraded backend | Active-run polling exponentially backs off from 1.5 to 15 seconds and remains disabled when work is terminal or unobserved |
| F7-09 | Medium | Shell notification copy claimed a zero state without a notification contract | It now states that notifications are unavailable and directs real work to Today |
| F7-10 | Medium | Library URL inputs and search could be unbounded or unsupported | Search is capped at 200 characters; platform/status values are allowlisted before query construction |
| F7-11 | Medium | Clipboard and review failures could be silently swallowed | Both surfaces show actionable errors and advise manual selection when clipboard permission fails |
| F7-12 | Medium | Client documentation still described removed command-center, skill-runner, raw context editor, Zustand, sidebar, and API capabilities | Architecture, features, backend contract, security, quality, audit, and milestone map were rewritten against current source |
| F7-13 | Low | Comments narrated obvious JSX while non-obvious concurrency policy was buried in a page component | Removed redundant visual comments; retained or added comments for idempotency, isolation, security, accessibility, and bounded-memory decisions |
| F7-14 | Low | Component loading/error branches on primary pages could omit a discoverable page heading | Added screen-reader headings to Today, Library, Brand, You, and diagnostic states |
| F7-15 | Low | Disclosure controls used menu/dialog semantics beyond their implemented interaction model | Workspace keeps the full menu pattern; notification/account popovers use disclosure semantics with Escape and focus restoration |

## Architecture and code-quality assessment

- **Simple ownership:** Astro owns SSR, auth boundary, middleware, and the BFF;
  React owns interactive views; TanStack Query owns remote cache; local React
  state owns ephemeral chrome; PostgreSQL owns product truth.
- **No spaghetti orchestration:** the Today selector is a pure presentation
  state machine, the Today controller owns side effects, and the page renders
  the discriminated result. UI code never chooses a backend skill.
- **No dead alternate product:** obsolete Dashboard, Workflow, Skill runner,
  context editor, approval/artifact pages, questionnaire, entries, and global
  UI store were removed. Compatibility URLs redirect safely.
- **Bounded scale:** high-cardinality reads use cursors, filters are bounded,
  page retention is capped, queries are workspace-scoped, and inactive reads
  consume abort signals.
- **Concurrency:** review revision checks, HTTP 409 recovery, stable
  idempotency, and explicit cache invalidation prevent duplicate or stale work.
- **Security:** HttpOnly Better Auth sessions, server-only service assertions,
  exact UUID routes, same-origin JSON mutations, no raw skill/context-write
  browser capability, safe Markdown, CSP, no-store, noindex, and no public
  source maps.
- **Accessibility:** native form controls, headings/landmarks, keyboard
  disclosures/tabs/dialogs, focus restoration, live errors, touch targets,
  reduced motion, and mobile safe areas are represented in code and tests.
- **Configurability:** product identity, navigation, phases, shared copy, SEO,
  and theme tokens have central owners. Component-local product names and
  private colors were removed from redesigned surfaces.

## Honest residual constraints

1. A preserved Today run URL survives refresh, but a new URL cannot discover an
   in-flight run until the backend adds an active-run projection.
2. Notifications, Brand history/improvement, durable preferences/workspace
   updates, publication completion, and Obsidian job status need backend
   contracts.
3. Final brand assets and any owner-specified prototype corrections remain
   owner inputs; the text/spark fallback is centralized.
4. Browser E2E, real-device/zoom visual acceptance, live Google/email flows,
   deployed CSP/TLS/proxy behavior, and field performance remain external.

## Final verification evidence

| Gate | Result |
| --- | --- |
| Frozen pnpm install and supply-chain verification | PASS — 853 lock entries, already up to date |
| ESLint | PASS — zero errors |
| Astro/TypeScript | PASS — 124 files, zero errors, warnings, or hints |
| Full non-browser Vitest suite | PASS — 20 files passed, 1 integration file skipped; 123 tests passed, 2 skipped |
| Standalone production build | PASS — Astro Node build completed in 10.85 seconds |
| Browser JavaScript budget | PASS — 803,791 raw bytes total; 212,939-byte largest chunk |
| Browser source maps | PASS — none emitted |
| Dependency advisory audit | PASS — no known vulnerabilities at moderate threshold |
| Static credential-format scan | PASS WITH DEPLOYMENT LIMIT — no private key or database URL format; exact real-secret comparison requires deployment secrets |

Browser E2E is intentionally excluded from this execution. The reproducible
procedure and acceptance matrix remain in client/docs/e2e-testing.md.
