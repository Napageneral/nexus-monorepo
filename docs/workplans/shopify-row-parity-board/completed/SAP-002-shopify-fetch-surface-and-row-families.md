# SAP-002 Shopify Fetch Surface And Row Families

## Status

Completed.

## Outcome

The Shopify package now emits the required row families:

- `order`
- `line_item`

Each family preserves the normalized row, raw provider payload, and bridge
evidence needed for downstream reuse.

## Proof

- Package: `/Users/tyler/nexus/home/projects/nexus/packages/adapters/shopify`
- Retained cleanroom proof: `/Users/tyler/nexus/state/sandboxes/bf043ac9-5575-49ea-8ecd-4ada02c1e3ab/artifacts/validation/shopify-row-parity-live/20260331T134606Z/shopify-proof-summary.json`
