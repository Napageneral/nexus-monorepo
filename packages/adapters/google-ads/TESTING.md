# Google Ads Adapter Testing

This guide covers the package-contract and package/install slice for the shared
Google Ads adapter.

Live Google Ads provider validation remains the next rung after package and
hosted lifecycle parity are green.

## Validate Package Contract

```bash
cd /Users/tyler/nexus/home/projects/nexus/packages/adapters/google-ads

jq -e '.methodCatalog.source == "openapi" and .methodCatalog.document == "api/openapi.yaml" and .methodCatalog.namespace == "google-ads"' adapter.nexus.json
rg -n 'operationId: (adapter\\.info|adapter\\.health|adapter\\.connections\\.list|google-ads\\.customers\\.accessible\\.list|google-ads\\.customers\\.get|google-ads\\.reporting\\.campaign_daily\\.list)' api/openapi.yaml
```

## Build

```bash
go test ./...
mkdir -p ./bin
go build -o ./bin/google-ads-adapter ./cmd/google-ads-adapter
```

## Validate Local Command Surface

```bash
./bin/google-ads-adapter adapter.info
nexus package validate .
```

## Build Package Artifact

```bash
./scripts/package-release.sh
tar -tzf ./dist/google-ads-0.1.0.tar.gz
```

Pass criteria:

- tarball exists under `dist/`
- archive contains `adapter.nexus.json`
- archive contains `bin/google-ads-adapter`
- `adapter.info` lists the three public `google-ads.*` methods above

## Next Validation Layer

After package/install parity is green:

1. run the shared hosted lifecycle proof
2. verify package health and restart rehydration
3. validate real Google Ads credentials in cleanroom proof
