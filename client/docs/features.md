# Frontend features

## Guided product experience

- **Owner authentication:** email/password registration, verification,
  sign-in, generic recovery, reset, Google sign-in/linking, and database-backed
  Better Auth sessions protected by HttpOnly cookies.
- **Workspace start:** a signed-in owner creates or selects a workspace. A new
  workspace enters its backend-defined onboarding state immediately.
- **Today:** the central work surface explains the current phase, renders one
  backend-selected question or action, shows honest working state, and presents
  each deliverable for approval, rejection, or revision.
- **Adaptive questions:** one question at a time with described choices and a
  final custom-answer path. Submissions include the exact question version and
  a retry-stable idempotency key.
- **Six-phase journey:** friendly phase labels and purposes come from shared
  configuration. Phase transitions and skill selection remain backend-owned.
- **Review moments:** Brand foundation, calendar, quality scorecard, and final
  posts use structured backend presentation data when available and safe
  Markdown fallback otherwise.
- **Library:** Fast provides a filtered copy-ready post view; Folders groups
  output by sprint/week/day/platform; Needs review provides bounded approval
  work. Every collection loads incrementally rather than holding an unbounded
  history.
- **Brand:** approved memory is organized into friendly areas while retaining
  source keys, versions, timestamps, and unknown fields. Bounded protected
  version history is available per source key. Improvement returns to Today
  instead of directly mutating context.
- **You:** authenticated identity, connected methods, active sessions, session
  revocation, password change, sign-out, durable preferences/workspace updates,
  and durable Obsidian export enqueue with job-status tracking.
- **Responsive shell:** Variant B top header, workspace switcher, Today phase
  strip, mobile four-item dock, disclosures, keyboard focus, safe-area spacing,
  loading/empty/error feedback, and reduced-motion support.
- **Installable web app:** manifest, app icons, standalone launch metadata, a
  You-page install guide, and a privacy-safe generic offline fallback. Private
  pages, API responses, and generated content are never service-worker cached.

## Deliberately unavailable

The interface does not fabricate backend capabilities. The following remain
disabled, absent, or explicitly unavailable until their contracts exist:

- notification/activity feed;
- arbitrary Brand area-improvement commands;
- external social publishing/scheduler connectors. The backend publication
  command records state but does not claim third-party delivery.

## Technology and ownership

| Concern | Choice | Ownership rule |
| --- | --- | --- |
| Routing and SSR | Astro | Pages, middleware, BFF, metadata, security headers |
| Interactive UI | React | Focused product islands and local interaction state |
| Server state | TanStack Query | Backend reads, pagination, cache, polling, mutations |
| Forms | React Hook Form | Temporary form state only |
| Validation | Zod | Environment, API response, URL and form boundaries |
| Styling | Tailwind CSS 4 + tokens | Current client palette and responsive system |
| Motion | CSS/native progress | Reduced-motion-safe feedback, no motion runtime |
| Icons | Lucide React | Consistent iconography; decorative icons hidden from AT |

PostgreSQL is canonical. Remote data is not copied into a client store, and
authentication secrets never enter React, URL parameters, or browser storage.

## Content-safety rules

- Generated Markdown is rendered without raw HTML.
- Unknown backend presentation payloads fail to safe text rather than being
  guessed into business fields.
- Clipboard failures are visible so the user can select content manually.
- Page-scoped counts say that they describe the current view; they are not
  presented as global totals.
- Raw skills, recipes, internal service keys, and low-level run creation are
  absent from the human product interface.
