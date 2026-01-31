# Specification Reconciliation Plan

**Status:** ACTIVE  
**Last Updated:** 2026-01-30  
**Canonical Reference:** `specs/UNIFIED_SYSTEM.md`

---

## Overview

This document tracks the work needed to align all Nexus specifications with the authoritative `UNIFIED_SYSTEM.md` architecture. The goal is a cohesive specification set that tells one consistent story.

**Note:** The specs have grown large and unwieldy. After completing the remaining priority items, we should consolidate and reorganize around this canonical component model.

---

## Canonical Component Model

The unified architecture with the **three-ledger model**:

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                  NEXUS                                           │
│                                                                                  │
│   ┌──────────┐     ┌──────────────┐     ┌────────────────────────────────────┐  │
│   │   IN-    │────►│ EVENT LEDGER │────►│          EVENT HANDLER             │  │
│   │ ADAPTERS │     │              │     │                                    │  │
│   │          │     │ • events     │     │  ┌────────────┐                   │  │
│   │ • iMsg   │     │ • threads    │     │  │ ID LEDGER  │◄─── Index         │  │
│   │ • Gmail  │     │              │     │  │            │     enrichment    │  │
│   │ • Discord│     │              │     │  │ • entities │                   │  │
│   │ • ...    │     │              │     │  │ • personas │                   │  │
│   └──────────┘     └──────────────┘     │  └─────┬──────┘                   │  │
│                                          │        │                          │  │
│                                          │        ▼                          │  │
│                                          │  ┌────────────┐                   │  │
│                                          │  │    ACL     │                   │  │
│                                          │  │  policies  │                   │  │
│                                          │  │  + grants  │                   │  │
│                                          │  └─────┬──────┘                   │  │
│                                          │        │                          │  │
│                                          │   ALLOW│DENY                      │  │
│                                          │        │                          │  │
│                                          │        ▼                          │  │
│                                          │  ┌────────────┐                   │  │
│                                          │  │ HOOK EVAL  │                   │  │
│                                          │  │ (scripts)  │                   │  │
│                                          │  └─────┬──────┘                   │  │
│                                          └────────┼──────────────────────────┘  │
│                                                   │                             │
│                                                   ▼                             │
│                                          ┌──────────────┐                       │
│                                          │    BROKER    │                       │
│                                          └───────┬──────┘                       │
│                                                  │                              │
│                     ┌────────────────────────────┼────────────────────────┐     │
│                     ▼                            ▼                        ▼     │
│              ┌────────────┐              ┌────────────┐           ┌──────────┐  │
│              │     MA     │◄────────────►│    WAs     │           │   OUT-   │  │
│              │            │              │            │──────────►│ ADAPTERS │  │
│              └─────┬──────┘              └────────────┘           │          │  │
│                    │                            │                 │ • Discord│  │
│                    └────────────────────────────┼────────────────►│ • Telegram│ │
│                                                 │                 │ • ...    │  │
│                                                 ▼                 └──────────┘  │
│                                          ┌──────────────┐                       │
│                                          │ AGENT LEDGER │                       │
│                                          │              │                       │
│                                          │ • sessions   │                       │
│                                          │ • turns      │                       │
│                                          │ • messages   │                       │
│                                          │ • tool_calls │                       │
│                                          └──────┬───────┘                       │
│                                                 │                               │
│   ┌──────────────┐                              │                               │
│   │ EVENT LEDGER │──────────────────────────────┼───────────────┐               │
│   └──────────────┘                              │               │               │
│                                                 ▼               ▼               │
│                                          ┌─────────────────────────┐            │
│                                          │         INDEX           │            │
│                                          │       (derived)         │            │
│                                          │                         │            │
│                                          │ • episodes              │            │
│                                          │ • facets                │            │
│                                          │ • embeddings            │            │
│                                          │ • search                │            │
│                                          └─────────────────────────┘            │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### The Three Ledgers

| Ledger | Contents | Purpose |
|--------|----------|---------|
| **Event Ledger** | events, threads | What happened (normalized external data) |
| **Identity Ledger** | entities, personas, identities | Who is involved (principal resolution for ACL) |
| **Agent Ledger** | sessions, turns, messages, tool_calls | AI conversation state |

### Other Core Components

| Component | Purpose |
|-----------|---------|
| **In-Adapters** | Normalize external data → Event Ledger |
| **ACL** | Declarative policies determining WHO, WHAT permissions, WHERE routing |
| **Hooks** | Programmatic scripts for content-based logic (runs after ACL allows) |
| **Broker** | Routes messages, manages sessions, executes agents |
| **Out-Adapters** | Format and deliver responses to platforms |
| **Index** | Derived layer: episodes, facets, embeddings, search |

