# NEX — Nexus Runtime

**Last Updated:** 2026-03-02

---

## Canonical Specs

These are the authoritative target-state definitions. Everything in the codebase must converge to what these documents describe.

| Spec | Description |
|------|-------------|
| [NEX_ARCHITECTURE_AND_SDK_MODEL.md](./NEX_ARCHITECTURE_AND_SDK_MODEL.md) | **Start here.** The 4-layer architecture (Core, Transport, Client, SDK), app model, operation taxonomy as API, Nex SDK vs Adapter SDK. |
| [NEXUS_REQUEST_TARGET.md](./NEXUS_REQUEST_TARGET.md) | **The core spec.** NexusRequest data bus, 5-stage pipeline, Entity model, events table, identity DB schema, backfill design, memory integration. |
| [AGENT_DELIVERY.md](./AGENT_DELIVERY.md) | Agent-driven delivery model. The pipeline doesn't deliver — the agent invokes tools. Adapter owns typing, chunking, streaming. |
| [ATTACHMENTS.md](./ATTACHMENTS.md) | Unified attachment schema across all layers. Zero translation from adapter protocol to events table. |

---

## Supporting Specs

Topics not covered by the canonical specs that are still relevant and active.

| Spec | Description |
|------|-------------|
| [ADAPTER_INTERFACE_UNIFICATION.md](./ADAPTER_INTERFACE_UNIFICATION.md) | NexusAdapter interface, operation catalog (70+ operations), SDK contract, clock scheduling cutover. |
| [DAEMON.md](./DAEMON.md) | Process lifecycle — startup, signals, shutdown, crash recovery, CLI commands. |
| [RELAY_FEDERATION_MCP_ARCHITECTURE.md](./RELAY_FEDERATION_MCP_ARCHITECTURE.md) | Federation layer for Nex-to-Nex communication, MCP integration, nex-peer adapter. |

---

## Cutover Workplans

Mechanical execution plans for the hard cutover from current code to canonical spec.

| Workplan | Phase | Summary |
|----------|-------|---------|
| [CUTOVER_INDEX.md](./workplans/CUTOVER_INDEX.md) | — | Master sequencing document, dependency graph, locked design decisions. |
| [CUTOVER_01](./workplans/CUTOVER_01_NEXUS_REQUEST_BUS.md) | 1 | NexusRequest bus rewrite — `request.ts`, all types and schemas. |
| [CUTOVER_02](./workplans/CUTOVER_02_PIPELINE_AND_STAGES.md) | 2 | Pipeline & stages — 8 stages to 5, pipeline.ts, nex.ts. |
| [CUTOVER_03](./workplans/CUTOVER_03_EVENTS_DB.md) | 3 | Events DB nuke & rebuild — fresh schema, no triggers. |
| [CUTOVER_04](./workplans/CUTOVER_04_IDENTITY_AND_NEXUS_DB.md) | 4-5 | Identity & Nexus DB — entity_tags, entity_persona, nexus_requests. |
| [CUTOVER_05](./workplans/CUTOVER_05_ADAPTER_PROTOCOL.md) | 6 | Adapter protocol update — schema rename, attachment fields. |
| [CUTOVER_06](./workplans/CUTOVER_06_REPLY_DELETION_AND_CLEANUP.md) | 0, 7-10 | Reply deletion, automations collapse, memory decouple, cleanup. |

---

## Subdirectories

| Directory | Description |
|-----------|-------------|
| `ingress/` | Ingress security, credentials, control plane authz taxonomy. |
| `hosted/` | Multi-workspace, hosted runtime profile, billing, direct browser mode. |
| `adapters/` | Adapter connection service (credential orchestration, OAuth). |
| `workplans/` | Active cutover workplans. |
| `archive/` | Superseded specs and completed workplans (historical reference). |
