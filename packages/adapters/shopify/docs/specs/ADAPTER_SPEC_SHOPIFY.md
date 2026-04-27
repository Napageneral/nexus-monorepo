# Adapter Spec: Shopify

## Purpose

This package is the canonical Nex adapter for Shopify.

Its target state is:

1. expose the full provider-native Shopify Admin API surface
2. keep additive Nex projection behavior in the same package
3. validate install/connect, backfill/monitor, and agent-use through the
   canonical proof ladder

## Canonical Upstream Target

The canonical upstream target for this adapter is Shopify's Admin GraphQL API,
not the legacy REST Admin API.

That means:

1. the package should pin a versioned Shopify Admin GraphQL schema as the
   upstream contract artifact
2. the public method catalog should be generated from that schema
3. retained REST Admin calls may exist only as explicitly transitional
   implementation residue, not as the target-state contract

## One Package, Two Layers

The Shopify adapter owns two layers in one package:

1. the full provider-native public method surface
2. the additive Nex projection contract

The projection layer exists to add:

1. canonical ingest records
2. stable IDs and provenance
3. backfill
4. monitor/live sync
5. normalization and attachment behavior

It must not narrow or replace the Shopify provider-native outward surface.

## Upstream Contract Artifacts

The target package should carry pinned Shopify contract artifacts such as:

1. `raw/provider.config.json`
2. `raw/upstream-graphql-schema.json`
3. optional human-readable schema or lock metadata as needed
4. generated method-catalog outputs derived from that pinned schema

Those artifacts are the canonical source for the Shopify provider surface.

## Public Method Model

The public Shopify method surface should be GraphQL-native and broad enough to
reach the full pinned Admin GraphQL schema without requiring us to hand-author
hundreds of wrappers.

The canonical Shopify outward surface should therefore have two layers:

1. a generic GraphQL execution backbone
2. optional convenience aliases for high-value Shopify domains

The backbone should include at least:

1. `shopify.graphql.query`
2. `shopify.graphql.mutate`
3. optional bulk-operation helpers if they are needed for long-running
   historical or operational flows

Convenience aliases may still exist where they materially improve ergonomics
for common use:

1. `shopify.query.shop`
2. `shopify.query.orders`
3. `shopify.query.order`
4. `shopify.query.products`
5. `shopify.query.product`
6. `shopify.query.customers`
7. `shopify.query.customer`

The important rule is:

1. full provider-native capability must come from the schema-backed backbone
2. convenience aliases are additive and may grow over time
3. the adapter must not pretend the convenience aliases alone are the whole
   Shopify Admin API

An alias only earns its keep when all of the following are true:

1. the workflow is common enough that agents would otherwise keep rebuilding
   the same document
2. the method can expose a stable, smaller input shape than raw GraphQL
3. the method carries a curated default selection or payload that is actually
   helpful
4. the method has its own proof coverage and does not become a shadow copy of
   the whole provider surface

The current explicit posture is:

1. `shopify.graphql.query` and `shopify.graphql.mutate` remain the canonical
   broad-surface story
2. first-wave read aliases remain for shop, orders, products, and customers
3. there are no dedicated convenience mutation aliases yet
4. Tier 2 and Tier 3 domains should prefer the generic backbone unless repeated
   real usage proves a wrapper is worth keeping

## Agent-Facing Capability Model

Agents should not have to interpret raw introspection output directly.

The package should project schema-domain capability docs into the mounted
`capabilities/` tree, grouped by Shopify domains such as:

1. shop/store identity
2. orders
3. customers
4. products
5. inventory
6. fulfillments
7. discounts
8. bulk operations
9. webhooks and eventing
10. payments
11. store settings and configuration

Those docs should include:

1. important arguments
2. example selections
3. pagination notes
4. cost/rate-limit notes
5. deprecation notes
6. scope hints where known

The package `SKILL.md` should teach agents how to:

1. choose the right Shopify domain and field
2. decide when to use the generic GraphQL backbone versus a convenience alias
3. keep selections narrow and purposeful
4. paginate correctly
5. switch to bulk operations when Shopify expects them

## Projection Contract

The additive Shopify projection contract should remain explicit even after the
public provider surface broadens.

The canonical target state for Shopify backfill, live monitor, reconcile, and
family-specific incremental behavior is defined in:

- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/shopify/docs/specs/SHOPIFY_INCREMENTAL_LIVE_SYNC_AND_RECONCILE_MODEL.md`

The key rule is:

1. outward provider capability should be broad
2. inward projected families should be selective and product-driven
3. the adapter does not need to ingest every Shopify schema object

The current minimum declared projection families are:

1. `order`
2. `line_item`

The long-term Shopify projection program should be tiered.

### Tier 1: Core Commerce Projection

These are the first high-value families that should likely gain explicit
projection contracts beyond `order` and `line_item`:

1. `customer`
2. `product`
3. `collection`
4. `inventory`
5. `fulfillment`
6. `discount`
7. `marketing`

The current shipped Tier 1 surface is:

1. `order`
2. `line_item`
3. `customer`
4. `product`

The remaining active Tier 1 expansion wave is:

1. `collection`
2. `inventory`
3. `fulfillment`
4. `discount`
5. `marketing`

For the first completed additive Tier 1 rollout:

1. `customer`
   - container identity remains the Shopify store
   - provider identity is the Shopify customer gid
   - backfill should page customers by `updatedAt`
   - monitor should advance an `updatedAt` watermark and emit only incremental
     customer changes
2. `product`
   - container identity remains the Shopify store
   - provider identity is the Shopify product gid
   - backfill should page products by `updatedAt`
   - monitor should advance an `updatedAt` watermark and emit only incremental
     product changes

For the active Tier 1 expansion wave, each remaining family must earn its
projection contract explicitly before the adapter can be called complete for
core commerce. Each of these families must define:

1. a dedicated upstream read path
2. a stable identity model
3. bounded backfill semantics
4. incremental monitor semantics

The intended posture for the remaining active Tier 1 families is:

1. `collection`
   - container identity remains the Shopify store
   - provider identity should center on the Shopify collection gid
   - thread identity should be per collection, not per membership edge
   - backfill and monitor should track collection row changes first; collection
     membership churn should only be added when it has a separate stable model
2. `inventory`
   - projection should reflect Shopify inventory-native semantics rather than
     pretending inventory is just a product field
   - identity should preserve `inventoryItem` plus location-sensitive
     inventory-level truth where available
   - proof must use a bounded real quantity or activation change on a dedicated
     proof item/location
3. `fulfillment`
   - projection should center on fulfillment-native objects and lifecycle,
     not just enrich orders indirectly
   - identity should preserve fulfillment or fulfillment-order native IDs as
     appropriate for the chosen model
   - proof must use one bounded real fulfillment-state change if scopes allow
4. `discount`
   - projection should preserve Shopify discount-native identities and classes
   - backfill should rely on discount-native updated/created timestamps, not
     order side effects
   - proof must use one bounded safe discount mutation or update on a dedicated
     proof discount
5. `marketing`
   - projection should be explicit about whether it means marketing activities,
     campaigns, or another Shopify-native marketing object family
   - backfill and monitor should target that chosen native object directly
   - proof must use one bounded real activity update if the current app scopes
     support it

### Tier 2: Configuration And Content Projection

These are likely worthwhile, but are lower priority than the core commerce
families:

1. `metafield`
2. `metaobject`
3. `online_store_content`
4. `market`
5. `localization`
6. `store_setting`

The current Tier 2 posture is:

1. all Tier 2 domains remain outward-capable through the generic GraphQL
   backbone
2. none of them are projected families by default today
3. a Tier 2 family only becomes projected when it has:
   - an explicit product/operator use case
   - a stable family identity and routing model
   - bounded backfill semantics
   - one safe incremental proof action

The explicit per-family stance is:

1. `metafield`
   - outward-only by default
   - do not project blindly because metafields are app-defined and can create
     noisy pseudo-schemas
   - only project when a product-specific owner contract names which namespace
     and owner resource classes matter
2. `metaobject`
   - outward-only by default
   - treat like structured content/config, not a universal sync family
   - only project when a concrete content workflow needs durable local records
3. `online_store_content`
   - outward-only by default
   - candidate future family when storefront publishing or content workflows
     need local change tracking
4. `market`
   - outward-only by default
   - prefer explicit reads because market configuration is low-frequency and
     configuration-heavy
5. `localization`
   - outward-only by default
   - prefer explicit reads and snapshots over always-on ingest
6. `store_setting`
   - outward-only by default
   - treat as configuration state, not a record stream, unless a future
     operator workflow proves otherwise

If any Tier 2 family is promoted into projection, its proof bar is:

1. backfill completes for the declared family
2. records exist and sample rows are retained as proof artifacts
3. one bounded upstream content/config mutation is introduced on a dedicated
   proof shop resource
4. monitor picks up that family incrementally without over-emitting unrelated
   data

### Tier 3: Special Operational Surfaces

These should not automatically be treated as ordinary ingested business
records. They need explicit strategy before projection:

1. `payment`
2. `webhook`
3. `bulk_operation`

The current Tier 3 posture is:

1. `payment`
   - outward-only by default
   - payment details are sensitive and should not be projected as routine
     business records without a redaction contract
   - if projection is ever required, it should begin with redacted summary
     records only on a dedicated proof shop
2. `webhook`
   - not a projected business-record family by default
   - webhooks are transport/configuration surfaces that should primarily feed
     monitor acceleration, reconciliation hints, and operator diagnostics
   - webhook proof should validate registration, delivery, and fallback
     reconciliation rather than inventing webhook event records as a primary
     product surface
3. `bulk_operation`
   - broad outward capability and internal substrate, not a projected family
   - use it to power large historical reads and long-running exports
   - proof should validate operation launch, completion, and artifact handling
     rather than emitting synthetic bulk-operation records by default

For projection/runtime semantics:

1. container identity should center on the Shopify store
2. order-centric record identity should preserve Shopify-native IDs
3. provider provenance should remain explicit on emitted records

## Backfill And Monitor Model

The Shopify adapter should use the provider's truthful data-access model for
historical and incremental sync.

The intended posture is:

1. backfill should use GraphQL pagination and bulk operations where needed for
   large historical loads
2. live monitor should prefer provider-native eventing or webhook posture where
   practical, with reconciliation polling where needed for correctness
3. rate-limit and query-cost handling should be first-class for setup,
   backfill, monitor, and safe public reads
4. not every outward Shopify capability needs an ingest family or monitor lane

The proof target is not merely "queue backfill."
Each declared projection tier should prove:

1. backfill completes
2. projected records exist for the families declared in scope
3. one bounded safe upstream change is introduced on a dedicated proof shop
4. monitor picks it up incrementally

Outward provider capability is validated separately through:

1. successful generic GraphQL query execution
2. successful generic GraphQL mutation or bulk-operation execution where safe
3. successful agent exploration and use of the schema-backed outward surface

## Validation Standard

The Shopify adapter is not complete until all three proof lanes are green:

1. install/connect proof
2. backfill/monitor proof
3. agent-use proof

That proof should cover:

1. package install and registration in a cleanroom Nex runtime
2. successful connection setup with real Shopify credentials
3. successful provider-native reads against the schema-backed public surface
4. completed backfill and incremental monitor behavior for declared projection
   families
5. successful worker discovery and use of the mounted capability tree and
   package skill

## Phase Model

The Shopify program should proceed in phases:

### Phase A: GraphQL Backbone

1. pin the schema
2. expose generic query and mutation execution
3. handle rate limits, cost, and pagination correctly
4. project mounted capability docs and examples from the schema

### Phase B: Core Commerce Projection

1. keep `order` and `line_item`
2. add `customer`, `product`, `collection`, `inventory`, `fulfillment`,
   `discount`, and `marketing` deliberately
3. prove backfill and monitor family by family

### Phase C: Configuration And Content Projection

1. add `metafield`, `metaobject`, `online_store_content`, `market`,
   `localization`, and `store_setting` where justified
2. preserve explicit family contracts and proofs

### Phase D: Special Operational Surfaces

1. decide the correct posture for `payment`, `webhook`, and `bulk_operation`
2. avoid pretending they are normal business-record families without design
3. prove them separately if and when they become projected families

## Current State Gap

The current package is below this target state today.

Current residue includes:

1. only a first convenience-query wave over Shopify GraphQL
2. no generic schema-backed query or mutation backbone yet
3. retained REST Admin implementation seams
4. only the first projection wave is complete
5. broader commerce, config, and operational tiers are still open

Those are implementation facts, not the target contract.
