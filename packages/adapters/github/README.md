# Nexus GitHub Adapter

Canonical GitHub adapter for Nex.

This package owns the GitHub provider API surface plus GitHub-specific Nex
projection behavior for connection setup, backfill, and monitor lifecycle. It
does not clone repositories or manage local worktrees; local git substrate
belongs outside the adapter.

Current public read surface includes:

- `github.users.me.get`
- `github.repositories.list`
- `github.repositories.get`
- `github.branches.list`
- `github.commits.list`
- `github.commits.diff.get`
- `github.pull_requests.list`
- `github.pull_requests.get`
- `github.pull_requests.diff.get`
- `github.pull_requests.files.list`
- `github.pull_requests.reviews.list`
- `github.pull_requests.commits.list`
- `github.pull_requests.source_archive.get` as an attachment-backed archive artifact
- `github.pull_requests.comments.list`

Current public write surface includes:

- `github.branches.create`
- `github.pull_requests.create`
- `github.pull_requests.comments.create`
- `github.pull_requests.merge`

## Build

```bash
go build -o ./bin/github-adapter .
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
./scripts/e2e/github-live-cleanroom-docker.sh
```

Passed cleanroom bundle:

- `/Users/tyler/nexus/state/artifacts/validation/cleanroom/github-live-cleanroom/latest`

## Notes

- API-capable GitHub credentials are required.
- The adapter is API-only and does not manage local clones or mirrors.
- Outbound collaboration actions are provider-side API operations.
- Consumer SDKs are generated centrally from `api/openapi.yaml`.
