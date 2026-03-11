# Release Notes

## v0.1.0

Initial shared Google adapter package cutover for Nex.

### Included

- canonical inbound `record.ingest` contract
- runtime `connection_id` identity surface
- shared Google Ads and Business Profile adapter behavior
- package manifest in `adapter.nexus.json`
- package release artifact builder
- package-local package/install spec, workplan, and validation docs

### Validated Locally

- `go test ./...`
- `go build -o ./bin/google-adapter ./cmd/google-adapter`
- `./bin/google-adapter adapter.info`
- `./scripts/package-release.sh`

### Remaining

- isolated runtime package install proof
- restart rehydration proof
- real Google Ads and Business Profile credential validation
