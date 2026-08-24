# Canonical Object Vocabulary Consolidation Ledger

**Status:** LOCKED MIGRATION INPUT
**Last Updated:** 2026-08-23
**Canonical spec:** [Canonical Projected Objects](../../specs/canonical-projected-objects.md)
**Execution board:** [Canonical Projected Object Foundation Board](README.md)

## Purpose

This ledger preserves the researched destination language without bulk-registering
every noun. Each row is migration input for one bounded convergence ticket.

The registry contains canonical identity-bearing objects only. Accepted packet
terms, search language, retired terms, and physical storage names are metadata on
their canonical object; they never create another graph head. Read views remain in
owner view catalogs outside the object registry.

## Vocabulary categories

| Category             | Meaning                                | Packet input | Creates identity   |
| -------------------- | -------------------------------------- | ------------ | ------------------ |
| Canonical object ID  | Stable semantic address                | Preferred    | No second identity |
| Accepted packet term | Closed machine normalization           | Transitional | No                 |
| Search term          | Human discovery language               | Never        | No                 |
| Retired term         | Recognized only to emit a correction   | Never        | No                 |
| Physical storage     | Owner resolver metadata                | Never        | No                 |
| Read view            | Query/workspace over canonical objects | Never        | No                 |

## Locked high-consequence destinations

