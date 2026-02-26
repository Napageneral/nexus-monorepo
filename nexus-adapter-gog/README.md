# nexus-adapter-gog

Nexus adapter wrapper around the `gog` CLI.

This project does **not** modify the upstream `gogcli` repo. It shells out to a `gog` binary
and adapts its JSON output into the Nexus adapter protocol using `adapter-sdk-go`.

## Requirements

- `gog` must be installed and available on PATH (or set `NEXUS_GOG_COMMAND`).
- A Google account must be authorized in `gog` (e.g. `gog auth add <email>`).

## Build

```bash
go build ./cmd/gog-adapter
```

## Run

```bash
go run ./cmd/gog-adapter adapter.info
go run ./cmd/gog-adapter adapter.accounts.list
go run ./cmd/gog-adapter adapter.health --account you@example.com
go run ./cmd/gog-adapter adapter.monitor.start --account you@example.com
go run ./cmd/gog-adapter event.backfill --account you@example.com --since 2026-01-01
```

## Monitor modes

- `watch + history polling` (preferred): if `gog gmail watch status` exists, monitor uses Gmail history IDs.
- `query polling fallback` (default-on): if watch state is missing, monitor polls Gmail message search.

This means Pub/Sub setup is optional for local/personal use. If Pub/Sub watch is configured, the adapter will automatically use it.

## State and watermarks

By default the adapter stores per-account state in:

`~/.nexus/adapters/gog/`

Files:
- `<account>.monitor.json` - history cursor watermark
- `<account>.poll.json` - recent message dedupe cache for polling fallback
- `<account>.backfill.json` - last backfill completion metadata

Configure paths with:
- `NEXUS_GOG_STATE_DIR`
- `NEXUS_GOG_STATE_PATH` (monitor cursor file override)

Other options:
- `NEXUS_GOG_POLL_INTERVAL` (default `20s`)
- `NEXUS_GOG_POLL_QUERY` (default `in:inbox newer_than:7d`)
- `NEXUS_GOG_BACKFILL_QUERY_BASE` (default `in:inbox -in:spam -category:promotions -category:social`)
- `NEXUS_GOG_BACKFILL_QUERY` (full override; if missing `after:` it is appended automatically)
- `NEXUS_GOG_RATE_LIMIT_RETRIES` (default `6`)
- `NEXUS_GOG_RATE_LIMIT_BACKOFF` (default `2s`)
