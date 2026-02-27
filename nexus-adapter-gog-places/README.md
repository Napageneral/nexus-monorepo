# nexus-adapter-gog-places

Nexus adapter wrapper for Google Business Profile fast-path metrics via `gog places`.

## Requirements

- `gog` installed and available on PATH (or set `NEXUS_GOG_COMMAND`)
- Places API key configured in gog (`places.api-key`) or provided in credential fields
- Adapter credential includes a `place_id` for the target clinic location

## Build

```bash
go build ./cmd/gog-places-adapter
```

## Run

```bash
go run ./cmd/gog-places-adapter adapter.info
go run ./cmd/gog-places-adapter adapter.accounts.list
go run ./cmd/gog-places-adapter adapter.health --account default
go run ./cmd/gog-places-adapter event.backfill --account default --since 2026-01-01
```
