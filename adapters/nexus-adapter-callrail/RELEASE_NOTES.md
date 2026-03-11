# Release Notes

## v0.1.0

Initial shared CallRail adapter package cutover for Nex.

### Included

- canonical inbound `record.ingest` contract
- runtime `connection_id` identity surface
- package manifest in `adapter.nexus.json`
- package release artifact builder
- package-local package/install spec, workplan, and validation docs

### Validated Locally

- `go test ./...`
- `go build -o ./bin/callrail-adapter ./cmd/callrail-adapter`
- `./bin/callrail-adapter adapter.info`
- `./scripts/package-release.sh`

### Remaining

- isolated runtime package install proof
- restart rehydration proof
- real CallRail credential validation
