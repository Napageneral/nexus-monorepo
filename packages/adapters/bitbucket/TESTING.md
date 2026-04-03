# Testing

## Validate Package Contract

```bash
jq -e '.methodCatalog.source == "openapi" and .methodCatalog.document == "api/openapi.yaml" and .methodCatalog.namespace == "bitbucket"' adapter.nexus.json
rg -n 'operationId: (adapter\\.info|adapter\\.health|adapter\\.connections\\.list|adapter\\.setup\\.(start|submit|status|cancel)|adapter\\.monitor\\.start|records\\.backfill|bitbucket\\.(workspaces\\.list|repositories\\.(list|get)|branches\\.list|commits\\.(list|diff\\.get)|pull_requests\\.(list|diff\\.get|source_archive\\.get|comments\\.list)|branches\\.create|pull_requests\\.create|pull_requests\\.comments\\.create|pull_requests\\.merge))' api/openapi.yaml
```

`bitbucket.pull_requests.source_archive.get` returns a canonical attachment
object for the archive artifact.

## Local Validation

```bash
go test ./...
go vet ./...
go build -o ./bin/bitbucket-adapter .
./bin/bitbucket-adapter adapter.info
nexus package validate .
nexus package release .
```

## Canonical Live Proof

```bash
./scripts/e2e/bitbucket-live-cleanroom-docker.sh
```

Passed bundle:

- `/Users/tyler/nexus/state/artifacts/validation/cleanroom/bitbucket-live-cleanroom/20260401T212708Z`

The cleanroom wrapper resolves workspace Bitbucket credentials automatically
from Nex when available.
