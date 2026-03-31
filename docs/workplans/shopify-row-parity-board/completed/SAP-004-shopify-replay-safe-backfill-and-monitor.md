# SAP-004 Shopify Replay-Safe Backfill And Monitor

## Status

Completed.

## Outcome

Backfill and monitor now use the intended Shopify sync split:

- historical backfill uses `created_at_min`
- monitor uses `updated_at_min`
- repeated syncs replay safely without changing the emitted contract

## Proof

- Package: `/Users/tyler/nexus/home/projects/nexus/packages/adapters/shopify`
- Retained cleanroom proof:
  `/Users/tyler/nexus/state/sandboxes/bf043ac9-5575-49ea-8ecd-4ada02c1e3ab/artifacts/validation/shopify-row-parity-live/20260331T134606Z/shopify-proof-summary.json`
