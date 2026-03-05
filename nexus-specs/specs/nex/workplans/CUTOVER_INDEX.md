# Canonical Hard Cutover — Master Workplan Index

**Status:** COMPLETED
**Created:** 2026-03-02
**Updated:** 2026-03-05
**Canonical Specs:** [NEXUS_REQUEST_TARGET.md](../NEXUS_REQUEST_TARGET.md) · [AGENT_DELIVERY.md](../AGENT_DELIVERY.md) · [ATTACHMENTS.md](../ATTACHMENTS.md) · [SPEC_INDEX.md](../SPEC_INDEX.md) · [RESOLVED_DECISIONS.md](../RESOLVED_DECISIONS.md)

---

## Overview

Total hard cutover from the current nex codebase to the canonical spec. No migration, no backward compatibility, complete removal of all legacy code.

This index covers two generations of workplans:

1. **Phases 1–10 (original cutover)** — NexusRequest bus rewrite, pipeline stages, DB schemas, adapter protocol, reply deletion. Phases 1–6 are complete. Phases 7–10 in progress.

2. **WP1–WP12 (API redesign)** — 12 workplans covering the full Nex API redesign (~196 operations across 22 domains). These build on the Phase 1–6 foundation and can execute in parallel where dependencies allow.

---

## API Redesign Workplans (WP1–WP12) — ALL COMPLETED

| # | Doc | Scope | Ops | Status | Commit |
|---|-----|-------|-----|--------|--------|
| WP1 | [WP_IDENTITY_DB_OVERHAUL.md](./_archive/WP_IDENTITY_DB_OVERHAUL.md) | Contacts 8→3 consolidation, groups, policies to DB, entity CRUD, is_agent, immutable row | 46 | ✅ COMPLETED | `c0627d7a2` |
| WP2 | [WP_CREDENTIAL_SYSTEM.md](./_archive/WP_CREDENTIAL_SYSTEM.md) | File→DB credential migration, vault, encrypted store, 6 storage types, adapter_connections table | 21 | ✅ COMPLETED | `f36731799` |
| WP3 | [WP_AUTH_UNIFICATION.md](./_archive/WP_AUTH_UNIFICATION.md) | Audience removal (131 occurrences, 28 files), two-server collapse, role-gated loopback/hosted | 6 | ✅ COMPLETED | `e83386a96` |
| WP4 | [WP_SESSION_ROUTING.md](./_archive/WP_SESSION_ROUTING.md) | 3 session key systems → 1, request.session_routing, persona→workspace, label→key rename | — | ✅ COMPLETED | `ed16d4474` |
| WP5 | [WP_WORKSPACE_PRIMITIVE.md](./_archive/WP_WORKSPACE_PRIMITIVE.md) | New workspaces table, manifest system, persona elimination, working_dir rename | 10 | ✅ COMPLETED | `4cec81ac1` |
| WP6 | [WP_HOOK_SYSTEM_COLLAPSE.md](./_archive/WP_HOOK_SYSTEM_COLLAPSE.md) | 4 hook systems → 1, 44→19 canonical hook points, naming standardization | — | ✅ COMPLETED | `9c3da712c` |
| WP7 | [WP_WORK_DOMAIN_UNIFICATION.md](./_archive/WP_WORK_DOMAIN_UNIFICATION.md) | 7 new tables replacing ~15 across 4 DBs: jobs, cron, DAGs, agent_configs | 29 | ✅ COMPLETED | `9b612d2f0` |
| WP8 | [WP_MEMORY_API_EXPOSURE.md](./_archive/WP_MEMORY_API_EXPOSURE.md) | Wrap 12 agent tools + internals as 20 control-plane operations | 20 | ✅ COMPLETED | `ce203a1f8` |
| WP9 | [WP_AGENTS_SESSIONS_API.md](./_archive/WP_AGENTS_SESSIONS_API.md) | agents.sessions.* (11), turns (2), messages (2), queue (2), agents CRUD (7), chat (3) | 27 | ✅ COMPLETED | `717d6c4b8` |
| WP10 | [WP_ADAPTERS_CHANNELS_DELIVERY.md](./_archive/WP_ADAPTERS_CHANNELS_DELIVERY.md) | Channels deduplicated union (12), adapter connections (13), events (5), channel→account resolution | 30 | ✅ COMPLETED | `2bcadaa4e` |
| WP11 | [WP_APPS_SKILLS_MODELS_RUNTIME.md](./_archive/WP_APPS_SKILLS_MODELS_RUNTIME.md) | Apps (9), skills (3), models (2), runtime (2), pubsub (3), events (5), chat (3) | 27 | ✅ COMPLETED | `f27b7d8c0` |
| WP12 | [WP_DROPS_AND_EXTRACTIONS.md](./_archive/WP_DROPS_AND_EXTRACTIONS.md) | TTS extraction, 55+ ops dropped, 17 namespace renames, dead code sweep | — | ✅ COMPLETED | `213d119a0` |

