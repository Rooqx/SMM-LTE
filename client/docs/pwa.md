# Progressive web app

Rasm can be installed from a supported browser without an app store.
Installation changes the launch experience only; PostgreSQL and the backend
remain the source of truth.

## What is implemented

- A generated web app manifest using the centralized product name,
  description, colors, icons, and Today/Library shortcuts.
- Versioned 180, 192, and 512 pixel icons plus an SVG source icon.
- A small service worker and a generic offline page.
- A You-page install card that uses the browser prompt when available and gives
  manual iOS/Android instructions when it is not.
- Public middleware access for the manifest, worker, offline page, and icons.

## Privacy and cache boundary

The service worker must never cache authenticated HTML, `/api/*` responses,
workflow state, generated content, session data, or account data. It caches
only hashed Astro assets, versioned brand assets, and the generic offline page.
Page navigation remains network-only and falls back to that content-free page
when the network is unavailable.

This intentionally does not make orchestration work offline. Queuing changes
for later replay would introduce stale approvals and unsafe duplicate actions.

## Installation requirements

Production must use HTTPS. Localhost is considered a secure development origin
by modern browsers. The manifest and icon URLs must remain publicly readable.

- Chromium browsers normally expose an Install action after their own
  installability checks pass.
- On iPhone/iPad, use Safari's Share menu and Add to Home Screen.
- The You page always provides the appropriate fallback instructions.

## Maintenance

Run `pnpm run generate:pwa-icons` from `client/` after changing
`public/brand/app-icon.svg`. Review the output visually. When changing the
service worker's precached resources or cache behavior, increment `CACHE_NAME`
in `public/sw.js` so obsolete public caches are removed on activation.

Push notifications, background sync, offline mutations, and private-data
caching are intentionally out of scope until separately designed and approved.

## Verification checklist

1. Run lint, Astro check, unit tests, and the production build.
2. Confirm `dist/client` contains the manifest, worker, registration script,
   offline page, and every declared icon.
3. Validate the manifest name, display mode, start URL, icons, and shortcuts.
4. On a disposable browser profile, verify install and standalone launch on an
   HTTPS deployment or localhost.
5. Sign in, visit private pages, go offline, and confirm no private page or API
   payload is served from service-worker cache.
6. Confirm offline navigation shows only the generic offline page.

Browser/device execution is an owner-led external acceptance gate and is not
claimed by the non-browser test suite.
