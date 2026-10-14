# Frontend architecture

This document describes the implemented frontend, not an aspirational design.
The authoritative redesign plan and milestone evidence live in
`docs/todo/frontend-redesign-implementation-context.md` and
`docs/todo/frontend-redesign-map.md`.

## Runtime boundary

Astro renders pages on a standalone Node server and acts as the
backend-for-frontend (BFF). React hydrates only interactive product surfaces.
The deployment does not require Docker.

```text
Browser
  | Better Auth HttpOnly cookie + same-origin JSON
  v
Astro middleware and /api/auth/*
  | server-only, 60-second EdDSA assertion
  v
/api/smm/* allowlist
  v
Fastify -> authorization + orchestration -> PostgreSQL
```

The service assertion, database credentials, provider secrets, and session
cookie are never exposed to browser JavaScript. The BFF rejects paths and
methods outside the browser product contract, including raw skill execution.

## Product surfaces

- **Today (`/`)** is the orchestration control surface. It asks the backend for
  the current phase and pending question, renders one dominant next action,
  follows an active run, and presents output for approval or revision.
- **Library (`/library`)** presents final posts, grouped folders, and the review
  queue using bounded cursor pagination.
- **Brand (`/brand`)** presents approved canonical context and provenance. It
  cannot overwrite context or choose a skill.
- **You (`/you`)** owns account, session, sign-in method, and Obsidian export
  controls. Unsupported durable settings remain disabled.
- **Run detail (`/runs/:id`)** is a protected diagnostic deep link. It is not a
  second orchestration experience.
- **Skill deep links** redirect to Today. No browser skill runner remains.

Compatibility routes redirect to their product equivalents while preserving
safe query parameters.

## State ownership

| State | Owner |
| --- | --- |
| Authentication, workspace, workflow, runs, artifacts, context | PostgreSQL through Fastify |
| Remote UI cache and invalidation | TanStack Query |
| Linkable view/filter/run selections | Bounded URL parameters |
| Temporary form values | React Hook Form or local React state, validated with Zod |
| Popovers, dialogs, tabs, copy feedback | Local React state |

The redesign has no global client state store. Browser storage owns neither
authentication credentials nor canonical workflow state. The Today controller
stores only an opaque validated run UUID in the URL so the same link can resume
after refresh; it verifies the fetched run belongs to the selected workspace.
Workflow state includes an account-scoped active-run projection. A preserved
run URL remains a useful deep link, while a fresh tab can recover queued,
running, or approval-waiting work without treating client storage as truth.

## Orchestration boundary

The backend selects the phase skill and validates transitions. The browser may
only continue the workflow, answer the exact pending question version, inspect
the returned run, and approve, reject, or request a revision. Uncertain retries
reuse their original idempotency key; changed user intent receives a new key.

`TodayPage.tsx` is the declarative view. `useTodayController.ts` owns query,
mutation, retry, URL, and invalidation policy. `today-selector.ts` is a pure,
fail-closed adapter from backend state to the discriminated Today presentation
states, including Phase 4 quality control and the Phase 6 cycle handoff.

## Scale and performance

- Workspace, Brand, artifact, grouped-post, and review collections use bounded
  cursor pagination. Long views retain at most ten pages in memory.
- Query keys include workspace or identity scope; reads consume abort signals.
- Polling runs only for queued/running work and exponentially backs off after
  failures.
- The Node/Astro tier is stateless apart from HttpOnly cookies and can scale
  horizontally when database connection budgets and distributed rate limits
  are configured.
- Public browser source maps are disabled and emitted JavaScript is checked
  against documented raw-size budgets.

## Generated content and Obsidian

Generated Markdown is untrusted display data. Raw HTML is disabled; external
links receive safe relationship attributes. PostgreSQL remains canonical.
Obsidian is a one-way export of approved context and artifacts through a
durable, idempotent backend job. The UI polls the exact account-scoped job read
and reports queued, running, completed, failed, or dead state without treating
the vault as canonical storage.

## Progressive web app boundary

The install manifest is rendered from the same product configuration as the UI.
The service worker is deliberately dependency-free and limited to public,
immutable assets plus a generic offline page. Authenticated navigation remains
network-only; `/api/*` is never intercepted or cached. This prevents a shared
device, stale worker, or browser cache from replaying private brand or post
content after sign-out. Offline orchestration and mutation replay are not
supported. See `pwa.md` for maintenance and device acceptance steps.

## Security and accessibility

Astro applies authenticated-route `no-store`, noindex metadata, CSP, frame and
object restrictions, nosniff, referrer and permissions policies. The shell has
a skip link, one page heading, visible focus, disclosure focus restoration,
mobile safe-area clearance, reduced-motion support, and minimum touch targets.
Generated choices use native radios and errors use live-region semantics.

See `security.md`, `quality-hardening.md`, and `e2e-testing.md` for the detailed
control and evidence boundaries.
