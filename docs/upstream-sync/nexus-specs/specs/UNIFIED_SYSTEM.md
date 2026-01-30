# Unified System Specification

**Status:** CANONICAL REFERENCE  
**Last Updated:** 2026-01-29

---

## Overview

Nexus is a unified personal AI system. This document describes how all components integrate into a coherent whole.

**Core Components:**

| Component | Purpose |
|-----------|---------|
| **Workspace** | File structure, identity, configuration (`~/nexus/`) |
| **Adapters** | Normalize external data into the Event Ledger |
| **Ledgers** | Primary data stores (Event Ledger, Agent Ledger) |
| **Event Handler** | Evaluates hooks against events, fires to Broker |
| **Broker** | Routes messages, manages sessions, executes agents |
| **Index** | Derived layer (episodes, facets, embeddings, search) |
| **CLI** | Agent orientation and capability discovery |
| **Skills** | Capability providers with dependency declarations |
| **Credentials** | Secure secret storage with consumer-centric access |

---

## 1. System Architecture

### 1.1 Component Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                  NEXUS                                       │
│                                                                             │
│   ┌──────────┐     ┌──────────────┐     ┌───────┐     ┌───────┐ ┌────────┐ │
│   │ ADAPTERS │────►│ EVENT LEDGER │────►│  ACL  │────►│ HOOKS │►│ BROKER │ │
│   │          │     │              │     │       │     │       │ │        │ │
│   │ • AIX    │     │ • events     │     │Policies│    │Scripts│ │ Routes │ │
│   │ • iMsg   │     │ • threads    │     │ WHO?  │     │ WHAT? │ │ queues │ │
│   │ • Gmail  │     │ • persons    │     │Grants │     │ HOW?  │ │executes│ │
│   │ • Discord│     │              │     │       │     │       │ │        │ │
│   └──────────┘     └──────┬───────┘     └───────┘     └───────┘ └───┬────┘ │
│                           │                                         │      │
│                           │                                         ▼      │
│                           │                              ┌──────────────┐  │
│                           │                              │ AGENT LEDGER │  │
│                           │                              │              │  │
│                           │                              │ • sessions   │  │
│                           │                              │ • turns      │  │
│                           │                              │ • messages   │  │
│                           │                              │ • tool_calls │  │
│                           │                              └──────┬───────┘  │
│                           │                                     │          │
│                           │         ┌───────────────────────────┘          │
│                           │         │                                      │
│                           ▼         ▼                                      │
│                     ┌─────────────────────┐                                │
│                     │        INDEX        │                                │
│                     │      (derived)      │                                │
│                     │                     │                                │
│                     │ • episodes          │◄──── Broker reads for          │
│                     │ • facets            │      context & smart forking   │
│                     │ • embeddings        │                                │
│                     │ • search            │                                │
│                     └─────────────────────┘                                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Data Flow Summary

```
Adapters → Event Ledger → ACL → Hooks → Broker → Agent Ledger
                │          │                ↑            │
                │          │                │            │
                │          └─ Identity resolution via persons table
                │                           │            │
                └───────► Index ◄───────────┴────────────┘
                        (derived)
```

1. **Adapters** normalize external data → **Event Ledger**
2. **Event Ledger** triggers **Event Handler** (hooks evaluation)
3. **Event Handler** evaluates hooks, potentially reading from Event Ledger + Index
4. Fired hooks route to **Broker** with routing instructions
5. **Broker** manages session lifecycle, reads/writes **Agent Ledger**
6. **Broker** reads from **Index** for context enrichment / smart forking
7. **Index** continuously processes both ledgers → episodes → facets → embeddings

### 1.3 Two-Layer Data Model

| Layer | Purpose | Contents |
|-------|---------|----------|
| **Ledgers** (Layer 1) | Primary data, source of truth | Raw events, agent sessions/turns/messages |
| **Index** (Layer 2) | Derived data, computed for access | Episodes, facets, embeddings, search |

**Key insight:** Ledgers store what happened. Index makes it useful.

---

## 2. Component Definitions

### 2.1 Workspace

The `~/nexus/` directory structure containing all Nexus state and configuration.

```
~/nexus/
├── AGENTS.md                 # System behavior (canonical)
├── skills/                   # Skill definitions
├── state/                    # Runtime state
│   ├── nexus.db              # Unified database (ledgers + index)
│   ├── user/IDENTITY.md      # User profile
│   ├── agents/{name}/        # Agent identities
│   ├── credentials/          # Credential pointers
│   ├── hooks/                # Hook scripts (*.ts)
│   └── skills/manifest.json  # Skill state
└── home/                     # User's personal space
```

**Design decision:** Visible `state/` directory (not hidden) for transparency.

### 2.2 Adapters

Adapters normalize data from external sources into the Event Ledger.

