# Nexus Adapter SDKs

This folder contains the SDK monorepo for the Nexus external adapter CLI protocol.

## Packages

- `nexus-adapter-sdk-go/`: Go SDK (`go` module)
- `nexus-adapter-sdk-ts/`: TypeScript SDK (npm package)

## Contract

The canonical machine-readable contract (JSON Schema + fixtures) lives in:

- `../nexus-specs/specs/runtime/adapters/contract/`

Both SDKs validate against that contract via conformance tests.

## Conformance

Run both SDK conformance suites:

```bash
./scripts/adapter-conformance.sh
```

The script exports `NEXUS_ADAPTER_PROTOCOL_CONTRACT_DIR` so tests can locate the schema/fixtures.

