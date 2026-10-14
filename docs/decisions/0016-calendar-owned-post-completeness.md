# ADR 0016: Calendar-owned post completeness

Status: Implemented locally; live provider and browser acceptance pending.

## Decision

An approved dated calendar table defines a bounded worklist of scheduled
date/platform/topic slots. The backend, not the model, assigns stable slot keys
from the approved calendar artifact ID and row position. On-demand extras,
which skip Phase 2, derive slots from the owner's versioned brief instead of
reusing last week's calendar. Flexible `Open` ideas
are not counted as promised posts. New calendars must have a parsable week date
and dated rows before approval; an unparsable calendar fails visibly.

Phase 3 writes at most three slots per run. Each run must return one nonempty
draft per slot. Intermediate writer drafts are accepted automatically, allowing
the next batch to queue without repeated human approvals; if automatic enqueue
cannot proceed, Continue resumes from the first missing slot. The owner still
approves the final batch in Phase 4. The formatter must return one structured
final post per calendar slot, with exact key, date, platform, and topic. Missing,
duplicate, or extra posts fail the run and cannot reach the approval gate.

New guided interviews use immutable release `1.2.0`: account type, what the
owner does, audience, and customer outcome. Older sessions remain pinned to
their original release. AI suggestions remain bounded and the owner can always
write a custom answer. The Phase 1 model may ask at most two focused follow-ups
for genuinely missing facts after the short intake; it must not repeat known
answers or invent the omitted fields.

## Why and trade-offs

The previous recipe considered `post-writer-sms` complete after its first
accepted run. A 10-post calendar could therefore advance with one draft and
one final post. Slot counting gives the workflow a deterministic definition of
done and makes partial progress visible. Three-slot batches limit truncated
model responses without requiring ten separate model calls.

The calendar parser is intentionally narrow: it reads a dated English heading
and a Markdown table with Day, Platform, and Topic columns. This avoids a
second LLM pass, but older free-form calendars may need revision before they
can be scheduled. Phase 4 still formats the complete batch in one model call;
large batches or weak providers may fail this strict gate and need a later
per-slot formatting design. The 15-slot cap keeps QC inputs within the bounded
approved-artifact snapshot. No previously completed workspace is silently
rewritten, and this change does not fabricate missing historical posts.

## Verification

Parser and completeness unit tests cover stable slots, flexible rows, exact
final count/date/platform, malformed plans, and per-slot draft assignment.
Backend/client typechecks and relevant unit tests are required. The focused
PostgreSQL orchestration suite passed on a disposable database, including
complete four-slot drafting and partial-final rejection. A live
production-like week from calendar approval through Library remains an
acceptance gate.
