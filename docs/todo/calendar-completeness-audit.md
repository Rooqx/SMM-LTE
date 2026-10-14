# Calendar completeness and short-intake implementation audit

Date: 2026-10-14. Scope: the one-post-for-a-week defect and excessive fixed
interview length. This is an implementation audit, not a claim of live E2E
acceptance.

| Agreed behavior / risk | Implementation | Evidence and remaining limit |
| --- | --- | --- |
| Three or four owner-only fixed questions | Versioned `1.2.0` asks four: account type, business description, audience, outcome | Definition/compiler/service tests; pre-existing `1.1.0` sessions remain pinned |
| Personalized options and written answer | Existing option assistant and visible custom field unchanged | Existing option tests pass; live relevance remains provider-dependent |
| AI follow-ups after the short intake | Phase 1 can ask a bounded focused follow-up and retains that answer in its next prompt | Prompt-compiler test; older long-intake release still suppresses repeat questions |
| Calendar controls number of posts | Approved dated rows become stable slots; flexible Open rows excluded | Parser tests; legacy free-form calendars may require revision |
| Extra-post command uses its own brief | Extra slots derive from the versioned on-demand brief, not the previous calendar | Pure builder test; 15-post request cap matches bounded QC inputs |
| Do not finish Phase 3 after one post | Writer runs cover up to three missing slots; only the last batch completes Phase 3 | Exact draft-count validation and accepted-run slot ledger; disposable PostgreSQL integration passed (four-slot calendar) |
| Reduce repeated approvals/clicks | Intermediate writer drafts auto-accepted and next batch best-effort queued | If queue admission closes or a worker stops between commits, Continue resumes safely from missing slots |
| No false final-week approval | Formatter output must match every slot key/date/platform exactly | Completeness unit tests; final formatting is still a single potentially slow/failing LLM call |
| Use current cycle drafts for QC | Phase 4 filters scheduled draft keys and refuses missing/truncated dependency snapshots | Disposable PostgreSQL partial-final rejection passed; live provider trial outstanding |
| Honest production UI | Today renders actual per-platform planned/drafted counts | Selector/component tests and Astro check; browser E2E outstanding |
| Existing completed workspace | No automatic mutation or invented historical posts | Workspace `a434aea8-0c06-4677-bc9a-bfdfb9857b66` still has its earlier single approved post unless the owner requests a recovery run |

## Verification gate

- Backend production build passed. The final backend suite passed 114 tests
  (42 integration tests skipped without a test URL); the focused parser,
  completeness, and dependency suite passed 10 tests.
- Client Astro check passed with 146 files and zero diagnostics; ESLint passed;
  the focused Today/continuation suite passed 42 tests and the final
  Today/selector regression passed 40 tests. Earlier broader Today/contracts
  coverage passed 55 tests.
- Eight orchestration integration tests passed against a disposable PostgreSQL
  16 database on 2026-10-14, including four-slot Phase 3 progression and a
  rejected partial Phase 4 final batch. The server and temp files were removed.
  These tests truncate organizations; never point them at the owner's main DB.
- Live acceptance: approve a 10-row calendar, observe all 10 draft slots and
  progress, review 10 exact final posts, then verify 10 approved Library rows.
  Also test a provider response with only one post: the run must fail, leave
  prior drafts intact, and allow retry from the missing batch.

## Residual design limits

Markdown calendar parsing is narrower than a future structured-calendar
contract. Phase 4 scores/edits a batch and formats the whole set in one model
response. A later per-slot formatter/aggregate-review design would improve
latency and resilience for larger calendars. Automatic chaining is best effort
after each durable draft commit, with manual Continue as the crash/admission
recovery path. Do not describe this as fully unattended scheduled autopilot.
