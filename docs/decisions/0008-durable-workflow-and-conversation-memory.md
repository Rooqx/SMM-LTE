# ADR 0008: Durable application-owned workflow and conversation memory

- Status: accepted
- Date: 2026-10-08

## Decision

Keep the application stateful and the LLM stateless. PostgreSQL owns one durable workflow per workspace, versioned phase instances, orchestration steps, an active conversation, ordered immutable messages, bounded derived summaries, pending questions, answers, and immutable canonical-context revisions.

New workspaces create their workflow, phase-1 instance, active conversation, and audit event in the same transaction. Message ordinals are allocated while locking the active conversation. A workspace can have only one pending question and one running orchestration transition. Answers target an exact question version and use a request hash plus workspace-scoped idempotency key. Canonical context points to a specific approved immutable revision; workers load pinned revision IDs rather than reconstructing old values from the latest row.

Composite foreign keys enforce that workflow, phase, step, conversation, message, question, answer, run, and context-revision relationships stay inside one workspace. Repository queries add the personal-account boundary. The initial persistence record uses `legacy-v1` until typed, immutable recipe definitions replace it in M3.

## Why

Provider threads, model caches, Markdown files, and vector similarity cannot safely provide authorization, recovery, ordering, idempotency, or exact-revision approval. Relational state, transactions, constraints, and append-only history make refresh, retry, deployment, and audit behavior predictable while keeping the model replaceable.

## Consequences

- PostgreSQL remains required for every hosted workflow.
- Conversation summaries are derived and never replace authoritative messages or answers.
- No vector database is introduced; later memory assembly begins with exact and metadata queries.
- Hosted execution does not write canonical Markdown files. Obsidian remains optional one-way export.
- Product-facing continue/answer/approval endpoints and typed recipes remain later milestones; M2 provides their safe persistence boundary without exposing a generic workflow engine.