| Adapter | Source | Event ID Format |
|---------|--------|-----------------|
| `aix` | External AI harnesses (Cursor, Codex, Claude Code) | `aix:{session_id}:{message_id}` |
| `imessage` | iMessage database | `imessage:{guid}` |
| `gmail` | Gmail API | `gmail:{message_id}` |
| `discord` | Discord WebSocket | `discord:{message_id}` |
| `telegram` | Telegram Bot API | `telegram:{message_id}` |
| `whatsapp` | Baileys WebSocket | `whatsapp:{message_id}` |
| `timer` | Scheduled events | `timer:{timestamp}` |
| `webhook` | HTTP webhooks | `webhook:{request_id}` |

**Key pattern:** Deterministic event IDs enable idempotent sync.

### 2.3 Ledgers

Two ledgers store primary data in `nexus.db`:

#### Event Ledger

Normalized events from all external sources.

| Table | Purpose |
|-------|---------|
| `events` | All normalized events (messages, emails, etc.) |
| `threads` | Event groupings (conversations, email threads) |
| `persons` | Contact/person entities |
| `event_participants` | Event ↔ person links |
| `event_state` | Per-event lifecycle state |
| `event_tags` | Event ↔ tag associations |

#### Agent Ledger

Agent session data written directly by the Broker.

| Table | Purpose |
|-------|---------|
| `agent_sessions` | Conversation containers with session pointers |
| `agent_turns` | Query + response exchanges (tree structure) |
| `agent_messages` | Individual messages within turns |
| `agent_tool_calls` | Tool invocations with params/results |

**Critical design decision:** The Broker writes directly to the Agent Ledger. There are no intermediate JSONL files for Nexus agent sessions. This avoids sync loops (see Section 3).

### 2.4 Access Control Layer (ACL)

Declarative policies that determine WHO can access the system, WHAT permissions they have, and WHERE messages route.

**Two-layer system:**
1. **ACL (policies)** — Declarative YAML, runs first, determines identity + permissions + session
2. **Hooks (scripts)** — Programmatic TypeScript, runs after ACL allows, handles content-based logic

```yaml
# Example ACL policy
- name: partner-access
  match:
    principal:
      relationship: partner
  effect: allow
  permissions:
    tools:
      allow: [web_search, calendar_read]
      deny: [shell, send_email]
  session:
    persona: atlas
    key: "partner:{principal.name}"
```

**Key features:**
- Identity resolution via ledger's `persons` table
- Priority-based policy evaluation (deny overrides allow)
- Dynamic permission grants with approval workflow
- Full audit logging

**See:** `specs/acl/` for full ACL specification.

### 2.5 Hooks

TypeScript scripts that evaluate event content and trigger actions.

```typescript
interface HookResult {
  fire: boolean;
  context?: { prompt?: string; extracted?: Record<string, any> };
  disable_hook?: boolean;
}
```

**Evaluation:** Hooks run AFTER ACL allows. All enabled hooks run in parallel.

**See:** `specs/agent-system/EVENT_SYSTEM_DESIGN.md` for full hook specification.

### 2.6 Broker

Routes messages to agents, manages session lifecycle, executes agent runs.

**Responsibilities:**
- Message routing (persona → session → thread resolution)
- Queue management (steer, followup, collect, interrupt modes)
- Session pointer management (prevent stale routing)
- Agent execution (pi-agent invocation)
- Direct writes to Agent Ledger

**Key invariants for session routing:**
1. Process queued messages serially (one at a time per session)
2. Fresh lookup of session pointer before each message
3. Update session pointer after turn completes
4. Session table is source of truth

**See:** `specs/agent-system/BROKER.md` for full broker specification.

### 2.6 Index

Derived layer that processes ledger data for intelligent access.

| Component | Purpose |
|-----------|---------|
| **Episodes** | Chunks of ledger data grouped for analysis |
| **Facets** | Extracted metadata (entities, topics, intent, sentiment) |
| **Embeddings** | Vector representations for semantic search |
| **Search** | Unified interface over embeddings |

**Processing flow:**
```
Ledgers → Episode Creation → Analysis Runs → Facet Extraction → Embedding Generation
```

**Used by:**
- Hooks (context for evaluation)
- Broker (smart forking, context enrichment)
- CLI (semantic search)

---

## 3. Critical Architecture Decisions

### 3.1 Broker Writes Directly to Ledger (No File Loop)

**Problem:** If the Broker wrote to JSONL files, and AIX synced from those files to the Ledger, smart forking would create duplication loops.

```
PROBLEMATIC (avoided):
  Broker → JSONL → AIX → Ledger → Smart Fork → Broker → JSONL... (loop!)
```

**Solution:** The Broker writes directly to the Agent Ledger. AIX only ingests from *external* harnesses (Cursor, Codex, etc.), not from Nexus.

