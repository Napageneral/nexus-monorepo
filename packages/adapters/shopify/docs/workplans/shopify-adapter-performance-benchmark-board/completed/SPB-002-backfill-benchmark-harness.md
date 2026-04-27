# SPB-002 Backfill Benchmark Harness

## Goal

Add a canonical Shopify adapter-only backfill benchmark harness.

## Scope

- run the packaged Shopify adapter in a fresh cleanroom
- create a real Shopify connection with MoonSleep credentials
- execute backfill against a bounded historical window
- capture elapsed time, emitted record counts, and family mix
- write a durable artifact bundle

## Acceptance

1. backfill benchmark runs without the hosted MoonSleep tenant
2. the artifact captures elapsed time and resulting record family counts
3. the artifact is durable and reviewable

## Progress

The first cleanroom-backed harness is now implemented in:

- `/Users/tyler/nexus/home/projects/nexus/nex/scripts/e2e/shopify-adapter-benchmark-live.ts`
- `/Users/tyler/nexus/home/projects/nexus/nex/scripts/e2e/shopify-adapter-benchmark-proof.ts`

The benchmark lane now boots a fresh sandbox, mounts the packaged Shopify
tarball plus MoonSleep secrets, installs only the Shopify adapter into the
cleanroom runtime, and captures:

- backfill elapsed time
- backfill record counts by family
- records per second
- backfill summary samples

Current signoff artifact:

- `/Users/tyler/nexus/state/sandboxes/6bab0655-3bc7-4513-bee8-44615bdc4360/artifacts/validation/shopify-adapter-benchmark/20260427T140738Z/shopify-adapter-benchmark.json`

April 27, 2026 result:

- `8577` records
- `34749ms` elapsed
- `246.83` records per second
- all declared Shopify Tier-1 families represented
