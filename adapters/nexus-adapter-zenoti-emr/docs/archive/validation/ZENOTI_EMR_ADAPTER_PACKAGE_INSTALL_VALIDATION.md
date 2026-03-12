# Zenoti EMR Adapter Package Install Validation

Local validation targets:

1. `go test ./...`
2. `./scripts/package-release.sh`
3. operator install of the emitted tarball
4. package health reports healthy
5. runtime restart rehydrates the active package