```
CORRECT:
  External harnesses → AIX → Agent Ledger
  Nexus Broker → Agent Ledger (direct, no AIX)
  
  Smart forking reads/writes same ledger. No loop.
```

### 3.2 Single Database

All data lives in `~/nexus/state/nexus.db`:
- Event Ledger tables
- Agent Ledger tables
- Index tables (episodes, facets, embeddings)

**Rationale:** 
- Simpler transactions across ledgers
- Single backup target
- Consistent query interface
- SQLite handles the scale we need

**Future consideration:** If performance requires, ledgers and index could be separate databases. The interface would remain the same.

### 3.3 External vs Internal Agent Sessions

| Source | Storage Path | Ingestion |
|--------|--------------|-----------|
| **Cursor** | `~/.cursor/...` (SQLite) | AIX → Agent Ledger |
| **Codex** | `~/.codex/sessions/` (JSONL) | AIX → Agent Ledger |
| **Claude Code** | `~/.claude/...` (JSONL) | AIX → Agent Ledger |
| **Nexus Broker** | Agent Ledger (direct) | No ingestion needed |

Nexus Broker is *not* an external harness. It writes directly to the ledger.

---

## 4. Service Name as Universal Linking Key

The **service name** links credentials, skills, and capabilities:

```
┌─────────────┐         ┌─────────────┐         ┌─────────────┐
│   SKILL     │         │ CREDENTIAL  │         │ CAPABILITY  │
│             │  link   │             │  link   │             │
│ requires:   │◀───────▶│ service:    │◀───────▶│ provided by │
│ credentials:│         │ "google"    │         │ skill with  │
│ [google]    │         │             │         │ capabilities│
└─────────────┘         └─────────────┘         └─────────────┘
```

| Component | Uses Service Name For |
|-----------|----------------------|
| **Skill** | `requires.credentials: [google]` — declares dependency |
| **Credential** | `service: "google"` — primary identifier |
| **Connector** | `enables: [google]` — sets up credentials for service |
| **Capability** | Derived from skill's `capabilities` field |

---

## 5. Status Cascade System

Status flows from credentials through skills to capabilities:

```
┌──────────────────────────────────────────────────────────────────────┐
│                       STATUS CASCADE                                  │
│                                                                      │
│   CREDENTIAL          SKILL              CAPABILITY                  │
│   ─────────          ─────              ──────────                  │
│                                                                      │
│   ❌ broken    ──►   🔧 needs-setup  ──►   🔧 needs-setup          │
│   ⭐ ready     ──►   ⭐ ready        ──►   ⭐ ready                 │
│   ✅ active    ──►   ✅ active       ──►   ✅ active               │
│   📥 missing   ──►   📥 needs-install ──►  📥 needs-install        │
│   ⛔ platform  ──►   ⛔ unavailable   ──►  ⛔ unavailable           │
└──────────────────────────────────────────────────────────────────────┘
```

| Status | Emoji | Meaning |
|--------|-------|---------|
| `active` | ✅ | Configured AND used |
| `ready` | ⭐ | Configured, never used |
| `needs-setup` | 🔧 | Missing credentials/config |
| `needs-install` | 📥 | Missing binary |
| `unavailable` | ⛔ | Wrong platform |
| `broken` | ❌ | Verification failed |

---

## 6. CLI Organization

### Primary Commands

```
nexus
├── status              # Orientation: who am I, what can I do?
├── capabilities        # Full capability map
├── skills              # Skill operations
│   ├── list
│   ├── use <name>
│   └── info <name>
├── credential          # Credential management
│   ├── list
│   ├── add
│   ├── verify <service>
│   └── scan
├── sync                # Adapter sync operations
│   └── --source <adapter>
├── search <query>      # Semantic search over Index
└── config              # Configuration
```

### Agent System Commands (Future)

```
nexus
├── broker
│   ├── start           # Start broker service
│   ├── status          # Broker health
│   └── route <target>  # Manual message routing
├── ledger
│   ├── migrate         # Run migrations
│   └── stats           # Ledger statistics
└── index
    ├── reindex         # Rebuild index
    └── search <query>  # Semantic search
```

---

## 7. Skills Taxonomy

Skills are capability providers with dependency declarations.

### Skill Types

| Type | Purpose | Key Field |
|------|---------|-----------|
| **Tool** | Binary + docs | `capabilities: [...]` |
| **Connector** | Sets up credentials | `enables: [...]` |
| **Guide** | Pure documentation | `capabilities: [...]` |

### Three-Layer Model

```
Domain (grouping)
└── Capability (what you can access)
    └── Service (who provides it)
```

**See:** `specs/skills/UNIFIED_SKILLS_OVERVIEW.md` for full skills specification.

---