---

## Dependency Graph

```
WP1 (Identity DB) ──┬── WP2 (Credentials) ──┬── WP10 (Adapters/Channels)
                     │                       └── WP11 (Apps/Skills/Models)
                     ├── WP5 (Workspaces) ──┬── WP4 (Session Routing)
                     │                      ├── WP7 (Work Domain)
                     │                      └── WP9 (Agents/Sessions)
                     └── WP10 (Adapters/Channels)

WP3 (Auth) ─────────── standalone (can start immediately)

WP6 (Hooks) ────────── WP7 (Work Domain)

WP7 (Work Domain) ──── WP9 (Agents/Sessions)
                   └── WP11 (Apps/Skills/Models)

WP8 (Memory API) ───── standalone (can start immediately)

WP12 (Drops) ────────── standalone (start anytime, finish LAST)
```

### Recommended Execution Order

**Wave 1 (no dependencies — start immediately):**
- WP1: Identity DB Overhaul (foundational)
- WP3: Auth Unification
- WP6: Hook System Collapse
- WP8: Memory API Exposure

**Wave 2 (depends on WP1):**
- WP2: Credential System
- WP5: Workspace Primitive

**Wave 3 (depends on WP2, WP5, WP6):**
- WP4: Session Routing
- WP7: Work Domain Unification
- WP10: Adapters/Channels/Delivery

**Wave 4 (depends on WP5, WP7):**
- WP9: Agents/Sessions API
- WP11: Apps/Skills/Models/Runtime

**Wave 5 (finish last):**
- WP12: Drops & Extractions

---

## Original Cutover Workplans (Phases 1–10)

### Active

| Doc | Phase | Summary | Depends On |
|-----|-------|---------|------------|
| [CUTOVER_06_REPLY_DELETION_AND_CLEANUP.md](./CUTOVER_06_REPLY_DELETION_AND_CLEANUP.md) | 0, 7–10 | Reply module deletion, automations collapse, memory decouple, delivery tool consolidation | Phases 1–6 |

### Completed (Archived)

| Doc | Phase | Summary | Archived |
|-----|-------|---------|----------|
| `_archive/CUTOVER_01_NEXUS_REQUEST_BUS.md` | 1 | Rewrite `request.ts` — all Zod schemas, types, constructors | ✅ |
| `_archive/CUTOVER_02_PIPELINE_AND_STAGES.md` | 2 | Rewrite pipeline stages, `pipeline.ts`, `nex.ts` processEvent | ✅ |
| `_archive/CUTOVER_03_EVENTS_DB.md` | 3 | Nuke events table, rebuild from canonical schema | ✅ |
| `_archive/CUTOVER_04_IDENTITY_AND_NEXUS_DB.md` | 4–5 | Identity DB (entity_tags, entity_persona) + Nexus DB (nexus_requests, backfill) | ✅ |
| `_archive/CUTOVER_05_ADAPTER_PROTOCOL.md` | 6 | Adapter event schema rename, attachment field mapping, parseAdapterEventLine | ✅ |

### Original Execution Sequence

```
Phase 1: NexusRequest Bus Rewrite ✅
  ├── src/nex/request.ts — all types and schemas
  └── everything imports from here, so this is the foundation
       │
       ├─── Phase 2: Pipeline & Stages ✅
       ├─── Phase 3: Events DB ✅
       ├─── Phase 4–5: Identity + Nexus DB ✅
       └─── Phase 6: Adapter Protocol ✅
                 │
                 └─── Phase 7–10: Reply Deletion & Cleanup 🔴 IN PROGRESS
                      ├── ✅ Archive + delete src/reply/
                      ├── ✅ Collapse evaluateDurableAutomations
                      ├── ✅ Decouple memory from pipeline
                      ├── ✅ Consolidate delivery tools
                      └── 🔴 SenderContext/ReceiverContext removal (~52 refs)
```

---

### Pre-Existing Workplans (Referenced by WP3 and WP4) — COMPLETED

