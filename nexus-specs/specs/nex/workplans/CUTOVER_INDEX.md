# Canonical Hard Cutover — Master Workplan Index

**Status:** ACTIVE
**Created:** 2026-03-02
**Canonical Specs:** [NEXUS_REQUEST_TARGET.md](../NEXUS_REQUEST_TARGET.md) · [AGENT_DELIVERY.md](../AGENT_DELIVERY.md) · [ATTACHMENTS.md](../ATTACHMENTS.md)

---

## Overview

Total hard cutover from the current nex codebase to the canonical spec. No migration, no backward compatibility, complete removal of all legacy code. Every old table gets nuked and recreated, every old type gets deleted and rewritten, the reply module gets deleted wholesale.

---

## Workplan Documents

| Doc | Phase | Summary | Depends On |
|-----|-------|---------|------------|
| [CUTOVER_01_NEXUS_REQUEST_BUS.md](./CUTOVER_01_NEXUS_REQUEST_BUS.md) | 1 | Rewrite `request.ts` — all Zod schemas, types, constructors | — |
| [CUTOVER_02_PIPELINE_AND_STAGES.md](./CUTOVER_02_PIPELINE_AND_STAGES.md) | 2 | Rewrite pipeline stages, `pipeline.ts`, `nex.ts` processEvent | Phase 1 |
| [CUTOVER_03_EVENTS_DB.md](./CUTOVER_03_EVENTS_DB.md) | 3 | Nuke events table, rebuild from canonical schema | Phase 1 |
| [CUTOVER_04_IDENTITY_AND_NEXUS_DB.md](./CUTOVER_04_IDENTITY_AND_NEXUS_DB.md) | 4–5 | Identity DB (entity_tags, entity_persona) + Nexus DB (nexus_requests, backfill) | Phase 1 |
| [CUTOVER_05_ADAPTER_PROTOCOL.md](./CUTOVER_05_ADAPTER_PROTOCOL.md) | 6 | Adapter event schema rename, attachment field mapping, parseAdapterEventLine | Phase 1 |
| [CUTOVER_06_REPLY_DELETION_AND_CLEANUP.md](./CUTOVER_06_REPLY_DELETION_AND_CLEANUP.md) | 0, 7–10 | Reply module deletion, automations collapse, memory decouple, delivery tool consolidation | Phases 1–6 |

---

## Execution Sequence

```
Phase 1: NexusRequest Bus Rewrite
  ├── src/nex/request.ts — all types and schemas
  └── everything imports from here, so this is the foundation
       │
       ├─── Phase 2: Pipeline & Stages (depends on Phase 1)
       │    ├── src/nex/stages/index.ts — stage definitions
       │    ├── src/nex/stages/*.ts — individual stage implementations
       │    ├── src/nex/pipeline.ts — pipeline runner
       │    └── src/nex/nex.ts — processEvent entry point
       │
       ├─── Phase 3: Events DB (depends on Phase 1, parallel with 2)
       │    └── src/db/events.ts — nuke and rebuild
       │
       ├─── Phase 4–5: Identity + Nexus DB (depends on Phase 1, parallel with 2–3)
       │    ├── src/db/identity.ts — entity_tags, entity_persona
       │    └── src/db/nexus.ts — nexus_requests, backfill_runs
       │
       └─── Phase 6: Adapter Protocol (depends on Phase 1, parallel with 2–5)
            └── src/nex/adapters/protocol.ts — schema rename + field mapping
                 │
                 └─── Phase 7–10: Reply Deletion & Cleanup (depends on 1–6)
                      ├── Archive src/reply/ to temp reference folder
                      ├── Delete src/reply/ from codebase
                      ├── Collapse evaluateDurableAutomations
                      ├── Decouple memory from pipeline
                      └── Consolidate delivery tools
```

Phases 2, 3, 4–5, and 6 can execute in parallel once Phase 1 lands. Phase 7–10 executes last after all structural changes are in place.

---

## Design Decisions (All Locked)

Every design decision referenced by the workplan documents is captured in the canonical spec docs. Key decisions summarized here for quick reference:

### Architecture
- **Pipeline**: `acceptRequest → resolvePrincipals → resolveAccess → executeOperation → finalizeRequest`
- **Automations**: Hookpoints at stage boundaries, NOT a separate stage
- **SessionQueue**: Lives INSIDE the broker, NOT at the pipeline level
- **executeOperation**: Dispatches to operation handlers. `event.ingest` handler CAN invoke `broker.runAgent()`. runAgent is layers away from executeOperation.
- **Agent delivery**: Agent invokes ONE delivery tool. Adapter owns typing/chunking/streaming. No `deliverResponse` stage.

### Data Model
- **NexusRequest**: 11 fields (request_id, created_at, operation, routing, payload, principals, access, automations, agent, stages, status)
- **Entity**: Replaces SenderContext/ReceiverContext — no wrapper types, no discriminated unions
- **Routing**: Universal context (adapter, platform, sender/receiver as RoutingParticipant, location hierarchy)
- **Payload**: Operation-specific. For event.ingest: EventPayload with id, content, content_type, attachments, recipients, timestamp
- **Attachment**: Canonical unified type across all layers (mime_type, media_type, size, local_path, etc.)

### Database
- **Events table**: Fresh schema. `UNIQUE(platform, event_id)` dedup. Drop source/source_id/type/direction/from_identifier/to_recipients/is_retained. Drop ALL SQL triggers. Drop threads/event_participants tables.
- **entity_tags**: Immutable row pattern with id PK, created_at/deleted_at, partial unique index
- **entity_persona**: Renamed from persona_bindings. Drop agent_id/active. Add deleted_at. Immutable row pattern.
- **nexus_requests**: Simplified to id + operation + status + timestamps + request_snapshot
- **backfill_runs**: Extended with adapter/account/events_processed/contacts_seeded/last_checkpoint. Drop backfill_episodes.

### Deletions
- **Reply module**: Complete nuclear deletion. Archive to temp folder for adapter SDK reference, then delete from codebase.
- **Memory flush**: DELETE (replaced by event-driven episode system)
- **deliverResponse stage**: DELETE (delivery is agent-initiated via tools)
- **assembleContext stage**: DELETE (part of executeOperation/broker)
- **runAgent stage**: DELETE (part of executeOperation/broker)
- **runAutomations stage**: DELETE (automations are hookpoints, not a stage)

### Automations
- Collapse `evaluateDurableAutomations` into `evaluateAutomationsAtHook` with unified signature
- Rename `DurableAutomationsOutcome` → `AutomationsOutcome`
- Remove `routing_override` from automation context (session targeting is broker-internal)
- TriggerContext → AutomationContext rename everywhere

### Open Items (Deferred, Not Blocking Cutover)
- Slash command architecture (where /model, /status, /think etc. live) — rebuild later
- Episode detection mechanism — separate workstream
- Rate limiting — design on top of simplified AccessContext
- Adapter SDK update — adapters need updating for new attachment fields + delivery protocol
- Durable vs non-durable automations — potential further simplification after collapse