## 8. Consumer-Centric Access Control

Credentials are controlled at the consumer level, not the credential level.

```json
// state/nexus/config.json
{
  "gateway": {
    "credentials": {
      "level": 1,
      "blocked": ["google/*", "github/*"]
    }
  }
}
```

| Level | Name | Default |
|-------|------|---------|
| 0 | Trust All | Allow everything |
| 1 | Opt-Out | Allow, can block |
| 2 | Opt-In | Deny, must allow |
| 3 | Scoped | Deny + scope check |

**See:** `specs/credentials/CREDENTIAL_SYSTEM.md` for full credential specification.

---

## 9. Agent System Ontology

Core data model for agent conversations:

| Concept | Definition | Analogy |
|---------|------------|---------|
| **Message** | Atomic content unit | File change |
| **Turn** | Query + response exchange | Commit |
| **Thread** | Turn + all ancestors | Branch history |
| **Session** | Thread whose head has no children | Branch tip |

**Key insight:** Turns form a tree. Sessions are pointers to active tips. Threads are computed (not stored).

**See:** `specs/agent-system/ONTOLOGY.md` for full data model.

---

## 10. Specification Index

### Core System
| Document | Status | Description |
|----------|--------|-------------|
| **UNIFIED_SYSTEM.md** | ✅ Canonical | This document |
| **specs/workspace/** | ✅ Current | Workspace structure, bindings |
| **specs/cli/** | ✅ Current | CLI commands and behavior |
| **specs/skills/** | ✅ Current | Skills system |
| **specs/credentials/** | ✅ Current | Credential system |
| **specs/acl/** | ✅ New | Access control system (policies, grants, audit) |

### Agent System
| Document | Status | Description |
|----------|--------|-------------|
| **UNIFIED_ARCHITECTURE.md** | ✅ Canonical | Agent system architecture diagram |
| **ONTOLOGY.md** | ✅ Canonical | Data model (Message, Turn, Thread, Session, Compaction) |
| **COMPACTION.md** | ✅ New | Compaction as special turn type |
| **EVENT_SYSTEM_DESIGN.md** | ✅ Current | Event layer, hooks, adapters |
| **BROKER.md** | ⚠️ Update needed | Needs ACL dispatch interface |
| **SESSION_FORMAT.md** | ⚠️ Update needed | Reflects direct ledger writes |

### Access Control System (NEW)
| Document | Status | Description |
|----------|--------|-------------|
| **ACCESS_CONTROL_SYSTEM.md** | ✅ New | Unified ACL overview |
| **POLICIES.md** | ✅ New | Policy schema and examples |
| **GRANTS.md** | ✅ New | Dynamic permission grants |
| **AUDIT.md** | ✅ New | Audit logging |

### Memory/Index System
| Document | Status | Description |
|----------|--------|-------------|
| **mnemonic/MNEMONIC_ARCHITECTURE.md** | ⚠️ Rename | Needs update to "Index" terminology |
| **mnemonic/AGENTS_LEDGER_FORKING.md** | ✅ Current | Forking behavior |
| **aix/AIX_MNEMONIC_PIPELINE.md** | ⚠️ Update needed | Reflects external-only ingestion |

---

## 11. Open Items

### Terminology Updates Needed

| Old Term | New Term | Files to Update |
|----------|----------|-----------------|
| Mnemonic | Index | All mnemonic/ docs, EVENT_SYSTEM_DESIGN.md |
| Core Ledger/Tables | Index | Schema files, architecture docs |
| Memory | Index | Various references |

### Architecture Updates Needed

| Change | Files Affected |
|--------|----------------|
| Broker writes directly to ledger | SESSION_FORMAT.md, BROKER.md |
| AIX only for external harnesses | AIX_MNEMONIC_PIPELINE.md |
| Single nexus.db database | Schema files, workspace docs |
| No ~/nexus/state/sessions/ | SESSION_FORMAT.md, workspace docs |

### Pending Specifications

| Topic | Status | Notes |
|-------|--------|-------|
| Smart forking algorithm | TODO | Scoring, context assembly |
| Index pipeline details | TODO | Episode → facet → embedding flow |
| Hook → Broker interface | TODO | How fired hooks become broker calls |

---

## 12. Summary

| Principle | Description |
|-----------|-------------|
| **Adapters → Ledger → Broker** | Clean unidirectional data flow |
| **Ledger + Index** | Primary data vs derived data separation |
| **Direct ledger writes** | Broker writes to Agent Ledger, no file intermediary |
| **Service as key** | Service name links credentials, skills, capabilities |
| **Status cascade** | Credential → skill → capability status flow |
| **Single database** | All state in `nexus.db` |
| **Visible state** | `state/` directory is visible, not hidden |

---

*This document is the canonical system overview. See individual spec files for implementation details.*
