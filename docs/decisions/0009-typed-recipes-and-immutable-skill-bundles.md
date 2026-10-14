# ADR 0009: Typed recipes and immutable skill bundles

Status: accepted and implemented in M3.

## Decision

Keep workflow routing as six small, source-controlled TypeScript recipe definitions. Each recipe declares ordered mandatory steps, same-phase optional-skill allowlists, required context keys, allowed outputs, retry limits, completion language, and the existing approval/next-phase lifecycle. Every discovered skill must have exactly one mandatory, optional, internal, or unsupported classification before startup succeeds.

Human callers submit a `continue` intent. The backend derives the next mandatory step from accepted run outputs; callers cannot select the skill or set phase completion. The legacy low-level run contract remains available only to service principals and is not exposed by the browser BFF.

At startup, hash a deterministic manifest containing every skill hash plus the root orchestrator and bridge hashes. Persist the complete trusted text as an immutable bundle and persist the six hashed recipe definitions. Enqueue stores an all-or-nothing pin to the exact recipe, bundle, skill, orchestrator, bridge, and current canonical context-revision IDs. Workers retrieve those pinned inputs and verify their hashes before execution.

Recipe definitions remain reviewed source data, not database-supplied executable code. When a future recipe version is introduced, its source definition must remain deployed while a workflow can still require its routing logic. Trusted Markdown bundles may be retrieved from their immutable database rows. Foreign keys prevent referenced releases from being deleted.

## Why

- Deterministic backend routing prevents a browser or model from skipping required work or advancing a phase early.
- Explicit optional allowlists preserve useful model judgment without granting arbitrary skill execution.
- Content-addressed bundles make rolling deployments, delayed jobs, retries, and audits resolve the same trusted instructions.
- Six ordinary definitions are easier to review and extend than a generic visual workflow or rules engine.
- Full content retention makes a pin executable; a hash alone would only prove that missing content once existed.

## Consequences

- Adding a normal skill requires its instruction file, one classification/recipe placement, and tests.
- Every semantic recipe or trusted instruction change creates a new hash/version; existing rows are never overwritten.
- `/ready` now depends on the active recipe and bundle being completely registered.
- M3 does not let the LLM invoke optional skills yet. The later strict action contract will validate requests against the active step allowlist.
- M3 does not add adaptive questions, exact-revision revision loops, final-post projections, publishing, or vector memory.
- Release garbage collection is intentionally absent until an operational retention window exists. Manual deletion is unsafe and database constraints reject referenced versions.

## Rejected alternatives

- Letting the LLM choose every skill: nondeterministic and too broad a privilege boundary.
- Hardcoding routing inside HTTP handlers or prompts: difficult to validate, test, and version.
- Loading arbitrary executable recipe logic from PostgreSQL: expands the database trust boundary and complicates review.
- Persisting only hashes: cannot execute a delayed job after files change.
- Introducing a generic workflow engine: unnecessary complexity for six known product phases.
