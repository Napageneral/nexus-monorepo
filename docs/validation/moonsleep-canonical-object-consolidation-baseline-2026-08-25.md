# MoonSleep canonical object consolidation baseline — v2

Status: locked source-only v2 semantic baseline; implementation and production
remain separately authorized

Date: 2026-08-25

No executable registry change, schema change, object publication, historical-cursor
movement, provider action, or production mutation is authorized by this document.

## Legacy extinction contract

> **This consolidation is not complete when canonical objects become
> publishable. It is complete only when every superseded active semantic
> surface is extinct.**

For this program, **extinct** means all of the following are true for the
completed vertical slice:

- zero superseded tables, views, functions, triggers, columns, or registry
  rows;
- zero active legacy producers, callers, readers, projectors, or decoder
  branches;
- zero accepted runtime aliases or compatibility reads/writes;
- zero legacy object IDs, relationship names, or fields in canonical state;
- zero active prompts, APIs, jobs, projections, or current documentation
  teaching the superseded vocabulary.

One surviving executable legacy path means the consolidation is incomplete.
Canonical value can be live before extinction, but the slice remains open.

Immutable source Records, historical packets, and Git history keep their exact
received language because they are evidence. The inert extinction ledger also
names what was removed. Those surfaces are not executable semantic vocabulary
and must never be accepted as runtime input after their bounded migration path
is deleted.

Each slice therefore has two independent completion measures:

| Measure | Meaning |
| --- | --- |
| business value live | approved canonical objects answer named SQL questions and one real workflow |
| legacy surfaces extinct | every replaced active producer, consumer, schema surface, alias, and compatibility branch is gone |

Overall completion requires both measures to reach 100 percent.

## Exact evidence boundary

This proposal reconciles three independently audited inputs:

- MoonSleep `origin/main` `574589bad8a52ce697989a8d05f162f5f2e3cb21`,
  tree `a8543048fc94bf275f970f3652889193e77a685d`;
- umbrella `origin/main` `5ce327ed362cbe8af6252f9252b5881220770dd7`,
  tree `509455e76a5b748181c22d47396fd5fa91fa95b4`;
- Nex `origin/main` `06d5ad028438a26c4db457bd97c53310a50a65dd`,
  tree `1e2791d21f4c1aa05189d9d760451a4cd5591b61`.

The Supplier evidence set is the latest accepted `SGD-0001` through
`SGD-0016` corpus plus the separately approved post-cutoff `SGD-0017` packet.
It contains 759 Resource rows, 705 Resource identities, 86 Resource type names,
and 811 relationship rows. Every one of the 86 type names receives an explicit
disposition below.

This is not a production census. A committed table or installer proves source
existence, not current production installation or use. Physical table deletion
always requires a fresh caller/data census and a separate governed decision.

Primary source families reviewed:

- `infra/ops-analytics/fixtures/supply-reviewed-interpretation/*.bundle.json`;
- `infra/ops-analytics/tests/test_supplier_reviewed_corpus_consistency.py`;
- `services/ops-analytics-api/src/ops_analytics_api/domains/inventory_planner.py`;
- `services/ops-analytics-api/src/ops_analytics_api/domains/inventory_stock.py`;
- `infra/ops-analytics/sql/supply_product_commercial_model_postgres.sql`;
- `infra/ops-analytics/sql/supply_facility_master_postgres.sql`;
- `infra/ops-analytics/sql/supply_interfacility_transfers_postgres.sql`;
- `infra/ops-analytics/sql/finance_accounts_payable_postgres.sql`;
- `infra/ops-analytics/sql/finance_cash_card_postgres.sql`;
- `infra/ops-analytics/sql/finance_ledger_postgres.sql`;
- Customer Service `CANONICAL_INTERPRETATION_AND_ADOPTION_CONTRACT.md`;
- Claims `ONTOLOGY.md` and `CLAIMS_GOLD_CORPUS_AGGREGATE_PACKET_V2.json`;
- `contracts/object-registry/v2/registry.json`;
- Nex `src/runtime/domains/objects/*` and the canonical-object stores/migrations.

## Executive proposal

The chapter packets do not prove 86 business-object classes. They serialized
stable identities, object history, lines, source documents, events, snapshots,
read models, compatibility rows, and inverse relationships as peer Resources.

The smaller target is:

```text
Nex Records
   -> Facts + accepted Observations
   -> objects.publish_revision
   -> canonical object identity + inherent immutable revision history
   -> objects.resolve_many and ordinary SQL
```

The joint Supplier, Customer Service, Claims, Finance, and native-owner review
establishes a catalog of 24 projected MoonSleep object types, existing owner-native objects,
structured child values, and Facts/Observations.
It does not need a table or object for every packet Resource.

The proposed 24 are:

```text
moonsleep.product
moonsleep.product_specification
moonsleep.bill_of_materials
moonsleep.bill_of_materials_line
moonsleep.component
moonsleep.component_variant
moonsleep.material_specification
moonsleep.supplier_quote
moonsleep.supplier_quote_line
moonsleep.purchase_plan
moonsleep.purchase_order
moonsleep.purchase_order_line
moonsleep.product_experiment
moonsleep.inventory_lot
moonsleep.sample_article
moonsleep.manufacturing_run
moonsleep.manufacturing_run_component
moonsleep.quality_inspection
moonsleep.product_quality_case
moonsleep.reconciliation_case
moonsleep.supply_shipment
moonsleep.joint_cargo_plan
moonsleep.interfacility_transfer
moonsleep.facility_receipt
```

This list is the locked semantic review catalog, not an authorization to
bulk-register all 24 declarations. Each type is declared only when its
business-value slice reaches the declaration/release transaction below. The
current source registry's 23 entries remain research input and must not be
bulk-promoted as the final business catalog.

## What changed from v1

The historical-ingestion review found seven concepts that v1 had compressed
too far and three native-owner families that must be reused rather than copied.

| v2 amendment | Evidence boundary |
| --- | --- |
| create Bill of Materials and BOM Line | SGD-0002 carries separately selected sample compositions; SGD-0004 PO lines target a commercial BOM; SGD-0006 uses a production BOM; SGD-0017 proves one-line pseudo-BOMs can still collapse |
| create Supplier Quote Line | Purchase planning and ordering select exact product/freight options, quantities, price breaks, inclusions, and BOM targets |
| create Purchase Plan | the planning decision can outlive communication, evaluate several Quote Lines, and produce several POs |
| create Product Experiment | hypothesis, test, evidence, and decision have a lifecycle independent of messages |
| create Product Quality Case | investigation/disposition spans several objects and may exist with no open Loop |
| create Reconciliation Case | discrepancy resolution spans Supply, Inventory, and Finance; measurement lines lack independent identity |
| reuse Claims and Finance line owners | Carrier Incident, Carrier Case, Carrier Recovery Receipt, and Invoice Line already have action-owning domains |
| normalize identity | Supplier, facility, and provider become relationships; stable MoonSleep IDs remain searchable identity |
| loosen base relationship requiredness | planned and partially-known objects can exist; action/readiness rules gate departure, payment, execution, and similar transitions |

No generic Case framework, line framework, per-type storage, or second revision
system is introduced by these amendments.

## Foundation rules

1. A canonical object must have a stable identity, independent business
   meaning, and a reason to be targeted, related, or queried over time.
2. Every canonical object already owns generic immutable Object Revisions.
   No `*_revision`, `*_status`, or `*_event` object is created merely to record
   change.
3. A source document, message, milestone, count, or status report remains a
   Record/Fact/Observation unless it has a separate business identity and
   lifecycle.
4. A child collection stays inside its parent revision unless the child needs
   an independent identity, lifecycle, Observation target, or relationship
   endpoint.
5. Publish one canonical relationship direction. Derive inverse navigation in
   SQL.
6. Reuse native Entity, Contact, Place, Channel, Loop, Commitment, Commerce,
   Finance, and Fulfillment owners. Do not copy their identities into generic
   projected objects.
7. Every canonical object has one stable MoonSleep object identity. Supplier,
   facility, provider, route, and other contextual owners are relationships,
   never identity material. A durable external business reference may supply
   the object ID; a bounded internal migration key is never promoted merely
   because an old table used it. Any externally supplied ID must be globally
   unique inside its declared MoonSleep object-type namespace; collision fails
   closed and never changes the identity shape by adding a contextual owner.
8. Legacy terms exist only in a bounded migration ledger until exact historical
   targets are recompiled. They do not remain permanent executable aliases.
9. Money uses integer minor units plus ISO currency. Quantities always carry a
   unit of measure.
10. Fields may be added compatibly as optional evidence appears. Renames,
    removals, type changes, and new required fields require an explicit schema
    transition. Existing object revisions are never rewritten.
11. Most relationships are optional-many at object creation. Requiredness
    belongs to the action/readiness policy that consumes the object. Only
    identity-defining or structural child-to-parent edges are intrinsically
    required.
12. Any registered object may be a relationship endpoint when the declaration
    admits it. Reuse an established predicate such as `supersedes` when the
    constrained endpoint types already carry the noun; retain meaningful
    domain verbs such as `executes_purchase_order`,
    `fulfills_purchase_order_line`, `requires_component_variant`, and
    `reconciles_object`. New predicates are additive, inverse reads are
    derived, and two directions are stored only when they express genuinely
    different facts.
13. If an artifact does not answer an approved business query, serve a named
    live caller or producer, or make a risky deletion safely reversible, it is
    not built.

## Purchase Order identity correction

