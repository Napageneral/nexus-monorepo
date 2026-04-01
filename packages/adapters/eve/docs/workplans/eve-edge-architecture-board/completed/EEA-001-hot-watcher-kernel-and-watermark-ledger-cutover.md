# EEA-001 Hot Watcher Kernel And Watermark Ledger Cutover

## Goal

Replace Eve's current broad hot monitor loop with a low-latency watcher kernel
and a restart-safe watermark ledger that can support the long-term edge model.

## Inputs

1. [ADAPTER_SPEC_EVE.md](/Users/tyler/nexus/home/projects/nexus/packages/adapters/eve/docs/specs/ADAPTER_SPEC_EVE.md)
2. [EVE_ADAPTER_VALIDATION.md](/Users/tyler/nexus/home/projects/nexus/packages/adapters/eve/docs/validation/EVE_ADAPTER_VALIDATION.md)
3. [ChatStats live sync README](/Users/tyler/nexus/home/projects/ChatStats/app/backend/etl/live_sync/README.md)
4. [ChatStats WAL watcher](/Users/tyler/nexus/home/projects/ChatStats/app/backend/etl/live_sync/wal.py)
5. [ChatStats extractors](/Users/tyler/nexus/home/projects/ChatStats/app/backend/etl/live_sync/extractors.py)
6. [ChatStats live sync state](/Users/tyler/nexus/home/projects/ChatStats/app/backend/etl/live_sync/state.py)
7. [Eve adapter main](/Users/tyler/nexus/home/projects/nexus/packages/adapters/eve/cmd/eve-adapter/main.go)
8. [Eve ETL sync](/Users/tyler/nexus/home/projects/nexus/packages/adapters/eve/internal/etl/sync.go)

## Scope

- watcher kernel for `chat.db`, WAL, and SHM changes
- low-latency debounce behavior
- persistent local `chat.db` read handle
- dedicated Eve watermark ledger or equivalent state layer
- monitor loop cutover off the broad `FullSync` hot-path behavior
- hot-path instrumentation for lag and batch timing

## Acceptance

- Eve no longer reruns broad full sync work on every live monitor tick
- watcher state survives idle periods and edge restart
- the hot loop is explicitly watcher-driven rather than timer-driven broad sync
- batch timing and lag are observable for future proof work
- the change is staged so downstream delta ETL tickets can build on it without
  redoing the kernel

## Validation

- focused watcher and watermark tests
- fixture-backed monitor loop proof that exercises WAL or SHM change handling
- `go test ./...` from the Eve package root
- `git diff --check`
