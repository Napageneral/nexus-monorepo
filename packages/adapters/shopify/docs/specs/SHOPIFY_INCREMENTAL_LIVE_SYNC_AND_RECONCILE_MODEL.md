# Shopify Incremental Live Sync And Reconcile Model

## Purpose

This document defines the canonical target state for Shopify backfill,
incremental live monitor behavior, and slow reconciliation inside the shared
Shopify adapter.

It complements the broader package contract in
`/Users/tyler/nexus/home/projects/nexus/packages/adapters/shopify/docs/specs/ADAPTER_SPEC_SHOPIFY.md`.

The goal is simple:

1. keep backfill exhaustive and correctness-first
2. keep live monitoring incremental and fast
3. preserve true upstream revisions as durable records
4. avoid duplicate work caused by replay-heavy or snapshot-heavy monitor loops

## Separation Of Concerns

The Shopify adapter has three distinct read modes:

1. backfill
2. live monitor
3. reconcile

### Backfill

Backfill is exhaustive.

It may page broad historical ranges and full family surfaces as needed to
establish complete projection truth.

Backfill is not optimized for minute-scale freshness.

### Live Monitor

Live monitor is incremental.

Its only job is to detect recent upstream changes quickly, turn those changes
into canonical Nex records, and stay cheap enough that the shared runtime
remains responsive while the adapter is active.

Live monitor must not behave like replay.

### Reconcile

Reconcile is the slow correction lane.

It exists for Shopify families where provider-native incremental filters are
not sufficient to guarantee perfect hot-lane coverage.

Reconcile may use broader scans, but it must run on explicitly slower cadences
and must not be coupled to the hot monitor cadence.

## Canonical Family Model

Live monitor is family-specific rather than monolithic.

Each projected Shopify family must declare:

1. the family-native upstream read path
2. the family-native sort and freshness signal
3. the family-specific watermark tuple
4. the overlap window used for eventual-consistency safety
5. whether the family runs on the hot monitor lane or a slower lane
6. whether the family also needs a slower reconcile lane

The current canonical family posture is:

### Hot Lane

These families are part of the fast path and must be incremental enough to
support minute-scale monitoring:

1. `order`
2. `line_item`
3. `fulfillment`
4. `inventory`

`line_item` is derived from changed orders and does not own an independent
provider fetch lane.

### Medium Lane

These families are not as latency-sensitive as order-state changes but still
need regular incremental sync:

1. `customer`
2. any future discount or marketing family that proves it needs more frequent
   incremental sync than the cold lane

### Cold Lane

These families should remain incremental, but they do not belong on the hot
lane:

1. `product`
2. `collection`
3. discount and marketing families whose upstream mutation rates do not justify
   more frequent polling

## Family Watermark Model

Each family owns its own watermark.

The adapter does not use one shared monitor cursor across all Shopify families.

Each family watermark must be defined in terms of:

1. a provider-native freshness field such as `updatedAt`
2. a stable provider tie-breaker identity such as the family-native Shopify id
3. a small overlap window for clock skew and eventual consistency

The adapter must resume monitor state from the persisted family watermark after
restart.

The family watermark must advance only after the cycle succeeds.

The family watermark must never be replaced by a large replay floor during
normal monitor execution.

If a family has not yet observed a provider row that can advance
`cursor_at`, the live monitor must use the family `last_poll_at` checkpoint
plus overlap as the next `since` value. That keeps no-change monitor cycles
bounded while still making restart-after-downtime safe.

## Candidate Selection Model

For each family cycle:

1. compute `since` from the family watermark and overlap window
2. fetch only rows whose provider freshness signal is at or after `since`
3. page in a stable ascending order
4. use the family tie-breaker id to disambiguate equal timestamps
5. process rows in that stable order

If Shopify cannot provide a trustworthy family-native incremental filter for a
family, that family must move to a slower reconcile lane rather than degrade
the hot monitor lane into a full snapshot scan.

## Record Emission Model

The adapter remains ledger-shaped.

True upstream family revisions still produce new durable records.

But live monitor must not emit duplicate durable records simply because:

1. an overlap window surfaced the same revision again
2. a broad scan re-read an unchanged row
3. a parent row freshness field changed while the child family row itself did
   not meaningfully change

Each family must therefore define:

1. a `logical_row_id`
2. a family-native revision fingerprint

The adapter must suppress emit when the newly observed family revision
fingerprint matches the latest emitted revision for that `logical_row_id`.

## Derived Child Families

Child families derived from parent fetches must use child-native revision
identity.

They must not churn merely because the parent row freshness changed.

For Shopify specifically:

1. `line_item` revisions are derived from changed orders
2. `line_item` revision identity must be based on line-item business content
3. parent order freshness alone must not create a new `line_item` revision

## Reconcile Model

Families with imperfect provider incrementality may keep a reconcile lane.

That reconcile lane must:

1. run slower than the hot live monitor lane
2. use bounded scans
3. still emit only genuinely new family revisions
4. leave the hot lane incremental and cheap

Reconcile is correction, not the main monitor strategy.

## Family-Specific Target State

### Orders

Orders are incrementally monitored by family-native order freshness and a
stable order identity tie-breaker.

Changed orders emit:

1. one `order` record when the order revision changed
2. derived `line_item` records only for line items whose own revision changed

### Fulfillments

Fulfillments are incrementally monitored by family-native fulfillment freshness
and a stable fulfillment identity tie-breaker.

### Inventory

Inventory uses the best family-native inventory freshness signal Shopify
exposes.

If inventory cannot be fully trusted on a single incremental hot path, the hot
lane remains targeted and a slower reconcile lane repairs broader inventory
state.

### Customers

Customers use an incremental customer watermark and do not rely on monitor-time
snapshot scans.

### Products

Products use an incremental product watermark and do not rely on monitor-time
snapshot scans.

### Collections

Collections use an incremental collection watermark and do not rely on
monitor-time snapshot scans.

## Operator And Proof Expectations

The supported proof story for this target state is:

1. exhaustive backfill remains correct
2. monitor remains restart-safe
3. the hot lane stays incremental under live production load
4. a hosted tenant under active Shopify monitoring remains responsive

The active validation corpus must therefore prove:

1. family watermark persistence
2. overlap-safe incremental monitor behavior
3. duplicate revision suppression
4. hosted before/after latency improvement
5. hosted before/after adapter-pressure improvement
