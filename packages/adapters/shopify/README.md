# Nexus Shopify Adapter

Shared Shopify adapter for Nex.

This package owns the Shopify order and fulfillment ingest surface only.
Storefront tracking, marketing attribution, and app-specific transforms remain
separate.

Current target behavior:

- direct Shopify Admin API auth and health
- row-shaped provider facts for orders and line items
- replay-safe backfill and monitor behavior
- retained cleanroom proof against MoonSleep Shopify credentials
- stable provider parity spot-checks against sampled upstream Shopify rows
- runtime caveat tracked separately: the retained proof currently needs a larger
  Node heap and search projection disabled in the launcher path

## Layout

- `cmd/shopify-adapter/` - adapter entrypoint and Shopify provider logic
- `docs/specs/` - package-local adapter specs
- `docs/workplans/` - package-local workplans
- `docs/validation/` - package-local validation docs

## Build

```bash
mkdir -p ./bin
go build -o ./bin/shopify-adapter ./cmd/shopify-adapter
```

## Package

```bash
./scripts/package-release.sh
```

## Validation

- Retained cleanroom proof:
  `/Users/tyler/nexus/state/sandboxes/bf043ac9-5575-49ea-8ecd-4ada02c1e3ab/artifacts/validation/shopify-row-parity-live/20260331T134606Z/shopify-proof-summary.json`
- Retained provider spot-check:
  `/Users/tyler/nexus/state/artifacts/validation/shopify/provider-spotcheck-stable-20260331T1540CDT.json`
- Note: the order-row spot-check is strict about normalized fields, so blank
  Shopify `fulfillment_status` values are compacted out of the emitted row and
  recorded as a semantic match rather than raw equality.

## Test

```bash
go test ./...
```

## Local CLI

```bash
./bin/shopify-adapter adapter.info
./bin/shopify-adapter adapter.connections.list
./bin/shopify-adapter adapter.health --connection <connection-id>
./bin/shopify-adapter adapter.monitor.start --connection <connection-id>
./bin/shopify-adapter records.backfill --connection <connection-id> --since 2026-01-01T00:00:00Z
```

## Active Docs

- [docs/README.md](/Users/tyler/nexus/home/projects/nexus/packages/adapters/shopify/docs/README.md)
- [ADAPTER_SPEC_SHOPIFY.md](/Users/tyler/nexus/home/projects/nexus/packages/adapters/shopify/docs/specs/ADAPTER_SPEC_SHOPIFY.md)
- [SHOPIFY_ADAPTER_WORKPLAN.md](/Users/tyler/nexus/home/projects/nexus/packages/adapters/shopify/docs/workplans/SHOPIFY_ADAPTER_WORKPLAN.md)
- [SHOPIFY_ADAPTER_VALIDATION.md](/Users/tyler/nexus/home/projects/nexus/packages/adapters/shopify/docs/validation/SHOPIFY_ADAPTER_VALIDATION.md)
