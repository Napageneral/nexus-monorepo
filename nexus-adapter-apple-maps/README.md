# nexus-adapter-apple-maps

Nexus adapter wrapper for Apple Maps manual/CSV metrics.

## Notes

Apple Maps does not currently expose a supported public reviews/performance API for this integration path. This adapter is intentionally manual-first and pairs with CSV uploads in the GlowBot integration flow.

## Build

```bash
go build ./cmd/apple-maps-adapter
```

## Run

```bash
go run ./cmd/apple-maps-adapter adapter.info
go run ./cmd/apple-maps-adapter adapter.health --account default
go run ./cmd/apple-maps-adapter event.backfill --account default --since 2026-01-01
```
