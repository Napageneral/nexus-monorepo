# Jira Adapter Testing

## Build

```bash
cd /Users/tyler/nexus/home/projects/nexus/adapters/jira
go test ./...
mkdir -p ./bin
go build -o ./bin/jira-adapter ./cmd/jira-adapter
```

## Validate Local Command Surface

```bash
./bin/jira-adapter adapter.info
```

## Build Package Artifact

```bash
./scripts/package-release.sh
tar -tzf ./dist/jira-1.0.0.tar.gz
```

Pass criteria:

- tarball exists under `dist/`
- archive contains `adapter.nexus.json`
- archive contains `bin/jira-adapter`

## Generate Consumer SDK

```bash
./scripts/generate-sdk.sh
```
