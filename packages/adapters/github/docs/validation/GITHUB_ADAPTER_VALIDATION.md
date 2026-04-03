# GitHub Adapter Validation

## Local

Run:

```bash
go test ./...
go vet ./...
go build -o ./bin/github-adapter .
nexus package validate .
```

## Cleanroom

Primary package cleanroom:

```bash
./scripts/e2e/github-live-cleanroom-docker.sh
```

Agent-use proof is owned by the Nex workplan board for forge app migration and
agent proof.
