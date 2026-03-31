# SAP-003 Shopify Record Identity And Payload Mapping

## Status

Completed.

## Outcome

Revision-aware identity is in place for both Shopify families:

- stable logical row identity
- revision hash on the emitted record id
- immutable-arrival metadata with row, bridge, payload, provider ids, and
  source request preserved

## Proof

- Package: `/Users/tyler/nexus/home/projects/nexus/packages/adapters/shopify`
- Example emitted rows are retained in:
  `/Users/tyler/nexus/state/sandboxes/bf043ac9-5575-49ea-8ecd-4ada02c1e3ab/artifacts/fresh-nex-workspace/state/data/records.db`
