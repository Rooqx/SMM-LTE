# Recurring content implementation map

| Milestone | Status | Scope |
| --- | --- | --- |
| R0. Product contract and ADR | DONE | Authoritative context, map and architecture decision |
| R1. Interview release and backend contracts | DONE | Immutable intake `1.1.0`; four suggestions, first-class custom text, select-all metadata and server validation |
| R2. Interview UI | DONE | Always-visible custom input, compatible option-plus-text answers, semantic multi-select and accessible select-all |
| R3. Recurring content commands | VERIFY | Account-scoped, idempotent next-week, extra-post and strategy-refresh commands are implemented; disposable-PostgreSQL integration execution remains |
| R4. Today continuation UI | DONE | Three clear completion actions and minimal, validated briefs wired to backend commands |
| R5. Library verification | VERIFY | Client grouping regression passed; database-backed cross-cycle grouping execution remains |
| R6. Final audit | VERIFY | Static/security/build/unit gates passed on 2026-10-13; disposable-PostgreSQL and live browser acceptance remain |

Update this file after each milestone. Do not mark a milestone DONE without its
automated verification evidence.

## Verification evidence — 2026-10-13

- Backend: 23 test files passed, 106 tests passed; 10 database-gated files / 40
  tests skipped because no separate `TEST_DATABASE_URL` was supplied.
- Client: 25 test files passed, 160 tests passed; 1 file / 2 tests skipped.
- Client ESLint passed with zero errors after removing a redundant synchronous
  state-reset effect.
- Astro check passed for 140 files with zero errors, warnings or hints.
- Backend and Astro production builds passed.
- Backend source secret scan found no known secret patterns.
- The recurring database integration test covers idempotent replay, cycle/week
  advancement, and preservation of approved brand context; it runs whenever a
  disposable `TEST_DATABASE_URL` is configured.