| Doc | Summary | Referenced By | Status |
|-----|---------|---------------|--------|
| [AUDIENCE_REMOVAL_CUTOVER.md](./_archive/AUDIENCE_REMOVAL_CUTOVER.md) | Remove token audience (131 occurrences, 28 files) | WP3 | ✅ COMPLETED (with WP3, `e83386a96`) |
| [SESSION_ROUTING_UNIFICATION.md](./_archive/SESSION_ROUTING_UNIFICATION.md) | Unify 3 session key systems (~25 files) | WP4 | ✅ COMPLETED (superseded by WP4, `ed16d4474`) |

---

## Design Decisions (All Locked)

Every design decision referenced by the workplan documents is captured in the canonical spec docs. Key decisions summarized here for quick reference. See also [RESOLVED_DECISIONS.md](../RESOLVED_DECISIONS.md) for the 8 decisions resolved during the API redesign gap analysis.

### Architecture
- **Pipeline**: `acceptRequest → resolvePrincipals → resolveAccess → executeOperation → finalizeRequest`
- **Automations**: Hookpoints at stage boundaries, NOT a separate stage
- **SessionQueue**: Lives INSIDE the broker, NOT at the pipeline level
- **executeOperation**: Dispatches to operation handlers. `events.ingest` handler CAN invoke `broker.runAgent()`. runAgent is layers away from executeOperation.
- **Agent delivery**: Agent invokes ONE delivery tool. Adapter owns typing/chunking/streaming. No `deliverResponse` stage.

### Data Model
- **NexusRequest**: 11 fields (request_id, created_at, operation, routing, payload, principals, access, automations, agent, stages, status)
- **Entity**: Replaces SenderContext/ReceiverContext — no wrapper types, no discriminated unions
- **Routing**: Universal context (adapter, platform, sender/receiver as RoutingParticipant, location hierarchy)
- **Payload**: Operation-specific. For events.ingest: EventPayload with id, content, content_type, attachments, recipients, timestamp
- **Attachment**: Canonical unified type across all layers (mime_type, media_type, size, local_path, etc.)

### Database
- **Events table**: Fresh schema. `UNIQUE(platform, event_id)` dedup. Drop source/source_id/type/direction/from_identifier/to_recipients/is_retained. Drop ALL SQL triggers. Drop threads/event_participants tables.
- **entity_tags**: Immutable row pattern with id PK, created_at/deleted_at, partial unique index
- **entity_persona**: Renamed from persona_bindings. Drop agent_id/active. Add deleted_at. Immutable row pattern.
- **nexus_requests**: Simplified to id + operation + status + timestamps + request_snapshot
- **backfill_runs**: Extended with adapter/account/events_processed/contacts_seeded/last_checkpoint. Drop backfill_episodes.

### API Redesign Decisions (2026-03-04)
- **Channels**: Deduplicated union of Batch 2 + Batch 5 = 12 operations (data + delivery in one domain)
- **Plural naming**: All domain names are plural (`events.ingest`, `agents.wait`, `adapters.connections.*`)
- **pubsub.publish**: Client-facing (everything on API, locked down through ACL)
- **events.emit**: Dropped — this IS pubsub (already renamed)
- **Channel→Account resolution**: Option C — channel records carry account_id from adapter discovery, MA queries channels to find available sender accounts
- **clock.schedule.***: Replaced by `cron.*` (Batch 6 authoritative)
- **status output alignment**: Deferred to deep pass

### Deletions
- **Reply module**: Complete nuclear deletion. Archive to temp folder for adapter SDK reference, then delete from codebase.
- **Memory flush**: DELETE (replaced by event-driven episode system)
- **deliverResponse stage**: DELETE (delivery is agent-initiated via tools)
- **assembleContext stage**: DELETE (part of executeOperation/broker)
- **runAgent stage**: DELETE (part of executeOperation/broker)
- **runAutomations stage**: DELETE (automations are hookpoints, not a stage)
- **TTS/Talk/VoiceWake**: Extract to standalone package (WP12)
- **55+ dropped operations**: usage.*, device.*, packs.*, capabilities.*, delivery.poll, system-presence, etc. (WP12)

### Open Items (Deferred, Not Blocking Cutover)
- Slash command architecture (where /model, /status, /think etc. live) — rebuild later
- Episode detection mechanism — separate workstream
- Rate limiting — design on top of simplified AccessContext
- Adapter SDK update — adapters need updating for new attachment fields + delivery protocol
- Wizard full redesign — deferred until adapter/credential/workspace systems stabilize
- Browser full redesign — deferred, keep `browser.request` proxy
- Deep pass — full input/output schemas for all ~196 operations