The human/business Purchase Order ID is `SWRC26004`, not
`surewal-2026-05-6000`.

The stable business identity is:

```json
{
  "purchase_order_id": "SWRC26004"
}
```

`purchase_order_id` is the immutable MoonSleep object identity and the value
shown and searched in the business. Surewal is linked through
`placed_with_supplier`; it is not baked into identity. The existing kernel
derives the collision-safe canonical address from the identity object.
`SWRC26004` is valid only because MoonSleep claims it as globally unique in the
`moonsleep.purchase_order` namespace. Publication of any second Purchase Order
with that ID and different identity evidence must fail closed; Supplier is
never silently added to disambiguate the collision.
`surewal-2026-05-6000` is a bounded source mapping; the `-inner` row contributes
a line to the same commercial PO. Neither becomes a permanent alias.

## Native reuse catalog

These are legitimate addressable objects, but their existing owner supplies
identity, state, history, and resolver receipts. They are not copied into the
generic projection store.

| Canonical address family | Owner and business role | Consolidates |
| --- | --- | --- |
| `nex.entity` | Person or organization identity | Supplier Organization, Supplier Representative person, customer, carrier, factory company, AP party identity |
| `nex.contact` | Contact-point identity | supplier contact method, customer Contact, packet Contact |
| `nex.place` | Physical place identity | Facility, warehouse, factory address, fulfillment-site location |
| `nex.facet_definition` / `nex.facet_attachment` | Supply Organization, Supplier Representative, Facility, Customer, and other contextual roles | duplicate role-specific identity tables |
| `nex.channel` | Immutable owner-native communication container | source conversation, derived email stream after native route expansion |
| `nex.loop` | One unresolved communicative expectation that may concern a domain object | `communication_loop`, `moonsleep.communication_loop`; it does not replace Purchase Plans, Experiments, Quality Cases, or Reconciliation Cases |
| `nex.commitment` | Promise/obligation identity | `moonsleep.commitment`, supplier promise, replacement or delivery commitment |
| `moonsleep.commerce_order` | Commerce-owned order identity and history | Shopify order packet aliases |
| `moonsleep.cash_card_account` | Finance-owned cash/card account | copied account rows |
| `moonsleep.financial_transaction` | Finance-owned transaction identity and immutable revisions | generic payment rows and packet `financial_transaction` |
| `moonsleep.invoice` | Finance-owned AP Invoice identity and revisions | invoice revision packet types |
| `moonsleep.invoice_line` | Finance-owned, independently targetable invoice line | invoice-line packet language; Claims does not create a duplicate |
| Finance Payment Order | Finance-owned payment instruction and revisions | generic `payment` language |
| Finance Payment Allocation | Finance-owned allocation between exact invoice/payment revisions and a PO relationship | `payment_application`, `purchase_order_payment_link` |
| Fulfillment Obligation | Dispatch owner | copied order-line fulfillment state |
| Delivery Plan | Dispatch owner | route/readiness plan state |
| Fulfillment Package | Dispatch owner with inherent owner revisions | `fulfillment_package_revision` as a second type |
| Fulfillment Label | Dispatch/provider-artifact owner | label fields copied into wave rows |
| Fulfillment Wave | Dispatch execution-cohort owner | denormalized wave read rows |
| Fulfillment Packet Edition | Dispatch immutable rendered-artifact owner | packet/read projection conflation |
| Return Case | Returns owner | copied return/refund/label workflow fields |
| `moonsleep.carrier_incident` | Claims-owned operational incident | carrier loss/damage/problem identity and lifecycle |
| `moonsleep.carrier_case` | Claims-owned provider claim/case | external carrier case lifecycle; case events remain Facts/Observations |
| `moonsleep.carrier_recovery_receipt` | Claims-owned monetary recovery custody | received recovery and its Finance reconciliation state |

Native Finance and Fulfillment declarations can be added when a real
Observation or Core Graph target needs them. Registration imports their owner
address; it does not create parallel generic state.

## Proposed projected object schemas

The schemas below describe business state only. The four-table kernel already
stores canonical address, revision number, predecessor, declaration digest,
accepted-Observation custody, producer, contract, and commit time.

### 1. `moonsleep.product`

Business boundary: a stable MoonSleep product identity, such as MoonSpoon, not
a batch, color, supplier offer, or historical design state.

Identity:

| Field | Requirement | Meaning |
| --- | --- | --- |
| `product_id` | required string | Durable MoonSleep product reference. |

Attributes:

| Field | Type | Requirement |
| --- | --- | --- |
| `canonical_name` | string | required |
| `customer_display_name` | string or null | optional |
| `status` | string | required |
| `notes` | string or null | optional |

Relationships: none required initially.

Consolidates `product_family` and `supply_product_families`. The proposed final
business noun is Product, not Product Family, unless Tyler explicitly wants a
separate family layer.

### 2. `moonsleep.product_specification`

Business boundary: an independently released design/specification used by a
PO, supplier, manufacturing run, sample, or inspection. This is not generic
revision bookkeeping. Corrections to our knowledge of one released
specification create ordinary Object Revisions; a genuinely new released
specification receives a new specification identity.

Identity:

| Field | Requirement | Meaning |
| --- | --- | --- |
| `product_specification_id` | required string | Stable MoonSleep specification identity. |

Attributes:

| Field | Type | Requirement |
| --- | --- | --- |
| `label` | string | required |
| `status` | string | required |
| `effective_from` | timestamp or null | optional |
| `effective_through` | timestamp or null | optional |
| `approval_status` | string or null | optional |
| `change_summary` | string or null | optional |
| `technical_specification` | object | optional |
| `direct_requirements` | array of structured intrinsic or collapsed one-line requirements | optional |

`direct_requirements` is only for intrinsic, non-targetable finished-design
constraints or the collapsed one-line case. A composition with multiple
meaningful requirements, or one that is selected, approved, quoted, ordered,
executed, or independently targeted, becomes a Bill of Materials with
targetable BOM Lines.

Relationships:

| Relationship | Cardinality | Target |
| --- | --- | --- |
| `for_product` | required one | `moonsleep.product` |
| `uses_component_variant` | optional many; intrinsic/collapsed case only | `moonsleep.component_variant` |
| `uses_material_specification` | optional many; intrinsic/collapsed case only | `moonsleep.material_specification` |

Composition has one authority. Product Specification owns finished-design
constraints and intended behavior. BOM Lines own the exact selected
components, quantities, units, and assembly-specific requirements whenever a
genuine BOM exists. Component Variant owns the reusable physical option;
Material Specification owns supplier-scoped technical material truth. The
same exact composition must not be copied into Product Specification
`direct_requirements` or direct component/material relationships and BOM Lines.

Consolidates `product_revision`, “product version,” and simple one-line
pseudo-BOM content that merely repeats the specification. It deliberately
replaces `moonsleep.product_revision`; ordinary knowledge changes remain
generic Object Revisions.

### 3. `moonsleep.bill_of_materials`

Business boundary: one independently selected manufacturing composition for a
Product Specification. It may be approved, quoted, ordered, executed, reused,
or superseded without changing Product or Product Specification identity.

Identity: required stable `bill_of_materials_id` string. The related Product
Specification is a relationship, not identity material.

Attributes: required `label` and `status`; optional `effective_from`,
`effective_through`, `output_quantity`, `output_unit_of_measure`,
`approval_status`, `change_summary`, and `notes`.

Relationships:

| Relationship | Cardinality | Target |
| --- | --- | --- |
| `for_product_specification` | required one | `moonsleep.product_specification` |
| `supersedes` | optional one | `moonsleep.bill_of_materials` |

A correction to our knowledge of one composition creates an ordinary Object
Revision. Before outside use, a draft can be refined through revisions. After
selection, approval, quotation, order, execution, or other targeting, a
material component or quantity change creates a successor BOM identity. This
preserves exact historical targets without creating a BOM Revision type.

Consolidates genuine `product_bom_version` rows. The old version-shaped noun
is deleted after migration.

### 4. `moonsleep.bill_of_materials_line`

Business boundary: one independently targetable component/material requirement
inside a real Bill of Materials. It is justified because Quote Lines, Purchase
Plan requirements, and Purchase Order Lines target exact BOM Lines.

Identity: required parent `bill_of_materials_id` plus required
`line_reference`.

Attributes: required `description`, `quantity`, and `unit_of_measure`; optional
`component_role`, `requirement_specification`, and `notes`.

Relationships:

| Relationship | Cardinality | Target |
| --- | --- | --- |
| `part_of_bill_of_materials` | required one | `moonsleep.bill_of_materials` |
| `requires_component_variant` | optional one | `moonsleep.component_variant` |
| `uses_material_specification` | optional many | `moonsleep.material_specification` |

Consolidates genuine `product_bom_line` rows. A one-line pseudo-BOM with no
outside target collapses into Product Specification instead.

### 5. `moonsleep.component`

Business boundary: a reusable physical component identity, such as outer cover
or inner core, not a color/material option or a quantity in a PO.

Identity: required `component_id` string.

Attributes: required `canonical_name` and `status`; optional `component_role`,
`default_unit_of_measure`, `description`, and `notes`.

Relationships: none required initially.

Consolidates the canonical meaning of `inventory_components` while excluding
legacy generic classification columns.

### 6. `moonsleep.component_variant`

Business boundary: an independently stocked/ordered option of one Component,
such as an outer cover in Baby Pink, not a PO line or inventory balance.

