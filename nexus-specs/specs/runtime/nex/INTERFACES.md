# NEX Component Interfaces

> **This document has been retired.** The interface contracts are now distributed to their home specs.

## Where to Find What

| Interface | Now Lives In |
|-----------|-------------|
| **Pipeline data bus** | `NEXUS_REQUEST.md` — Full 8-stage lifecycle with typed schema per stage |
| **Identity resolution** | `../../data/ledgers/IDENTITY_GRAPH.md` — Resolution Query section |
| **Identity enrichment** | `../../data/ledgers/IDENTITY_GRAPH.md` — Cortex Enrichment section |
| **ACL / permissions** | `../iam/ACCESS_CONTROL_SYSTEM.md` + `NEXUS_REQUEST.md` stage 3 (AccessContext) |
| **Broker → Agent** | `../broker/AGENT_ENGINE.md` — AssembledContext input, AgentResult output |
| **Ledger writes** | `../broker/AGENT_ENGINE.md` — writeTurnToLedger function |
| **Delivery (outbound)** | `../STREAMING.md` + `../adapters/ADAPTER_SYSTEM.md` — StreamEvent protocol, CLI commands |
| **Response events** | `../../data/ledgers/EVENTS_LEDGER.md` — Outbound Events section |
| **Memory queries** | `../../data/cortex/README.md` — Query Interface section |

## Why Retired

The original 12-interface model was designed before the NexusRequest data bus pattern. With all pipeline data flowing through a single typed object (NexusRequest), the component-to-component contracts are better captured:
- **Pipeline interfaces** → in the NexusRequest lifecycle doc (each stage reads/writes typed sections)
- **Off-pipeline interfaces** → in their home specs (Memory queries, identity enrichment, etc.)

See `NEXUS_REQUEST.md` for the canonical pipeline flow.
