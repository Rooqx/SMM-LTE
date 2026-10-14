# Frontend redesign implementation context

**Status:** F0-F7 and post-F7 redesign work are implemented; F8 guided-interview integration is planned  
**Last reviewed:** 2026-10-11  
**Scope:** `client/` only, except documentation under `docs/`  
**Selected experience:** Variant B — Guided Briefing

This document is the durable handoff and completion contract for rebuilding the
SMM web application. It exists so another engineer can continue the work without
guessing at the product intent, visual contract, backend behavior, or quality
bar.

## 1. Product outcome

The application is an **autopilot social-media manager**, not a technical
orchestration dashboard. It should behave like a capable human SMM who does the
work, asks only for the decision currently needed, explains why that decision
matters, and returns reviewable results.

The primary journey is:

1. The owner signs in with email/password or Google.
2. The owner creates or selects one workspace.
3. The **Today** page becomes the control point for the entire orchestration.
4. A new workspace automatically enters onboarding. The page names the current
   phase, explains its purpose, and presents one next action.
5. The backend-selected workflow may ask one adaptive question. The UI renders
   its options and always preserves the backend-provided custom-answer path.
6. The agent works in the background while the UI communicates honest status.
7. The completed output is presented for review, not hidden inside a technical
   run screen.
8. The owner approves, rejects, or requests a revision with instructions.
9. Approved context becomes canonical Brand memory; generated deliverables stay
   visible in Library; final posts become copy-ready content.
10. The backend advances to the next phase and Today presents the next useful
    action. Strategy, calendar, production, quality control, repurposing, and
    feedback are moments in this single flow—not separate tools the owner must
    coordinate.

Phase 6 is a feedback/calibration phase, not a permanent finish state. The
backend advances it to Phase 2 for the next planning cycle. The interface must
show the current cycle clearly and must never freeze the owner on a fake
“workflow complete” screen after analytics.

The interface must optimize for recognition rather than recall, one clear
primary action, progressive disclosure, visible system status, and user control
at every approval boundary.

## 2. Sources of truth and precedence

When sources appear to disagree, use this order:

1. The backend authorization, workflow, revision, and persistence contracts are
   authoritative for data and behavior.
2. This document is authoritative for implementation scope, boundaries, and
   acceptance criteria.
3. The approved Variant B prototype is authoritative for product layout,
   hierarchy, iconography, copy intent, interaction, and responsive behavior.
4. Existing `client/` code may be reused only when it satisfies the first three
   sources; existing behavior is not automatically a requirement.

Prototype reference used to create this durable specification:

```text
/home/farooq-ashiru/.codex/visualizations/2026/10/06/
01a11241-dc35-7a00-b41e-a4fbfd5f761c/
autopilot-smm-briefing-variant-b.html
```

Audited prototype SHA-256:
`d0d1baafbdcd6b1a69eab89484104ba761f36786fc31377800639e294181de76`.
If that file changes, treat it as a new design revision and reconcile the
differences before implementation.

The external prototype path is not a production dependency. This document and
the tracker contain the durable contract.

### 2.1 Standards baseline used by the audit

The quality requirements below are anchored to primary guidance rather than
personal preference:

- [W3C WCAG 2.2](https://www.w3.org/TR/WCAG22/) and its
  [Understanding guidance](https://www.w3.org/WAI/WCAG22/Understanding/) for
  keyboard access, reflow, contrast, status messages, accessible authentication,
  focus visibility, and focus not being obscured;
- [OWASP DOM XSS Prevention](https://cheatsheetseries.owasp.org/cheatsheets/DOM_based_XSS_Prevention_Cheat_Sheet.html)
  and [Content Security Policy](https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html)
  guidance for untrusted generated content and defense in depth;
- [Astro islands architecture](https://docs.astro.build/en/concepts/islands/) for
  shipping client JavaScript only where interaction requires it;
- [Google Core Web Vitals](https://web.dev/articles/defining-core-web-vitals-thresholds)
  for LCP, INP, and CLS targets at the 75th percentile; and
- [Google noindex guidance](https://developers.google.com/search/docs/crawling-indexing/block-indexing)
  for excluding private application routes from search results. Authentication
  remains the security control; `noindex` is only indexing policy.

## 3. Locked constraints

- Make frontend source changes only inside `client/`.
- Keep project and implementation records in `docs/`.
- Use Astro SSR with focused React islands; do not turn the entire application
  into an unnecessary single-page application.
- Use `pnpm`, the repository-pinned package manager. Do not introduce npm lock
  files.
- Do not add Docker.
- Retain the same-origin Astro BFF. Browser code must never receive a service
  key, internal assertion, database credential, or model-provider credential.
- Retain Better Auth's secure HttpOnly session model. Do not recreate the old
  shared access-password flow.
- The backend owns phase transitions, skill routing, current questions,
  approvals, revision lineage, context promotion, and orchestration status.
- The browser must not call the compatibility `POST /v1/workspaces/:id/runs`
  route or allow a human to choose a skill. That route is service-only and is
  deliberately absent from the browser allowlist.
- Do not modify the backend merely to simplify a component. Record an interface
  gap first and request a separately reviewed backend change.
- Do not run full browser end-to-end tests unless the owner asks. Add and
  document them so the owner or another agent can execute them later.
- Keep PostgreSQL canonical. Obsidian remains an optional one-way export of
  approved knowledge, not application storage.

## 4. Prototype fidelity contract

The production implementation must reproduce Variant B's application UI down
to its information hierarchy and interaction details:

- desktop top navigation and mobile bottom navigation;
- compact six-phase journey indicator;
- workspace switcher, notification affordance, and account entry;
- Today greeting, autopilot status, one central mission card, agent activity,
  and desktop progress/coach rail;
- the eight represented Today moments: first visit, adaptive question, agent
  working, review, approved/transitioning, strategy/calendar, production, and
  final posts;
- Library's **Fast view**, **Folders**, and **Needs review** views;
- Brand's approved-memory overview, context-area list, detail view, version
  history action, and improvement action;
- You's identity, sign-in methods, sessions, autopilot settings, reminders,
  timezone, Obsidian export, and workspace controls;
- the same Lucide icon choices, placements, sizes, and meaning;
- the same responsive content priority: secondary coaching disappears on small
  screens while the current mission and primary action remain prominent;
- the same concise, human product language. Technical identifiers, recipe
  versions, run IDs, and raw skill names belong only in explicitly opened
  diagnostics.

The eight prototype moments are representative states, not complete phase
coverage. Phase 4 quality control and Phase 6 analytics/feedback must reuse the
same mission/review/working grammar without inventing a new shell or navigation.
Their exact data still comes from the backend and their visual fixtures require
owner review under PX-010.

### 4.1 Pre-authorized visual change

Only the color system is pre-authorized to differ from the prototype. Replace
the prototype's orange/light palette with the current client's dark palette,
using semantic tokens rather than component-local colors.

| Semantic role | Current client source | Intended use |
| --- | --- | --- |
| App background | `ink-950` / `#090b12` | Browser and page background |
| Shell background | `ink-900` / `#10131e` | Header, navigation, major shell surfaces |
| Raised surface | `ink-800` / `#191d2a` plus existing alpha surfaces | Mission cards, menus, dialogs |
| Primary accent | `acid-400` / `#c8ff4d` | Current phase, primary action, active selection |
| Approved/success | `acid-400` tonal variants | Success banner/check state; distinguish from primary action with icon, copy, shape, and placement |
| Information accent | `sky-400` / `#57d5ff` | Informational state and secondary data |
| Attention/error/destructive | `coral-400` / `#ff7d66` | Validation, rejection, destructive confirmation |
| Primary text | Existing `#f5f5ef` | Headings and high-emphasis content |
| Muted text/borders | Existing white alpha values | Supporting copy, dividers, disabled state |

Color is never the only state signal. Every state also needs text, an icon, or
another perceivable cue. Contrast must be verified against WCAG 2.2 AA.
Because acid is a light color, acid-filled controls use dark ink text rather
than copying the prototype's white-on-orange foreground mechanically.

### 4.2 Exact navigation, phase, and icon contract

The prototype's display vocabulary is fixed. Keep backend phase numbers as the
join key and source these friendly labels from the typed phase configuration.

| Phase | Primary label | Supporting label |
| --- | --- | --- |
| 1 | Know your brand | Onboarding |
| 2 | Plan the month | Strategy |
| 3 | Create posts | Production |
| 4 | Polish quality | Review |
| 5 | Multiply reach | Repurpose |
| 6 | Learn & improve | Analytics |

The primary icon mapping is also fixed unless PX-006 is invoked:

| Location/action | Lucide icon |
| --- | --- |
| Product/agent identity | `Sparkles` |
| Today | `House` |
| Library | `Library` |
| Brand | `Fingerprint` |
| You | `CircleUserRound` |
| Notifications | `Bell` |
| Workspace switcher | `ChevronsUpDown` |
| First step | `Flag` |
| Adaptive question | `MessageCircleQuestion` |
| Agent working | `BrainCircuit` / `LoaderCircle` |
| Approval/review | `ClipboardCheck`, `MessageSquareText`, `Check` |
| Approved state | `BadgeCheck` |
| Phase transition/strategy | `Route` |
| Calendar | `CalendarDays` |
| Production | `WandSparkles` |
| Ready to publish | `Send` |
| Copy | `Copy` |
| Version history | `History` |
| Security/session | `ShieldCheck`, `MonitorSmartphone` |
| Email/Google | `Mail`, `Chrome` |
| Timezone/reminders | `Clock3`, `BellRing` |
| Obsidian/data | `Database` |
| Folders/archive | `Folder`, `FolderOpen`, `Archive` |
| Post types/platforms | `FileText`, `GalleryHorizontalEnd`, `Clapperboard`, `Linkedin`, `Twitter`, `Instagram` |

Platform icons remain presentation metadata. If a Lucide brand icon is removed
or visually unsuitable, treat that as PX-006 instead of quietly adding a second
icon library.

### 4.3 Exact layout and responsive contract

These measurements preserve the approved composition. They are reference
values, centralized as tokens where repeated, not permission to scatter magic
numbers across components.

| Surface | Prototype contract |
| --- | --- |
| Desktop header | Minimum 64 px; 10×20 px padding; 16 px item gap |
| Desktop six-phase strip | Six equal columns; 6 px gap; 12×20 px padding; 4 px progress bars |
| Main content | Maximum 900 px; centered; 28×24 px padding with 96 px bottom clearance |
| Today desktop grid | Fluid mission column + 235 px coach rail; 14 px gap |
| Main mission card | 18 px radius; 20 px padding; 16 px on compact mobile |
| Mobile header | Minimum 58 px; 10×14 px padding |
| Mobile phase summary | 34 px phase ring; 10×14 px container padding |
| Mobile content | 19×14 px padding with at least 92 px bottom clearance |
| Mobile navigation | Four items; each at least 58×48 px; 10 px visual inset; 16 px container radius; include safe-area inset in production |
| Library spotlight | `1.2fr / minmax(220px, .8fr)` desktop; single column mobile; secondary weekly panel hidden mobile |
| Brand detail | Fluid list + 250 px detail desktop; single column mobile with selected detail first |
| Account | `.8fr / 1.2fr` desktop; single column mobile |
| Calendar | Five-column week strip desktop; agenda rows mobile |
| Responsive thresholds | Full compact layout at 720 px and below; narrow refinements at 440 px and below |
| Motion | 180 ms interaction transitions; 0.985 active press scale; 1.8 s status pulse only when reduced motion is not requested |

In production, responsive CSS—not a JavaScript “mobile” mode—selects the layout.
The Today phase strip/progress is hidden on Library, Brand, and You exactly as in
the prototype. The mobile dock may be fixed to the viewport rather than absolute
inside a demo window, but its visual position and geometry stay equivalent and
it must never obscure content or keyboard focus.

### 4.4 Typography

Typography must match the prototype's quiet, readable hierarchy but be sourced
through design tokens. The product default is Inter with safe system fallbacks.
No component may declare its own product font family. A future typeface change
must require changing configuration/tokens, not component source.

The prototype uses 24/18/14 px primary heading levels and dense 8–12 px
supporting labels. Preserve the hierarchy, but verify the smallest text on real
mobile viewports, at 200% zoom, and with the current dark palette. If it is not
readable or cannot satisfy reflow/contrast requirements, record the measured
failure under PX-008 before adjusting the token; never silently drift.

### 4.5 Exception register

Do not silently “improve” or reinterpret the approved design. Record every
necessary deviation here before implementing it.

| ID | Item | Decision/status |
| --- | --- | --- |
| PX-001 | Prototype orange/light colors | **APPROVED CHANGE:** translate to the current client palette in section 4.1 |
| PX-002 | Prototype scene selector, viewport toggle, variant header, and tweak controls | **EXCLUDED:** these are demo controls outside the product window, not production navigation |
| PX-003 | Prototype static records, fake user identity, timers, and local demo persistence | **REPLACE:** use authenticated session and backend data without changing presentation |
| PX-004 | Prototype simulates progress by switching scenes | **REPLACE:** derive the displayed moment from authoritative workflow/run/review data |
| PX-005 | User has identified minor prototype mistakes but has not listed them | **OPEN:** add each reported correction here; do not guess or broaden the redesign |
| PX-006 | A referenced Lucide icon is unavailable in the installed version | **CONDITIONAL:** record the closest semantic equivalent and obtain review before accepting the visual difference |
| PX-007 | Prototype uses buttons for navigation/inert progress, non-semantic folder rows, button-like choices, switches without `aria-checked`, and one app-wide live region | **MANDATORY SEMANTIC CORRECTION:** preserve appearance while using links, progress/list semantics, radio-group behavior, disclosure buttons, real switches, and scoped live regions |
| PX-008 | Prototype includes supporting text as small as 8–9 px | **VERIFY:** retain only if contrast, zoom/reflow, and real-device readability pass; any token adjustment requires recorded evidence |
| PX-009 | Prototype mobile dock is absolutely positioned inside a demo window | **MANDATORY RESPONSIVE CORRECTION:** preserve geometry while using viewport/safe-area positioning that cannot cover content or focused controls |
| PX-010 | Prototype has no dedicated Phase 4 quality-control or Phase 6 analytics/feedback scene | **OPEN VISUAL COMPLETION:** use the existing mission/status/review grammar, preserve the shell, and obtain owner visual acceptance; Phase 6 must visibly cycle to Phase 2 rather than imply termination |

## 5. No-hardcoding architecture

Frequently changed identity, presentation, routing metadata, and display copy
must have one typed source. “No hardcoding” does not mean moving every string
into one enormous file; it means separating volatile product configuration from
component behavior and keeping a single owner for each concern.

### 5.1 Planned configuration boundaries

The exact filenames may be refined during the baseline milestone, but their
responsibilities must stay separate:

```text
client/src/config/
  product.ts       product name, short name, tagline, logo references, support links
  navigation.ts    Today/Library/Brand/You labels, routes, exact Lucide icons
  phases.ts        display metadata only: names, purposes, icons, friendly progress labels
  ui-copy.ts       stable shared product copy and empty/error-state wording
  seo.ts           title templates, descriptions, indexing policy, public origin helpers

client/src/styles/
  global.css       reset and truly global rules
  tokens.css       semantic color, typography, spacing, radii, elevation and motion tokens

client/public/brand/
  logo and favicon assets referenced by product configuration
```

Rules:

- `product.ts` supplies the default product name **Autopilot SMM**; no page or
  component repeats that literal as its own source of truth.
- The same server-safe product configuration supplies Better Auth's `appName`,
  verification/reset email subjects and introductions, page title templates,
  login branding, and accessible logo text. The current hardcoded “Signal
  Studio” strings in `auth.ts`, `auth-email.ts`, page files, layout metadata, and
  shell components must all be reconciled.
- A logo is an asset/configuration concern. Do not hardcode the current `S`
  placeholder or duplicate inline SVG logos throughout the app.
- Navigation entries and their Lucide components live in one typed registry.
- `phases.ts` is presentation metadata only. It may label backend phase `1` as
  “Know your brand,” but it cannot decide the next phase, choose a skill, or
  unlock a gate.
- Phase/cycle display is derived from backend `phase`, `cycle`, workflow status,
  and phase status. If workspace summary and workflow detail disagree, refetch
  and fail safely rather than choosing whichever produces the prettier screen.
- Components use semantic styles such as surface, primary action, danger, and
  muted text. They do not scatter raw hex values or re-create shadows/radii.
- Breakpoints, animation durations, focus rings, minimum touch sizes, and
  z-index layers have named owners instead of repeated magic numbers.
- API paths are owned by the typed API client. Pages do not build endpoint URLs.
- Environment variables contain deployment configuration only and are validated
  at the server boundary. Only explicitly safe `PUBLIC_*` values may enter a
  browser bundle.
- Content supplied by the backend remains data. Do not duplicate questions,
  options, calendar items, posts, artifacts, or account identity in frontend
  fixtures outside tests and Storybook-like demonstrations.

The allowed ownership categories are:

| Kind of value | Owner | Example |
| --- | --- | --- |
| Product configuration | Typed configuration | App name, logo path, support link |
| Design decision | Semantic tokens | Palette, radius, spacing, typography, motion |
| Navigation/display metadata | Typed registries | Route label, Lucide icon, friendly phase title |
| Domain/runtime data | Backend response | Question, option, post, run status, user identity |
| Code invariant | Focused module constant | Maximum locally rendered pages, retry classification |

Centralization does not make a secret safe for the browser. Product
configuration must be intentionally split into browser-safe and server-only
values when those concerns ever overlap.

### 5.2 Avoid configuration theatre

Do not over-abstract one-off markup or create a general design-system package
before there is a repeated need. Extract a primitive when it owns behavior,
accessibility, or a repeated visual contract. Prefer a clear focused component
over a universal component with dozens of flags.

### 5.3 Type safety, linting, formatting, and comments

- Keep the existing `astro/tsconfigs/strictest` baseline.
- Avoid `any`, unchecked casts, unguarded non-null assertions, and stringly typed
  status branching. Use strict Zod boundaries, discriminated unions, exhaustive
  switches, and an `assertNever`-style guard for presentation states.
- During F0, establish one maintained lint/format toolchain that covers Astro,
  TypeScript, React hooks, and JSX accessibility. Do not add competing formatters
  or a large plugin set without a demonstrated rule gap.
- CI must run formatting/linting, Astro check, tests, and production build from a
  frozen pnpm install.
- Comment exported security/data boundaries and non-obvious invariants: why a
  route is browser-blocked, who owns an idempotency key, why a query is cancelled,
  how a backend state maps to a mission, and why a focus behavior exists.
- Do not comment self-evident JSX or narrate syntax. Stale comments are defects;
  update or remove them in the same change as the behavior.
- Public component props and complex selectors should have concise TSDoc when
  their contract is not obvious from the type alone.
- Keep components, hooks, schemas, selectors, and tests near the feature that
  owns them. Shared code moves to a common folder only after genuine reuse.

## 6. Information architecture and routes

The primary navigation is intentionally small:

| Product destination | Canonical route | Responsibility |
| --- | --- | --- |
| Today | `/` | Central work surface and current orchestration action |
| Library | `/library` | Fast view, week/day/platform folders, review queue, artifacts and final posts |
| Brand | `/brand` | Approved canonical context and its revision history |
| You | `/you` | Account, sessions, preferences, integrations, and workspace settings |

Migration compatibility:

| Existing route | Planned behavior |
| --- | --- |
| `/workflow` | Redirect to Today; progress is part of the central work surface |
| `/artifacts` | Redirect to Library, preserving safe workspace/run selection where meaningful |
| `/context` | Redirect to Brand |
| `/approvals` | Redirect to Library's Needs review view or the relevant Today review card |
| `/settings` | Redirect to You |
| `/skills/[name]` | Remove from human navigation; do not expose backend skill selection |
| `/runs/[id]` | Preserve as a protected deep link or diagnostic/detail surface, not primary navigation |

Route state must be linkable when useful. Workspace selection and Library
filters should survive refresh through validated URL state. Sensitive data and
authentication credentials must never be stored in the URL.

Navigation between product destinations uses real links so open-in-new-tab,
copy-link, browser history, and assistive technology work normally. Buttons are
reserved for actions that mutate local or remote state. The phase strip is a
read-only ordered progress indicator unless a later requirement gives a phase
an actual destination; it must not expose six inert focusable buttons.

## 7. Planned component architecture

Use the smallest component tree that preserves clarity and testability:

```text
AppShell
├── DesktopHeader
│   ├── ProductIdentity
│   ├── WorkspaceSwitcher
│   ├── PrimaryNavigation
│   └── AccountActions
├── MobileHeader
├── JourneyProgress
├── RouteContent
└── MobileNavigation

TodayPage
├── TodayGreeting
├── AutopilotStatus
├── MissionCard
│   └── one backend-derived mission renderer
├── AgentActivity
└── ProgressCoach (desktop enhancement)

LibraryPage
├── LibraryHeader
├── LibraryTabs
├── FastView
├── FolderView
└── ReviewQueue

BrandPage
├── BrandStrengthSummary
├── ContextAreaList
├── ContextDetail
└── RevisionHistory

AccountPage
├── ProfileAndAuthentication
├── SessionManagement
├── AutopilotPreferences
├── ObsidianExport
└── WorkspaceSettings
```

The Today mission renderer may use a typed registry for the finite states
described below, but must not become a giant component containing every branch
and mutation. Desktop and mobile should share data/behavior and use responsive
layout, not two divergent business implementations.

Reuse existing `Button`, feedback, markdown, form, and query primitives only
after checking them against the new fidelity and accessibility contract.

Error boundaries must isolate route-level React failures and show a safe retry
surface without discarding the Astro shell. A component boundary must not catch
and hide authentication or authorization failures that require session-level
recovery.

## 8. Backend-to-UI state model

The frontend does not invent an orchestration state machine. It derives a
presentation model from typed backend responses.

### 8.1 Authoritative calls

| Intent | Backend contract |
| --- | --- |
| List/create/select workspace | `GET/POST /v1/workspaces`, `GET /v1/workspaces/:id` |
| Discover current phase and pending question | `GET /v1/workspaces/:id/workflow` |
| Start/continue mandatory backend-selected work | `POST /v1/workspaces/:id/continue` |
| Answer exact adaptive question | `POST /v1/workspaces/:id/questions/:questionId/answer` |
| Observe work and review output | `GET /v1/runs/:id` |
| Approve/reject exact run | `POST /v1/runs/:id/approve|reject` |
| Request a revision | `POST /v1/runs/:id/revise` |
| Read canonical brand memory | `GET /v1/workspaces/:id/context` |
| Browse deliverables | `GET /v1/workspaces/:id/artifacts` |
| Browse copy-ready content | `GET /v1/workspaces/:id/final-posts` |
| Export approved knowledge | `POST /v1/workspaces/:id/exports/obsidian/jobs` |

The client API schemas must be updated to match the implemented backend. The
current client schema predates workflow state, cursor pages, revision lineage,
structured final posts, and durable export jobs. It also exposes a low-level
`createRun` call that is not a browser product contract and must be removed from
human UI usage.

### 8.2 Interaction traceability

Every visible prototype action must resolve to a real contract or a named gap.

| Prototype interaction | Production behavior/data owner | Status |
| --- | --- | --- |
| Switch workspace | Cursor-list workspaces; validated URL selection; cancel old workspace requests | Supported, client wiring required |
| Today/Library/Brand/You navigation | Real protected Astro routes | Supported, client wiring required |
| Notification button | Decision-needed/activity projection | Gap in section 8.4 |
| Start with one question | Idempotent backend-selected `continue` | Supported |
| Option/custom answer | Exact pending-question ID/version and answer union | Supported |
| Why I'm asking | `pendingQuestion.purpose`; no invented explanation | Supported |
| Working/status view | Known run status plus bounded current-step projection | Partial; gap in section 8.4 |
| Ask for changes | Reveal bounded revision form locally | Supported presentation |
| Send changes | Exact run `revise` with expected review revision and idempotency key | Supported |
| Approve and continue | Exact run `approve`, then refetch workflow; call `continue` only when backend state permits | Supported |
| Adjust calendar/plan | Revision request against the exact current review run | Supported if calendar has a typed review projection |
| Preview completed posts | Cursor-paginated artifacts/final posts; no partial-count claim without backend data | Partial; structured/progress gaps in section 8.4 |
| Copy post | Clipboard API after an explicit user gesture, with accessible success/failure feedback | Browser-supported with fallback/error handling |
| Open post | Protected exact final-post/artifact route or dialog with linkable state | Supported |
| Folder expand/collapse | Accessible disclosure over backend grouped data | Supported |
| Version history | Account-scoped context history | Gap in section 8.4 |
| Improve this | Backend-controlled guided improvement intent | Gap in section 8.4 |
| Account/session controls | Better Auth user/account/session APIs after capability verification | Verify during F0 |
| Preference switches | Durable account/workspace preferences | Gap in section 8.4 |
| Timezone/workspace manage | Authorized version-aware workspace update | Gap in section 8.4 |
| Obsidian export | Durable enqueue plus exact job status | Partial; gap in section 8.4 |
| Mark today complete | Explicit idempotent publication/completion command | Gap in section 8.4 |

When `allow_custom` is true, the UI appends the visually final “Something else”
choice and submits `{type: "custom", text}`. It does not require the model to
duplicate that choice inside its option array. Hide “Why I'm asking” when the
backend purpose is empty rather than showing invented justification.

### 8.3 Presentation states

The selector layer should produce a discriminated union such as:

- `needs_workspace`
- `ready_to_start`
- `question_pending`
- `run_queued`
- `run_active`
- `review_pending`
- `revision_queued`
- `phase_approved`
- `phase_transitioning`
- `final_posts_ready`
- `cycle_feedback`
- `next_cycle_ready`
- `workflow_paused`
- `recoverable_failure`
- `terminal_failure`

Each state declares exactly which component, primary action, secondary action,
status language, and permitted mutation it needs. Impossible combinations fail
closed to a safe recovery state and are logged without exposing private content.

### 8.4 Product interface gap register

`GET /workflow` returns durable phase state and a pending question, but does not
currently include the latest active/review run ID. The production Today page
needs a reliable way to resume after refresh while a run is queued, executing,
or awaiting review.

This is a documented backend interface gap, not permission to guess from stale
client memory or scan unbounded records. During F0:

1. verify whether an existing bounded response already provides the active run;
2. if not, propose a small account-scoped addition to the workflow projection
   (preferred) or a bounded filtered run endpoint;
3. review and implement that backend change separately before declaring refresh
   recovery complete.

The UI may keep the newly returned run ID in query cache for immediate feedback,
but that cannot be the only durable resume mechanism.

The audit found additional prototype capabilities that do not yet have complete
product APIs. These are explicit integration gaps; static placeholders do not
close them.

| Prototype capability | Current backend support | Required decision before claiming completion |
| --- | --- | --- |
| Honest current step, mini-step progress, and activity timeline | Workflow exposes phase and pending question; a known run exposes its own status | Extend the bounded workflow/Today projection with current step/run/review and safe activity summaries, or deliberately reduce unsupported detail through a registered prototype exception |
| Notifications button | No user notification feed/read state | Add a bounded notification/decision-needed projection, map it to existing real activity, or register the control as intentionally unavailable |
| Workspace timezone/settings update | Timezone is accepted only during workspace creation | Add an authorized, concurrency-safe workspace update contract before enabling Change/Manage controls |
| Autopilot and review-reminder toggles | No durable preference model/API | Add bounded account/workspace preferences with secure defaults, or render controls as unavailable with an approved exception |
| Context version history | Canonical context list returns current items; historical revision endpoint is not public | Add an account-scoped cursor-paginated history read before enabling Version history |
| “Improve this” for an arbitrary Brand area | Normal workflow continues only the active recipe path | Define a backend-controlled guided improvement intent; do not directly mutate canonical context or choose a raw skill |
| Review queue | Artifact list can filter drafts and rows include run IDs, but there is no canonical decision-needed projection | Verify a bounded artifact-based derivation is complete; otherwise add a cursor-paginated current-review projection to avoid missed/context-only reviews and duplicate run cards |
| Obsidian export job status | A durable job can be enqueued, but no browser status read endpoint is documented | Add an account-scoped exact-job status read (or a bounded export history) before promising running/succeeded/failed updates |
| “Mark today complete” / publication state | Final posts expose `publication_status`; no human publication-state mutation is documented | Add an idempotent explicit publication/status command or register the button as unavailable |
| Rich brand-summary facts and calendar cards | Context/artifact `data` and `metadata` are generic JSON; artifacts are otherwise generic Markdown/content | Define versioned, discriminated backend presentation data per supported output kind, with a safe Markdown fallback; never parse headings or business fields out of prose |
| Per-post production progress | A run exposes aggregate status and final output, not partial item progress | Add bounded step/item progress or use an honest indeterminate state; never display fixture counts such as “4 of 7” |
| Brand strength percentage | No authoritative completeness score is exposed | Define a backend-owned/config-versioned completeness projection or register the percentage as omitted; never calculate a persuasive score from arbitrary client assumptions |
| Phase 4 and Phase 6 rich views | Prototype has no dedicated scenes; backend output remains generic until typed view data is defined | Reuse existing state grammar with versioned output data and obtain owner visual acceptance under PX-010 |
| Phase 6 → Phase 2 cycle | Workflow state exposes `cycle`, while the prototype demonstrates only a single pass | Make cycle part of the presentation selector, reset current-cycle progress honestly, retain approved history in Library/Brand, and never infer terminal completion from phase number |
| “Next to publish” and weekly totals | Final-post pages are cursor bounded and ordered newest/local-date descending; a page is not a complete aggregate | Add a bounded ascending next-post query/projection and aggregate summary, or present only page-scoped facts with accurate labels |

Any backend addition must preserve account scoping, exact revision semantics,
bounded responses, idempotency for mutations, and the same-origin BFF allowlist.
It is a separate reviewed backend change even when discovered during F0.

### 8.5 Polling and eventual progress

- Poll only a known active run.
- Pass TanStack Query's abort signal through the API client. Cancel obsolete
  workspace/filter/run requests so a late response cannot flash data from the
  previous selection.
- Use a modest interval with backoff and pause polling when the document is
  hidden or the state becomes terminal.
- Classify errors: a `401` triggers session recovery, `403` stays a permission
  denial, `409` refreshes stale revision state, `429` respects `Retry-After`, and
  transient read failures may retry with bounded jitter. Mutations do not retry
  automatically.
- Refetch workflow, workspace, context, artifacts, and posts after successful
  decisions according to an explicit invalidation matrix.
- Display “working in background” only when the backend has accepted work.
- Never show fake percentages. Use backend step progress when the interface gap
  above is resolved; otherwise use an indeterminate progress treatment and
  register any visual difference from the prototype.

### 8.6 Idempotency

Generate one idempotency key for one user intent. Reuse it only when retrying the
same material request after an uncertain transport outcome. A changed answer,
revision instruction, continue action, or export request receives a new key.
Keep the key with the pending mutation until the result is known; do not create a
new key on every React render.

## 9. State ownership

- **PostgreSQL/backend:** identity ownership, workspace, phase, questions,
  messages, runs, approvals, context, artifacts, posts, settings that affect
  orchestration, and export jobs.
- **TanStack Query:** validated remote data, pagination, polling, and cache
  invalidation.
- **React Hook Form + Zod:** temporary input drafts and client-side feedback.
- **Zustand:** transient cross-component chrome only, such as a mobile menu,
  non-authoritative selected Library tab, or dismissible local panel state.
- **Component state:** local open/closed or focus state.
- **URL:** safe, linkable workspace/content/filter selection.

Do not mirror server data into Zustand. Do not persist workflow truth or tokens
in localStorage. A safe, non-sensitive display preference may use browser
storage only when it has an explicit schema/version and graceful fallback.

On logout, session invalidation, or identity change, cancel outstanding private
queries and clear the entire authenticated QueryClient before navigation. On a
workspace switch, cancel workspace-scoped queries and ensure every query key
includes the workspace and normalized filters. Never render cached data from a
prior identity while a new session initializes.

## 10. Library behavior

Library is the output view for everything the agent creates.

### Fast view

- Show the next useful/copy-ready post without requiring folder traversal.
- Select “next to publish” through a backend query/projection that is correct for
  workspace timezone and bounded data; do not pick the first row of the current
  descending page and call it next.
- Provide search and bounded filters for platform, status, campaign, sprint,
  week, and date.
- Copy only on an explicit user gesture and confirm success accessibly.
- Make full content and lineage available without overwhelming the first view.

### Folders

- Present `sprint/week → day → platform` as a familiar visual hierarchy.
- Use the backend grouped final-post projection; do not download the entire
  corpus and regroup it indefinitely in the browser.
- Treat each grouped response as a bounded page. Query the selected week/day
  with backend filters and preserve `nextCursor`; never imply the loaded page is
  the complete folder when more data exists.
- Treat folders as a view, not a filesystem. PostgreSQL remains canonical.
- Include Brand/strategy deliverables alongside post folders where the
  prototype specifies them.

### Needs review

- Show exact current review revisions with status, output summary, and actions.
- Approve/reject/revise the run identified by the item.
- Revision instructions are required, bounded, and submitted with
  `expectedReviewRevision` and a stable idempotency key.
- Stale review conflicts refresh the current revision and explain what changed;
  the UI never overwrites a newer decision.

## 11. Brand behavior

Brand displays approved canonical memory the agent uses automatically. It is not
a raw database editor in the primary experience.

- Organize friendly areas such as voice, audience, positioning, and strategy on
  top of namespaced context keys.
- Show approval/version provenance and last update.
- Render Markdown with raw HTML disabled.
- Version history is read-only unless a reviewed backend operation exists.
- “Improve this” starts the appropriate guided workflow; it must not directly
  overwrite canonical context.
- Manual context editing, if retained for administrators, must be deliberately
  separated from the everyday Brand experience and preserve backend validation.

## 12. Account, settings, and authentication

You is a product-facing account page, not an infrastructure dashboard.

- Complete Better Auth email/password registration, verification, sign-in,
  recovery, sign-out, Google OAuth, and session management UI.
- Use generic authentication errors where enumeration would be unsafe.
- Keep redirect targets same-origin and validated.
- Support password managers, paste, and browser autocomplete with correct
  `autocomplete` values. Do not impose cognitive puzzles, block paste, or make
  users re-enter information the session already knows.
- Show current user identity from the authenticated session, never a fixture.
- Expose sessions and secure revocation when supported by the Better Auth
  contract.
- Keep autopilot/reminder preferences honest: a toggle is disabled or marked
  unavailable until it has durable backend behavior.
- Use the browser's detected IANA timezone as the workspace-creation default,
  while allowing a validated change.
- Prefer the durable Obsidian export-job endpoint. After an authorized job-status
  read contract exists, show queued/running/succeeded/failed state without
  exposing backend filesystem paths unnecessarily.
- Hide health/readiness and security implementation details from this everyday
  page; place operational diagnostics behind an appropriate protected surface.

## 13. Security requirements

- All application data requests are same-origin through `/api/smm/*`.
- Preserve the BFF route allowlist, UUID validation, bounded request/response
  behavior, timeouts, and normalized errors.
- Never expose `SMM_API_KEY`, assertion keys, session secrets, database URLs,
  OAuth secrets, email credentials, or model keys to browser code or rendered
  HTML.
- Use secure HttpOnly, SameSite cookies in production and the existing
  same-origin mutation checks.
- Preserve `Cache-Control: no-store` for authenticated HTML and JSON. A CDN or
  reverse proxy must not cache one owner's personalized shell for another owner.
- On logout/revocation/identity change, cancel requests, clear private query
  caches, remove non-essential local drafts, and navigate only after the client
  can no longer render the prior identity's data.
- Validate responses with strict Zod schemas at the API boundary. Do not cast
  unknown JSON into trusted UI types.
- Render generated Markdown with raw HTML disabled. Sanitize/validate external
  link protocols, add safe `rel` values, and avoid unsanitized `innerHTML`.
- Treat all model output, filenames, titles, metadata, URLs, and user-entered
  Markdown as untrusted display data. Do not use `dangerouslySetInnerHTML`,
  executable URL schemes, dynamic code evaluation, or user-controlled style
  injection.
- Never place generated content into page metadata, logs, analytics, or error
  reports by default.
- Limit user input in both schema and UI; the backend remains authoritative.
- Destructive workspace/session actions require clear scope and confirmation.
- Do not leak whether another account owns a requested resource.
- Preserve the existing HSTS, frame denial, content-type, referrer,
  permissions, COOP, and CORP protections. Audit compatibility before relaxing
  any header.
- The current middleware CSP permits inline scripts and styles. Migrate through
  a report-only phase toward nonce/hash-based `script-src` and the narrowest
  viable `style-src`; remove `unsafe-inline` where Astro/runtime behavior allows.
  CSP is defense in depth, never a substitute for safe rendering. Document every
  remaining source and exception.
- Validate and encode all route/query values with `URL`/`URLSearchParams`; do not
  concatenate untrusted path or query fragments.
- Production error monitoring, source maps, traces, screenshots, and test
  artifacts must not become a new path for session cookies, reset links,
  generated content, or credentials. Keep public source-map exposure an explicit
  deployment decision.
- Dependency additions require a need, maintenance/security review, and `pnpm`
  audit. Review package size, transitive scripts, license, release health, and
  browser/runtime permissions; prefer the libraries already present and avoid
  third-party remote scripts/fonts.

## 14. Accessibility and HCI acceptance

Target WCAG 2.2 AA and verify rather than assume.

- Semantic landmarks, one page `h1`, logical heading levels, and a skip link.
- Full keyboard operation with visible focus and predictable focus order.
- Sticky/fixed headers and the mobile dock must never obscure the focused
  element. Use `scroll-padding`/content clearance and test keyboard traversal at
  every responsive breakpoint.
- At least 44×44 CSS-pixel coarse-pointer targets for primary mobile controls.
- Correct button/link semantics; no clickable `div` elements.
- Fieldsets and legends for options; radio semantics with one selected value;
  persistent labels and programmatically associated help/errors.
- Custom answer is reachable, labeled, and preserved while switching choices.
- Folder rows are disclosure buttons with `aria-expanded`/`aria-controls`;
  switches expose name, role, value, disabled state, and `aria-checked`.
- Dialogs trap/restore focus, close predictably, and announce their title.
- Status changes use a restrained `aria-live` region; animated progress is not
  continuously announced.
- Loading skeletons preserve layout and have an accessible textual status.
- Reduced-motion preferences disable non-essential motion; no essential meaning
  depends on animation.
- Forced-colors/high-contrast mode keeps focus, selection, status, and boundaries
  perceivable. Text spacing overrides must not clip content.
- Color, icon, and text jointly communicate current/completed/error states.
- Content remains usable at 320 CSS pixels and 200% zoom without two-dimensional
  scrolling in the main journey.
- Mobile bottom navigation accounts for safe-area insets and does not cover the
  final action/content.
- Approval language names the consequence: what becomes official, what advances,
  and what remains editable.
- The owner can leave and resume; the UI never implies that staying on the page
  is required for server-side work.
- Authentication, approval, rejection, revision, and destructive settings meet
  error-prevention expectations: consequences are named, drafts survive a
  correctable error, and irreversible scope requires confirmation.
- Automated axe checks supplement—rather than replace—manual keyboard,
  screen-reader, zoom/reflow, voice-control label, and mobile usability checks.

## 15. Performance architecture

- Let Astro render route shells and metadata. Hydrate only components that need
  interaction.
- Avoid one application-wide React island when smaller route-level islands can
  share server-rendered shell/navigation.
- If server-prefetched query hydration is introduced, define one serialization
  owner, include only data needed above the fold, and never serialize credentials
  or another workspace's cache. Otherwise let the focused client island fetch
  through the BFF without double-fetching the same resource.
- Do not ship demo controls, prototype state machinery, or fixture records.
- Use route/component lazy loading for genuinely heavy secondary experiences,
  not for tiny components.
- Paginate artifacts, posts, and context through backend cursors. Never fetch an
  unbounded history.
- Bound retained infinite-query pages and QueryClient garbage-collection times
  so long sessions do not accumulate every post/artifact ever viewed.
- Use stable query keys, selectors, and memoization only where measurement shows
  benefit; do not optimize by obscuring simple code.
- Prevent layout shift with stable card/media dimensions and predictable status
  regions.
- Use the existing icon library with tree-shakable direct imports. Do not bundle
  a second icon system.
- Use system fallbacks and a deliberate font-loading strategy; avoid render-
  blocking third-party font requests.
- Format dates, times, week labels, and counts with `Intl` using the workspace's
  IANA timezone and an explicit locale fallback. Do not parse or sort localized
  display strings.
- Establish a production-build baseline in F0. Provisional targets are LCP under
  2.5 seconds, INP under 200 ms, CLS under 0.1 on representative hardware, and
  no unexplained increase in initial route JavaScript. Replace provisional bundle
  numbers with measured route budgets rather than an invented threshold.
- Evaluate Core Web Vitals at the 75th percentile in a representative deployed
  environment when privacy-approved field telemetry exists. Lab checks use
  Lighthouse/DevTools and TBT as an INP proxy; lab INP or initial-load CLS alone
  must not be misreported as field evidence.

## 16. SEO and metadata

This is a private authenticated application. Correct SEO means useful metadata
without indexing or data leakage, not attempting to rank private workspace
pages.

- Centralize product title, title template, description, theme color, icons,
  language, canonical/public origin, and indexing policy.
- Mark authenticated pages and authentication flows `noindex, nofollow` unless a
  future public marketing surface receives a separate decision.
- Prefer both a robots meta directive and an `X-Robots-Tag` defense-in-depth
  policy for private HTML where deployment permits. Do not rely on robots.txt to
  protect confidential data, and do not mistake `noindex` for authorization.
- Never put workspace names, generated posts, answers, or user email addresses
  into public metadata or social preview tags.
- Use meaningful route titles for browser history and assistive technology.
- Keep semantic HTML and descriptive link text even on noindex routes.
- A future public landing page should have its own lightweight Astro route and
  explicit Open Graph/canonical policy; it is outside this redesign scope.

## 17. Resilience, loading, and error design

Every data surface must define loading, empty, recoverable error, permission
loss, stale conflict, offline, and terminal failure states.

- Preserve successful prior data while a background refresh occurs.
- Do not preserve prior-workspace data in view while switching identities or
  workspaces; show a bounded transition state instead.
- Use plain-language recovery actions and keep request IDs only in expandable
  diagnostics/support details.
- Differentiate “no content yet” from “could not load content.”
- Disable duplicate mutation submission and preserve the draft on failure.
- Network recovery must not double-answer a question, double-advance a phase, or
  create duplicate revisions.
- If a session expires, preserve safe local form text long enough to sign back in
  where feasible, but never persist secrets.
- Do not claim a decision succeeded until the server confirms it.
- Feature-detect Clipboard and other browser APIs. A copy failure keeps the
  content selectable and reports a recovery action without pretending success.
- Client errors carry the opaque request ID and release identifier to
  privacy-safe observability. Logs use codes and state names, not generated
  content or form bodies.

## 18. Analytics and A/B-readiness

Variant B is the selected implementation. Preserve the ability to compare a
future variant without duplicating orchestration state or spreading flags across
components.

- Put variant assignment at a route/composition boundary.
- Both variants must consume the same typed presentation model and mutations.
- Keep assignments stable and non-sensitive.
- Do not add a third-party analytics SDK without consent, privacy, security, and
  data-retention review.
- If analytics are approved, record event names centrally and exclude generated
  content, question answers, revision instructions, email, workspace names, and
  raw IDs.

Candidate privacy-safe events include workspace created, onboarding started,
question answered, review opened, revision requested, output approved, next
action completed, post copied, and primary tab opened. Useful outcome measures
are journey completion, time to first approved foundation, time to copy-ready
post, revision rate, abandonment point, and repeated navigation that may signal
confusion.

## 19. Testing strategy

### Automated checks

- Run the selected formatter/linter, `astro check`, Vitest, and production build
  from `pnpm install --frozen-lockfile` in CI. Fail on hook, accessibility,
  type-safety, formatting, test, or build errors.
- Unit-test configuration, route builders, response schemas, selectors,
  idempotency ownership, query-key factories, and state-to-mission mapping.
- Component-test every Today presentation state, adaptive options/custom answer,
  review actions, pagination, copy feedback, navigation, and forms.
- Contract-test the API client against realistic backend fixtures, including
  rejected unknown fields and cursor pages.
- Accessibility-test high-value views with axe plus keyboard-focused component
  tests.
- Add visual-regression fixtures for the approved prototype moments at desktop
  and mobile widths. At minimum cover 1440, 1024, 768, 390, 375, and 320 CSS
  pixels where the layout meaningfully changes.
- Retain server/BFF/auth tests and confirm no secret enters built client assets.
- Add cache-isolation tests for logout, account/session invalidation, workspace
  switching, aborted requests, and late-response races.
- Test stale review conflicts, uncertain network retries, session expiry, empty
  data, long content, long translated-like labels, reduced motion, and 200% zoom.
- Verify current evergreen Chromium, Firefox, and WebKit behavior in the deferred
  browser suite; keep desktop and mobile emulation, and record real-device iOS/
  Android acceptance as external evidence rather than assuming emulation proves
  it.
- Test CSP/security headers in report-only/enforced stages and scan the built
  output, source maps, Playwright traces, screenshots, and reports for secrets or
  private fixture content.

### Deferred end-to-end checks

Document but do not execute the complete journey unless asked:

1. email/password sign-up, verification, sign-in, recovery, and sign-out;
2. Google sign-in;
3. first workspace creation and automatic onboarding;
4. one backend-generated option answer and one custom answer;
5. background work and refresh-safe resumption;
6. review → revision → newest revision approval;
7. canonical Brand and Library updates;
8. strategy/calendar review and content production;
9. final-post Fast view, folder view, filters, and copy action;
10. Obsidian durable export job;
11. session expiry/recovery, cross-account denial, and mobile keyboard flow.

The existing `playwright.config.ts` and `e2e/studio.spec.ts` are intentionally
invalid redesign evidence: they still seed the retired shared-password cookie,
use obsolete environment names, mock a browser-accessible raw run route, and
exercise the old skill picker. Replace them; never make them pass by restoring
`CLIENT_ACCESS_PASSWORD`, `SESSION_SECRET`, a browser `SMM_API_KEY`, or the
service-only run endpoint.

The final implementation must update `client/docs/e2e-testing.md` with exact
commands, seed/fixture requirements, expected results, and cleanup.

## 20. Implementation milestones

### F0 — Baseline and contract reconciliation

- Capture current production build/check/test results and bundle baseline.
- Establish the single lint/format/JSX-accessibility toolchain and add it to CI.
- Inventory current routes/components and classify reuse, adaptation, redirect,
  or removal.
- Add missing frontend schemas for workflow, questions, revision runs, cursor
  pages, artifacts, final posts, session/account data, and export jobs.
- Resolve the Today/product interface gaps from section 8.4, beginning with
  durable active-run resumption and versioned structured view data for Brand,
  calendar, review, and progress cards.
- Freeze prototype screenshots/fixtures and record the owner's known corrections.
- Update the frontend tracker before source changes.

### F1 — Foundations and authenticated shell

- Introduce typed product/navigation/phase/SEO configuration and semantic tokens.
- Replace hardcoded metadata, product identity, logo, typography, and colors.
- Replace the old identity in Better Auth configuration, auth email copy, page
  metadata, login UI, and all visible shell content from the server-safe product
  configuration.
- Complete Better Auth screens and session-backed identity.
- Build the exact desktop header, mobile header/bottom navigation, journey
  progress, workspace switcher, and protected route shell.
- Implement new-workspace creation and immediate onboarding entry.

### F2 — Today orchestration

- Implement the typed backend-derived presentation selector.
- Build all eight prototype Today moments with exact responsive behavior.
- Use real/indeterminate progress only; no demo percentages, counts, activity,
  greetings, identities, or time estimates may leak into production fixtures.
- Wire continue, adaptive answer, polling/resume, approve, reject, and revise.
- Add explicit loading/offline/conflict/failure states and correct query
  invalidation.

### F3 — Library

- Build Fast view, Folders, and Needs review exactly as approved.
- Wire cursor pagination, backend grouping/filters, item details, review lineage,
  revision actions, and accessible copy feedback.
- Preserve compact mobile access without forcing folder traversal.

### F4 — Brand

- Build the approved-memory summary/list/detail presentation.
- Map namespaced context to friendly configured areas without losing provenance.
- Add version-history and guided-improvement entry points using real contracts.

### F5 — You and settings

- Build profile, authentication methods, sessions, and secure sign-out.
- Implement only durable preferences; honestly disable unimplemented controls.
- Wire timezone/workspace settings and durable Obsidian export status.

### F6 — Quality hardening

- Complete accessibility, responsive, performance, security-header, metadata,
  dependency, and built-asset secret audits.
- Verify private cache clearing, request cancellation, CSP report-only/enforced
  behavior, cross-browser layout, timezone/locale formatting, and observability
  redaction.
- Complete unit/component/contract/visual tests.
- Reconcile loading/error/empty/conflict behavior across every route.

### F7 — Final audit and handoff

- Compare implementation against the prototype, this document, backend API,
  route policy, and frontend tracker.
- Re-run `pnpm` install/check/test/build and non-browser security scans.
- Update architecture/features/security/backend-contract/E2E documentation.
- Record deferred manual/browser/production evidence without claiming it passed.

## 21. Definition of done

The redesign is complete only when all of the following are true:

- An owner can authenticate, create/select a workspace, and finish the guided
  backend-owned journey without seeing or selecting a raw skill.
- Today is the central control surface and exactly one next action is visually
  dominant.
- All eight prototype moments and all three secondary destinations match the
  approved layout, iconography, behavior, and responsive hierarchy, with only
  approved palette/exception changes.
- Refreshing during work or review resumes from durable backend state.
- Questions/options are backend-generated and validated; custom answers work.
- Approval/rejection/revision uses exact revision contracts and cannot promote
  stale output.
- Approved context appears in Brand, every artifact remains discoverable through
  cursor-paginated Library views, and final posts support both quick access and
  the week/day/platform hierarchy without pretending one page is the full set.
- Rich cards consume versioned structured backend data or an explicit safe
  fallback; no UI extracts calendar/brand fields from generated prose.
- Product identity, logo, palette, fonts, navigation, phase display metadata,
  SEO defaults, API routes, and repeatable shared copy have centralized owners.
- No credential or private generated content is exposed through client bundles,
  browser storage, metadata, analytics, logs, or error pages.
- Logout, session replacement, and workspace switching cannot reveal stale
  private cache data or allow late responses to overwrite the current view.
- Accessibility, component, contract, static, unit, and production-build checks
  pass; deferred browser/production gates are named honestly.
- The source is readable, typed, intentionally commented, and free from giant
  multi-purpose components, duplicated server state, and speculative
  abstractions.
- Formatting, linting, strict type checks, tests, and production build run from a
  frozen pnpm install in CI.
- Documentation and the frontend tracker match the shipped files and tests.

## 22. Senior-engineering audit checklist

The implementer must revisit every item at F7.

### Product and fidelity

- [ ] Every prototype application element is accounted for.
- [ ] Only registered exceptions differ from the approved prototype.
- [ ] Current client colors are mapped through semantic tokens.
- [ ] Exact geometry/responsive behavior is covered by deterministic visual
  fixtures, including the mobile detail-first and agenda transformations.
- [ ] Desktop and mobile journeys preserve the same capabilities and priorities.
- [ ] Technical workflow vocabulary is absent from the everyday path.

### Architecture and maintainability

- [ ] Product identity, theme, typography, navigation, display metadata, and SEO
  are centralized and typed.
- [ ] Better Auth, auth email, page metadata, and shell identity all consume the
  same server-safe product configuration.
- [ ] Components have focused responsibilities and understandable names.
- [ ] Server state is not mirrored into Zustand or browser storage.
- [ ] Backend phase/skill routing is not reimplemented in the client.
- [ ] Shared abstractions remove real duplication without hiding behavior.
- [ ] Comments explain security, concurrency, accessibility, or non-obvious
  decisions—not the syntax immediately below them.
- [ ] Strict TypeScript, hooks, Astro, formatting, and JSX-accessibility linting
  pass with no unexplained suppression.
- [ ] No dead legacy route or component remains reachable accidentally.

### Data correctness and resilience

- [ ] Every response crosses a Zod boundary.
- [ ] Rich view data is versioned/discriminated; prose is never parsed as a data
  contract.
- [ ] Cursor pagination, filtering, and invalidation are correct and bounded.
- [ ] Idempotency survives uncertain transport outcomes without duplicate work.
- [ ] Polling stops and backs off correctly.
- [ ] Abort signals, workspace changes, logout, and session invalidation cancel
  obsolete work and clear private query data.
- [ ] Refresh recovery works for questions, active work, reviews, and revisions.
- [ ] Phase 6 returns to a clearly labelled next planning cycle; the UI does not
  treat phase number or final-post availability as workflow termination.
- [ ] Stale-review conflicts preserve the newer server decision.
- [ ] All loading, empty, offline, error, and permission-loss states are explicit.

### Security and privacy

- [ ] No secret is present in source, rendered HTML, build artifacts, storage, or
  browser-visible environment values.
- [ ] Auth redirects, API paths, link protocols, and Markdown are handled safely.
- [ ] Same-origin BFF and route allowlist remain intact.
- [ ] Authenticated HTML/JSON is not cacheable by shared intermediaries, and
  private query data cannot cross identities.
- [ ] Private content is absent from metadata, analytics, and normal logs.
- [ ] Sensitive/destructive actions are scoped and confirmed.
- [ ] Dependency and CSP/security-header reviews pass with documented exceptions.
- [ ] Generated text/Markdown/URLs never enter an unsafe DOM/code/style sink.

### Accessibility, UX, and performance

- [ ] Keyboard, focus, screen-reader naming, live status, error association,
  reduced motion, contrast, zoom, and touch-target checks pass.
- [ ] Focus is not obscured by the mobile dock/header; disclosures, radios, and
  switches expose correct name/role/value/state.
- [ ] The primary action is unambiguous at each point.
- [ ] User control and consequences are clear at review gates.
- [ ] No fake progress, fake records, or misleading durable settings appear.
- [ ] Production-build and Core Web Vitals budgets show no unexplained regression.
- [ ] Lab and field performance evidence are labelled correctly; p75 field CWV
  is not inferred from Lighthouse alone.
- [ ] Long content and small-screen layouts remain usable.

### Testing and documentation

- [ ] Unit, component, contract, accessibility, and visual tests pass.
- [ ] Static check, production build, dependency audit, and client-secret scan
  pass using pnpm.
- [ ] Browser matrices distinguish automated emulation from real-device evidence.
- [ ] Browser E2E remains explicitly marked run/not run with evidence.
- [ ] Client and root documentation match the final architecture and API.
- [ ] Tracker statuses are evidence-based and external gates remain open.

## 23. Scalability and future-risk checklist

These are design guards, not permission to add speculative features now.

- [ ] Account ownership remains isolated even though the current product is one
  owner per account.
- [ ] Navigation and data selectors do not assume only one workspace forever.
- [ ] Lists remain cursor-paginated and filterable as content volume grows.
- [ ] The UI can render new backend phase display metadata without moving phase
  authority into the browser.
- [ ] A future team/role model can replace owner-only account presentation without
  rewriting the orchestration pages.
- [ ] A future real-time event stream can replace polling behind the query layer.
- [ ] A future public marketing site can coexist without indexing private routes.
- [ ] A future visual variant can share the same presentation model and mutations.
- [ ] A future publishing connector can attach to approved final posts without
  turning Library into an unbounded platform-specific component.
- [ ] Theme, product name, logo, fonts, and palette can change in one place.
- [ ] No premature plugin system, generic workflow builder, vector database,
  multi-tenant admin console, or client-side skill router is introduced.

## 24. Continuation instruction

The historical F0-F7 sequence is complete. Before changing UI source for the
next cycle, mark F8 `IN-PROGRESS` in `frontend-redesign-map.md` and read the M9
speed/reliability context and map. Implement one milestone at a time, update the
maps with every material file, and move F8 to `DONE` only after its stated
contract, accessibility, responsive, real-service, and failure-path evidence
passes. Do not claim browser E2E, live OAuth/email, or production readiness
without actually collecting that evidence.

## 25. F8 guided-interview follow-up

F8 changes Today's Phase 1 interaction model without changing the approved
Variant B shell, navigation, palette, Library, Brand, or account layouts.
Questions remain backend-owned and versioned, but their projection is preloaded
so the interface can advance immediately. A small option assistant may prefetch
personalized choices and examples for fixed questions; it never owns progression
and a reviewed fallback is always renderable.

F8 must provide:

- plain-language opening questions and examples for users with no marketing
  vocabulary;
- server-declared single-select, multi-select, help, custom-text, and combined
  answer modes;
- non-blocking suggestion prefetch, cancellation/invalidation, and protection
  against replacing choices after interaction begins;
- refresh/device resume from canonical server state rather than local storage;
- clear stale-version, conflict, offline, fallback, synthesis-progress, failure,
  and reconnect states;
- accessible focus, live announcements, keyboard behavior, touch targets,
  reduced motion, and responsive parity;
- SSE consumption behind a query/progress abstraction with canonical reads and
  bounded polling fallback.

The frontend must not contain its own divergent questionnaire, accept unknown
option/question IDs, expose model/provider details, or treat suggestions as
confirmed facts. Full cross-stack behavior, latency targets, security controls,
and milestones are authoritative in
[`backend-speed-reliability-implementation-context.md`](./backend-speed-reliability-implementation-context.md)
and [`backend-speed-reliability-map.md`](./backend-speed-reliability-map.md).