Identity: required `component_id` and `variant_id` strings.

Attributes: required `display_name` and `status`; optional `option_values`,
`supplier_codes`, `sku_references`, `color_display_name`, and `notes`.

Relationships:

| Relationship | Cardinality | Target |
| --- | --- | --- |
| `of_component` | required one | `moonsleep.component` |
| `uses_material_specification` | optional many | `moonsleep.material_specification` |

Consolidates `inventory_registry_variants`, the older `inventory_variants`
language, and `product_colorway` by default. A separate Colorway object should
be created only if cross-product brand color identity needs independent
targeting beyond variant attributes.

### 7. `moonsleep.material_specification`

Business boundary: a supplier-scoped technical material identity used across
specifications, variants, POs, manufacturing, and inspection. Supplier “Ice
Silk” remains distinct from MoonSleep-facing “Satin.”

Identity: required stable `material_specification_id` string.

Attributes: required `supplier_material_name` and `status`; optional
`moonsleep_display_name`, `material_family`, `composition`, `weight_gsm`,
`technical_specification`, and `notes`.

Relationships: required `specified_by_supplier` to `nex.entity`.

Consolidates `supplier_material_specification`.

### 8. `moonsleep.supplier_quote`

Business boundary: one independently issued supplier commercial quotation.
Product and freight quotes share issuer, validity, currency, terms, line values,
and lifecycle; `quote_scope` preserves their business distinction without two
parallel infrastructures.

Identity: required stable `supplier_quote_id` string. Supplier reference is an
attribute/lookup key and issuer is a relationship.

Attributes:

| Field | Type | Requirement |
| --- | --- | --- |
| `supplier_quote_reference` | string or null | optional |
| `quote_scope` | `product`, `freight`, or `mixed` | required |
| `issued_at` | timestamp | required |
| `valid_through` | timestamp or null | optional |
| `status` | string | required |
| `currency` | ISO currency string | required |
| `incoterm_code` | string or null | optional |
| `transport_mode` | string or null | optional |
| `service_scope` | string or null | optional |
| `lead_time_days` | integer or null | optional |
| `transit_min_days` | integer or null | optional |
| `transit_max_days` | integer or null | optional |
| `quoted_total_minor_units` | integer or null | optional |
| `deposit_minor_units` | integer or null | optional |
| `terms` | object | optional |
| `packaging_options` | array of structured options | optional |

Relationships: required `issued_by_supplier` to `nex.entity`. Exact quoted
targets belong to Supplier Quote Lines.

Consolidates supplier product/freight quotation headers, packaging-option rows,
and freight-quote header fields previously copied onto POs. Commercially
meaningful lines are separate Supplier Quote Line objects.

### 9. `moonsleep.supplier_quote_line`

Business boundary: one independently targetable product, freight, service, or
packaging offer within a Supplier Quote. Planning and ordering select exact
options and price breaks rather than only the parent Quote.

Identity: required parent `supplier_quote_id` plus required `line_reference`.

Attributes: required `line_scope` and `description`; optional `quantity`,
`unit_of_measure`, `quantity_break_units`, `unit_price_minor_units`,
`quoted_amount_minor_units`, `carton_count`, `transit_min_days`,
`transit_max_days`, `delivery_to_address_included`,
`customs_clearance_included`, `duties_included`, `status`, and `notes`.
Currency remains on the parent Supplier Quote.

Relationships:

| Relationship | Cardinality | Target |
| --- | --- | --- |
| `part_of_supplier_quote` | required one | `moonsleep.supplier_quote` |
| `quotes_object` | optional one | any admitted registered target |

Consolidates `supplier_product_quotation_line`,
`supplier_freight_quotation_line`, and their table families. It avoids an
addressable JSON-child-path system.

### 10. `moonsleep.purchase_plan`

Business boundary: one procurement decision process that evaluates exact
requirements and commercial alternatives and may produce multiple Purchase
Orders. It can exist without an open communication Loop and can be concerned
by several Loops.

Identity: required stable `purchase_plan_id` string.

Attributes: required `title` and `status`; optional `opened_at`, `closed_at`,
`target_quantity`, `unit_of_measure`, `decision_summary`, structured `options`,
structured `requirements`, and `notes`.

Relationships:

| Relationship | Cardinality | Target |
| --- | --- | --- |
| `plans_for_product_specification` | optional one | `moonsleep.product_specification` |
| `requires_bill_of_materials_line` | optional many | `moonsleep.bill_of_materials_line` |
| `evaluates_supplier_quote_line` | optional many | `moonsleep.supplier_quote_line` |
| `results_in_purchase_order` | optional many | `moonsleep.purchase_order` |

Options remain structured decision content. Any exact manufacturing
requirement that identifies a BOM Line uses the typed relationship above; its
object ID is never hidden inside unvalidated `requirements` JSON.

Consolidates `purchase_plan`; its option, requirement, proposal, and join-table
families become content or relationships rather than peer object types.

### 11. `moonsleep.purchase_order`

Business boundary: one commercial order placed with one supplier under one
external PO reference. It is not a production run, shipment, lot, payment,
receipt, batch, capacity count, or revision row.

Identity: required stable external `purchase_order_id`, for example
`SWRC26004`, globally unique in the `moonsleep.purchase_order` namespace.
Supplier is a relationship, not identity material. A collision fails closed;
Supplier is never incorporated to manufacture a different identity.

Attributes:

| Field | Type | Requirement |
| --- | --- | --- |
| `provider_order_reference` | string or null | optional |
| `order_purpose` | `commercial` or `sample` | required |
| `ordered_at` | timestamp or null | optional |
| `status` | string | required |
| `status_effective_at` | timestamp or null | optional |
| `currency` | ISO currency string or null | optional until money is evidenced |
| `commercial_total_minor_units` | integer or null | optional |
| `payment_terms` | object | optional |
| `notes` | string or null | optional |

Relationships: required `placed_with_supplier` to `nex.entity`. Exact quote
provenance belongs on PO Lines through Supplier Quote Line relationships.

Exact ordered quantities, prices, selected variants, typed specification/BOM
relationships, and evidenced order-specific commercial deltas live on PO
Lines. Authoritative component composition remains on genuine BOM Lines.
Payments and balances live in Finance. Freight lives in Quote/Shipment.
Production, receipt, physical state, and capacity live in their respective
objects or SQL reads.

Consolidates `inventory_purchase_order`, `supply_order`,
`inventory_purchase_orders`, `sample_order`, `purchase_order_revision`, and
`purchase_order_adjustment`. There is no dedicated revision or adjustment
object and no permanent alias for the deleted names.

### 12. `moonsleep.purchase_order_line`

Business boundary: an independently targetable commercial line on a PO. It
carries ordered quantity, unit price, typed specification/BOM/quote
relationships, and any evidenced order-specific commercial delta needed by
production, shipment, receipt, inventory, and Finance allocation. It never
becomes the authority for a genuine BOM's component composition.

Identity: required Purchase Order identity material plus `line_reference`. Use
the supplier line reference when present; otherwise use a deterministic line
reference sealed by the accepted source evidence.

Attributes: required `description`, `quantity`, and `unit_of_measure`; optional
`status`, `unit_price_minor_units`, `currency`, `line_total_minor_units`,
`supplier_color_label`, and structured `order_specific_specification_delta`.
Any convenient full specification snapshot is a derived read, not duplicate
authoritative state.

Relationships:

| Relationship | Cardinality | Target |
| --- | --- | --- |
| `part_of_purchase_order` | required one | `moonsleep.purchase_order` |
| `orders_component_variant` | optional one | `moonsleep.component_variant` |
| `orders_product_specification` | optional one | `moonsleep.product_specification` |
| `uses_material_specification` | optional many | `moonsleep.material_specification` |
| `based_on_bill_of_materials_line` | optional one | `moonsleep.bill_of_materials_line` |
| `based_on_supplier_quote_line` | optional one | `moonsleep.supplier_quote_line` |

Consolidates `inventory_purchase_order_component`,
`purchase_order_component_line`, the `surewal-...-inner` mirror row, and their
inverse `contains`/`belongs_to` edge pairs. The final business term is Purchase
Order Line.

### 13. `moonsleep.product_experiment`

Business boundary: one persistent hypothesis-test-decision lifecycle. It is an
operational object even when no communication is open; source messages and
individual measurements remain evidence.

Identity: required stable `product_experiment_id` string.

Attributes: required `title`, `status`, and `hypothesis`; optional `method`,
`results`, `decision`, `opened_at`, `closed_at`, structured `alternatives`, and
`notes`.

Relationships: optional `experiments_on_product_specification`; optional-many
`uses_sample_article`; optional `results_in_product_specification`.

Consolidates `product_experiment`; `product_experiment_option` remains
structured content.

### 14. `moonsleep.inventory_lot`

Business boundary: an independently identifiable committed, produced,
in-transit, received, or physically counted cohort of one component variant.
It is not a generic plan, batch label, capacity pool, or ETA history row and
may exist before PO provenance is recovered.

Identity: required `inventory_lot_id`. Prefer a durable supplier lot reference;
otherwise derive a stable evidenced identity scoped to the PO Line.

Attributes: required `status` and `unit_of_measure`; optional
`supplier_lot_reference`, `committed_quantity`, `received_quantity`,
`usable_quantity`, `blocked_quantity`, `physical_status`,
`supplier_color_code`, `received_at`, and `notes`.

Relationships: optional `from_purchase_order_line`; required
`for_component_variant`; optional `stored_at_place` to `nex.place`.

