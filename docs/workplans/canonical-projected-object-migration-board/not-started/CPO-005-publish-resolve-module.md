# CPO-005 — Publish and Resolve Module

**State:** not started
**Depends on:** CPO-003, CPO-004
**Repository:** Nex core

## Goal

Expose one deep module for publishing and resolving every projected object.

## Scope

- Implement `publishObjectRevision` with registry, identity, attribute,
  relationship, supporting-Observation, digest, idempotency, and CAS checks.
- Implement ordered batched `resolveSubjects` for generic projected objects.
- Return explicit misses and the existing six-field Core Graph custody result.
- Compute lightweight deterministic read digests without writes.
- Expose history and exact-revision reads through the same module interface.

## Acceptance

- Callers learn one publication interface and one resolution interface.
- Unknown types, stale registry digests, malformed state, ambiguous identity,
  and output order/cardinality defects fail closed.
- No domain-specific conditionals or object-specific resolvers exist in the
  external interface.

## Validation

- Interface-level tests with at least two unrelated projected object types.
- Ordered mixed-hit/miss batch tests.
- Digest stability and zero-read-write assertions.
