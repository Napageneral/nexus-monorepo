# Canonical Projected Object Foundation Board

**Status:** WORKPLAN
**Last Updated:** 2026-08-23
**Canonical spec:** [Canonical Projected Objects](../../specs/canonical-projected-objects.md)
**Related spec:** [Nex Core Real-World Graph and Domain Facets](../../specs/core-real-world-graph-and-domain-facets.md)
**Vocabulary ledger:** [Canonical Object Vocabulary Consolidation Ledger](consolidation-ledger.md)

---

## Outcome

Nex has one small Canonical Object Kernel. An authorized agent or deterministic
producer can project any registered `moonsleep.*` object through two generic
operations:

```text
objects.publish_revision
objects.resolve_many
```

The kernel supplies stable identity, immutable revisions, current heads,
Observation targeting, Core Graph relationships, exact resolution, and
evidence lineage. Native Nex objects remain native and resolve through owner
adapters at the same seam.

The foundation is proven with Purchase Order and Product Revision. The first
real convergence wave now follows the next global historical interval. Within
that wave, declarations and owner bindings still land as small independent
slices; the chronological slate is the readiness and production-proof boundary,
not a reason to build a domain-family framework.

## Deliberate simplification

The earlier 20-ticket plan incorrectly promoted implementation details and
domain migrations into architectural phases. This board replaces it with six
bounded tickets.

These are no longer separate phases:

- **Native dispatch** is an internal detail of `objects.resolve_many`.
- **Channel binding** is one contained native adapter integration in CPO-003.
- **Native reuse and Facet collapse** are `reuse | alias | create` vocabulary
  decisions made per candidate.
- **Canonical Supply declarations** are ordinary object declarations made when
  those objects are needed.
- **Supply projectors** are projecting agents or deterministic producers using
  the generic publication operation.
- **Historical decoding** is projection-time vocabulary interpretation, not a
  standing subsystem.

Disabled or superseded projectors and decoders are removal candidates. They are
not prerequisites for the new foundation.

## Current baselines

- Umbrella exact `origin/main`: `98174577d9cc20650c03e119d78c6471785c5902`
- Nex exact `origin/main`: `c55bf28f92fc3df64516e6487833bdbee8f15e83`
- MoonSleep exact `origin/main`: `baeda9025a71bc409cdc68fd6780f5c8a0f325ef`
- Native Channel cleanup is merged through Nex PR #432. Communication-storage
  safety and parity work is merged through PR #453; current main is a
  descendant of both.
- Projecting and historical-interpretation agent:
  `codex://threads/019fec90-be1c-7cc3-8961-5c05caadd78d`

These hashes are planning baselines only. Each implementation ticket begins in
a clean worktree at then-current exact `origin/main` and records its immutable
source commit.

## Execution rules

1. Work one ticket at a time unless Tyler explicitly approves parallel work.
2. The canonical spec owns target semantics; tickets may not invent a second
   registry, projector system, decoder system, resolver system, or activation
   lifecycle.
3. Agents are first-class projecting producers. The registry never requires a
   permanent projector declaration for an object type.
4. Every registered `moonsleep.*` type uses the generic kernel immediately.
5. Every candidate receives one `reuse | alias | create` decision before
   registration. The exhaustive vocabulary census remains research input, not
   a global gate.
6. Land declarations and owner bindings one small dependency-closed slice at a
   time. Validate the full chronological slate before historical publication.
7. Delete replaced vocabulary and code as each concept converges. Do not carry
   disabled projectors or decoders toward a final big-bang cleanup.
8. Historical packets and cursors are never rewritten.
9. Source merge is not production authorization. Every production change has
   separate admission, readback, rollback or resume semantics, and receipts.
10. The active historical cursor remains paused until CPO-005 proves the full
    next-slate vocabulary, resolver, relationship, and replay contract and a
    separately approved historical publication transaction completes.

## Dependency DAG

```mermaid
flowchart TD
    CPO001[CPO-001 Simplified kernel contract] --> CPO002[CPO-002 Generic Canonical Object Kernel]
    CPO002 --> CPO003[CPO-003 Observation, graph, and native resolution]
    Channel[Completed native Channel resolver] --> CPO003
    CPO003 --> CPO004[CPO-004 Agent projection proof]
    CPO004 --> AUDIT[Historical frontier vocabulary audit]
    AUDIT --> DECISIONS[Approved semantic decisions]
    DECISIONS --> CPO005A[CPO-005A Native imports and owner bindings]
    CPO005A --> CPO005B[CPO-005B Next-slate projected declarations]
    CPO005B --> CPO005C[CPO-005C Registry-derived vocabulary and relationship coverage]
    CPO005C --> CPO005D[CPO-005D Full next-slate dry run]
    CPO005D --> CPO005E[CPO-005E Governed historical publication and readback]
    CPO005E --> CPO005[CPO-005 First convergence wave complete]
    CPO005 --> CPO006[CPO-006 Legacy deletion and foundation closure]
```