---

## Critical Architecture Decisions (Already Made)

These decisions are locked and documented in UNIFIED_SYSTEM.md:

| Decision | Details |
|----------|---------|
| **Single database** | All data in `~/nexus/state/nexus.db` |
| **Broker writes directly to ledger** | No JSONL files for Nexus sessions |
| **AIX only for external harnesses** | Cursor, Codex, Claude Code, Clawdbot — NOT Nexus |
| **Two-layer data model** | Ledgers (primary) vs Index (derived) |
| **Session pointer management** | Serial processing, fresh lookup, update after completion |
| **Forking creates new turns** | Fork from turn X creates child turn, not duplicate |

---

## Priority 1: Broker-Ledger Unification

### The Change

The Broker writes directly to the Agent Ledger (SQLite tables). There are no more JSONL session files for Nexus.

```
OLD: Broker → JSONL files → (sync) → Database (creates loop with AIX)
NEW: Broker → Agent Ledger (direct writes to nexus.db)
```

### Why It Matters

- Eliminates sync loops with AIX
- Enables smart forking without duplication
- Simplifies session state management
- Single source of truth

### Agent Ledger Schema (from mnemonic/AGENTS_LEDGER_SCHEMA.md)

```sql
agent_sessions    — Conversation containers with session pointers
agent_turns       — Query + response exchanges (tree via parent_turn_id)
agent_messages    — Individual messages within turns
agent_tool_calls  — Tool invocations with params/results
```

### Session Pointer Management (RESOLVED)

We resolved this in detail. Key invariants:

1. **One message at a time per session** — Processing lock prevents parallel execution
2. **Fresh lookup each message** — Always read session pointer from DB, never cache
3. **Update after completion** — Pointer moves only after turn finishes
4. **Session table is source of truth** — Route via session lookup, not cached turn IDs

This is documented in:
- `specs/agent-system/UNIFIED_ARCHITECTURE.md` (Section 7.1-7.2)
- `specs/agent-system/BROKER.md` (Section 5.3-5.4)
- `mnemonic/docs/AGENTS_LEDGER_FORKING.md`

### Forking Behavior (RESOLVED)

To fork from a turn that has children:
1. Create new session
2. Route message to new session — this creates a new turn as **child** of fork point
3. No turn duplication; the tree grows

### Files to Update

| File | Current State | Action |
|------|---------------|--------|
| `workspace/INIT.md` | Creates `state/sessions/` | Remove sessions directory |
| `workspace/PROJECT_STRUCTURE.md` | Lists `state/sessions/` | Remove from structure |
| `workspace/WORKSPACE_SYSTEM.md` | Shows `state/sessions/` in diagram | Remove from structure |
| `agent-system/SESSION_FORMAT.md` | Documents JSONL format | Major rewrite — clarify JSONL only for external harnesses, Nexus uses ledger |
| `agent-system/BROKER.md` | Partial coverage | Add ledger client section, ensure 5.3-5.4 are complete |

### Open Questions

- [x] ~~Document the exact schema for these tables~~ → See mnemonic/AGENTS_LEDGER_SCHEMA.md
- [x] ~~How does the Broker manage session pointers?~~ → Serial processing with fresh lookup
- [x] ~~What's the turn tree structure look like in practice?~~ → parent_turn_id links

---

## Priority 2: Mnemonic → Index Rename

### The Change

"Mnemonic" as a system name is being replaced with clearer terms:
- **Ledgers** = primary data (Event Ledger + Agent Ledger)
- **Index** = derived data (episodes, facets, embeddings, search)

### Why It Matters

- Clearer separation of concerns
- "Ledger" = source of truth, append-only
- "Index" = computed, can be rebuilt from ledgers
- Avoids confusion with "memory" in LLM context

### Terminology Mapping

| Old | New |
|-----|-----|
| Mnemonic (as system) | Ledger (primary) + Index (derived) |
| Mnemonic Event Layer | Event Ledger |
| Mnemonic context | Index context (if derived) or Ledger context (if primary) |
| Core tables | Split: Ledger tables vs Index tables |
| ~/nexus/state/sessions/ | Gone for Nexus; JSONL only for external harnesses |

### Files Updated ✅

| File | Status |
|------|--------|
| `agent-system/EVENT_SYSTEM_DESIGN.md` | ✅ Updated (terminology sweep) |
| `agent-system/ORCHESTRATION.md` | ✅ Marked SUPERSEDED |
| `memory/README.md` | ✅ Updated to reference Index |
| Status markers on HUB, CREDENTIAL_SYSTEM, SKILL_CLI | ✅ Marked COMPLETE |

### What's NOT Changing

