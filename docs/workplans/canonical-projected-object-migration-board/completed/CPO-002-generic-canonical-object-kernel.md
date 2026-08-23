# CPO-002 — Generic Canonical Object Kernel

**State:** completed
**Depends on:** CPO-001
**Owner:** Canonical Object Registry Consolidation
**Nex source:** `bf06ae79de625e9fb06ebe70894e822ef585ef53`
**Nex implementation:** `68dd18d779cabad366fb030ce8905110e847017c`
**Nex worktree:** `state/worktrees/cpo002-canonical-object-kernel-nex-20260823`
**Repository:** Nex core, with the umbrella registry contract

## Goal

Implement the one deep module that gives every registered projected MoonSleep
object stable identity, immutable revisions, current heads, provenance, and
exact resolution.

## Delivered

- Canonical object registry v2 declaration schema, deterministic compiler,
  compiled artifact, and two-unrelated-type self-test.
- One domain-neutral kernel interface with `publishRevision` and `resolveMany`.
- Stable canonical IDs derived from validated identity inputs and the exact
  registered identity contract.
- Closed identity and attribute schemas, registered relationship slots,
  globally unambiguous accepted input terms, and non-authoritative search
  terms.
- Atomic first identity/revision creation, immutable revision lineage,
  compare-and-set head advancement, and exact replay no-ops.
- Revision provenance bound to the registry digest, projection producer,
  projection contract, and exact accepted-Observation custody.
- Ordered batch resolution with explicit misses, current or exact-revision
  reads, Core Graph custody fields, stable read digests, and no read writes.
- SQLite identity migration 21 and PostgreSQL operational migration 34 with the
  same storage interface and database-enforced append-only/head invariants.
- Selected-backend store exposure through Nex for CPO-003 integration.

Registry v1 remains research and migration input until its concepts converge
independently. No v1 entry was bulk-promoted.

## Out of scope preserved

- No per-object MoonSleep table, resolver, projector, or decoder was created.
- Observation target and Core Graph adoption remains CPO-003.
- Native Channel binding remains CPO-003.
- Purchase Order and Product Revision declarations remain CPO-004.
- No production state, packet, historical cursor, or live registry was mutated.

## Acceptance

- Two unrelated synthetic object types use the same declaration, publication,
  storage, and resolution paths with no type-specific runtime branch.
- First publication atomically creates identity and revision one.
- Exact replay is a no-op; changed state or evidence appends one revision;
  stale-head and concurrent-loser publications fail closed.
- Every revision binds its registry digest, producer, projection contract, and
  exact supporting Observations.
- Ordered mixed-hit/miss resolution and digest stability pass.
- Ordinary reads write no receipt row.
- SQLite and PostgreSQL satisfy the same kernel and storage contracts.

## Validation

- Registry v2 compiler self-test: passed for two unrelated types, deterministic
  output, and duplicate accepted-term rejection.
- Registry v2 JSON Schema validation: passed under strict draft 2020-12
  validation.
- Focused source typecheck for the complete new module and both stores: passed.
- Focused lint and formatting for all new module/storage files: passed.
- Kernel, SQLite migration, and PostgreSQL schema suite: 9 tests passed.
- PostgreSQL 17 isolated cleanroom: migration 34 plus publication, replay,
  advancement, ordered current/historical/miss resolution, and append-only
  enforcement passed.
- Existing runtime store bundle suite: 14 tests passed.
- Existing NEX historical ingest/construction suite: 11 tests passed.
- New implementation files are below the 500-line deep-module limit.
- Domain-specific scan found no Purchase Order, Product Revision, Supply,
  MoonSleep, or Communication Stream branch in the kernel/storage source.

Current exact main independently has a stale migrator-receipt assertion that
expects migrations only through 32 even though migration 33 is already merged.
That test fails before reaching this ticket's migration 34; it was recorded and
left to the owning Jobs track rather than broaden CPO-002.
