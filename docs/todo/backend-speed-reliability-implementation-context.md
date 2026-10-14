# Backend speed and guided-intake implementation context

Status: `VERIFY` — M9.0–M9.7 are implemented and pass local static/regression
verification. Production-like PostgreSQL latency/query-plan evidence, live option-
provider telemetry, staging browser E2E, and rollout acceptance remain open.

Last reviewed: 2026-10-11.

This is the authoritative handoff for M9, the cross-stack speed and reliability
adjustment discovered during the production-like browser test. Read it with
`backend-implementation-context.md`, `frontend-redesign-implementation-context.md`,
ADR 0014, and `backend-speed-reliability-map.md` before implementation.

## 1. Why this change exists

The current Phase 1 path sends the master orchestrator, bridge contract, selected
skill, bounded memory, and strict action schema to the primary model after most
answers. The live test proved that questions can be generated correctly, but the
experience is not acceptably fast or dependable:

- primary-model calls took roughly 40–90 seconds and one provider call failed;
- the synchronous `continue` request took about 5.3 seconds before returning;
- ordinary authenticated reads took roughly 0.5–0.65 seconds in the tested setup;
- a provider timeout or malformed action can prevent the next question appearing;
- a beginner still has to formulate marketing concepts if the UI presents blank
  fields such as “target audience” or “positioning.”

The durable worker is not being removed. It remains the correct boundary for
long-running brand synthesis, strategy, calendar, post generation, QC, and
revisions. M9 narrows worker/primary-model use so ordinary interview progression
does not depend on a heavyweight generation.

## 2. Agreed product outcome

Phase 1 becomes a beginner-friendly guided interview:

```text
Backend-owned, versioned question goals
  -> frontend-preloaded interview
  -> small option assistant personalizes choices and examples
  -> user selects, combines, or writes an answer
  -> deterministic validation and persistence
  -> programmatic compiler creates a factual intake packet
  -> durable primary-model Phase 1 recipe execution
  -> review, approve, or request revision
```

The user is never expected to understand terms such as customer persona, value
proposition, or positioning. Application code controls the workflow; a small
model reduces cognitive load; the primary model performs the professional work
that genuinely requires model reasoning.

## 3. Locked decisions

1. PostgreSQL remains authoritative for questionnaire sessions, answers,
   generated option sets, compiler output, runs, artifacts, and approved context.
2. The backend owns question IDs, meaning, order, branching, required state,
   questionnaire version, and completion rules.
3. The frontend may preload backend-projected current/likely-next presentation
   data for instant rendering, but it does not evaluate canonical branch rules.
   The backend selects and returns the authoritative next question while
   validating every accepted transition and answer.
4. Questions are deterministic. The option assistant may personalize options,
   examples, and plain-language explanations; it cannot add, remove, reorder,
   answer, or complete required questions.
5. AI-generated options are never a blocking dependency. Every question has a
   reviewed option-first fallback and always permits an appropriate custom
   answer. No required question is presented as an unexplained blank field.
6. Option generation is prefetched and batched where practical. Do not create a
   synchronous model round trip between every answer and the next visible screen.
7. The compiler is deterministic application code, not another LLM call.
8. The compiler is concise but lossless: it preserves raw answers and provenance,
   uses `null`/missing markers honestly, and never invents facts.
9. The primary model receives the compiled intake packet and the minimum trusted
   Phase 1 instructions needed to create the complete reviewable artifact.
10. Existing queue leases, fencing, idempotency, approvals, immutable revisions,
    account isolation, and model-output validation remain mandatory.
11. No vector database, generic workflow engine, Redis requirement, Docker setup,
    or client-owned canonical workflow state is introduced.

## 4. Beginner interview contract

The opening establishes enough context for useful personalization.

### 4.1 Opening question

Use plain language:

> What are we promoting?

Initial reviewed choices include company/business, personal brand, client
business, product launch, and “something else.” This step requires no model.

### 4.2 Plain-language business explanation

The next prompt is:

> Tell me what you do.

Supporting copy must say that the user can write normally and does not need a
professional answer. It must show concrete examples, such as:

- “I created a SaaS app that helps small businesses make social media posts.”
- “I sell skincare products online.”
- “I help people find and buy properties.”
- “I am trying to grow my personal account as a fitness coach.”
- “I manage social media for local businesses.”

The UI must also offer easy starting choices such as software/app, online
products, professional service, creator/personal brand, local business, and
client marketing. A choice may reveal a shorter personalized follow-up, but the
user can always write or add their own plain-language description. The examples
and choices are sent with the accepted answer as provenance; they are not merely
decorative client copy.

### 4.3 Personalized remaining choices

