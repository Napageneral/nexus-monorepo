# Eve Adapter Testing

## Automated

```bash
go test ./...
go build ./cmd/eve-adapter
./scripts/package-release.sh
```

## Manual Runtime Sanity

1. run `adapter.info`
2. run `adapter.accounts.list`
3. run `adapter.health`
4. exercise `adapter.setup.start` / `adapter.setup.submit`
5. if local permissions allow, exercise `records.backfill`
6. if local permissions allow, exercise `adapter.monitor.start`
7. exercise `channels.send` against a safe iMessage target