Consolidates `inventory_purchase_order_lot` and independently identifiable
committed/physical run-component cohorts. A hypothetical planned quantity
stays on Purchase Plan, Purchase Order Line, Manufacturing Run planning state,
or accepted Observations. `planned_component_cohort` is not automatically a
Lot. ETA history is Observation evidence, not a Lot child object.

### 15. `moonsleep.sample_article`

Business boundary: one physical sample/prototype/approval/retained article.
Its status changes through inherent Object Revisions.

Identity: required `sample_article_id`.

Attributes: required `label`, `article_role`, `status`, and
`commercial_inventory`; optional `article_context`, `completed_at`,
`received_at`, and `notes`.

Relationships: optional `implements_product_specification`; optional
`ordered_on_purchase_order_line`; optional `located_at_place`.

Consolidates `sample_article`, `sample_article_status`, and
`product_prototype`. Sample Orders are POs with `order_purpose=sample`; sample
shipments are Supply Shipments with `shipment_purpose=sample`.

### 16. `moonsleep.manufacturing_run`

Business boundary: one supplier production execution lifecycle. It is
independent from commercial ordering, physical shipment, and receipt.

Identity: required stable `manufacturing_run_id` string. Supplier and facility
are relationships.

Attributes: required `status`; optional `supplier_run_reference`,
`status_effective_at`,
`planned_start_at`, `started_at`, `planned_completion_at`, `completed_at`,
`planned_quantity`, `finished_quantity`, `packed_quantity`,
`unit_of_measure`, `hold_reason`, `packing_status`, and `notes`.

Relationships: required `performed_by_supplier`; required-many
`executes_purchase_order`; optional `at_facility`; optional-many
`governed_by_product_specification`; optional-many
`uses_approval_sample_article`.

Consolidates `manufacturing_run`, top-level `production_schedule`, and schedule
state. Supplier schedule messages are Facts/Observations that revise this
object, not Schedule objects.

### 17. `moonsleep.manufacturing_run_component`

Business boundary: one independently targetable component workstream inside a
run. The Supplier chapters show outer and inner components progressing and
completing at different times, so this child currently clears the independent
lifecycle test.

Identity: required Manufacturing Run identity material plus
`workstream_reference`.

Attributes: required `status` and `unit_of_measure`; optional
`planned_quantity`, `finished_quantity`, `packed_quantity`,
`unpacked_finished_quantity`, `status_effective_at`, and `notes`.

Relationships: required `part_of_manufacturing_run`; required
`executes_purchase_order_line`; optional-many `consumes_inventory_lot`.

Consolidates `manufacturing_run_component`,
`manufacturing_run_component_cohort`, and production schedule lines.

### 18. `moonsleep.quality_inspection`

Business boundary: one independently issued inspection/quality-assessment
result. Findings, scope rows, and test results are content of the inspection,
not peer objects by default.

Identity: required stable `quality_inspection_id` string. Provider reference is
an attribute/lookup key and provider is a relationship.

Attributes: required `inspection_date`, `status`, and `overall_disposition`;
optional `provider_reference`, `issued_at`, `inspection_method`,
`inspection_scope`, `carton_count`, `sampled_quantities`, `severity_counts`,
`findings`, `test_results`, `repair_required`, and `notes`.

Relationships: required `performed_by`; required-many `inspects_object`
admitting Product Specification, Sample Article, Purchase Order, Manufacturing
Run, Inventory Lot, Supply Shipment, or another approved target; optional
`at_place`.

Consolidates inspection findings, scope lines, and test-result rows into one
queryable inspection revision.

### 19. `moonsleep.product_quality_case`

Business boundary: one investigation and disposition lifecycle for a product
quality concern. It may span samples, specifications, runs, lots, shipments,
inspections, and commitments and may exist with zero open communication.

Identity: required stable `product_quality_case_id` string.

Attributes: required `category`, `status`, and `opened_at`; optional `severity`,
`cause`, `batch_wide_effect`, `disposition`, `resolved_at`, and `notes`.

Relationships: required-many `concerns_object` admitting the affected Product,
Product Specification, Sample Article, Manufacturing Run, Inventory Lot, or
Supply Shipment; optional-many `supported_by_quality_inspection`; optional-many
`governed_by_commitment` to `nex.commitment`.

Consolidates `product_quality_case`. Related `nex.loop` objects point to the
case through `concerns`; they do not replace it.

### 20. `moonsleep.reconciliation_case`

Business boundary: one cross-domain discrepancy investigation spanning Supply,
Inventory, and Finance until a governing source and resolution are established.

Identity: required stable `reconciliation_case_id` string.

Attributes: required `category`, `status`, `discrepancy_summary`, and
`opened_at`; optional `governing_source`, `resolution`, `resolved_at`,
structured `measurements`, and `notes`.

Relationships: required-many `reconciles_object` admitting Purchase Order,
Supply Shipment, Interfacility Transfer, Facility Receipt, Inventory Lot,
Finance Invoice/Invoice Line, or Financial Transaction.

Consolidates `supply_reconciliation_case`; line rows become structured
measurements. Related Loops concern the case rather than acting as the case.

### 21. `moonsleep.supply_shipment`

Business boundary: one planned-to-physical movement of supply. Sample,
commercial, and transfer cargo use the same shipment lifecycle.

Identity: required stable `shipment_id` assigned when the evidenced movement
first becomes independently targetable. External booking, container, BOL,
PRO, and tracking references are mutable attributes, not identity material,
because they may not exist at planning time and may be corrected later.

Attributes:

| Field group | Required | Optional |
| --- | --- | --- |
| lifecycle | `shipment_purpose`, `status` | `status_effective_at` |
| carrier | — | `shipment_reference`, `carrier`, `service`, `transport_mode`, `vessel`, `voyage`, `container_number`, `tracking_references` |
| dates | — | `planned_departure_at`, `departed_at`, `planned_arrival_at`, `arrived_at`, `delivered_at` |
| cargo | — | `carton_count`, `weight`, `weight_unit`, intrinsic `cargo_lines`, `notes` |

Relationships: optional `origin_place`; optional-many `destination_place`;
optional-many `fulfills_purchase_order_line`; optional
`carries_sample_article`; optional-many `carries_inventory_lot`; optional
`part_of_joint_cargo_plan`; optional `realizes_interfacility_transfer`.

`cargo_lines` may retain intrinsic cargo summaries, but an exact Inventory Lot
reference is always the typed `carries_inventory_lot` relationship. Shared PO
Line provenance is never used to guess which Lot is in transit.

Consolidates `inventory_shipment`, `sample_shipment`, `supply_shipment_wave`,
shipment destination plans, shipment routing revisions, manifests and manifest
lines as Shipment state plus exact source Records. Milestones are Facts.

### 22. `moonsleep.joint_cargo_plan`

Business boundary: one stable consolidation plan coordinating several POs or
Shipments without collapsing their identities.

Identity: required `joint_cargo_plan_id`.

Attributes: required `status`; optional `planned_departure_at`,
`allocation_basis`, `destination_allocations`, `uncertainty_note`, and `notes`.

Relationships: optional-many `includes_purchase_order`; optional-many
`destination_place`. Supply Shipment stores `part_of_joint_cargo_plan`; the
inverse is derived.

Consolidates `joint_cargo_plan`, `supply_joint_cargo_plan`, and every membership
row. Membership is the typed relationship, not a new object.

### 23. `moonsleep.interfacility_transfer`

Business boundary: the authorized movement intent between two facilities. It
is separate from the physical Shipment that may realize it.

Identity: required `interfacility_transfer_id`, using the stable human transfer
reference. Carrier BOL/PRO values remain attributes.

Attributes: required `status`; optional `carrier`, `service_level`,
`bol_number`, `pro_number`, `pallet_count`, `carton_count`, `weight`,
`weight_unit`, `dimensions`, `picked_up_at`, `received_at`, and `notes`.

Relationships: optional `origin_place`; optional `destination_place`;
optional-many `moves_inventory_lot`. Supply Shipment stores
`realizes_interfacility_transfer`; the inverse is derived.

Consolidates the `supply_interfacility_transfer*` family. Transfer documents
remain Records and transfer events remain Facts/Observations.

### 24. `moonsleep.facility_receipt`

Business boundary: one receiving transaction at one facility. Partial receipt
progress is inherent history, not a Receipt Event object.

Identity: required stable `facility_receipt_id` string. Facility/provider
references are attributes or relationships.

Attributes: required `status`; optional `provider_receipt_reference`,
`received_at`, `physically_available_at`, `carrier`, `service`, `signed_by`,
`expected_carton_count`, `delivered_carton_count`, `component_lines`,
`reconciliation_status`, `usable_inventory_status`, and `notes`.

Relationships: required `received_at_place`; required `receives_movement`
targeting either Supply Shipment or Interfacility Transfer; optional-many
`creates_or_updates_inventory_lot`.

Consolidates Receipt, Receipt Line, Receipt Event, and Receipt Event Line.

## Deliberately not proposed as canonical objects

