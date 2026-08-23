# CPO-012 — Supply Projectors and Historical Decoder

**State:** not started
**Depends on:** CPO-005, CPO-006, CPO-011
**Repositories:** MoonSleep, Nex core

## Goal

Project canonical Supply objects from accepted Observations and keep historical
packets replayable through generated decoding.

## Scope

- Implement deterministic Projectors for the CPO-011 Supply types.
- Publish through the generic revision interface only.
- Compile historical terms such as `inventory_purchase_order` and
  `product_revision` to canonical type IDs.
- Preserve exact Record, Fact, Fact Set, Observation, and relationship lineage.
- Reproject the paused historical cohort into an isolated shadow substrate.

## Acceptance

- Exact replay is a no-op.
- Changed accepted understanding creates one successor revision.
- No Projector writes domain identity/history tables directly.
- No historical packet, Record, Fact, Observation, or cursor is rewritten.
- Unknown or ambiguous historical terms fail closed.

## Validation

- Unit fixtures for every approved Supply type and relationship.
- Full accepted-corpus shadow replay with deterministic digests.
- Restart, reordered-input, late-evidence, and idempotency tests.
