# Shopify Adapter Testing

Primary package test command:

```bash
go test ./...
```

Build and package checks should follow after focused package tests pass:

```bash
mkdir -p ./bin
go build -o ./bin/shopify-adapter ./cmd/shopify-adapter
```

Release artifacts target the MoonSleep Ops VPS and must be produced in a
Linux/AMD64 cleanroom that contains the exact release Nex CLI:

```bash
PACKAGE_NEXUS_ENTRY=/opt/nex/nexus.mjs ./scripts/package-release.sh
```

The repository cleanroom wrapper builds that environment from an exact Nex
release image, disables network access for tests and packaging, and removes its
derived image afterward:

```bash
NEX_RELEASE_IMAGE=moonsleep-nex-empty:<exact-commit> \
  ./scripts/test-package-release-linux-amd64.sh
```

The release script fails before building when the current host does not match
the selected target. `PACKAGE_TARGET_OS` and `PACKAGE_TARGET_ARCH` exist for an
explicit future platform release; their defaults are `linux` and `amd64`.

Cleanroom validation should follow after focused package tests pass.