| Historical/proposed noun | Direct treatment |
| --- | --- |
| Product Family | folded into Product |
| Product Revision | renamed Product Specification because it is a released design artifact; generic knowledge changes remain Object Revisions |
| BOM Version | genuine recipes become Bill of Materials; version-shaped language is deleted because every BOM already has inherent revisions |
| Product Colorway | Component Variant attributes initially |
| Product Prototype | Sample Article with `article_role=prototype` |
| Product Experiment Option | structured content inside Product Experiment |
| Purchase Plan Option / Requirement | structured content and typed relationships inside Purchase Plan |
| Sample Order / Status | Purchase Order with `order_purpose=sample`; inherent revisions |
| Production Planning Profile / Stage | governed configuration Record and read model, not business identity by default |
| Production Schedule / Line | Manufacturing Run and Run Component planned-state Observations |
| Reconciliation Case Line | structured measurements inside Reconciliation Case |
| Shipment Manifest / Line | exact document Record plus structured Shipment cargo state |
| Transport Document | exact Record attached to Shipment/Transfer/Receipt evidence |
| Transport Milestone | Fact/Observation revising Shipment |
| Receipt Event / Line | Fact/Observation revising Receipt |
| Facility snapshots and lines | Facts/Observations plus derived SQL reads |
| Supplier capture checkpoint | operational receipt only |
| Supply manifest observation | Observation, not another wrapper object |

This remains a large simplification from the earlier packet-shaped candidate
lists. A deferred noun can be promoted later without redesigning the four-table
kernel, but only after independent identity, lifecycle, targeting, and a real
consumer are proven.

## Purchase Order field relocation

The packet corpus attached more than sixty fields to
`inventory_purchase_order`. The following relocations are deliberate; an
absent field is not silently discarded.

| Historical PO field group | Exact fields | Final owner |
| --- | --- | --- |
| identity | `supplier_reference` | globally unique `purchase_order_id` in the `moonsleep.purchase_order` namespace; Supplier remains a relationship; collision fails closed |
| provider contract | `provider_order_reference` | Purchase Order attribute |
| core commercial header | `ordered_at`, `status`, `status_effective_at`, `currency`, `commercial_total_minor_units` | Purchase Order attributes |
| misleading header quantity | `ordered_set_quantity` | derived SQL over PO Lines when units are compatible; not authoritative header truth |
| component quantities and allocation | `outer_cover_quantity`, `inner_cover_quantity`, `variant_allocation_state` | Purchase Order Lines and Inventory Lots |
| product/spec references | `governing_product_revision_id`, `governing_revision_id` | typed relationships from PO Lines to Product Specification |
| revision pointer | `current_revision_id` | generic canonical-object kernel only |
| freight quote and transport | `initial_freight_minor_units`, `freight_estimate_minor_units`, `freight_deposit_minor_units`, `freight_included`, `freight_state`, `freight_quote_state`, `final_freight_amount_state`, `shipment_2_freight_state`, `current_freight_quotation_id`, `supplier_funded_freight_selected`, `freight_estimate_state` | Supplier Quote and Supply Shipment revisions |
| payment and settlement | `deposit_minor_units`, `deposit_principal_minor_units`, `deposit_percent`, `second_payment_percent`, `final_payment_percent`, `paid_product_minor_units`, `outstanding_product_minor_units`, `remaining_product_principal_minor_units`, `remaining_under_revision_minor_units`, `wire_fee_minor_units`, `processing_fee_minor_units`, `total_initial_payment_minor_units`, `supplier_receipt_state`, `balance_minor_units`, `deposit_state`, `product_gross_minor_units`, `product_principal_minor_units`, `final_payment_percent` | Finance Transaction, Invoice, Payment Order, and Payment Allocation |
| credit/correction | `product_credit_minor_units` | a new PO revision when the legal commercial agreement changes; Finance allocation when only settlement changes |
| production | `manufacturing_run_id`, `production_state`, `grey_fabric_state`, `inner_fabric_progress_state`, `planned_completion_date`, `planned_completion_window_start`, `planned_completion_window_end`, `planned_completion_state`, `planned_completion_evidence_state` | Manufacturing Run, Run Component, and accepted schedule Observations |
| physical state | `strongest_physical_state` | derived SQL over Shipment, Receipt, and Lot |
| capacity | `complete_pillow_capacity`, `cover_only_capacity` | derived SQL over PO Lines, Lots, and fulfillment reservations |
| cohort/display | `accounting_cohort_alias`, `batch_label` | contextual read/display projection; never PO identity |
| authority | `action_authority`, `customer_promise_authority` where present | operation/policy boundary; not projected object state |
| historical arithmetic | `initial_total_minor_units`, `remaining_under_revision_minor_units`, `product_quantity_changed_by_freight_revision` | recomputed from exact PO revisions and Finance state; not copied current truth |

The same rule applies to `purchase_order_revision`: quantities and prices move
to the corresponding PO Line revision, commercial header changes append a PO
revision, freight moves to Quote/Shipment, and settlement moves to Finance.
`revision_ordinal`, `revision_state`, `supersedes_purchase_order_revision_id`,
and `revision_of` disappear into generic revision lineage.

## Canonical relationship direction

Every relationship uses the existing generic object relationship content:

```text
subject address + predicate + target address
  + optional effective interval/state/qualifiers
  + supporting accepted Observations
```

This is a declaration convention, not a second relationship framework or
table. Any registered object can be an endpoint when admitted by the
declaration. Only the following direction is published. Reverse traversal is
an ordinary SQL/Core Graph query, not a second stored assertion.

| Subject | Relationship | Target |
| --- | --- | --- |
| Product Specification | `for_product` | Product |
| Product Specification | `uses_component_variant` | Component Variant, set-valued; intrinsic/collapsed case only |
| Product Specification | `uses_material_specification` | Material Specification, set-valued; intrinsic/collapsed case only |
| Bill of Materials | `for_product_specification` | Product Specification |
| Bill of Materials | `supersedes` | Bill of Materials |
| Bill of Materials Line | `part_of_bill_of_materials` | Bill of Materials |
| Bill of Materials Line | `requires_component_variant` | Component Variant |
| Bill of Materials Line | `uses_material_specification` | Material Specification |
| Component Variant | `of_component` | Component |
| Component Variant | `uses_material_specification` | Material Specification |
| Material Specification | `specified_by_supplier` | `nex.entity` |
| Supplier Quote | `issued_by_supplier` | `nex.entity` |
| Supplier Quote Line | `part_of_supplier_quote` | Supplier Quote |
| Supplier Quote Line | `quotes_object` | admitted registered target |
| Purchase Plan | `plans_for_product_specification` | Product Specification |
| Purchase Plan | `requires_bill_of_materials_line` | Bill of Materials Line, set-valued |
| Purchase Plan | `evaluates_supplier_quote_line` | Supplier Quote Line, set-valued |
| Purchase Plan | `results_in_purchase_order` | Purchase Order, set-valued |
| Purchase Order | `placed_with_supplier` | `nex.entity` |
| Purchase Order Line | `part_of_purchase_order` | Purchase Order |
| Purchase Order Line | `orders_component_variant` | Component Variant |
| Purchase Order Line | `orders_product_specification` | Product Specification |
| Purchase Order Line | `uses_material_specification` | Material Specification, set-valued |
| Purchase Order Line | `based_on_bill_of_materials_line` | Bill of Materials Line |
| Purchase Order Line | `based_on_supplier_quote_line` | Supplier Quote Line |
| Product Experiment | `experiments_on_product_specification` | Product Specification |
| Product Experiment | `uses_sample_article` | Sample Article, set-valued |
| Product Experiment | `results_in_product_specification` | Product Specification |
| Inventory Lot | `from_purchase_order_line` | Purchase Order Line |
| Inventory Lot | `for_component_variant` | Component Variant |
| Inventory Lot | `stored_at_place` | `nex.place` |
| Sample Article | `implements_product_specification` | Product Specification |
| Sample Article | `ordered_on_purchase_order_line` | Purchase Order Line |
| Sample Article | `located_at_place` | `nex.place` |
| Manufacturing Run | `executes_purchase_order` | Purchase Order, set-valued |
| Manufacturing Run | `performed_by_supplier` | `nex.entity` |
| Manufacturing Run | `at_facility` | `nex.place` |
| Manufacturing Run | `governed_by_product_specification` | Product Specification, set-valued |
| Manufacturing Run | `uses_approval_sample_article` | Sample Article, set-valued |
| Manufacturing Run Component | `part_of_manufacturing_run` | Manufacturing Run |
| Manufacturing Run Component | `executes_purchase_order_line` | Purchase Order Line |
| Manufacturing Run Component | `consumes_inventory_lot` | Inventory Lot, set-valued |
| Quality Inspection | `performed_by` | `nex.entity` |
| Quality Inspection | `inspects_object` | admitted specification/sample/order/run/lot/shipment target |
| Quality Inspection | `at_place` | `nex.place` |
| Product Quality Case | `concerns_object` | admitted product/specification/sample/run/lot/shipment target, set-valued |
| Product Quality Case | `supported_by_quality_inspection` | Quality Inspection, set-valued |
| Product Quality Case | `governed_by_commitment` | `nex.commitment`, set-valued |
| Reconciliation Case | `reconciles_object` | admitted Supply/Inventory/Finance target, set-valued |
| Supply Shipment | `fulfills_purchase_order_line` | Purchase Order Line, set-valued |
| Supply Shipment | `carries_inventory_lot` | Inventory Lot, set-valued |
| Supply Shipment | `origin_place` / `destination_place` | `nex.place` |
| Supply Shipment | `carries_sample_article` | Sample Article |
| Supply Shipment | `part_of_joint_cargo_plan` | Joint Cargo Plan |
| Joint Cargo Plan | `includes_purchase_order` | Purchase Order, set-valued |
| Joint Cargo Plan | `destination_place` | `nex.place`, set-valued |
| Interfacility Transfer | `origin_place` / `destination_place` | `nex.place` |
| Interfacility Transfer | `moves_inventory_lot` | Inventory Lot, set-valued |
| Supply Shipment | `realizes_interfacility_transfer` | Interfacility Transfer |
| Facility Receipt | `received_at_place` | `nex.place` |
| Facility Receipt | `receives_movement` | Supply Shipment or Interfacility Transfer |
| Facility Receipt | `creates_or_updates_inventory_lot` | Inventory Lot, set-valued |
| Finance Payment Allocation | `pays_purchase_order` | Purchase Order |
| `nex.loop` | `concerns` | any admitted projected/native domain object |
| Carrier Case | `for_carrier_incident` | Carrier Incident |
| Carrier Recovery Receipt | `settles_carrier_case` | Carrier Case, set-valued |
| Carrier Recovery Receipt | `reconciles_invoice_line` | Finance Invoice Line, set-valued |

