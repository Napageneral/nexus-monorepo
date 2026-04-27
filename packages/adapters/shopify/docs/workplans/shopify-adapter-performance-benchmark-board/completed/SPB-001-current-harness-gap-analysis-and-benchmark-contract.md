# SPB-001 Current Harness Gap Analysis And Benchmark Contract

## Goal

Define the current-vs-target gap for Shopify adapter performance benchmarking
and lock the benchmark contract before more implementation.

## Current Reality

The Shopify package has:

1. correctness-oriented cleanroom proof
2. hosted MoonSleep benchmark artifacts
3. hosted Shopify churn samples

It does not yet have a canonical adapter-only benchmark harness that answers:

1. how long backfill takes in isolation
2. what backfill emits by family
3. how a bounded monitor soak behaves in isolation
4. what the adapter's own persisted monitor-state metrics look like after the
   soak

## Gap

The current evidence is split:

1. cleanroom proof is correctness-first, not benchmark-first
2. hosted benchmark proves shared-runtime pressure, not isolated adapter cost
3. there is no package-local benchmark artifact bundle for Shopify itself

## Acceptance

1. the benchmark contract is explicit and package-local
2. the board is populated with the implementation steps needed to satisfy it
3. no future Shopify efficiency discussion has to guess whether a result came
   from the adapter or from hosted runtime contention

## Completion

Completed on April 27, 2026.

The benchmark contract is now captured in:

- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/shopify/docs/specs/SHOPIFY_ADAPTER_PERFORMANCE_BENCHMARK_MODEL.md`
