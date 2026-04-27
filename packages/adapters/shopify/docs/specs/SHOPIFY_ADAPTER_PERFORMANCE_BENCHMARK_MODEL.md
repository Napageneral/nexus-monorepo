# Shopify Adapter Performance Benchmark Model

## Purpose

This document defines the canonical performance benchmark model for the Shopify
adapter.

The goal is to measure Shopify adapter cost in isolation from:

1. hosted tenant runtime contention
2. unrelated adapters
3. downstream app read-model cost

This benchmark model complements:

- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/shopify/docs/specs/ADAPTER_SPEC_SHOPIFY.md`
- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/shopify/docs/specs/SHOPIFY_INCREMENTAL_LIVE_SYNC_AND_RECONCILE_MODEL.md`

## Benchmark Posture

The canonical performance benchmark is adapter-focused.

It must run the packaged Shopify adapter against a fresh disposable runtime
surrogate rather than the long-lived MoonSleep hosted tenant.

The benchmark harness must answer:

1. how long backfill takes
2. what record volume and family mix backfill emits
3. how a bounded live monitor soak behaves
4. what monitor-state counters and family deltas the adapter produces during
   that soak

The benchmark harness is not a substitute for hosted end-to-end proof.

Hosted benchmarking still matters for:

1. shared-runtime contention
2. public request latency
3. app-plus-adapter interaction

But adapter-only benchmarking is the canonical proof surface for the Shopify
adapter's own backfill and live-monitor efficiency.

## Canonical Benchmark Substrate

The benchmark must run in a fresh cleanroom.

The cleanroom may use:

1. a runtime-managed sandbox bootstrapped from a small containerized Nex kernel
2. a fresh scratch runtime process when the adapter does not need hosted or
   sandbox-only seams

For Shopify, the canonical substrate is a fresh runtime-managed sandbox with:

1. the current packaged Shopify tarball
2. MoonSleep Shopify credentials mounted from the operator-owned secrets root
3. only the Shopify adapter package installed for the benchmark lane

The benchmark must not depend on the existing MoonSleep hosted tenant.

## Canonical Benchmark Lanes

The Shopify benchmark model has two required lanes.

### Backfill Lane

The backfill lane must measure:

1. requested `since`
2. backfill run start and completion timestamps
3. total elapsed milliseconds
4. total emitted records
5. emitted records by family
6. records per second
7. stabilization wait, if the benchmark waits for record summary convergence

The backfill lane must also capture a durable summary of the resulting data:

1. family counts
2. first and last timestamps per family
3. representative sample records

### Live Monitor Soak Lane

The live monitor lane must start from a completed backfill baseline and then
run a bounded monitor soak.

The canonical first soak duration for Shopify is `10m`.

The live monitor soak must measure:

1. monitor start success
2. soak start and completion timestamps
3. total elapsed milliseconds
4. baseline record summary before soak
5. final record summary after soak
6. emitted-record deltas by family during the soak
7. persisted adapter monitor-state counters after the soak

The benchmark artifact must surface the adapter-owned monitor-state metrics,
including:

1. per-family attempted counts
2. per-family emitted counts
3. per-family suppressed counts
4. persisted family watermarks

## Artifact Contract

The benchmark harness must emit a durable artifact bundle under a stable
validation root.

The canonical bundle must include:

1. one JSON summary artifact
2. one Markdown summary artifact
3. raw monitor-state capture after the soak
4. any backfill or runtime proof receipts needed to audit the run

The JSON summary must include:

1. benchmark metadata
2. adapter package identity and version
3. connection identity used for the benchmark
4. backfill metrics
5. live monitor soak metrics
6. family-level record deltas
7. adapter-owned monitor-state metrics

## Review Questions

The benchmark should make it easy to answer:

1. is Shopify backfill duration acceptable for the requested historical window
2. is live monitor doing bounded incremental work rather than replay
3. which families dominate emitted volume during a soak
4. how many observations are suppressed as duplicate revisions
5. whether Shopify is still the main performance problem after its own adapter
   improvements land

## Acceptance

The Shopify adapter performance benchmark lane is only complete when:

1. the package has one canonical benchmark harness
2. the harness proves backfill timing and emitted family mix
3. the harness proves a `10m` live monitor soak with adapter-owned metrics
4. package-local validation references that benchmark lane truthfully
5. the benchmark can be rerun after future Shopify monitor changes without
   reinventing the setup