Existence and operational readiness remain separate:

- a planned Shipment may exist without route endpoints, but departure requires
  both origin and destination;
- an independently identifiable committed or physical Inventory Lot may exist
  before Purchase Order provenance is recovered, but a hypothetical quantity
  plan is not a Lot;
- a Sample Article may exist before its Product Specification is known;
- a Quality Inspection may target a Sample, Specification, Lot, Run, Order, or
  Shipment without inventing parallel predicates or requiring a PO;
- a Purchase Order may exist without currency when no commercial amount has
  yet been evidenced.

Delete `current_revision`, `has_revision`, `revision_of`, target-noun-specific
supersession duplicates, `contains_component_line`,
`belongs_to_purchase_order` duplicates,
`purchase_order_has_lot`, `has_quote_line`, `belongs_to_freight_quotation`, and
membership-object edges whose only purpose is to encode the inverse or generic
history.

## Exhaustive 86-type semantic disposition

The exhaustive observed field and outbound-relationship inventory is in
[`supplier-historical-resource-fields-relationships-appendix-2026-08-25.md`](supplier-historical-resource-fields-relationships-appendix-2026-08-25.md).
It contains all 1,183 unique type/field pairs and all 160 unique outbound
type/relationship pairs. This table supplies the final semantic destination.

| Historical Resource type | Final disposition |
| --- | --- |
| `facility_fulfillment_snapshot` | Facts/Observations targeting Place, Facility Facet, or Fulfillment owner; derived SQL read |
| `facility_fulfillment_snapshot_line` | structured Fact values; no object |
| `facility_inventory_snapshot` | physical-count Facts/Observations targeting Place; inventory owner applies authorized stock effects |
| `facility_inventory_snapshot_line` | structured count Facts; no object |
| `facility_receipt` | `moonsleep.facility_receipt` |
| `facility_receipt_event` | Receipt revision support Fact/Observation |
| `facility_receipt_event_line` | Receipt component content plus Facts |
| `facility_receipt_line` | embedded `component_lines` on Facility Receipt |
| `facility_throughput_snapshot` | Facts/Observations plus derived read |
| `financial_transaction` | reuse Finance-owned `moonsleep.financial_transaction` |
| `interfacility_transfer` | `moonsleep.interfacility_transfer` |
| `interfacility_transfer_document` | immutable Record evidence |
| `interfacility_transfer_event` | Transfer revision support Fact/Observation |
| `inventory_purchase_order` | `moonsleep.purchase_order`; delete old term |
| `inventory_purchase_order_component` | `moonsleep.purchase_order_line`; delete old term |
| `inventory_purchase_order_lot` | `moonsleep.inventory_lot` |
| `inventory_shipment` | `moonsleep.supply_shipment`; delete old term after migration |
| `joint_cargo_plan` | `moonsleep.joint_cargo_plan` |
| `joint_cargo_plan_membership` | typed relationships; no object |
| `manufacturing_run` | `moonsleep.manufacturing_run` |
| `manufacturing_run_component` | `moonsleep.manufacturing_run_component` |
| `manufacturing_run_component_cohort` | Run Component revision plus Inventory Lot relationships |
| `nex.commitment` | reuse owner-native `nex.commitment` |
| `nex.contact` | reuse owner-native `nex.contact` |
| `nex.entity` | reuse owner-native `nex.entity` |
| `nex.facet_attachment` | reuse owner-native Facet Attachment |
| `nex.loop` | reuse owner-native `nex.loop` |
| `nex.place` | reuse owner-native `nex.place` |
| `payment_application` | reuse Finance Payment Allocation plus `pays_purchase_order` relationship |
| `planned_component_cohort` | hypothetical state to Purchase Plan/PO Line/Manufacturing Run Observation; only an independently identified committed/physical cohort becomes an Inventory Lot |
| `product_bom_line` | genuine line to `moonsleep.bill_of_materials_line`; one-line pseudo-BOM content to Product Specification; delete old term |
| `product_bom_version` | `moonsleep.bill_of_materials`; delete version-shaped type language |
| `product_colorway` | Component Variant attributes initially |
| `product_component_variant_rule` | intrinsic/collapsed-one-line constraint to Product Specification; exact composition to BOM Line when a genuine BOM exists |
| `product_experiment` | `moonsleep.product_experiment` |
| `product_experiment_option` | structured alternative content on Product Experiment |
| `product_family` | `moonsleep.product` |
| `product_prototype` | `moonsleep.sample_article` with prototype role |
| `product_quality_case` | `moonsleep.product_quality_case`; Loops may concern it |
| `product_revision` | `moonsleep.product_specification`; delete revision-shaped type language |
| `production_planning_profile` | governed configuration Record/read model; no object initially |
| `production_planning_stage` | embedded configuration content |
| `production_schedule` | Manufacturing Run planned-state Observations |
| `production_schedule_line` | Manufacturing Run Component planned-state Observations |
| `purchase_order_adjustment` | accepted change Fact/Observation or Finance allocation; no object |
| `purchase_order_component_line` | `moonsleep.purchase_order_line` |
| `purchase_order_payment_link` | Finance Payment Allocation relationship; no Supply object |
| `purchase_order_revision` | inherent Purchase Order Object Revision; delete type |
| `purchase_plan` | `moonsleep.purchase_plan`; Loops may concern it |
| `purchase_plan_option` | structured planning-decision content on Purchase Plan |
| `purchase_plan_requirement` | structured Purchase Plan content plus explicit `requires_bill_of_materials_line` typed targets when an exact BOM Line is named |
| `quality_inspection` | `moonsleep.quality_inspection` |
| `quality_inspection_finding` | embedded Quality Inspection finding |
| `quality_inspection_scope_line` | embedded Quality Inspection scope |
| `quality_inspection_test_result` | embedded Quality Inspection test result |
| `sample_article` | `moonsleep.sample_article` |
| `sample_article_status` | inherent Sample Article Object Revision; delete type |
| `sample_order` | `moonsleep.purchase_order` with sample purpose |
| `sample_order_line` | `moonsleep.purchase_order_line` |
| `sample_order_status` | inherent Purchase Order Object Revision; delete type |
| `sample_payment_report` | payment evidence plus Finance-owned transaction/allocation |
| `sample_shipment` | `moonsleep.supply_shipment` with sample purpose |
| `shipment_destination_plan` | planned Supply Shipment/Joint Cargo revision state |
| `shipment_destination_plan_line` | destination relationships plus embedded allocation values |
| `shipment_manifest` | source Record plus intrinsic Supply Shipment `cargo_lines`; exact Lot membership is typed; no object initially |
| `shipment_manifest_line` | intrinsic Shipment cargo summary; exact Lot membership is typed |
| `shipment_routing_revision` | inherent Supply Shipment Object Revision; delete type |
| `shipment_routing_revision_line` | reroute Fact plus destination relationship change |
| `supplier_capture_checkpoint` | operational receipt only; delete from active business vocabulary |
| `supplier_freight_quotation` | `moonsleep.supplier_quote` with freight scope |
| `supplier_freight_quotation_line` | `moonsleep.supplier_quote_line`; delete old family name |
| `supplier_material_specification` | `moonsleep.material_specification` |
| `supplier_product_quotation` | `moonsleep.supplier_quote` with product scope |
| `supplier_product_quotation_line` | `moonsleep.supplier_quote_line`; delete old family name |
| `supplier_product_quotation_packaging_option` | embedded Supplier Quote packaging option |
| `supplier_shipment_schedule` | source Record and Facts revising planned Shipment/Run state |
| `supplier_shipment_schedule_line` | structured schedule Facts; no identity |
| `supply_component_supply_link` | typed Lot/PO Line/fulfillment relationship; no object |
| `supply_joint_cargo_plan` | `moonsleep.joint_cargo_plan`; delete duplicate term |
| `supply_manifest_observation` | direct Observation targeting Shipment/Transfer/Receipt; delete wrapper |
| `supply_reconciliation_case` | `moonsleep.reconciliation_case`; Loops may concern it |
| `supply_reconciliation_case_line` | structured measurements on Reconciliation Case; no line object |
| `supply_shipment_wave` | planned `moonsleep.supply_shipment`; delete duplicate family |
| `supply_shipment_wave_destination_observation` | destination-allocation Observation and relationship evidence |
| `transport_document` | immutable Record evidence attached to Shipment/Transfer/Receipt |
| `transport_milestone` | timed Fact/Observation revising Shipment |

Coverage assertion: 86 historical Resource types entered; 86 dispositions
present; zero unclassified types.