| Current language                                                                                          | Decision                        | Canonical destination                                       | Required convergence                                                                                                       |
| --------------------------------------------------------------------------------------------------------- | ------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `moonsleep.commitment`, `commitment`                                                                      | reuse / alias                   | `nex.commitment`                                            | Retire the MoonSleep compatibility identity; preserve exact historical reference resolution in the native owner.           |
| `moonsleep.communication_loop`, `communication_loop`                                                      | reuse / alias                   | `nex.loop`                                                  | Retire the MoonSleep compatibility identity; preserve historical input normalization.                                      |
| Supply Organization, supplier organization, `supply_organization`, `supply_organizations`                 | reuse + facet                   | `nex.entity` with Supply Organization facet                 | Entity owns identity; Supply owns facet fields; Partners is a view.                                                        |
| Facility, warehouse, factory location, `supply_facilities`, `supply_facility_locations`                   | reuse + facet                   | `nex.place` with Facility facet                             | Place owns physical identity; Fulfillment Node remains a distinct operating identity linked to Place.                      |
| `inventory_purchase_order`, `supply_order`, PO, `inventory_purchase_orders`                               | alias                           | `moonsleep.purchase_order`                                  | `inventory_purchase_order` is accepted packet input; PO is search shorthand; table names are physical storage metadata.    |
| `product_revision`, product version, design/specification revision, `supply_product_revisions`            | alias                           | `moonsleep.product_revision`                                | `product_revision` is accepted packet input; human phrases are search or retired language; table name is storage metadata. |
| `commerce_order`, `shopify_order`, Shopify Order, `commerce_orders`                                      | reuse / alias                   | `moonsleep.commerce_order`                                  | Preserve the deployed `commerce_order_<sha256>` identity and immutable Commerce revisions through the shared owner resolver; never copy the Order into generic storage. |
| refund statement, `refund_amount`, refund event                                                          | conditional reuse               | `moonsleep.refund`                                          | Register and resolve only an exact provider refund identity; reviewed claims or email language alone do not create one.     |
| `inventory_shipment`, `sample_shipment`                                                                   | create once                     | `moonsleep.supply_shipment`                                 | One Supply shipment identity qualified by purpose and relationships; never collapse into Fulfillment Package.              |
| `joint_cargo_plan`, `supply_joint_cargo_plan`, `supply_joint_cargo_plans`                                 | create once                     | `moonsleep.joint_cargo_plan`                                | Both packet spellings normalize to the existing stored business concept.                                                   |
| `inventory_purchase_order_component`, `purchase_order_component_line`                                     | create once                     | `moonsleep.purchase_order_component_line`                   | One supporting identity; preserve old observed ID forms during migration.                                                  |
| `transport_document`, `interfacility_transfer_document`, BOL, customs document                            | create once                     | `moonsleep.supply_transport_document`                       | One evidence-custody identity; document role describes its use.                                                            |
| provider case, support ticket, intervention, investigation, retrieval case, provider claim, carrier trace | alias                           | `moonsleep.carrier_case`                                    | Owner process type carries the operational subtype.                                                                        |
| financial recovery instrument, claim recovery                                                             | alias when exact receipt exists | `moonsleep.carrier_recovery_receipt`                        | Unresolved phrases remain evidence references.                                                                             |
| provider invoice, AP invoice, provider credit memo                                                        | alias / profile                 | `moonsleep.invoice`                                         | Credit memo is an Invoice profile.                                                                                         |
| provider credit line, AP line                                                                             | alias                           | `moonsleep.invoice_line`                                    | Preserve signed line meaning under Invoice.                                                                                |
| Job, Job definition, `job_definitions`                                                                    | reuse                           | `nex.job`                                                   | Job means reusable definition only.                                                                                        |
| Job revision, `job_revisions`                                                                             | create native identity          | `nex.job_revision`                                          | Immutable revision of a Job definition.                                                                                    |
| Run, Job Run, work item, `job_runs`                                                                       | create native identity          | `nex.run`                                                   | One accepted logical execution; bare `run` is not a global alias.                                                          |
| Attempt, retry attempt, `job_attempts`                                                                    | create native identity          | `nex.attempt`                                               | One fenced execution try within a Run.                                                                                     |
| Customer Shipment, Tracking, package, `fulfillment_packages`                                              | reuse / view language           | `moonsleep.fulfillment_package`                             | Tracking is a view; Package is one physical container identity.                                                            |
| package revision, `fulfillment_package_revisions`                                                         | create                          | `moonsleep.fulfillment_package_revision`                    | Immutable child revision under stable Package.                                                                             |
| Dispatch Wave, `dispatch_wave`, `dispatch_waves`                                                          | rename / alias                  | `moonsleep.fulfillment_wave`                                | Wave is a temporary execution cohort, not a package, label, shipment, or Batch.                                            |
| label, shipping label, provider label                                                                     | create                          | `moonsleep.fulfillment_label`                               | Provider artifact for one immutable Package revision; a file is custody, not the Label.                                    |
| `dispatch_packet_edition`, packet edition, Fulfillment Packet                                             | create / alias                  | `moonsleep.fulfillment_packet`                              | One immutable instruction/artifact edition for a released Fulfillment Wave.                                                |
| Channel, provider thread, provider conversation                                                           | reuse                           | `nex.channel`                                               | Communication container only.                                                                                              |
| Sales Channel, marketplace/inventory/commerce channel                                                     | create                          | `moonsleep.sales_channel`                                   | Commerce exposure identity; never normalize to communication Channel.                                                      |
| Batch 1/2/3/4/5, `batch_key`, inventory batch                                                             | contextual only                 | Purchase Order, Lot, Manufacturing Run, or Fulfillment Pool | No canonical Batch object. Resolve the intended lifecycle identity.                                                        |
| PO lot, `inventory_purchase_order_lot`                                                                    | alias                           | `moonsleep.lot`                                             | Traceable quantity/material cohort under a Purchase Order.                                                                 |
| manufacturing batch, production run                                                                       | create                          | `moonsleep.manufacturing_run`                               | Production execution, distinct from Purchase Order and Lot.                                                                |
| manufacturing run component, component workstream                                                         | create                          | `moonsleep.manufacturing_run_component`                     | Independently targetable component execution under a Manufacturing Run.                                                    |
| product component variant rule                                                                            | embed initially                 | Product Revision or BOM attributes                          | Register only if later evidence proves independent identity and lifecycle.                                                 |
| accepted inspection work, accepted inspection service                                                     | reuse                           | `nex.commitment`                                            | Accepted work is an obligation; create service procurement only after an independent lifecycle is proven.                  |
| batch pool, inventory pool, `fulfillment_pools.batch_key`                                                 | create                          | `moonsleep.fulfillment_pool`                                | Allocatable capacity linked to Product, Lot, Purchase Order, and Node as applicable.                                       |