- The `mnemonic` project/codebase name (for now) — code rename is separate
- The actual functionality — Index pipeline already implemented
- AIX integration approach — AIX handles external, Nexus is direct

---

## Priority 3: Persona Management + Routing ✅ RESOLVED

**Status:** Resolved in previous session.

The ACL system now handles persona/routing:
- **Personas** — Tracked in Identity Ledger (entities table with type='persona')
- **Routing** — ACL policies assign `session.persona` and `session.key`
- **Permissions** — ACL policies define tool/credential/data access per principal

**Key insight:** ACL runs FIRST (declarative policies), then hooks (programmatic scripts). ACL determines persona + session + permissions. Hooks handle content-based logic.

**See:** `specs/acl/ACCESS_CONTROL_SYSTEM.md`

---

## Priority 4: Identity Ledger Formalization ✅ DONE

### The Change

Conceptually split out the **Identity Ledger** from the Event Ledger as shown in the whiteboard diagram.

### Status: Complete

- ✅ `UNIFIED_SYSTEM.md` updated with three-ledger model
- ✅ `acl/ACCESS_CONTROL_SYSTEM.md` references Identity Ledger for principal resolution
- ✅ Identity Ledger schema documented

### Identity Ledger Tables

```sql
-- IDENTITY LEDGER (conceptually separate)
entities (id, type, name, is_user, relationship, ...)  -- 'person' | 'persona'
entity_identities (entity_id, channel, identifier, account_id, is_owned)
entity_tags (entity_id, tag)

-- EVENT LEDGER references Identity via:
event_participants (event_id, entity_id, role)
```

**See:** `UNIFIED_SYSTEM.md` Section 2.3 for full schema.

---

## Priority 5: Out-Adapters Specification

### The Change

Specify how responses are formatted and delivered to external platforms.

### Current State

**Blind spot.** We have detailed specs for in-adapters but out-adapters are under-specified.

### What's Needed

1. **Platform formatting** — Character limits, markdown support, threading
2. **Delivery mechanism** — How Broker/Agents invoke out-adapters
3. **Response capture** — Responses become events in Event Ledger (closes the loop)
4. **Error handling** — Delivery failures, retries

### Out-Adapters to Specify

| Adapter | Key Constraints |
|---------|-----------------|
| Discord | 2000 char limit, embeds, threads |
| Telegram | 4000 chars, markdown, media groups |
| WhatsApp | Baileys API, PTT audio, polls |
| Slack | Blocks, threads, reactions |
| Email | MIME, threading headers |

### Files to Create

| File | Purpose |
|------|---------|
| `specs/adapters/OUT_ADAPTERS.md` | Unified out-adapter specification |
| `specs/adapters/RESPONSE_FORMATTING.md` | Platform-specific formatting rules |

---

## Priority 6: Mnemonic → Index Migration

### The Change

Bring the mnemonic codebase into Nexus as the Index layer.

### Current State

- Mnemonic exists as separate project (`cortex/`)
- Spec terminology updated (Mnemonic → Index)
- Code migration not yet done

### What's Needed

1. **Rename** — `mnemonic/` → embedded in nexus or `nexus-index/`
2. **Integration** — Wire Index to Broker for context/forking
3. **Schema alignment** — Ensure Index tables match spec
4. **AIX integration** — AIX feeds external harness data to Index

### Files to Update

| File | Action |
|------|--------|
| `aix/AIX_MNEMONIC_PIPELINE.md` | Rename references, clarify external-only ingestion |
| `mnemonic/MNEMONIC_ARCHITECTURE.md` | Rename to INDEX_ARCHITECTURE.md |

---

## AIX Integration (Clarified)

### The Rule

**AIX only ingests from EXTERNAL harnesses:**
- Cursor (SQLite at `~/.cursor/...`)
- Codex (JSONL at `~/.codex/sessions/`)
- Claude Code (JSONL at `~/.claude/...`)
- Clawdbot (JSONL at `~/.clawdbot/sessions/`)

**AIX does NOT ingest from Nexus.**

Nexus Broker writes directly to the Agent Ledger. No sync loop.

### Files to Update

| File | Action |
|------|--------|
| `aix/docs/AIX_MNEMONIC_PIPELINE.md` | Clarify external-only ingestion |

---

## Specs Marked Complete ✅

These specs are stable and don't need reconciliation work:

| Spec | Status | Notes |
|------|--------|-------|
| `credentials/CREDENTIAL_SYSTEM.md` | ✅ Complete | Well-defined |
| `skills/HUB.md` | ✅ Complete | Solid |
| `skills/SKILL_CLI.md` | ✅ Complete | Unified under `nexus skills` |
| `workspace/AGENT_BINDINGS.md` | ✅ Complete | Research folder is supporting evidence |
| `cli/COMMANDS.md` | ✅ Complete | Comprehensive |
| `agent-system/ONTOLOGY.md` | ✅ Complete | Canonical data model |
| `agent-system/EVENT_SYSTEM_DESIGN.md` | ✅ Complete | Terminology updated |
| `agent-system/UNIFIED_ARCHITECTURE.md` | ✅ Complete | Added session pointer management |

