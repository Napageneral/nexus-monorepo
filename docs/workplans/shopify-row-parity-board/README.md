# Shopify Row Parity Board

This board tracks the implementation and validation work needed to bring the
shared Shopify backend outcome surface to the row-shaped attribution contract.

Canonical inputs:

- `/Users/tyler/nexus/home/projects/nexus/docs/specs/attribution-adapters/shopify-adapter.md`
- `/Users/tyler/nexus/home/projects/nexus/docs/proposals/attribution-adapters/shopify-record-mapping.md`
- `/Users/tyler/nexus/home/projects/nexus/docs/workplans/attribution-adapter-packages-board/completed/AAP-004-shopify-package.md`
- `/Users/tyler/nexus/home/projects/nexus/docs/spec-driven-development-workflow.md`

Scope:

- shared Shopify package boundary and auth model
- order and line-item row families
- replay-safe backfill and monitor semantics
- checkout-surviving bridge-attribute passthrough
- MoonSleep credential cleanroom validation

Status lanes:

- `not-started/`
- `in-progress/`
- `completed/`

## Current Status Snapshot

Completed:

1. `SAP-001`
2. `SAP-002`
3. `SAP-003`
4. `SAP-004`
5. `SAP-006`
6. `SAP-007`

Not Started:

- `SAP-005`

Note:

- `SAP-005` is an optional webhook-assisted freshness follow-up. It is not
  required to consider the core Shopify adapter lane complete.

## Execution Order

The default sequence for this board is:

1. lock the Shopify package boundary, auth model, and provider access path
2. land order and line-item fetch surfaces
3. implement revision-aware record identity and payload mapping
4. align historical backfill and replay-safe monitor sync
5. validate against real MoonSleep Shopify credentials
6. sync docs, validation corpus, and signoff
7. optionally add webhook-assisted order refetch without making it the only
   freshness path
