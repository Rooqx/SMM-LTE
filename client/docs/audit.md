# Frontend audit

The current rigorous milestone audit is
[F7 final frontend audit](../../docs/todo/f7-final-frontend-audit.md). It
supersedes the original pre-redesign assessment that referenced the removed
command center, skill runner, raw context editor, and shared-password-era UI.

## Current verdict

- The browser follows the backend-owned workflow and cannot list or execute raw
  skills, create arbitrary runs, or write canonical context directly.
- Today is split into a pure presentation selector, a focused side-effect
  controller, and declarative phase views.
- High-cardinality product reads use bounded cursor pagination and abortable,
  workspace-scoped queries.
- Authentication/session secrets stay behind Astro and HttpOnly Better Auth
  cookies; generated Markdown renders without raw HTML.
- Missing backend capabilities are unavailable explicitly rather than
  simulated.
- Browser E2E and production/provider acceptance remain external and are not
  claimed by the internal audit.

Use [e2e-testing.md](./e2e-testing.md) for the deferred browser procedure and
[quality-hardening.md](./quality-hardening.md) for performance, accessibility,
privacy, and release gates.
