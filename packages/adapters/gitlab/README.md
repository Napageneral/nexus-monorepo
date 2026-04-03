# Nexus GitLab Adapter

Canonical GitLab adapter for Nex.

This package owns the GitLab provider API surface plus GitLab-specific Nex
projection behavior for connection setup, backfill, and monitor lifecycle. It
does not clone repositories or manage local worktrees; local git substrate
belongs outside the adapter.

## Build

```bash
go build -o ./bin/gitlab-adapter .
```

## Test

```bash
go test ./...
go vet ./...
```

## Package

```bash
nexus package validate .
nexus package release .
```

Canonical package-method truth lives in `adapter.nexus.json` and
`api/openapi.yaml`.

## Cleanroom Proof

Canonical live-provider validation runs through:

```bash
./scripts/e2e/gitlab-live-cleanroom-docker.sh
```

Current status:

- live cleanroom proof is blocked until a GitLab credential is present
- set `GITLAB_TOKEN` or `GITLAB_CREDENTIAL_ID` for the wrapper

## Notes

- API-capable GitLab credentials are required.
- The adapter is API-only and does not manage local clones or mirrors.
- Outbound collaboration actions are provider-side API operations.
- Consumer SDKs are generated centrally from `api/openapi.yaml`.
