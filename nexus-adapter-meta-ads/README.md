# nexus-adapter-meta-ads

Nexus adapter wrapper for Meta Ads fast-path ingestion using a long-lived user access token.

## Requirements

- Meta long-lived user access token with `ads_read`
- Meta ad account id (`act_<id>`)

## Build

```bash
go build ./cmd/meta-ads-adapter
```

## Run

```bash
go run ./cmd/meta-ads-adapter adapter.info
go run ./cmd/meta-ads-adapter adapter.health --account default
go run ./cmd/meta-ads-adapter event.backfill --account default --since 2026-01-01
```