The foundation critical path and CPO-005A are complete. The active path is:

```text
CPO-005B -> CPO-005C -> CPO-005D -> CPO-005E -> CPO-006
```

The only external implementation input is the already-completed native Channel
resolver used by CPO-003. It does not block construction of the generic
projected-object kernel in CPO-002.

## Ticket index

| Ticket                                                                | State       | Outcome                                                                                   | Depends on              |
| --------------------------------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------- | ----------------------- |
| [CPO-001](completed/CPO-001-simplified-kernel-contract.md)            | completed   | Canonical two-operation, agent-projection contract                                        | —                       |
| [CPO-002](completed/CPO-002-generic-canonical-object-kernel.md)       | completed   | Registry, identities, revisions, heads, provenance, and two generic operations            | CPO-001                 |
| [CPO-003](completed/CPO-003-observation-graph-native-resolution.md)   | completed   | Uniform targeting, revision-linked graph, and native Channel adapter binding              | CPO-002, Channel branch |
| [CPO-004](completed/CPO-004-agent-projection-proof.md)                | completed   | Agent projects Purchase Order and Product Revision end to end, including historical terms | CPO-003                 |
| [CPO-005](in-progress/CPO-005-historical-first-object-convergence.md) | in progress | Converge the first full chronological slate through small dependency-closed slices        | CPO-004, frontier audit |
| [CPO-006](not-started/CPO-006-legacy-deletion-foundation-closure.md)  | not started | Delete superseded foundation-era machinery and close the foundation proof                 | CPO-005                 |

## What happens after CPO-006

CPO-006 closes the foundation, not every future domain migration.

Each additional candidate becomes a small independent ticket using the template
proven inside CPO-005:

```text
classify -> declare if needed -> agent projects -> verify -> move consumers -> delete replacement
```

Later intervals reuse the same loop. Their order is determined by active
evidence chronology and business need, not by a predeclared family sequence.

The locked vocabulary census and ordered first convergence queue are recorded
in the [consolidation ledger](consolidation-ledger.md). The ledger does not
force all candidates to become objects and does not block an already-decided
object from using the kernel.

## Repository ownership

- **Umbrella repository** owns the canonical specification, registry contract,
  vocabulary decisions, and this board.
- **Nex core repository** owns the Canonical Object Kernel, generic operations,
  Observation targeting, Core Graph integration, owner-adapter seam, and
  conformance cleanroom.
- **MoonSleep repository** owns domain schemas, agent instructions or
  deterministic projection logic when useful, exact consumers, and governed
  production cutovers.
- **Native domains** own their identity readers. The Channel track supplies the
  completed `nex.channel` adapter implementation consumed by CPO-003.

## Board movement

- A ticket lives in exactly one state directory.
- Moving the file is the status change.
- `in-progress` requires an owner and exact current source commits.
- `completed` requires every acceptance criterion and named validation result.
- A source merge does not complete a production transaction.
- CPO-006 archives this foundation board only after the kernel, proof objects,
  replacement deletions, and continuation template are independently verified.

## Foundation acceptance

- One canonical v2 declaration registry contains complete identity-bearing
  object types only; registry v1 remains migration input, not a second active
  declaration system.
- One deep module exposes `objects.publish_revision` and
  `objects.resolve_many`.
- Agents and deterministic producers use the same publication operation.
- No permanent per-object MoonSleep resolver, target adapter, projector
  registration, or historical decoder subsystem is required.
- Purchase Order and Product Revision prove stable identity, idempotent replay,
  immutable revision advancement, targetability, graph addressability,
  resolution, and provenance.
- `nex.channel` resolves through its native owner without Communication Stream
  fallback or successor inference.
- Read Views, receipts, and action authority remain outside the object registry.
- Historical vocabulary is interpreted without rewriting packets or cursors.
- Replaced disabled projectors, decoders, compatibility declarations, and
  duplicate adapter paths are deleted.
- SQLite and PostgreSQL pass the same interface-level cleanroom suite.
