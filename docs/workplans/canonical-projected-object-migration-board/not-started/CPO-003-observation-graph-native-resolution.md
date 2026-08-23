# CPO-003 — Observation, Graph, and Native Resolution

**State:** not started
**Depends on:** CPO-002 and the completed native Channel branch
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

- Observation target conformance tests.
- Current and historical graph tests across revision advancement.
- Native Channel focused tests from the completed branch.
- Mixed-adapter ordered-batch cleanroom.
- Zero-crosswalk-read and zero-read-write assertions.
