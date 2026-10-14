# F4 Brand strict audit

**Date:** 2026-10-09  
**Result:** Internal implementation passes; two backend capabilities remain
explicitly unavailable.

## Corrections made

- Removed a fabricated area-wide version that had been derived from unrelated
  canonical sources. Each source now displays only its own backend version.
- Changed the summary count to say that more memory exists while cursor pages
  remain unloaded; it becomes complete only after pagination finishes.
- Exposed the canonical source key so friendly grouping never hides provenance.
- Replaced absolute “always applied” language with accurate automatic-use copy.
- Restored selected-area state on browser back/forward navigation.
- Kept last-update copy explicitly unavailable when the API omits a timestamp.

## Evidence and limits

Focused presenter/component tests cover grouping, unknown-key fallback, safe
Markdown/image behavior, pagination, URL restoration, empty state, and honest
unavailable actions. Brand never creates a synthetic completeness score or
mutates canonical context. Historical revisions and a targeted improvement
command remain blocked until account-scoped backend contracts exist; the UI
disables or routes around them rather than simulating success.
