# F6 quality-hardening audit

**Verdict:** Internal gates pass; external browser and production evidence remains pending  
**Audited:** 2026-10-10  
**Authority:** [`frontend-redesign-implementation-context.md`](./frontend-redesign-implementation-context.md)

## Completed scope

| Area | Evidence | Result |
| --- | --- | --- |
| Accessibility | Native questions, dialog focus trap/restore, menu/tab keyboard models, skip link, live regions, forced colors, reduced motion, axe component tests | PASS |
| Responsive foundations | 320px minimum, safe-area dock clearance, unobscured focus scroll margins, long-title wrapping and 48px interaction targets | PASS (static/internal) |
| Security headers | Astro hash CSP plus tested middleware headers without `unsafe-inline`; no-store/HSTS/frame/nosniff/referrer/permissions/COOP/CORP retained | PASS (local); deployed observation pending |
| Metadata | One configured product identity; non-duplicated titles; private/auth routes `noindex, nofollow`; generated content excluded | PASS |
| Private state | Abort signals consumed; five-minute query GC; ten-page cursor retention; secure logout cancels and clears cache/storage | PASS |
| Timezone/locale | Workspace IANA timezone used for dates and greeting; deterministic UTC/English fallback tested across a date boundary | PASS |
| Observability privacy | Normalized errors and bounded request IDs; no request/generated content logging; database messages redacted; public source maps disabled | PASS |
| Dependencies | Unused Motion chain removed; axe-core justified as dev-only; pnpm policy verified 854 entries; advisory audit clean | PASS |
| Build performance | 810,459 raw JS bytes total; largest chunk 212,939 bytes; thresholds 850 KiB/220 KiB | PASS |
| Built artifacts | No source maps, private-key/database URL/retired test-secret format found in browser output | PASS (static); real-value deployment scan pending |

## Final automated evidence

- Frozen pnpm lockfile: up to date; all 854 entries passed configured
  supply-chain policy.
- Advisory audit: no known vulnerabilities at `moderate` or higher.
- ESLint: full client tree, zero errors.
- Astro check: 140 files, zero errors, warnings, or hints.
- Unit/component/contract/accessibility suite: 22 files passed, one database
  integration file skipped; 123 tests passed, two skipped.
- Astro standalone production build: passed in 20.09 seconds with no warnings.
- Browser E2E and screenshots: not run, by explicit owner direction.

## Residual external evidence

- Chromium/Firefox/WebKit and real-device layout, keyboard, zoom, contrast, and
  deterministic screenshot comparison.
- Live email and Google OAuth acceptance.
- Deployed TLS/proxy CSP/header observation and field Core Web Vitals.
- Exact built-secret comparison where deployment secret values are available.
- Legal approval of the dependency license inventory.

Procedures and evidence rules are documented in
[`client/docs/quality-hardening.md`](../../client/docs/quality-hardening.md) and
[`client/docs/e2e-testing.md`](../../client/docs/e2e-testing.md).
