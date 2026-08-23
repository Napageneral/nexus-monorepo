# CPO-004 — Agent Projection Proof

**State:** completed
**Depends on:** CPO-003
**Owner:** Canonical Object Registry Consolidation
**Nex implementation:** `51dff4f8a6`
**MoonSleep source:** `d8abfec5459a842952edce15878947674275508b`
**MoonSleep validation:** `fdaca7a25`
**Registry digest:** `779025aee49314634f99bf6cf6a04c97492f2ade35dbd671726669414fcbae23`
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

- Agent-generated proof packet grounded in SGD-0008 Record/Fact references:
  passed.
- Identical SQLite and isolated PostgreSQL 17 projection/readback packet:
  passed.
- CPO-003/CPO-004 focused kernel, target, native Channel, graph, store, public
  operation, and backend suite: 52 tests passed.
- Exact replay no-op, controlled revision advancement, current/historical
  relationship separation, accepted-Observation custody, ordered misses, and
  generic target-consumer readback: passed.
- Alias convergence and rejection of `inventory_purchase_orders` and `PO` as
  packet semantics: passed.
- Nex production build under Node 22: passed.
- No object-specific runtime path, standing projector, decoder, or duplicate
  resolver was added. Existing historical Supply evidence remains under the
  projecting-agent track and was not rewritten or activated.
- Production projection and historical cursor resume were not performed; each
  remains a separately admitted transaction after source landing and runtime
  deployment.
