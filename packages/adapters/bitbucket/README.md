# Nexus Bitbucket Adapter

Canonical Bitbucket adapter for Nex.

This package owns the Bitbucket provider API surface plus Bitbucket-specific
Nex projection behavior for connection setup, backfill, and monitor lifecycle.
It does not clone repositories or manage local worktrees; local git substrate
belongs outside the adapter.

Current representative public read slice:

- `bitbucket.workspaces.list`
- `bitbucket.repositories.list`
- `bitbucket.repositories.get`
- `bitbucket.branches.list`
- `bitbucket.commits.list`
- `bitbucket.commits.diff.get`
- `bitbucket.pull_requests.list`
- `bitbucket.pull_requests.diff.get`
- `bitbucket.pull_requests.source_archive.get` as an attachment-backed archive artifact
- `bitbucket.pull_requests.comments.list`

Current representative public write slice:

- `bitbucket.branches.create`
- `bitbucket.pull_requests.create`
- `bitbucket.pull_requests.comments.create`
- `bitbucket.pull_requests.merge`

## Build

```bash
go build -o ./bin/bitbucket-adapter .
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
./scripts/e2e/bitbucket-live-cleanroom-docker.sh
```

Passed cleanroom bundle:

- `/Users/tyler/nexus/state/artifacts/validation/cleanroom/bitbucket-live-cleanroom/20260401T212708Z`

## Notes

- API-capable Bitbucket credentials are required.
- The adapter is API-only and does not manage local clones or mirrors.
- Outbound collaboration actions are provider-side API operations.
- Workspace discovery is exposed as `bitbucket.workspaces.list` for broader
  provider catalog reads.
- For direct provider reads, prefer `payload.repository = "<workspace>/<repo>"`
  over an inferred target object when you already know the repository full
  name.
- Consumer SDKs are generated centrally from `api/openapi.yaml`.
