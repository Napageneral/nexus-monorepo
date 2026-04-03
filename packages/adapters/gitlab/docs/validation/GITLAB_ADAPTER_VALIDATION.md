# GitLab Adapter Validation

## Local

Run:

```bash
go test ./...
go vet ./...
go build -o ./bin/gitlab-adapter .
nexus package validate .
```

## Cleanroom

Primary package cleanroom requires GitLab credentials and is intentionally
deferred until they exist.
