# Wednesday Content Batch: LinkedIn & X (Twitter)

Status: [QUALITY CHECK PASSED]
Date: Week of 2026-W36 (Wednesday)

---

## 📌 Post 1: [LinkedIn] The Composite Index Trap in PostgreSQL

### 🎣 Hook Options (Select One):
- [x] **Option A (The Silent Flaw)**: Your PostgreSQL composite index might be completely ignored by the query planner.
- [ ] **Option B (Misconception)**: Adding `(status, created_at)` to an index doesn't mean queries on `created_at` are fast. Column order matters.
- [ ] **Option C (Hard Rule)**: If you don't understand the "Leftmost Prefix Rule" in B-trees, half the database indexes you create are dead weight.

### 📝 Final Post Draft:
Ever added an index to a slow table, re-ran your query, and watched in horror as PostgreSQL still did a 10-second `Seq Scan`?

Here is the trap:

When you create a composite index on two columns:
`CREATE INDEX idx_orders_status_date ON orders (status, created_at);`

PostgreSQL constructs a B-tree sorted by `status` FIRST, and only then by `created_at`.

If your query filters by:
`WHERE status = 'completed' AND created_at > NOW() - INTERVAL '7 days'`
👉 **Index Scan** (Blazing fast, 2ms).

BUT if your query filters by:
`WHERE created_at > NOW() - INTERVAL '7 days'` (without filtering `status`)
👉 **PostgreSQL cannot use the index!** It defaults back to a full table sequential scan.

Why? The **Leftmost Prefix Rule**. A multi-column index can only be searched starting from the first column.

```sql
-- TRAP: Composite index on (status, created_at)
-- This query CANNOT use the index efficiently because 'status' is missing:
EXPLAIN ANALYZE 
SELECT * FROM orders 
WHERE created_at >= '2026-01-01'; 
-- Result: Seq Scan on orders (cost=0.00..18450.20 rows=50200) [SLOW]

-- FIX: Put the highest-cardinality or universally queried column FIRST,
-- or create a separate dedicated index:
CREATE INDEX idx_orders_created_at ON orders (created_at);
-- Result: Index Scan using idx_orders_created_at (cost=0.42..8.44) [2.1ms]
```

Rule of thumb:
Put equality columns first, range columns second, and never assume index column order is interchangeable.

Have you ever debugged an index that PostgreSQL refused to use? What was the culprit?

