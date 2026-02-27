# nexus-adapter-gog-ads

Nexus adapter wrapper for Google Ads metrics via `gog ads`.

## Requirements

- `gog` installed and available on PATH (or set `NEXUS_GOG_COMMAND`)
- Gog auth account connected for Google Ads scope
- Gog Ads config set (`ads.developer-token`, `ads.login-customer-id`, `ads.customer-id`)

## Build

```bash
go build ./cmd/gog-ads-adapter
```

## Run

```bash
go run ./cmd/gog-ads-adapter adapter.info
go run ./cmd/gog-ads-adapter adapter.accounts.list
go run ./cmd/gog-ads-adapter adapter.health --account you@example.com
go run ./cmd/gog-ads-adapter event.backfill --account you@example.com --since 2026-01-01
```
