# Nexus Jira Adapter

Shared Jira adapter for Nex.

This repository contains:

- the Jira adapter implementation
- an installable adapter package manifest in `adapter.nexus.json`
- a release script that emits a Nex operator-install tarball
- a repo-local consumer SDK generated from the published adapter contract

## Layout

- `cmd/jira-adapter/` - adapter entrypoint and Jira provider logic
- `scripts/package-release.sh` - package the adapter for Nex install
- `scripts/generate-sdk.sh` - regenerate the repo-local consumer SDK
- `sdk/jira-sdk-ts/` - generated TypeScript consumer SDK

## Build

```bash
mkdir -p ./bin
go build -o ./bin/jira-adapter ./cmd/jira-adapter
```

## Package

```bash
./scripts/package-release.sh
```

This writes a tarball to `./dist/` containing:

- `adapter.nexus.json`
- `bin/jira-adapter`

## Test

```bash
go test ./...
```

## Consumer SDK

Generated consumer SDK:

- `sdk/jira-sdk-ts/`

Regenerate it with:

```bash
./scripts/generate-sdk.sh
```
