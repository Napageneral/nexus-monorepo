# CPO-002 — Generic Canonical Object Kernel

**State:** not started
**Depends on:** CPO-001
**Repository:** Nex core, with the umbrella registry contract

## Goal

Implement the one deep module that gives every registered projected MoonSleep
object stable identity, immutable revisions, current heads, provenance, and
exact resolution.

## Scope

- Replace registry v1's mixed declaration shape with complete canonical object
  declarations and generated catalogs.
- Implement the generic logical identity, revision, head, relationship, and
  provenance model for SQLite and PostgreSQL.
- Implement `objects.publish_revision` with registry validation, exact identity
  validation, supporting-Observation checks, semantic digests, idempotent
  replay, and compare-and-set head advancement.
- Implement generic projected-object handling in `objects.resolve_many`, with
  ordered hits or explicit misses and deterministic read digests.
- Expose exact current and requested-revision reads through the same module
  interface.
- Keep publication authorization in normal Nex policy; do not create a
  projector registry.

## Out of scope

- Per-object MoonSleep tables or resolvers.
- Observation and Core Graph adoption, which belongs to CPO-003.
- Native Channel binding, which belongs to CPO-003.
- Supply-wide declarations, projectors, decoders, or migration framework.
- Production cutover or historical cursor movement.

## Acceptance

- Two unrelated synthetic object types use the same declaration, publication,
  storage, and resolution paths with no type-specific runtime branch.
- First publication atomically creates identity and revision one.
- Exact replay is a no-op; semantic change appends one revision; stale-head
  publication fails closed.
- Every revision binds its registry digest, producer, projection contract, and
  exact supporting Observations.
- Ordered mixed-hit/miss resolution and digest stability pass.
- Ordinary reads write no receipt row.
- SQLite and PostgreSQL satisfy the same interface-level tests.

## Validation

- Focused registry/compiler tests.
- Interface-level publication and resolution conformance suite.
- Concurrent-head and idempotency tests.
- PostgreSQL cleanroom plus SQLite cleanroom.
- Deletion scan proves no new per-object projector or resolver registry.
