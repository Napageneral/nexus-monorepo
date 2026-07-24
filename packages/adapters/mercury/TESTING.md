# Mercury Adapter Testing

Run from this package:

```bash
go test ./... -count=1
go vet ./...
mkdir -p ./bin
go build -trimpath -buildvcs=false -o ./bin/mercury-adapter ./cmd/mercury-adapter
go build -trimpath -buildvcs=false -o ./bin/mercury-provenance ./cmd/mercury-provenance
./bin/mercury-adapter adapter.info
```

Package validation from the umbrella repository:

```bash
nexus package validate ./packages/adapters/mercury
```

Build the deterministic Linux/AMD64 release:

```bash
NEX_RELEASE_IMAGE=moonsleep-nex-empty:<exact-revision> \
  ./scripts/test-package-release-linux-amd64.sh
```

Then install those exact bytes through the real Nex package operator against
disposable PostgreSQL 17. This proves package health, tampered-stage rejection,
and restart rehydration without configuring a Mercury connection or calling
the provider:

```bash
NEX_RELEASE_IMAGE=moonsleep-nex-empty:<exact-revision> \
POSTGRES_RELEASE_IMAGE=postgres:17 \
  ./scripts/test-full-postgres-install-cleanroom.sh
```

The unit suite uses only loopback fake Mercury servers. It must never issue a
provider write. A live smoke is a separate GET-only gate and must not print
provider payloads or credentials.
