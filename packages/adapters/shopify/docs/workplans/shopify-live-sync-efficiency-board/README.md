# Shopify Live Sync Efficiency Board

This board tracks the Shopify-specific work required to move the adapter from a
correct-but-replay-heavy monitor posture to a production-grade incremental live
sync posture.

Canonical inputs:

- `/Users/tyler/nexus/home/projects/nexus/docs/spec-driven-development-workflow.md`
- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/shopify/docs/specs/ADAPTER_SPEC_SHOPIFY.md`
- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/shopify/docs/specs/SHOPIFY_INCREMENTAL_LIVE_SYNC_AND_RECONCILE_MODEL.md`
- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/shopify/docs/validation/SHOPIFY_ADAPTER_VALIDATION.md`
- `/Users/tyler/nexus/home/projects/nexus/docs/workplans/adapter-live-sync-efficiency-board/in-progress/ALSE-002-shopify-backfill-and-monitor-efficiency.md`

Scope:

- define the canonical incremental live-sync target state for Shopify
- perform a truthful current-vs-target gap analysis
- split Shopify families into hot, medium, cold, and reconcile lanes
- remove replay-heavy and snapshot-heavy behavior from live monitor
- prove that hosted MoonSleep latency and write pressure improve materially

Status lanes:

- `not-started/`
- `in-progress/`
- `completed/`

## Current Status Snapshot

In progress:

- `SLE-007`

Completed:

- `SLE-001`
- `SLE-002`
- `SLE-003`
- `SLE-004`
- `SLE-005`
- `SLE-006`

Not started:

- none

## Goal State

The board is only complete when all of the following are true:

1. Shopify backfill is still exhaustive and correctness-first
2. Shopify live monitor is family-incremental and restart-safe
3. hot-lane families do not depend on broad snapshot scans
4. duplicate family revisions are suppressed before emit
5. hosted MoonSleep latency and host pressure improve materially under live
   Shopify monitoring
6. the package-local validation corpus proves the new incremental story rather
   than the old replay-heavy one

Current package-local signoff artifact:

- `/Users/tyler/nexus/state/sandboxes/6bab0655-3bc7-4513-bee8-44615bdc4360/artifacts/validation/shopify-adapter-benchmark/20260427T140738Z/shopify-adapter-benchmark.json`

Remaining hosted signoff:

- `SLE-007` stays open until the MoonSleep hosted tenant is re-benchmarked with
  the full adapter set and attribution app reads after Shopify's latest local
  watermark fallback patch is packaged and installed.