## Names removed from final semantic language

The following are not permanent aliases. A bounded historical compiler may
recognize one only long enough to emit the canonical target; recognition code
is deleted after exact target parity.

```text
inventory_purchase_order
supply_order
inventory_purchase_orders
inventory_purchase_order_component
purchase_order_component_line
purchase_order_revision
purchase_order_adjustment
product_revision
product version
product_bom_version
product_bom_line
supplier_product_quotation_line
supplier_freight_quotation_line
sample_order
sample_order_status
sample_article_status
inventory_shipment
sample_shipment
supply_shipment_wave
supply_joint_cargo_plan
shipment_routing_revision
facility_receipt_event
transport_milestone
supply_manifest_observation
supply_reconciliation_case
moonsleep.communication_loop
moonsleep.commitment
```

`PO` remains human search shorthand only. It is not stored as a type ID or
accepted semantic alias.

## Extinction ledger

Deletion happens inside each dependency-closed vertical slice after canonical
value is live, the complete family is migrated, its real producers and
consumers have moved, and ordinary parity readback passes. The final track-wide
closure is a zero-result audit, not a deferred cleanup phase.

Every tracked legacy surface must carry these fields during execution:

| Legacy surface | Canonical destination | Producers | Consumers | Data migrated | Producer removed | Consumers removed | Database removed | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| exact table/view/API/alias/compiler branch | approved object/native/evidence/SQL destination | named real writers | named real readers | yes/no | yes/no | yes/no | yes/no | reviewed / declaration live / canonical published / history migrated / consumers migrated / physically deleted (extinct) |

Source-only existence is not production proof. A fresh production caller/data
census identifies the exact rows and callers before deletion. Once authorized,
deletion uses the ordinary migration/release, normal backup/rollback, and normal
health readback—not a parallel cryptographic release system.

### Live Inventory sources: migrate the family, then make superseded surfaces extinct

| Current relation | Current material fields | Canonical destination | Why it cannot be dropped immediately |
| --- | --- | --- | --- |
| `inventory_purchase_orders` | `po_id`, `sku_key`, `batch_key`, `supplier_name`, `units_ordered`, `ordered_at`, `status`, `unit_cost`, `currency`, `notes` | Purchase Order plus PO Lines and Supplier relationship | many Inventory, Supply, Dispatch, Order Journey, UI, and reconciliation callers |
| `inventory_purchase_order_lots` | `lot_id`, `po_id`, SKU/variant, units, ship mode, ETA/confidence, status, notes | Inventory Lot plus Shipment/Observation state | allocation, Dispatch, Supply, and receipt callers |
| `inventory_purchase_order_lot_eta_history` | Lot/PO/SKU, ETA values, confidence, source, recorded time | accepted timing Facts/Observations | timeline consumers require parity first |
| `inventory_shipments` | shipment/PO, destination, carrier/vessel, tracking, ETD/ETA/arrival, status, manifest | Supply Shipment | receipt, stock, allocation, Dispatch, Order Journey, transport callers |
| `inventory_stock_events` | component/variant/node quantity event, Shipment, Facility, PO, Batch, receipt/count evidence, time | append-only owner event plus Facts | remains Inventory action custody; never a mutable canonical object |
| `inventory_components` | component key, label, legacy classification, notes | Component | shared Registry/Stock/Allocation/Quota/Dispatch/Shopify callers |
| `inventory_registry_variants` | variant/component, label, options, supplier/channel IDs, SKU, status | Component Variant | shared Inventory and channel callers |
| older `inventory_variants` / `inventory_skus` | planner identities and compatibility fields | one reviewed Component/Variant vocabulary | real readers still exist; reconcile before extinction |
| `inventory_physical_count_sessions` / `inventory_physical_count_lines` | facility, time, reporter, component/variant, units, condition | count workflow plus accepted Observations | preserve operational workflow; exclude from object registry |

The canonical vocabulary changes first. Physical owner storage changes only
after each real writer/reader moves; a route name never dictates the canonical
object type.

### Duplicate identity/facility schema: bind to Nex owners, then make it extinct

```text
supply_organizations
supply_people
supply_contact_methods
supply_facilities
supply_facility_locations
supply_facility_contact_assignments
supply_organization_relationships
supply_component_suppliers
supply_facility_node_mappings
```

These fold into Entity, Contact, Place, Facets, and typed relationships. Supply
readers must move before the physical tables disappear.

### Table-per-type commercial schema: migrate any retained data, then delete

Current source has an installer and tests but no non-test application
reader/writer for this family. That makes it a strong deletion candidate, but
a fresh production row census is still required.

```text
supply_product_families
supply_product_revisions
supply_product_prototypes
supply_product_bom_versions
supply_product_bom_lines
supply_product_experiments
supply_product_experiment_options
supply_supplier_product_quotations
supply_supplier_product_quotation_lines
supply_supplier_product_quotation_packaging_options
supply_supplier_freight_quotations
supply_supplier_freight_quotation_lines
supply_purchase_plans
supply_purchase_plan_options
supply_purchase_plan_requirements
supply_purchase_plan_product_quote_lines
supply_purchase_plan_freight_quote_lines
supply_purchase_plan_proposals
supply_purchase_plan_purchase_orders
supply_sample_orders
supply_sample_order_lines
supply_sample_order_status_history
supply_sample_order_payment_reports
supply_sample_articles
supply_sample_article_status_history
```

Destination: the 24-object model, native owners, structured parent attributes,
relationships, and Facts. Dedicated `_revisions`, `_status_history`, `_options`, and
line-table families do not become canonical type families.

### PO/cargo/schedule/transfer/transport compatibility schema

```text
supply_purchase_order_proposals
supply_purchase_order_proposal_sources
supply_purchase_order_payment_links
supply_joint_cargo_plans
supply_joint_cargo_purchase_orders
supply_joint_cargo_destinations
supply_joint_cargo_sources
supply_shipment_waves
supply_shipment_wave_destination_observations
supply_joint_cargo_wave_memberships
supply_supplier_shipping_schedule_entries
supply_supplier_schedule_shipment_links
supply_supplier_schedule_wave_links
supply_component_supply_links
supply_manifest_observations
supply_interfacility_transfers
supply_interfacility_transfer_events
supply_interfacility_transfer_documents
supply_transport_source_captures
supply_vessel_identities
supply_vessel_identity_evidence
supply_shipment_vessel_assignments
supply_vessel_observations
supply_transport_milestones
```

Destinations are Purchase Order, Supplier Quote, Joint Cargo Plan, Supply
Shipment, Interfacility Transfer, native Finance allocations, Records,
Facts/Observations, and relationships. `supply_joint_cargo_plans` currently has
an ordinary reader, and the transfer/schedule families have Supply callers, so
their deletion needs bounded consumer migration. Vessel identity may later
belong to a native Transport owner; the Supplier packets do not justify a
MoonSleep Vessel declaration.

### Evidence/adoption/projection schema: freeze new dependencies and remove after producer parity

These are not business objects. They duplicate parts of Records, Facts,
Observations, canonical revisions, or publication receipts. No new dependency
may be added. Each family is deleted after its historical compiler/current
producer reaches ordinary data parity and named consumers have moved; this
object-model review itself does not authorize a production deletion.

```text
evidence_source_records
evidence_source_record_relations
evidence_record_fragments
evidence_episodes
evidence_episode_records
evidence_episode_seals
evidence_fact_assertions
evidence_fact_support
evidence_fact_episode_memberships
evidence_domain_field_links
evidence_resource_attribute_observation_links
evidence_resource_relationship_observation_links
evidence_nex_resource_refs
evidence_nex_entity_identity_bindings
evidence_nex_observation_refs
evidence_nex_semantic_adoption_receipts
evidence_nex_semantic_adoption_observations
evidence_resource_projection_receipt_nex_observations
evidence_resource_projection_target_readbacks
evidence_resource_target_adapter_deployment_receipts
evidence_resource_target_adapter_schema_migrations
supply_observations
supply_observation_fact_inputs
supply_observation_input_sets
supply_observation_relations
supply_adoption_source_records
supply_adoption_source_record_relations
supply_adoption_record_fragments
supply_adoption_fact_assertions
supply_adoption_fact_support
supply_adoption_domain_field_links
supply_adoption_observations
supply_adoption_observation_inputs
supply_adoption_observation_relations
supply_adoption_projection_receipts
supply_adoption_coverage_scopes
supply_adoption_coverage_instances
supply_adoption_coverage_proofs
supply_projection_receipts
supply_projection_receipt_observations
supply_projection_publications
supply_projection_receipt_coverage_scopes
supply_projection_receipt_coverage_instances
supply_projection_receipt_coverage_proofs
supply_provenance_field_registry
supply_provenance_coverage_contract
supply_provenance_coverage_requirements
supply_provenance_adoption_receipts
supply_nex_evidence_projection_items
supply_nex_evidence_projection_bindings
supply_nex_semantic_terminal_receipts
supply_nex_semantic_orchestrator_receipts
supply_nex_semantic_sync_receipts
supply_partner_event_proposals
supply_partner_event_proposal_sources
supply_partner_event_review_decisions
supply_partner_events
supply_partner_event_purchase_orders
supply_partner_event_lots
supply_partner_event_joint_cargo
supply_partner_event_shipments
supply_partner_event_nodes
supply_partner_event_obligations
supply_partner_event_interfacility_transfers
```

### Packet-only nouns with no owner table

These disappear from the model without moving live table complexity:

