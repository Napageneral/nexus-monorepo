# Nexus LinkedIn Adapter

This package is the shared LinkedIn adapter for Nex.

## Scope

- LinkedIn OAuth-backed organization connections
- organization discovery
- organization post publishing
- LinkedIn post, comment, and social metadata reads

## Validate

```bash
pnpm test
pnpm build
```

## Package

```bash
./scripts/package-release.sh
```

## Consumer SDK

Consumer SDKs for this package are generated centrally from `api/openapi.yaml` into `artifacts/sdk/ts/adapters/linkedin-sdk-ts/`.
This package does not own SDK publication logic.