---

## Work Completed ✅

| Task | Status |
|------|--------|
| UNIFIED_SYSTEM.md rewrite with component flow | ✅ Done |
| UNIFIED_ARCHITECTURE.md session pointer sections | ✅ Done |
| BROKER.md session pointer sections (5.3-5.4) | ✅ Done |
| mnemonic/AGENTS_LEDGER_FORKING.md created | ✅ Done |
| EVENT_SYSTEM_DESIGN.md terminology update | ✅ Done |
| Three-Ledger Model (Event, Identity, Agent) | ✅ Done |
| Component Interfaces (Section 10 in UNIFIED_SYSTEM.md) | ✅ Done |
| ACL specs referencing Identity Ledger | ✅ Done |
| Identity Ledger formalization | ✅ Done |
| Upstream structure mapping | ✅ Done (specs/project-structure/UPSTREAM_STRUCTURE.md) |
| Nexus structure proposal | ✅ Done (specs/project-structure/NEXUS_STRUCTURE.md) |
| ORCHESTRATION.md marked superseded | ✅ Done |
| memory/README.md updated | ✅ Done |
| Status markers on complete specs | ✅ Done |
| HOOK_BROKER_INTERFACE.md | ✅ Created (being refined) |

---

## Deferred Work

| Item | Status | Notes |
|------|--------|-------|
| Smart forking algorithm | TODO | Scoring, context assembly from Index |
| Index pipeline documentation | Done | Already implemented in mnemonic codebase |
| Hook → Broker interface | In Progress | HOOK_BROKER_INTERFACE.md exists |
| Mnemonic codebase rename | Defer | Separate from spec work |
| Upstream comparison doc | Defer | Tyler will do after specs complete |

---

## Execution Order

### Phase 1: Specification Alignment

1. **Priority 1: Broker-Ledger Unification** 🔴 HIGH
   - [ ] Update SESSION_FORMAT.md (major rewrite)
   - [ ] Update workspace docs to remove `state/sessions/`
   - [ ] Ensure BROKER.md ledger client section is complete

2. **Priority 2: Mnemonic → Index (Mostly Done)**
   - [x] Terminology sweep complete
   - [ ] Update aix/AIX_MNEMONIC_PIPELINE.md

3. **Priority 3: Persona/Routing** ✅ RESOLVED
   - [x] ACL system handles persona/routing
   - [x] See `specs/acl/`

4. **Priority 4: Identity Ledger Formalization**
   - [ ] Update UNIFIED_SYSTEM.md with three-ledger model
   - [ ] Update ACL specs to reference Identity Ledger
   - [ ] Document entity/identity schema

5. **Priority 5: Out-Adapters Specification** 🔴 HIGH (blind spot)
   - [ ] Create OUT_ADAPTERS.md
   - [ ] Document platform formatting rules
   - [ ] Document response → event loop

6. **Priority 6: Mnemonic → Index Migration**
   - [ ] Rename mnemonic references
   - [ ] Wire Index to Broker
   - [ ] Complete AIX integration

### Phase 2: Consolidation

After completing Phase 1, consolidate the specs around the canonical component model:

| Current State | Target State |
|---------------|--------------|
| Many overlapping docs | One doc per component |
| Historical terminology | Consistent three-ledger model |
| Scattered examples | Examples with each component spec |

**Target structure:**
```
specs/
├── UNIFIED_SYSTEM.md           # Canonical overview (keep)
├── adapters/                   # In + Out adapters
├── ledgers/                    # Event, Identity, Agent ledgers
├── acl/                        # Access control (keep)
├── hooks/                      # Hook system
├── broker/                     # Broker + routing
├── agents/                     # MA/WA, ontology
├── index/                      # Derived layer
├── workspace/                  # File structure, bindings
├── cli/                        # CLI commands
├── skills/                     # Skills hub
└── credentials/                # Credential system
```

---

## Notes

- `UNIFIED_SYSTEM.md` is the canonical reference — all other specs must align with it
- The `agent-bindings-research/` folder contains supporting research
- Single database model (`nexus.db`) is confirmed
- Forking behavior is documented in mnemonic/AGENTS_LEDGER_FORKING.md
- **ACL specs are comprehensive** — policies, grants, audit all spec'd
- **Out-adapters are a blind spot** — need specification work

---

*This plan will be updated as work progresses. Check off items as specs are aligned.*
