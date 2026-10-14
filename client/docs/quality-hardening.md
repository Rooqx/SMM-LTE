# Frontend quality-hardening record

This document records F6 controls and the evidence boundary. It does not claim
browser, provider, or production acceptance that was not run.

## Implemented controls

### Accessibility and interaction

- Every rendered page has one meaningful `h1`, a `main` landmark, and a skip
  link that becomes visible on focus.
- Generated choices use native radio inputs inside a labelled `fieldset`.
- The workspace dialog traps focus, closes with Escape, restores prior focus,
  prevents background scrolling, and associates validation errors with fields.
- The workspace chooser implements menu arrow/Home/End/Escape behavior. Library
  tabs implement the corresponding tab-list keyboard pattern.
- Loading and error feedback use `status`/`alert` live-region semantics. Focus
  styles, 48-pixel touch targets, reduced motion, forced colors, safe-area
  spacing, and fixed-dock clearance are explicit.
- `axe-core` DOM checks cover the dialog, menu, tabs, and generated question.
  Color contrast and layout remain browser checks because JSDOM has no layout
  or paint engine.

### Security and privacy

- Astro's CSP integration hashes generated scripts and styles. Middleware adds
  `frame-ancestors`, `base-uri`, `object-src`, and `form-action` in an enforced
  header without `unsafe-inline`.
- Authenticated HTML and API responses remain `no-store`; frame denial,
  nosniff, referrer, permissions, COOP, CORP, and production HSTS remain active.
- Auth and product routes are `noindex, nofollow`. Page titles use the single
  product configuration and never include workspace names or generated text.
- Public source maps are disabled. Error boundaries expose normalized messages;
  support correlation may use the bounded `x-request-id`, never request bodies,
  answers, generated content, cookies, or credentials.
- PostgreSQL pool logs emit only a stable event label, error name, and driver
  code. No error object or connection message is serialized.

### State, memory, and performance

- Read queries consume TanStack Query abort signals. Secure sign-out cancels
  requests, clears the entire private query cache, clears transient workflow
  identifiers, and redirects only after server sign-out succeeds.
- Unused query data is collected after five minutes. Library and Brand views
  cap a single in-memory browsing session at ten pages and ask the user to
  narrow filters rather than retaining an unbounded history.
- Remote state stays in TanStack Query; PostgreSQL remains canonical; ephemeral
  chrome uses local React state. No generated or authentication data is
  persisted by the redesign in browser storage.
- Today query/mutation policy is isolated in a focused controller hook. The
  page remains declarative, while workspace isolation, URL run validation,
  retry-stable idempotency, backoff, and cache invalidation have one owner.
- Motion's runtime dependency was removed after its two uses were replaced by
  native progress/CSS behavior. The client uses no remote font or analytics
  script.

## Build budgets

F6 uses simple, inspectable raw build limits rather than pretending local lab
results are production Core Web Vitals:

| Budget | F6 threshold | Rationale |
| --- | ---: | --- |
| Total emitted browser JavaScript | 850 KiB raw | Detects large dependency or island regressions |
| Largest application/shared chunk | 220 KiB raw | Prevents one ownership boundary from growing unchecked |
| Browser source maps | 0 | Avoids publishing private implementation detail by default |
| Retained cursor pages per long list | 10 | Bounds browser memory while preserving useful browsing |

Production LCP, INP, CLS, cache effectiveness, and compressed transfer size
require a representative deployed origin and device/network profile. Record
those separately; do not relabel local build size as field performance.

## Manual browser and visual acceptance matrix

Execution was deferred by the owner. A later tester must record browser version,
OS, viewport, zoom, result, and sanitized evidence for each row.

| Surface | Widths / modes | Required checks |
| --- | --- | --- |
| Login, registration, recovery, reset | 320, 375, 768, 1440 px; 200% zoom | Reflow, labels, autocomplete, generic errors, focus order, no horizontal scroll |
| Today: all eight deterministic moments | 320, 390, 720, 900, 1440 px | One dominant action, phase progress, question keyboard flow, review/revision, background state, Phase 6 loop |
| Library: Fast, Folders, Needs review | 320, 720, 900, 1440 px | Tab keys, filters, copy feedback, nested disclosures, conflict alert, bounded load-more |
| Brand and You | 320, 720, 900, 1440 px | List/detail order, long Markdown, sessions, confirmation focus, disabled-contract honesty |
| Global shell | Chrome, Firefox, Safari, Edge; keyboard only | Skip link, workspace menu, dialog focus return, dock clearance, sticky header, sign-out |
| Accessibility modes | reduced motion, forced colors, 200%/400% zoom | Visible focus, readable status, no motion-dependent truth, usable controls |

Use deterministic fixtures for screenshot comparison at `390×844` and
`1440×1000`. Mask timestamps and account identity. Failed screenshots, traces,
and videos are private artifacts and must be scanned before sharing.

## Dependency review

- `axe-core` is a development-only MIT dependency used for DOM accessibility
  regression tests. `@axe-core/playwright` remains for the deferred browser
  suite.
- The unused `motion`/Framer Motion chain was removed.
- The lockfile supply-chain policy and advisory audit must pass before release.
- The dependency license inventory contains common permissive/content licenses
  plus an LGPL libvips binary pulled through Sharp. This record is engineering
  inventory, not legal approval; the release owner applies the organization’s
  license policy.

## External gates

- Cross-browser and real-device visual acceptance.
- Browser E2E and visual screenshot execution.
- Live Google OAuth and transactional email lifecycle.
- Production CSP observation, field performance, proxy/TLS behavior, and
  privacy-approved telemetry decision.
- Exact built-secret comparison in the deployment environment, where the real
  secret values are available. Static scans still reject credential formats,
  private keys, database URLs, public source maps, and obsolete shared-secret
  names.