📸 **1-Click Ray.so Code Card**: [Generate Dark-Mode Code Screenshot](https://ray.so/#code=LS0gVFJBUDogQ29tcG9zaXRlIGluZGV4IG9uIChzdGF0dXMsIGNyZWF0ZWRfYXQpCi0tIFRoaXMgcXVlcnkgQ0FOTk9UIHVzZSB0aGUgaW5kZXggYmVjYXVzZSAnc3RhdHVzJyBpcyBtaXNzaW5nOgprRVhQTEFJTiBBTkFMWVpFIApTRUxFQ1QgKiBGUk9NIG9yZGVycyAKV0hFUkUgY3JlYXRlZF9hdCA+PSAnMjAyNi0wMS0wMSc7IAotLSBSZXN1bHQ6IFNlcSBTY2FuIG9uIG9yZGVycyBbU0xPV10KCgotLSBGSVg6IFB1dCB0aGUgaGlnaGVzdC1jYXJkaW5hbGl0eSBjb2x1bW4gRklSU1QsCi0tIG9yIGNyZWF0ZSBhIHNlcGFyYXRlIGluZGV4OgprQ1JFQVRFIElOREVYIGlkeF9vcmRlcnNfY3JlYXRlZF9hdCBPTiBvcmRlcnMgKGNyZWF0ZWRfYXQpOwotLSBSZXN1bHQ6IEluZGV4IFNjYW4gdXNpbmcgaWR4X29yZGVyc19jcmVhdGVkX2F0IFsyLjFtc10&theme=dracula&darkMode=true&padding=32&language=sql)

### 💬 Pinned First Comment:
"P.S. Use `EXPLAIN (ANALYZE, BUFFERS)` to see exactly how many 8kB memory pages your query hits on disk. What's your go-to database optimization tool?"

### 📊 Quality Scorecard: 49 / 50 [✅ PASSED GATE]

---

## 📌 Post 2: [LinkedIn] The Hidden Cost of `is_deleted = true` (Soft Deletes)

### 🎣 Hook Options (Select One):
- [x] **Option A (The Silent Flaw)**: Adding `is_deleted BOOLEAN DEFAULT FALSE` is the most dangerous "innocent" architectural decision in database design.
- [ ] **Option B (The Trap)**: Soft deletes sound clean in theory. In production at 10M rows, they ruin query performance.
- [ ] **Option C (Contrarian Perspective)**: Stop adding soft deletes to primary tables. Use dedicated archival tables instead.

### 📝 Final Post Draft:
Almost every developer starts a new table schema like this:

`id, email, created_at, is_deleted BOOLEAN DEFAULT FALSE`

It feels responsible. You never lose user data, and you can "restore" mistakes.

Fast-forward 2 years to 20 million records:

1. **Polluted Indexes**: 99.9% of your rows have `is_deleted = false`. Your B-tree indexes are forced to index billions of records you will never look at.
2. **Developer Fatigue**: Every single junior developer writing a `SELECT` must remember `WHERE is_deleted = false`. Miss it once, and a deleted user shows up on an invoice.
3. **Broken Unique Constraints**: If a user deletes their account and re-registers with the same email, your `UNIQUE(email)` constraint throws a duplicate key violation.

Here is the modern production alternative: **Partial Indexes & Dedicated Archival Tables**.

```sql
-- Solution 1: Partial Indexes
-- Only index the ACTIVE records. Ignores all deleted rows completely!
CREATE UNIQUE INDEX idx_users_active_email 
ON users (email) 
WHERE is_deleted IS FALSE;

-- Solution 2: The Archival Pattern (Cleanest)
-- Move deleted rows completely out of the hot table into 'users_archive'
BEGIN;
  INSERT INTO users_archive SELECT * FROM users WHERE id = $1;
  DELETE FROM users WHERE id = $1;
COMMIT;
```

With an archival table, your primary hot table stays lean, cache hits stay at 99%, and unique constraints work naturally.

How do you handle data retention and deletion in your databases?

📸 **1-Click Ray.so Code Card**: [Generate Dark-Mode Code Screenshot](https://ray.so/#code=LS0gU29sdXRpb24gMTogUGFydGlhbCBJbmRleGVzCi0tIE9ubHkgaW5kZXggdGhlIEFDVElWRSByZWNvcmRzLiBJZ25vcmVzIGRlbGV0ZWQgcm93cyBjb21wbGV0ZWx5IQpDUkVBVEUgVU5JUVVFIElOREVYIGlkeF91c2Vyc19hY3RpdmVfZW1haWwgCk9OIHVzZXJzIChlbWFpbCkgCldIRVJFIGlzX2RlbGV0ZWQgSVMgRkFMU0U7CgotLSBTb2x1dGlvbiAyOiBUaGUgQXJjaGl2YWwgUGF0dGVybiAoQ2xlYW5lc3QpCi0tIE1vdmUgZGVsZXRlZCByb3dzIGNvbXBsZXRlbHkgb3V0IG9mIHRoZSBob3QgdGFibGUgCkJFR0lOOgogIElOU0VSVCBJTlRPIHVzZXJzX2FyY2hpdmUgU0VMRUNUICogRlJPTSB1c2VycyBXSEVSRSBpZCA9ICQxOwogIERFTEVURSBGUk9NIHVzZXJzIFdIRVJFIGlkID0gJDE7CkNPTU1JVDs&theme=dracula&darkMode=true&padding=32&language=sql)

### 💬 Pinned First Comment:
"P.S. PostgreSQL Row-Level Security (RLS) can also enforce `is_deleted = false` automatically at the tenant layer, but partial indexes save the most IOPS. Which do you use?"

### 📊 Quality Scorecard: 48 / 50 [✅ PASSED GATE]

---

## 📌 Post 3: [X / Twitter - Morning] The Adversarial AI QA Skill

### 📝 Final Post Draft (258 characters):
Most developers use AI as a glorified Google Search.

Senior engineers use it as an adversarial QA robot.

Feed your API schema to an agent with this prompt:
"Generate 15 edge cases designed to trigger a 500 error or SQL crash on this route."

It will humble you.

### 💬 Pinned First Comment:
"It will test for: Unicode null bytes, negative timestamps, 10MB payloads, circular JSON references, and simultaneous requests. Run this before your users do."

### 📊 Quality Scorecard: 49 / 50 [✅ PASSED GATE]

---

## 📌 Post 4: [X / Twitter - Afternoon] Junior vs Senior Founders

### 📝 Final Post Draft (256 characters):
Junior founder:
"We are training a bespoke multi-modal diffusion pipeline with custom tokenization across a distributed cluster."
(Revenue: $0)

Senior founder:
"We built a boring CRUD app with React and Supabase that bills $45k/mo."

Don't confuse complexity with cash.

### 💬 Pinned First Comment:
"Customers don't pay you for how hard your code was to write. They pay you for solving their problem fast. Ship the boring stack."

### 📊 Quality Scorecard: 49 / 50 [✅ PASSED GATE]

---

## 📌 Post 5: [X / Twitter - Evening] The Horrifying SQL Prompt

### 📝 Final Post Draft (246 characters):
Frontend devs please look away.

Backend engineers:
What is the most horrifying, unholy SQL query or database crime you've ever discovered lurking in legacy production code?

I'll go first:
A 12-table `JOIN` inside a cron job running every 60 seconds with no indexes.

👇

### 💬 Pinned First Comment:
"Runner up: Storing a comma-separated list of IDs in a VARCHAR column instead of a foreign key relationship. What's the worst you've seen?"

### 📊 Quality Scorecard: 49 / 50 [✅ PASSED GATE]
