# CPO-004 — Agent Projection Proof

**State:** not started
**Depends on:** CPO-003
**Repositories:** nexus umbrella, Nex core, and MoonSleep

## Goal

Prove the foundation end to end using the real projecting agent and the two
currently blocking canonical objects: Purchase Order and Product Revision.

## Scope

- Finalize `moonsleep.purchase_order` and
  `moonsleep.product_revision` declarations using the vocabulary ledger.
- Record physical, packet, historical, and shorthand terms as aliases or search
  terms rather than competing objects.
- Give the projecting agent the exact generic publication and readback
  instructions; do not build a permanent Supply projector.
- Have the agent derive complete revisions from existing Records, Facts, and
  accepted Observations.
- Prove current-evidence projection and historical interpretation through the
  same publication operation.
- Move only the exact Purchase Order and Product Revision consumers needed for
  the proof.
- Delete replaced disabled projectors, decoders, compatibility declarations,
  and adapter paths for these two concepts.
- Keep historical cursor resume as a separately admitted production
  transaction after all named proof gates pass.

## Vocabulary proof

The proof must demonstrate at least:

```text
inventory_purchase_orders  -> physical table, not an object type
inventory_purchase_order   -> moonsleep.purchase_order
supply_order               -> moonsleep.purchase_order
PO                         -> human search term
product_revision           -> moonsleep.product_revision
product version            -> moonsleep.product_revision
```

## Acceptance

- The projecting agent publishes both types using
  `objects.publish_revision`; no object-specific runtime path is added.
- Both types have stable canonical IDs, immutable revisions, exact heads,
  accepted-Observation lineage, direct targets, revision-linked graph
  relationships, and ordered resolution.
- Reprojection of unchanged evidence is a no-op.
- A controlled semantic change appends a revision and preserves the prior graph.
- Historical packet terminology reaches the same canonical objects without a
  standing decoder subsystem or cursor rewrite.
- Exact consumers read the canonical heads before any legacy path is removed.
- Production and cursor claims require their own admitted receipts and live
  readback; source completion alone is insufficient.

## Validation

- Agent-generated proof packet and deterministic readback manifest.
- SQLite and PostgreSQL end-to-end cleanrooms.
- Independent identity, revision, target, graph, and provenance audit.
- Alias and physical-name rejection tests.
- Historical replay no-op and changed-revision tests.
- If approved, bounded production projection and separately governed cursor
  resume receipt.
