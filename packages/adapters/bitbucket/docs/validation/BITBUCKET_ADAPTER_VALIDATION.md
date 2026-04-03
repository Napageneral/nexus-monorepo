# Bitbucket Adapter Validation

## Local

Run:

```bash
go test ./...
go vet ./...
go build -o ./bin/bitbucket-adapter .
nexus package validate .
```

## Cleanroom

Primary package cleanroom:

```bash
./scripts/e2e/bitbucket-live-cleanroom-docker.sh
```

Agent-use proof is owned by the Nex workplan board for forge app migration and
agent proof.