## Supplier packet census

The accepted Supplier corpus contains 93 distinct Resource labels. All are
accounted for as follows:

- 37 exact reuses or aliases to existing canonical objects;
- 8 duplicate labels collapsed into four new canonical concepts;
- 45 distinct stable additions awaiting one-at-a-time declaration;
- 3 evidence-shaped rows that resolve to Nex evidence objects rather than new
  business identities.

### Existing objects: normalize, do not create

`commitment`, `communication_loop`, `nex.commitment`, `nex.loop`, `nex.channel`,
`nex_channel`, `nex.contact`, `nex.entity`, `nex_entity`,
`nex.facet_attachment`, `nex.place`, `supply_organization`,
`financial_transaction`, `payment_application`, `product_family`,
`product_revision`, `product_bom_version`, `product_bom_line`,
`product_prototype`, `product_experiment`, `product_experiment_option`,
`purchase_plan`, `purchase_plan_option`, `purchase_plan_requirement`,
`supplier_product_quotation`, `supplier_product_quotation_line`,
`supplier_product_quotation_packaging_option`, `supplier_freight_quotation`,
`supplier_freight_quotation_line`, `sample_order`, `sample_order_line`,
`sample_order_status`, `sample_article`, `sample_article_status`,
`sample_payment_report`, `inventory_purchase_order`, and
`inventory_purchase_order_lot`.

### Four duplicate clusters: create once

- `inventory_shipment` + `sample_shipment` -> `moonsleep.supply_shipment`
- `joint_cargo_plan` + `supply_joint_cargo_plan` -> `moonsleep.joint_cargo_plan`
- `purchase_order_component_line` + `inventory_purchase_order_component` ->
  `moonsleep.purchase_order_component_line`
- `transport_document` + `interfacility_transfer_document` ->
  `moonsleep.supply_transport_document`

### Stable additions: decide and declare one at a time

| Candidate group            | Canonical destinations                                                                                                                                                                                                                                                                                                                                                   |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Product                    | `moonsleep.external_product_reference`, `moonsleep.product_colorway`; Product Component Variant Rule remains embedded unless later evidence proves independent identity                                                                                                                                                                                                 |
| Receiving and facilities   | `moonsleep.facility_receipt`, `moonsleep.facility_receipt_line`, `moonsleep.facility_receipt_event`, `moonsleep.facility_receipt_event_line`, `moonsleep.facility_inventory_snapshot`, `moonsleep.facility_inventory_snapshot_line`, `moonsleep.facility_fulfillment_snapshot`, `moonsleep.facility_fulfillment_snapshot_line`, `moonsleep.facility_throughput_snapshot` |
| Transfers and cargo        | `moonsleep.interfacility_transfer`, `moonsleep.interfacility_transfer_event`, `moonsleep.joint_cargo_plan_membership`                                                                                                                                                                                                                                                    |
| Manufacturing and planning | `moonsleep.manufacturing_run`, `moonsleep.manufacturing_run_component`, `moonsleep.manufacturing_run_component_cohort`, `moonsleep.planned_component_cohort`, `moonsleep.production_planning_profile`, `moonsleep.production_planning_stage`, `moonsleep.production_schedule`, `moonsleep.production_schedule_line`                                                      |
| Quality                    | `moonsleep.product_quality_case`, `moonsleep.quality_inspection`, `moonsleep.quality_inspection_finding`, `moonsleep.quality_inspection_scope_line`, `moonsleep.quality_inspection_test_result`                                                                                                                                                                          |
| Purchase Order support     | `moonsleep.purchase_order_revision`, `moonsleep.purchase_order_adjustment`, `moonsleep.purchase_order_payment_link`                                                                                                                                                                                                                                                      |
| Shipment planning          | `moonsleep.shipment_destination_plan`, `moonsleep.shipment_destination_plan_line`, `moonsleep.shipment_manifest`, `moonsleep.shipment_manifest_line`, `moonsleep.shipment_routing_revision`, `moonsleep.shipment_routing_revision_line`, `moonsleep.supply_shipment_wave`, `moonsleep.transport_milestone`                                                               |
| Supplier evidence          | `moonsleep.supplier_material_specification`, `moonsleep.supplier_shipment_schedule`, `moonsleep.supplier_shipment_schedule_line`                                                                                                                                                                                                                                         |
| Supply reconciliation      | `moonsleep.component_supply_link`, `moonsleep.supply_reconciliation_case`, `moonsleep.supply_reconciliation_case_line`                                                                                                                                                                                                                                                   |