After the opening context exists, the option assistant proposes plausible
choices for fixed questions that only the user can confirm, including:

- who most needs or buys the offer;
- the most important social goal;
- desired brand perception and tone;
- platform priorities;
- preferred call to action;
- realistic publishing capacity;
- founder visibility;
- topics, claims, or styles to avoid.

Wording must remain beginner-friendly. Prefer “Who would get the most value from
this?” over “Who is your target persona?” Options are suggestions, never asserted
facts. “I’m not sure—help me choose” and “Something else” appear where meaningful.
“Help me choose” uses an already prefetched explanation or an immediate reviewed
fallback; it must not open another blocking model call.

## 5. Option-assistant boundary

The option assistant is a small, replaceable provider capability with a strict
schema. It receives only the minimum interview context and fixed question
descriptors. It returns bounded option sets keyed by known question IDs.

It may:

- personalize two to four meaningfully distinct choices;
- generate one short example or explanation;
- use earlier confirmed answers to make later options more relevant.

It may not:

- invent revenue, customer counts, research, performance, legal facts, or brand
  decisions;
- mutate workflow state, question definitions, or completion requirements;
- write canonical context or artifacts;
- call skills, tools, or connectors;
- return executable markup or uncontrolled identifiers.

Required reliability controls:

- strict request/response schemas, length limits, and local allowlist validation;
- a short independent timeout and no unbounded SDK retry behavior;
- cache key containing account/workspace, questionnaire version, normalized
  confirmed-answer hash, canonical target-question set, option-prompt version,
  provider, and model;
- cancellation or invalidation when a preceding answer materially changes;
- reviewed deterministic fallbacks for every question;
- content-safe text rendering and no raw HTML;
- no full prompts or sensitive answers in ordinary logs;
- latency, failure, fallback, cache-hit, token, and cost measurements.

Option generation is a low-priority durable worker job (or an equivalently
reviewed durable async mechanism), not an untracked fire-and-forget promise in
the API process. Its concurrency and spend budget must not starve authentication,
answer persistence, or primary synthesis. Because fallbacks are complete, an
option job may expire or be cancelled without blocking the interview.

Prefetch likely next option sets while the user reads the current question. If
personalization is unavailable when the next question opens, show the fallback
immediately and optionally replace only an untouched option list later. Never
replace options after the user has selected or typed an answer.

## 6. Saved interview and provenance

Persist enough information to resume and audit the interview without depending
on model memory:

- questionnaire and question versions;
- stable question ID and displayed wording version;
- option-set origin (`curated`, `programmatic`, or `model`);
- option-generator provider/model/prompt version and content hash, not secret or
  raw-prompt logging;
- options shown to the user;
- selected option IDs and labels;
- custom text exactly as submitted;
- answer source, timestamps, and idempotency key;
- supersession when an earlier answer is changed.

Old in-progress interviews keep their pinned questionnaire version. A deploy
must not silently reinterpret existing option IDs.

The backend assigns canonical IDs/hashes after validating model-produced option
text; provider-supplied identifiers are never trusted as database identities.

During rollout, a workspace has exactly one interview authority. New eligible
Phase 1 sessions use the M9 interview; an existing legacy pending question/run
either completes on the legacy path or moves through an explicitly tested
migration. Do not dual-write two active questionnaires or infer completion from
partially overlapping conversation messages.

## 7. Programmatic intake compiler

The compiler is a pure, versioned function over accepted interview answers. For
identical inputs and compiler version it returns identical output.

It must:

- normalize option IDs into a versioned `brand-intake` schema;
- combine related answers without discarding the originals;
- retain question/answer provenance and user-selected alternatives;
- distinguish confirmed facts, user preferences, and unknown fields;
- record validation issues explicitly;
- never perform creative expansion or infer unsupported business facts.

The result should contain concise sections for account/offer, audience/buyer,
problems and outcomes, goals, platforms, voice preferences, calls to action,
capacity, content boundaries, unknown fields, and source answers. “Concise” must
not become vague or lossy; the primary model must not be forced to guess.

The compiled packet also carries bounded provenance for every answer: question
ID/version, wording, options shown, selected option(s), and custom text. This is
passed to Phase 1 execution so the model can understand what the user deliberately
selected over the alternatives without resending an unbounded UI transcript.

## 8. Primary Phase 1 synthesis

Only after deterministic completeness succeeds does the API enqueue the normal
durable worker job. The worker receives the compiled intake packet, relevant
approved context, the exact pinned Phase 1 release, and a smaller execution
contract.

