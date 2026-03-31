# Website Input Package Board

This board tracks implementation and validation work for the shared website
input package family after the canonical contract is locked.

Canonical inputs:

- `/Users/tyler/nexus/home/projects/nexus/docs/specs/attribution-website-input-package-and-install-contract.md`
- `/Users/tyler/nexus/home/projects/nexus/docs/validation/attribution-website-input-install-and-proof-workflow.md`
- `/Users/tyler/nexus/home/projects/nexus/docs/specs/attribution-intelligence-layer.md`
- `/Users/tyler/nexus/home/projects/nexus/docs/specs/attribution-intelligence-taxonomy.md`
- `/Users/tyler/nexus/home/projects/nexus/docs/spec-driven-development-workflow.md`

Scope:

- shared browser SDK bootstrap and identity contract
- shared collector ingest and durable record contract
- GTM wrapper and mapping layer
- Wix wrapper and platform-specific compatibility lane
- backend bridge-extension lane
- operator proof and validation lane
- companion pixel ownership policy for one-shot website instrumentation

Status lanes:

- `not-started/`
- `in-progress/`
- `completed/`

## Current Status Snapshot

Completed:

1. `WIB-001`
2. `WIB-002`
3. `WIB-003`
4. `WIB-004`
5. `WIB-005`
6. `WIB-006`
7. `WIB-007`

## Execution Order

The default sequence for this board is:

1. land the shared browser SDK bootstrap, identity, and event contract
2. land the collector ingest surface and durable website-event record model
3. implement the GTM wrapper against the same contract
4. implement the Wix wrapper and compatibility gate
5. implement the backend bridge-extension contract and the first bridge lane
6. prove operator install and QA flows
7. lock companion pixel ownership policy for one-shot instrumentation
