# SLE-002 Monitor Family Watermarks And Scheduler

## Goal

Refactor Shopify live monitor so it runs family-specific incremental cycles
instead of one replay-heavy monolithic fetch path.

## Scope

- define the family catalog for hot, medium, cold, and reconcile lanes
- replace the replay-floor monitor cursor with family-specific watermarks
- persist family watermarks under the adapter state dir
- add small overlap windows instead of large replay windows
- define the scheduler that decides which families run on each tick

## Acceptance

1. no live monitor family depends on the current `72h` replay floor
2. Shopify monitor resumes from persisted family watermarks after restart
3. a family can run without forcing every other family to run on the same tick
4. overlap handling is explicit and bounded

## Proof

- focused local tests for watermark persistence and scheduler due logic
- cleanroom monitor restart proof
- hosted MoonSleep smoke proof that monitor still starts and stays healthy

## Result

Implemented on April 7, 2026.

What landed:

- Shopify live monitor no longer uses the old `72h` replay floor or a single
  shared monitor cursor
- monitor now runs on a Shopify-owned family scheduler with per-family
  persisted cursor state under `NEXUS_ADAPTER_STATE_DIR`
- hot, medium, and cold families can run independently by cadence
- overlap handling is explicit and bounded per family

Code:

- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/shopify/cmd/shopify-adapter/monitor_state.go`
- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/shopify/cmd/shopify-adapter/main.go`

Focused validation:

- `go test ./cmd/shopify-adapter -v`
- `nexus package validate .`
