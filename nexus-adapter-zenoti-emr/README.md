# nexus-adapter-zenoti-emr

Nexus adapter wrapper for Zenoti EMR metrics.

## Fast Path

- API key auth (`api_key`)
- Optional `center_id` for multi-location scope
- CSV fallback for manual imports

## Build

```bash
go build ./cmd/zenoti-emr-adapter
```

## Run

```bash
go run ./cmd/zenoti-emr-adapter adapter.info
go run ./cmd/zenoti-emr-adapter adapter.health --account default
go run ./cmd/zenoti-emr-adapter event.backfill --account default --since 2026-01-01
```
