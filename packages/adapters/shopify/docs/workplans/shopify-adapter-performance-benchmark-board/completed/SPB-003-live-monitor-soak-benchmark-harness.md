# SPB-003 Live Monitor Soak Benchmark Harness

## Goal

Add a canonical Shopify adapter-only live monitor soak benchmark.

## Scope

- start from a completed backfill baseline
- run `adapter.monitor.start`
- soak for `10m`
- capture baseline and final record summaries
- capture adapter-owned monitor-state metrics after the soak
- write a durable artifact bundle

## Acceptance

1. the soak benchmark records family deltas during the soak
2. the soak benchmark records monitor-state counters and persisted watermarks
3. the benchmark is rerunnable after future monitor changes

## Progress

The same benchmark harness now includes a bounded soak path with env-tunable
duration and sampling interval.

Current harness behavior:

- starts `adapter.monitor.start` after backfill
- records baseline record summary
- sleeps and samples during the soak
- records final record summary
- captures adapter-owned monitor state from
  `state/adapters/shopify/shopify/<connection_id>/monitor-state.json`

Default intended soak is `10m`, with lower values available for smoke runs via:

- `SHOPIFY_BENCHMARK_SOAK_SECONDS`
- `SHOPIFY_BENCHMARK_SAMPLE_INTERVAL_SECONDS`

Current signoff artifacts:

- `/Users/tyler/nexus/state/sandboxes/6bab0655-3bc7-4513-bee8-44615bdc4360/artifacts/validation/shopify-adapter-benchmark/20260427T140738Z/shopify-adapter-benchmark.json`
- `/Users/tyler/nexus/state/sandboxes/6bab0655-3bc7-4513-bee8-44615bdc4360/artifacts/validation/shopify-adapter-benchmark/20260427T140738Z/shopify-adapter-monitor-state.json`

April 27, 2026 result:

- `600s` live monitor soak
- `10` snapshots
- `0` total record delta
- `0` family-level churn across all declared families