M9 does **not** silently collapse Phase 1 into one skill or one provider call.
The current recipe has six mandatory steps: social-context capture, niche
research, customer research, competitor profiling, voice building, and profile
optimization. The intake packet replaces repeated primary-model interviewing in
the first social-context step; the approved output then feeds the remaining
pinned steps through the existing recipe. Each mandatory step keeps its declared
context, artifact, review, version, and permission contract.

Whether those six steps should later be combined, auto-chained behind one
phase-level review, or routed to different model tiers is a separate product and
recipe decision requiring evaluation and an ADR. It is not authorized by M9.
The current per-run review/promotion semantics therefore remain authoritative;
M9 must not advertise a single Phase 1 review screen unless the backend contract
is separately changed and tested.

The primary model remains responsible for developed positioning, audience
profiles, brand voice, messaging principles, content boundaries, platform
guidance, and examples. Output remains staged until authenticated approval.

Prompt reduction must be measured, not guessed. Preserve trusted-release hashes
and execution auditability, but avoid resending irrelevant root/skill text or
conversation history. Any compiled runtime instruction derived from Markdown
must be versioned, content-addressed, evaluated, and traceable to its source.

## 9. Fast synchronous path

Questionnaire reads, answer submission, validation, compiler execution, and next
question projection are ordinary API/database work. They do not enter the
long-running job queue.

The answer transaction should:

1. authorize the current user and workspace;
2. lock/check the active interview version;
3. validate question version, answer shape, and allowed transition;
4. write the answer and audit event idempotently;
5. update deterministic interview progress;
6. return the next question projection immediately.

The primary-model synthesis remains asynchronous. `/continue` and equivalent
dispatch endpoints should commit only the minimal durable intent/run/job work
needed before returning `202`; immutable release metadata should be cached or
resolved efficiently without weakening pinning.

## 10. Progress delivery

Replace high-frequency authenticated polling with same-origin Server-Sent Events
where deployment measurements support it. SSE reports coarse, content-free
states such as queued, loading approved context, generating, validating, ready,
and failed. PostgreSQL remains authoritative; reconnect uses a normal state read,
so losing an event never loses workflow state.

SSE is a perceived-latency and load improvement, not proof that generation is
faster. Keep bounded polling as a compatibility fallback with backoff and page
visibility awareness. Do not introduce WebSockets without a bidirectional use
case.

## 11. Backend workstreams

1. Instrument current request, database, queue-start, prompt-build, provider,
   validation, and commit latency before optimizing.
2. Add versioned questionnaire definitions and validation.
3. Add durable interview session/answer/option-set persistence with account and
   workspace isolation.
4. Add the bounded option-assistant provider boundary, cache, prefetch, fallback,
   low-priority durable job, and evaluation fixtures.
5. Add the pure versioned intake compiler and schema.
6. Add a fast interview API and keep raw skill selection unavailable to browsers.
7. Adapt Phase 1 synthesis to consume the intake packet and reduced prompt.
8. Reduce synchronous enqueue work using measured query consolidation and safe
   immutable-release caching.
9. Add SSE progress with reconnect and polling fallback.
10. Load-test and audit before rollout behind one server-controlled feature flag.

Do not combine all work into one unreviewable migration or route module.

## 12. Frontend workstreams

The Today page remains the center of orchestration. Required frontend updates:

- preload the pinned interview projection and render deterministic questions;
- display plain-language examples and option-first answers;
- support single-select, multi-select, “help me choose,” custom text, and combined
  option-plus-text answers according to the server contract;
- prefetch suggestions without blocking navigation;
- never replace an option set after user interaction begins;
- save/resume progress across refresh and devices;
- show curated fallback options without presenting them as errors;
- make loading, option-refresh, validation, offline, stale-version, and conflict
  states accessible and understandable;
- preserve keyboard operation, focus, announcements, touch targets, reduced
  motion, and mobile layout from the approved Variant B design;
- display truthful synthesis progress and reconnect after SSE interruption;
- keep questionnaire definitions and workflow authority out of local storage.

Reusable copy, examples, question presentation rules, and capability flags belong
in typed configuration/contracts rather than being scattered through components.

## 13. Security and privacy requirements

- Every interview/option endpoint is authenticated, account-scoped, rate-limited,
  body-bounded, and protected by the existing same-origin BFF policy.
- User text and generated options are untrusted data at prompt, database, log,
  Markdown, and browser-rendering boundaries.
- Never send unrelated brand context to the option assistant.
- Do not preselect a generated option. Present suggestions as suggestions, keep
  ordering neutral, preserve “none/not sure/something else” escape paths, and
  evaluate for steering, stereotyping, and omitted user groups.
- Provider disclosure, data processing, retention, and regional handling for
  interview text must satisfy the product privacy policy before production.
