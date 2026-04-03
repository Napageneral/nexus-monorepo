# Testing

## Validate Package Contract

```bash
jq -e '.methodCatalog.source == "openapi" and .methodCatalog.document == "api/openapi.yaml" and .methodCatalog.namespace == "gitlab"' adapter.nexus.json
rg -n 'operationId: (adapter\\.info|adapter\\.health|adapter\\.connections\\.list|adapter\\.setup\\.(start|submit|status|cancel)|adapter\\.monitor\\.start|records\\.backfill|gitlab\\.(branches\\.create|pull_requests\\.create|pull_requests\\.comments\\.create|pull_requests\\.merge))' api/openapi.yaml
```

## Local Validation

```bash
go test ./...
go vet ./...
go build -o ./bin/gitlab-adapter .
./bin/gitlab-adapter adapter.info
nexus package validate .
nexus package release .
```

## Canonical Live Proof

```bash
./scripts/e2e/gitlab-live-cleanroom-docker.sh
```

Current blocker:

- GitLab live cleanroom proof requires `GITLAB_TOKEN` or `GITLAB_CREDENTIAL_ID`
- there is no GitLab credential in the current workspace state
