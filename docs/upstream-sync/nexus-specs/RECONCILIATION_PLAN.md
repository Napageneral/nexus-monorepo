# Specification Reconciliation Plan

**Status:** ACTIVE  
**Last Updated:** 2026-01-30  
**Canonical Reference:** `specs/UNIFIED_SYSTEM.md`

---

## Overview

This document tracks the work needed to align all Nexus specifications with the authoritative `UNIFIED_SYSTEM.md` architecture. The goal is a cohesive specification set that tells one consistent story.

---

## Canonical Component Model

The unified architecture has these components:

```
┌──────────┐     ┌──────────────┐     ┌───────────────┐     ┌──────────┐
│ ADAPTERS │────►│ EVENT LEDGER │────►│ EVENT HANDLER │────►│  BROKER  │
└──────────┘     └──────┬───────┘     │   (Hooks)     │     └────┬─────┘
                        │             └───────────────┘          │
                        │                                        ▼
                        │                              ┌──────────────┐
                        │                              │ AGENT LEDGER │
                        │                              └──────┬───────┘
                        │                                     │
                        └───────────► INDEX ◄─────────────────┘
                                    (derived)
```

| Component | Purpose |
|-----------|---------|
| **Workspace** | `~/nexus/` structure, config, identity |
| **Adapters** | Normalize external data → Event Ledger |
| **Event Ledger** | Primary data: events, threads, persons |
| **Agent Ledger** | Primary data: sessions, turns, messages, tool_calls |
| **Event Handler** | Hook evaluation, fires to Broker |
| **Broker** | Routes messages, manages sessions, executes agents |
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

## Priority 3: Persona Management + Routing

### The Change

Clarify the relationship between:
- **Personas** — Agent identities/configurations
- **Routing Hooks** — Programmatic evaluation (TypeScript)
- **Routing Rules** — Declarative config (potential future addition)

### Current Understanding

From ONTOLOGY.md, the routing hierarchy is:

```
Persona Routing (top)      → maps persona → main session
    ↓
Session Routing (middle)   → maps label → current thread head
    ↓
Turn/Thread Routing (base) → routes to specific turn ID
```

**Persona** = Identity + Permissions (decorates threads)

### Open Questions

- [ ] Do we need declarative routing rules, or are hooks sufficient?
- [ ] Where is persona configuration stored? (`state/agents/{name}/` presumably)
- [ ] How does the Broker resolve persona → session → turn?
- [ ] How do personas inherit/share permissions?

### Files to Update

| File | Action |
|------|--------|
| `agent-system/ROUTING_HOOKS.md` | Clarify persona vs routing relationship |
| `agent-system/ONTOLOGY.md` | Ensure persona is well-defined |
| `agent-system/BROKER.md` | Document persona resolution |

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

1. **Priority 1: Broker-Ledger Unification**
   - [ ] Update SESSION_FORMAT.md (major rewrite)
   - [ ] Update workspace docs to remove `state/sessions/`
   - [ ] Ensure BROKER.md ledger client section is complete

2. **Priority 2: Mnemonic → Index (Mostly Done)**
   - [x] Terminology sweep complete
   - [ ] Update aix/AIX_MNEMONIC_PIPELINE.md

3. **Priority 3: Persona/Routing**
   - [ ] Clarify persona storage and resolution
   - [ ] Update ROUTING_HOOKS.md
   - [ ] Update BROKER.md persona section

---

## Notes

- `UNIFIED_SYSTEM.md` is the canonical reference — all other specs must align with it
- The `agent-bindings-research/` folder contains supporting research
- Single database model (`nexus.db`) is confirmed
- Forking behavior is documented in mnemonic/AGENTS_LEDGER_FORKING.md

---

*This plan will be updated as work progresses. Check off items as specs are aligned.*
