# Shopify Adapter Validation

**Spec:** `docs/specs/ADAPTER_SPEC_SHOPIFY.md`
**Workplan:** `docs/workplans/SHOPIFY_ADAPTER_WORKPLAN.md`

## Retained Proof

- Cleanroom proof:
  `/Users/tyler/nexus/state/sandboxes/bf043ac9-5575-49ea-8ecd-4ada02c1e3ab/artifacts/validation/shopify-row-parity-live/20260331T134606Z/shopify-proof-summary.json`
- Provider spot-check:
  `/Users/tyler/nexus/state/artifacts/validation/shopify/provider-spotcheck-stable-20260331T1540CDT.json`

The cleanroom proof passes when the launcher is given a larger Node heap and
search projection is disabled. That is a runtime caveat, not a Shopify adapter
contract problem.

The retained provider spot-check is intentionally strict. Shopify order rows
compact blank `fulfillment_status` values out of the normalized row, so the
artifact records the order samples as semantically aligned rather than raw
field-for-field identical. Line-item samples are exact.

## Local Proof

```bash
cd /Users/tyler/nexus/home/projects/nexus/packages/adapters/shopify

go test ./...
mkdir -p ./bin
go build -o ./bin/shopify-adapter ./cmd/shopify-adapter
./bin/shopify-adapter adapter.info
./bin/shopify-adapter adapter.health --connection shopify-primary
./bin/shopify-adapter records.backfill --connection shopify-primary --since 2026-01-01T00:00:00Z
./bin/shopify-adapter adapter.monitor.start --connection shopify-primary
```

## Validation Ladder

1. package contract is valid
2. build and connection health are green
3. historical ingest is canonical and row-shaped
4. monitor, managed profile behavior, replay safety, and restart durability
   remain aligned
5. retained MoonSleep proof and provider parity artifacts both pass

## Pass Criteria

- `adapter.nexus.json` is valid
- package identity is `shopify`
- package-local spec, workplan, validation, skill, and release flow exist
- `adapter.info` reflects the currently declared Shopify package surface
- `adapter.health` succeeds for a valid Nex-managed Shopify connection
- `records.backfill` emits canonical `record.ingest`
- orders and line items remain row-shaped with raw payload preserved in
  metadata, while blank fulfillment values are normalized consistently
- `adapter.monitor.start` emits the same canonical record model as backfill
- package install and restart do not lose the connection identity