```text
purchase_order_revision
purchase_order_adjustment
inventory_purchase_order_component
sample_article_status
sample_order_status
shipment_routing_revision
facility_receipt_event
transport_milestone
supply_manifest_observation
```

## Ordinary SQL business value

The 24 schemas do not require 24 physical tables or generated views. Current
state remains one indexed join from stable identity to its current immutable
revision:

```sql
SELECT
  object.object_type_id,
  object.canonical_object_id,
  object.identity_json,
  revision.revision_id,
  revision.revision_number,
  revision.attributes_json,
  revision.relationships_json,
  revision.supporting_observations_json,
  revision.committed_at
FROM nex_runtime.canonical_objects AS object
JOIN nex_runtime.canonical_object_revisions AS revision
  ON revision.revision_id = object.current_revision_id;
```

History remains:

```sql
SELECT *
FROM nex_runtime.canonical_object_revisions
WHERE object_type_id = 'moonsleep.purchase_order'
  AND canonical_object_id = $1
ORDER BY revision_number;
```

Product, supplier, PO status, date, and money filters can query JSONB directly.
Only measured hot workloads receive a deliberate expression or GIN index.
Typed generated views, activation tables, and duplicate current-state copies
are not prerequisites for publication, resolution, history, or SQL reporting.

## Registry corrections across the first Product-to-PO slice

The source v2 registry validates mechanically, but its 23 entries are not the
approved catalog. The following work occurs across the first slice's separately
terminal transactions; post-cutover language deletion is not a prerequisite
for the earlier canonical publication transaction:

1. replace `moonsleep.product_revision` with the reviewed Product/Product
   Specification decision;
2. normalize retained identity schemas around stable object IDs—including
   Purchase Order, Supplier Quote, Material Specification, Manufacturing Run,
   Quality Inspection, and Facility Receipt—while Supplier, facility, and
   provider remain relationships;
3. replace `moonsleep.purchase_order` field shape with the narrow header above;
4. rename `moonsleep.purchase_order_component_line` to
   `moonsleep.purchase_order_line`;
5. remove `inventory_purchase_order`, `supply_order`,
   `inventory_purchase_order_component`, and other deleted legacy terms from
   permanent runtime input language after the one bounded producer cutover;
6. replace `product_bom_version` / genuine `product_bom_line` with Bill of
   Materials / BOM Line and collapse only proven one-line pseudo-BOMs;
7. add only Supplier Quote Line and Purchase Plan—including
   `requires_bill_of_materials_line`—for the first Product-to-PO slice;
8. remove revision-shaped bookkeeping and duplicate inverse relationships;
9. leave Product Experiment, Product Quality Case, Reconciliation Case, and all
   other reviewed types undeclared until their own slices; do not bulk-register
   the catalog merely because the compiler accepts it.

The generic four-table kernel, `objects.publish_revision`,
`objects.resolve_many`, accepted-Observation verification, relationship-target
validation, owner resolvers, registry history, and declaration history remain.
Generated typed views, duplicate current-state/materialization tables, or a new
schema migration per type are not prerequisites for the vertical slices.

## Business-value execution loop

Each batch is a dependency-closed vertical slice. Semantic review may run ahead,
but only one implemented compatibility transition for the exact object family
and conflicting resource set remains open at a time; disjoint production work
is not globally serialized.

The slice is one business outcome, not one deployment. Declaration/release,
canonical publication, historical migration, consumer migration, and physical
legacy deletion are separately terminal governed transactions. Each one ends
with its ordinary tests/readback and releases custody before the next begins;
no deployment, lock, rollback marker, or bespoke proof packet spans the whole
slice.

Before implementation, Tyler approves identity, fields, relationship
direction, inherent-revision versus successor-object boundary, old-field
disposition, named producers/consumers, exact deletion list, and two to five
ordinary SQL questions. The separately terminal implementation transactions
are then:

| Transaction | Terminal outcome |
| --- | --- |
| declaration/release | only the approved type declarations and relationships are live; runtime health/readback complete |
| canonical publication | at least two real accepted-Observation-backed objects publish through `objects.publish_revision`; current SQL, history SQL, `objects.resolve_many`, and one real workflow/query pass |
| historical migration | the bounded existing Records/Facts/Observations compile to canonical objects; producer cutover and ordinary count/`EXCEPT` parity complete |
| consumer migration | every named reader uses the canonical surface; any temporary dual-read is removed |
| physical legacy deletion | aliases, writers/readers, compiler/decoder branches, recreating schemas, prompts, docs, and eligible tables are removed through the standard release process |

After the fifth transaction, read the business query in production and run one
bounded census over database catalogs, source, runtime vocabulary, producers,
consumers, jobs, prompts, and APIs. Close the logical slice only at zero active
legacy surfaces.

Keep proof proportional: normal unit/integration tests, one disposable
PostgreSQL migration test, explicit caller census, ordinary SQL parity,
standard backup/rollback, health checks, and production query readback. Do not
create signed migration packets, custom digest protocols, candidate selector
systems, per-object cleanrooms, a bespoke registry-activation framework,
cross-track release gates, or bespoke receipt hierarchies.

## Vertical-slice order

1. **Product-to-PO trace:** Product, Product Specification, genuine BOM/BOM
   Lines, Supplier Quote/Quote Lines, Purchase Plan where evidenced, Purchase
   Order `SWRC26004`, and PO Lines, plus native Supplier Entity.
2. **Product development and cases:** Product Experiment, Sample Article,
   Product Quality Case, and Reconciliation Case.
3. **Manufacturing and quality:** Inventory Lot, Manufacturing Run, Run
   Component, and Quality Inspection.
4. **Movement and receipt:** Supply Shipment, Joint Cargo Plan, Interfacility
   Transfer, and Facility Receipt.
5. **Native Claims/Finance expansion:** Carrier Incident, Carrier Case,
   Carrier Recovery Receipt, and Invoice Line owner registrations when first
   targeted.
6. **Track-wide zero audit:** verify shared evidence/adoption machinery and
   every other superseded surface are gone. This step discovers zero work; it
   does not hold deferred deletion.

The first implementation batch is one useful Product-to-PO trace for
`SWRC26004`, including exact BOM and Quote Lines when evidenced. It must answer:

- what exactly MoonSleep ordered;
- from which Supplier and against which Product Specification/BOM;
- which components, materials, quantities, and units;
- which exact quote lines established price/terms;
- what changed through inherent revisions.

After that proof, migrate the complete PO/BOM/Quote family and its callers, then
delete its superseded active surfaces before declaring the slice complete.

## Locked v2 decisions and remaining review points

These choices define v2. Field-by-field approval and exact historical examples
remain part of each vertical slice, but implementation must not silently
reverse these boundaries:

1. Product, not Product Family, is the stable MoonSleep business identity.
2. Product Specification replaces Product Revision; generic Object Revisions
   preserve knowledge changes.
3. Genuine targetable recipes and their lines are Bill of Materials/BOM Line;
   one-line pseudo-BOMs collapse into Product Specification. Product
   Specification never duplicates a genuine BOM's exact composition.
4. Material BOM change after external use creates a successor BOM identity;
   knowledge correction uses the same BOM's inherent revisions, and the
   established `supersedes` predicate links successor identities.
5. Product and freight quotations share Supplier Quote; exact commercial
   alternatives are Supplier Quote Lines.
6. Purchase Plan, Product Experiment, Product Quality Case, and Reconciliation
   Case are domain objects, not Loops or Facets. Loops may concern them. Exact
   Purchase Plan requirements target BOM Lines through
   `requires_bill_of_materials_line`.
7. Sample Order is a Purchase Order with sample purpose; status is inherent
   revision history.
8. Colorway remains Component Variant data unless independent cross-product
   identity is later proven.
9. Manufacturing Run Component remains independently targetable because its
   workstream lifecycle diverges.
10. Inventory Lot begins only with an independently identifiable committed,
    produced, in-transit, received, or physically counted cohort; hypothetical
    quantities remain planning state or Observations.
11. Shipment receives a stable MoonSleep ID before carrier/container refs.
12. Supplier/facility/provider are relationships, never canonical identity
    material. External IDs such as `SWRC26004` are globally unique inside the
    object-type namespace; collisions fail closed.
13. Relationship requiredness is enforced by action/readiness policies except
    for structural child-parent edges.
14. Claims reuses owner-native Carrier Incident/Case/Recovery and Finance
    Invoice Line rather than duplicating them.
15. The 24 types are a review catalog, never a bulk-registration instruction;
    each type is declared only in its business-value slice.
16. Declaration/release, canonical publication, historical migration, consumer
    migration, and physical legacy deletion terminalize separately.
17. Consolidation is incomplete until every superseded active surface is
    extinct; immutable evidence retains its received words but cannot execute.

## Validation

- 17 exact Supplier chapter bundles reviewed.
- 759 Resource rows and 705 Resource identities reconciled.
- 86 of 86 historical Resource types classified.
- 1,183 unique historical type/field pairs inventoried in the companion
  appendix.
- 811 relationship rows and 160 outbound type/relationship pairs inventoried.
- Current v2 registry, consolidation ledger, kernel, owner schemas, and actual
  non-test callers audited.
- Joint historical review expanded the projected proposal from 17 to 24 only
  where independent identity, lifecycle, targeting, or real consumers were
  evidenced.
- No schema property with the prohibited exact name was introduced.
- No production read/write, provider action, source packet mutation, registry
  publication, object revision, or historical cursor movement occurred.