### Evidence rows: do not create business objects

- `supply_manifest_observation` -> `nex.observation`
- `supply_shipment_wave_destination_observation` -> `nex.observation`
- `supplier_capture_checkpoint` -> sealed `nex.set` plus capture receipt

## Claims, Customer, and Accounting consolidation

Claims terms `provider_case`, `provider_support_ticket`,
`provider_intervention`, `provider_investigation`, and
`provider_retrieval_case` converge on `moonsleep.carrier_case`.
`financial_recovery_instrument` converges on an exact
`moonsleep.carrier_recovery_receipt`; provider invoices and credit memos converge
on `moonsleep.invoice`; provider credit lines converge on
`moonsleep.invoice_line`. `logical_communication`, audit waves, evidence windows,
and value proofs remain Records, Sets, or Fact Sets. Remittance Configuration is
undecided until Finance proves stable effective-dated ownership.

Customer, Customer Thread, Customer Issue, Partner, Tracking, and workspace names
are read views over canonical objects. Accounting already uses canonical Invoice,
Payment, Payment Application, Channel, Contact, and Entity language.

## Collision rules

The following bare terms are never global machine aliases: `document`,
`shipment`, `warehouse`, `customer case`, `inventory snapshot`, `run`, `claim`,
and `receipt`. Owner and domain context must select the canonical identity.

## Historical-first convergence queue

The first convergence boundary is the complete global interval
`[2026-03-26T05:00:00Z, 2026-04-02T05:00:00Z)`. Implementation remains sliced
so each declaration or owner binding is independently reviewable.

| Order | Slice                                     | Outcome                                                                                                                                                                                                     |
| ----: | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|     1 | Native imports and owner bindings         | Reuse Entity, Contact, Channel, Loop, Commitment, and Facet identities through their native owners; create no projected copies.                                                                             |
|     2 | Commerce declarations                     | Register only the Commerce Order and exact Refund identity contracts required by the bounded evidence. Receipts remain custody, not business identities.                                                    |
|     3 | Supply dependency closure                 | Register Product Family, BOM Version/Line, Sample Article, freight quote/line, Manufacturing Run, Manufacturing Run Component, and the single Purchase Order Component Line vocabulary needed by the slate. |
|     4 | Finance dependency closure                | Register Financial Account, Financial Transaction, Invoice, and Invoice Line as needed; map accepted inspection work to Commitment and never to Payment.                                                    |
|     5 | Generated normalization and relationships | Compile aliases and canonical relationship slots from registry v2; eliminate packet-local object translations.                                                                                              |
|     6 | Complete slate dry run                    | Prove every subject and endpoint resolves, with zero withheld links, duplicate identities, future-state inference, or synthetic revisions.                                                                  |
|     7 | Governed historical publication           | In one separately authorized transaction, write the bounded semantic layer, publish object revisions, read back, replay no-op, and only then advance the cursor.                                            |

Later waves select only the additional concepts actually encountered by the
next chronological interval. Supply Shipment, Joint Cargo Plan, Supply
Transport Document, Claims, Fulfillment, Jobs, and Sales Channel use the same
per-concept contract when their evidence arrives.

## Per-ticket contract

```text
classify -> declare if needed -> project or bind native owner -> verify
-> move exact consumers -> delete replaced vocabulary/code
```

Every ticket records source evidence, canonical destination, accepted packet
terms, search/retired/storage language, identity contract, owner resolution,
Observation and Core Graph proof, consumer cutover, and deletion scans. It never
rewrites historical packets or advances the historical cursor.
