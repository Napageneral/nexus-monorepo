# Shopify Adapter Performance Benchmark Board

This board tracks the adapter-only benchmark lane for the Shopify adapter.

Canonical inputs:

- `/Users/tyler/nexus/home/projects/nexus/docs/spec-driven-development-workflow.md`
- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/shopify/docs/specs/ADAPTER_SPEC_SHOPIFY.md`
- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/shopify/docs/specs/SHOPIFY_INCREMENTAL_LIVE_SYNC_AND_RECONCILE_MODEL.md`
- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/shopify/docs/specs/SHOPIFY_ADAPTER_PERFORMANCE_BENCHMARK_MODEL.md`
- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/shopify/docs/validation/SHOPIFY_ADAPTER_VALIDATION.md`

Scope:

- define the canonical Shopify adapter-only benchmark contract
- measure backfill duration and emitted family mix in isolation
- measure a bounded live monitor soak in isolation
- capture adapter-owned monitor-state counters and family deltas
- keep this benchmark lane distinct from hosted tenant latency proof

Status lanes:

- `not-started/`
- `in-progress/`
- `completed/`

## Current Status Snapshot

Completed:

- `SPB-001`
- `SPB-002`
- `SPB-003`
- `SPB-004`

Not started:

- none

## Goal State

The board is only complete when all of the following are true:

1. Shopify has a canonical adapter-only benchmark harness
2. the harness proves backfill timing and emitted family mix
3. the harness proves a `10m` monitor soak with adapter-native metrics
4. the validation corpus references adapter-only benchmark artifacts
5. hosted tenant benchmarking is no longer the only evidence for Shopify
   efficiency

Current signoff artifact:

- `/Users/tyler/nexus/state/sandboxes/6bab0655-3bc7-4513-bee8-44615bdc4360/artifacts/validation/shopify-adapter-benchmark/20260427T140738Z/shopify-adapter-benchmark.json`
