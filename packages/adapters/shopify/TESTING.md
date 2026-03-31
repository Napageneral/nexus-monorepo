# Shopify Adapter Testing

Primary package test command:

```bash
go test ./...
```

Build and package checks should follow after focused package tests pass:

```bash
mkdir -p ./bin
go build -o ./bin/shopify-adapter ./cmd/shopify-adapter
./scripts/package-release.sh
```

Cleanroom validation should follow after focused package tests pass.
