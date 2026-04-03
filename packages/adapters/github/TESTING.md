# Testing

## Validate Package Contract

```bash
jq -e '.methodCatalog.source == "openapi" and .methodCatalog.document == "api/openapi.yaml" and .methodCatalog.namespace == "github"' adapter.nexus.json
rg -n 'operationId: (adapter\\.info|adapter\\.health|adapter\\.connections\\.list|adapter\\.setup\\.(start|submit|status|cancel)|adapter\\.monitor\\.start|records\\.backfill|github\\.(users\\.me\\.get|repositories\\.(list|get)|branches\\.list|commits\\.(list|diff\\.get)|pull_requests\\.(list|get|diff\\.get|files\\.list|reviews\\.list|commits\\.list|source_archive\\.get|comments\\.list)|branches\\.create|pull_requests\\.create|pull_requests\\.comments\\.create|pull_requests\\.merge))' api/openapi.yaml
```

`github.pull_requests.source_archive.get` returns a canonical attachment object
for the archive artifact.

## Local Validation

```bash
go test ./...
go vet ./...
go build -o ./bin/github-adapter .
./bin/github-adapter adapter.info
nexus package validate .
nexus package release .
```

## Canonical Live Proof

```bash
./scripts/e2e/github-live-cleanroom-docker.sh
```

Passed bundle:

- `/Users/tyler/nexus/state/artifacts/validation/cleanroom/github-live-cleanroom/latest`

The cleanroom wrapper resolves workspace GitHub credentials automatically from
Nex when available.
