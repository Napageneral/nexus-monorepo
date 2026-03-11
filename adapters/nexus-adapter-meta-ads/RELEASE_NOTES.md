# Release Notes

## v0.1.0

Initial shared Meta Ads adapter package cutover for Nex.

### Included

- canonical inbound `record.ingest` contract
- runtime `connection_id` identity surface
- package manifest in `adapter.nexus.json`
- package release artifact builder
- package-local package/install spec, workplan, and validation docs

### Validated Locally

- `go test ./...`
- `go build -o ./bin/meta-ads-adapter ./cmd/meta-ads-adapter`
- `./bin/meta-ads-adapter adapter.info`
- `./scripts/package-release.sh`

### Remaining

- isolated runtime package install proof
- restart rehydration proof
- real Meta Ads credential validation