- Do not expose provider keys, service keys, internal prompts, skill text, or raw
  model diagnostics to browser JavaScript.
- Preserve idempotency and optimistic/question-version checks against duplicate
  clicks, stale tabs, and conflicting edits.
- Apply retention and account-deletion policy to interview content and option
  cache records; cache entries must not become an unbounded shadow profile.
- Feature flags are server-controlled and recorded in diagnostics.

## 14. Performance and reliability targets

Targets must be confirmed against production-like hosting before release:

- cached questionnaire/next-question presentation: no model dependency;
- answer-and-next-question API: p95 <= 500 ms in the target region;
- dispatch endpoint: p95 <= 500 ms before returning durable `202`;
- option suggestions: never block navigation; target p95 <= 5 seconds in the
  background with immediate fallback;
- option-assistant failure: zero loss of answers and zero blocked interviews;
- queue-start latency: measured separately from provider duration;
- every primary Phase 1 recipe step: provider-specific latency/error/token SLO
  established by benchmark, plus an end-to-end phase-duration budget;
- no duplicate answers, option sets, intake packets, artifacts, or transitions
  under retries/concurrency;
- SSE loss/reconnect does not affect canonical state.

If the chosen provider cannot meet the option-assistant target, use reviewed
fallbacks or another evaluated small model. Do not hide a slow dependency behind
longer spinners.

## 15. Testing and evaluation

Required evidence includes:

- unit tests for branching, completeness, fallback selection, compiler purity,
  version pinning, and invalid transitions;
- schema/property tests for option responses and compiler output;
- PostgreSQL integration tests for isolation, idempotency, concurrent answers,
  supersession, resume, and mixed questionnaire versions;
- provider tests for timeout, malformed output, unknown IDs, unsafe lengths,
  cancellation, retry classification, and fallback;
- frontend component/accessibility tests for all answer modes and failure states;
- contract tests shared across backend and client;
- latency spans and a production-like load test for answer and dispatch paths;
- evaluation corpus covering multiple business/account types, option relevance,
  diversity, cognitive simplicity, hallucination, and bias;
- browser E2E for first visit, refresh/resume, slow/unavailable option model,
  successful synthesis, revision, approval, mobile, and offline/reconnect behavior.

## 16. Milestones

| Milestone | Scope | Initial status |
| --- | --- | --- |
| M9.0 | Baseline traces, prompt/token sizes, provider benchmark, query plans, and explicit SLOs | VERIFY — implementation/tooling complete; production-like evidence open |
| M9.1 | Versioned questionnaire domain, persistence, migrations, and fallback catalog | VERIFY — implementation/unit evidence complete; PostgreSQL execution open |
| M9.2 | Fast interview APIs, deterministic validation/branching, idempotency, and compiler | VERIFY |
| M9.3 | Bounded option assistant, batching/prefetch, cache, fallbacks, and evaluations | VERIFY |
| M9.4 | Primary Phase 1 intake consumption and prompt-size reduction | VERIFY |
| M9.5 | SSE progress, polling fallback, metrics, and operational controls | VERIFY |
| M9.6 | Variant B frontend guided interview and responsive/accessibility states | VERIFY |
| M9.7 | Strict security, concurrency, load, browser, documentation, and rollout audit | VERIFY |

## 17. Definition of done

- [x] Question progression no longer requires the primary model.
- [x] The backend is the versioned authority while the frontend remains instant.
- [x] Every question has a safe reviewed fallback and custom-answer path.
- [x] AI options are bounded, non-authoritative, non-blocking, and fallback-backed.
- [x] The compiler is deterministic, factual, lossless, versioned, and tested.
- [x] The first Phase 1 recipe step consumes the compiled packet without another
  basic interview, and all six mandatory Phase 1 steps remain correctly pinned,
  ordered, permissioned, reviewable, and measurable.
- [x] Existing approvals, release pins, queue fencing, account isolation, and
  immutable histories remain intact.
- [ ] Measured p95 synchronous targets and failure behavior pass in a
  production-like environment.
- [ ] Frontend desktop/mobile/accessibility/E2E evidence passes.
- [x] Current-state docs describe only shipped behavior; this plan and ADR are
  updated to accepted/implemented only after evidence exists.

## 18. Rejected shortcuts

- Frontend-only canonical questions or answers.
- A full primary-model call after every answer.
- A blocking option-model call before every question.
- An LLM-based compiler for information application code can normalize exactly.
- Treating AI suggestions as known customer facts.
- Sending all skills or complete conversation history to every call.
- Removing the durable worker and holding HTTP requests open across synthesis.
- Claiming speed from a spinner without measuring provider and database latency.
