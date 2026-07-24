# Mercury Adapter Testing

Run from this package:

```bash
go test ./... -count=1
go vet ./...
mkdir -p ./bin
go build -trimpath -buildvcs=false -o ./bin/mercury-adapter ./cmd/mercury-adapter
./bin/mercury-adapter adapter.info
```

Package validation from the umbrella repository:

```bash
nexus package validate ./packages/adapters/mercury
```

The unit suite uses only loopback fake Mercury servers. It must never issue a
provider write. A live smoke is a separate GET-only gate and must not print
provider payloads or credentials.
