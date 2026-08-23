# CPO-004 — Projected-Object Storage

**State:** not started
**Depends on:** CPO-002
**Repository:** Nex core

## Goal

Implement the generic identity, immutable revision, Current Head, relationship,
and provenance storage used by every MoonSleep canonical object.

## Scope

- Define one logical storage model for object identities, immutable full-state
  revisions, revision relationships, supporting Observations, and Current Heads.
- Implement equivalent SQLite and PostgreSQL adapters.
- Enforce unique identity, predecessor integrity, immutable revisions,
  compare-and-set head advancement, and no hard deletion.
- Index exact point reads, history reads, relationship traversal, and affected
  Observation reprojection.
- Keep domain tables outside identity authority.

## Acceptance

- The same storage interface supports arbitrary registered MoonSleep types.
- Concurrent stale-head publication fails without partial writes.
- Exact replay creates no duplicate revision.
- Restart preserves heads, revisions, and relationship history.

## Validation

- Migration, constraint, concurrency, rollback, restart, and backend-parity
  suites in a clean database.
- Adversarial tests for predecessor gaps, duplicate IDs, hard delete, and
  partial transaction failure.
