# CPO-003 — Observation, Graph, and Native Resolution

**State:** completed
**Depends on:** CPO-002 and the completed native Channel branch
**Owner:** Canonical Object Registry Consolidation
**Nex source:** `915ddc6f3b4da89d95f29ff866cefe55fed0d2ae`
**Native Channel integration merge:** `5d0ede7887`
**Nex implementation:** `5c919b9942`
**Registry digest:** `89e3a901676cf33be739e3b262194ec3fd1f5276f6d0ca3f2eda6a7d39e3f3e1`
**Repository:** Nex core

## Goal

Make every registered object address usable by Observations and Core Graph, and
prove that native Nex storage can satisfy the same generic resolution
interface.

## Scope

- Generate Observation target validation from canonical object declarations.
- Use one canonical address shape for projected object targets and graph
  subjects.
- Publish projected-object relationships from exact Object Revisions and
  preserve historical edges.
- Route `nex.channel` requests inside `objects.resolve_many` to the completed
  native Channel owner adapter.
- Preserve request ordering and the existing Core Graph custody result.
- Remove the Communication Stream resolver fallback and any duplicate Channel
  declaration from the active integration path.

## Clarification

This ticket does not introduce a "native dispatch" subsystem. Resolution
routing is private implementation inside the Canonical Object Kernel. Channel
is one adapter because it has genuinely different owner storage.

## Acceptance

- A newly registered projected type is immediately a valid Observation target
  without a second adapter declaration.
- Current graph reads follow current heads; exact historical reads follow the
  requested revision without rewriting earlier edges.
- `nex.channel` preserves the supplied native row ID as canonical, resolves
  deleted rows, digest-binds complete row state including `deleted_at`, and
  never infers route successors.
- No Communication Stream read participates in Channel resolution.
- Mixed projected/native batches preserve order, cardinality, explicit misses,
  and custody fields.
- Graph addressability grants no external action authority.

## Validation

- Observation target, current/historical graph, native Channel, public operation,
  SQLite bundle, and mixed-adapter tests: 46 passed.
- Generated runtime registry digest matched the canonical umbrella registry.
- Mixed native/projected resolution preserved order, explicit misses, exact
  revision selection, custody, and no read writes.
- Retired native Channel row resolved by exact supplied ID with `deleted_at`
  receipt-bound; no route-successor inference was present.
- Active runtime/source scan found zero Communication Stream Channel-crosswalk
  reads or declarations.
- No production state or historical cursor was mutated.
