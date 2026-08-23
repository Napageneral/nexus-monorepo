# CPO-015 — Fulfillment Migration

**State:** not started
**Depends on:** CPO-013
**Repositories:** Nex core, MoonSleep Dispatch

## Goal

Move the approved Fulfillment object family onto uniform canonical identities
and revisions without collapsing its distinct execution nouns.

## Scope

- Review and register Fulfillment Obligation, Delivery Plan, Fulfillment Node,
  Fulfillment Package, Package Revision, Fulfillment Label, Fulfillment Wave,
  and Fulfillment Packet as approved.
- Preserve Place versus Fulfillment Node and Supply Shipment versus Fulfillment
  Package distinctions.
- Project current semantic state from accepted Observations and source receipts.
- Keep label purchase, packet publication, print acknowledgment, carrier
  possession, and Shopify fulfillment as separate evidence.

## Acceptance

- Stable object IDs and immutable revisions replace mutable compound identity.
- Every current relationship resolves to registered native or projected
  subjects.
- Tracking remains a Read View.
- Dispatch action authority remains outside projection acceptance.

## Validation

- Package revision/label invalidation, wave release, packet edition, node/place,
  replay, restart, and no-double-shipment golden journeys.
