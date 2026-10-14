# Variant B desktop/mobile parity audit

**Status:** internally complete  
**Audited:** 2026-10-10  
**Reference:** `autopilot-smm-briefing-variant-b.html`  
**Authorized difference:** retain the existing client color palette

## Reference-to-product mapping

| Prototype contract | Implemented product surface | Result |
| --- | --- | --- |
| 64px desktop top bar | Product mark, compact workspace switcher, Today/Library/Brand nav, notification and owner controls | MATCH |
| Compact mobile header | Product identity, workspace control, owner avatar | MATCH |
| Six-part desktop journey | Phase bars with label and purpose | MATCH |
| Mobile phase ring | Current phase number, label, and progress ring | MATCH |
| 900px content stage | Shared authenticated shell content boundary | MATCH |
| Work briefing layout | Dominant mission plus 235px desktop coach rail; single-column mobile | MATCH |
| Adaptive question | One numbered choice at a time, custom answer, reason, explicit submit | MATCH |
| Working/review/calendar/production/posts | Separate backend-derived scenes using the prototype hierarchy and compact density | MATCH |
| Activity and coach cards | Compact timeline, current task, phase steps, latest delivery | MATCH |
| Library | Content Library header, soft tabs, spotlight, filters, folder/review views | MATCH |
| Brand | Foundation status, area list, compact detail, protected history | MATCH |
| You | Identity, security, preferences, workspace, Obsidian and install cards in the same compact visual grammar | MATCH |
| Mobile navigation | Floating inset four-item dock with safe-area clearance | MATCH |

## Intentional product-grade adaptations

- Demo-only viewport, scene, variant, and tweak controls are excluded.
- Fixtures, fake timers, and fake identity are replaced with authenticated and
  backend-derived state.
- Inert prototype controls use semantic buttons, links, radios, disclosures,
  dialogs, and live regions.
- Existing ink/acid/coral/sky tokens replace only the prototype colors.
- PWA install/offline controls and full account security remain available even
  though the visual demo did not model those production needs.
- History and other collections stay bounded; no page loads an unlimited record
  set to imitate a static mockup.

## Responsive audit

- Desktop retains the horizontal navigation, six-step journey, two-column Work
  briefing, five-day calendar, and compact secondary-page headers.
- Mobile replaces the journey with the phase ring, hides the coach rail,
  changes the calendar to agenda rows, stacks headers/actions, and preserves
  minimum touch targets plus bottom safe-area clearance.
- Long workspace names, content titles, account addresses, and generated text
  wrap or truncate inside min-width-safe grid/flex children.
- The service worker caches no authenticated page, API response, Brand memory,
  or generated post.

## Verification

- ESLint: pass.
- Astro check: 132 files, zero errors, warnings, or hints.
- Vitest: 127 passed, 2 skipped.
- Production build: pass.
- Source-to-reference layout reconciliation: pass.
- Browser screenshot/E2E comparison: deliberately not run at the owner's
  request; device and deployed-browser acceptance remain external.

## Verdict

The authenticated desktop and mobile product now follow the approved Variant B
layout, iconography, component hierarchy, density, and interaction model while
preserving the authorized client colors and real security/orchestration
boundaries.
