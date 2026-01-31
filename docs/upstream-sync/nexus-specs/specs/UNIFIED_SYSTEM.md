# Unified System Specification

**Status:** CANONICAL REFERENCE  
**Last Updated:** 2026-01-30

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
│   ┌──────────────┐    ┌────────────┐            │                               │
│   │ EVENT LEDGER │    │ ID LEDGER  │────────────┼───────────────┐               │
│   └──────┬───────┘    └─────┬──────┘            │               │               │
│          │                  │                   │               │               │
│          └──────────────────┴───────────────────┼───────────────┤               │
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

### 1.2 Data Flow Summary

```
In-Adapters → Event Ledger → [Id Ledger → ACL → Hooks] → Broker → Agent Ledger
                   │              │                         │            │
                   │              │                         ▼            │
                   │              │                    Out-Adapters      │
                   │              │                         │            │
                   └──────────────┴─────────► Index ◄───────┴────────────┘
                                            (derived)
```

1. **In-Adapters** normalize external data → **Event Ledger**
2. **Event Handler** resolves identity via **Identity Ledger**
3. **ACL** evaluates policies against resolved principal
4. If allowed, **Hooks** evaluate content-based logic
5. Fired hooks route to **Broker** with routing instructions + permissions
6. **Broker** manages session lifecycle, reads/writes **Agent Ledger**
7. **Agents** (MA/WAs) execute and send responses via **Out-Adapters**
8. **Index** continuously processes all three ledgers → episodes → facets → embeddings

### 1.3 Three-Ledger Model

| Ledger | Purpose | Contents |
|--------|---------|----------|
| **Event Ledger** | What happened | Raw events, threads |
| **Identity Ledger** | Who is involved | Entities (persons, personas), identities, relationships |
| **Agent Ledger** | AI conversation state | Sessions, turns, messages, tool_calls |

**Plus the derived layer:**

| Layer | Purpose | Contents |
|-------|---------|----------|
| **Index** | Computed for access | Episodes, facets, embeddings, search |

**Key insight:** The three ledgers are the source of truth. The Index makes them useful.

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

Three conceptual ledgers store primary data in `nexus.db`:

#### Event Ledger

Normalized events from all external sources.

| Table | Purpose |
|-------|---------|
| `events` | All normalized events (messages, emails, etc.) |
| `threads` | Event groupings (conversations, email threads) |
| `event_participants` | Event ↔ entity links |
| `event_state` | Per-event lifecycle state |
| `event_tags` | Event ↔ tag associations |

#### Identity Ledger

Who is involved — the principal resolution layer for ACL.

| Table | Purpose |
|-------|---------|
| `entities` | Persons and personas (type: 'person' \| 'persona') |
| `entity_identities` | Contact handles/accounts per entity |
| `entity_tags` | Custom tagging for entities |

**Key distinction:**
- **Persons** HAVE identities (contact info discovered from messages)
- **Personas** OWN identities (bot accounts they control)

The Identity Ledger is queried by ACL during principal resolution:
```sql
SELECT e.*, ei.* FROM entities e
JOIN entity_identities ei ON e.id = ei.entity_id
WHERE ei.channel = 'imessage' AND ei.identifier = '+15551234567'
```

**Index enrichment:** The Index can feed back into Identity Ledger — learning relationships over time from conversation patterns.

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
- Identity resolution via **Identity Ledger** (entities + entity_identities tables)
- Priority-based policy evaluation (deny overrides allow)
- Dynamic permission grants with approval workflow
- Full audit logging

**See:** `specs/acl/` for full ACL specification.

### 2.5 Out-Adapters

Format and deliver agent responses to external platforms.

| Adapter | Delivery Method | Key Constraints |
|---------|-----------------|-----------------|
| Discord | REST API | 2000 char limit, embeds, threads |
| Telegram | Bot API | 4000 chars, markdown, media groups |
| WhatsApp | Baileys socket | PTT audio, polls, read receipts |
| Slack | Blocks API | Threads, reactions |
| Email | SMTP | MIME, threading headers |

**Response flow:**
1. Agent completes turn → response captured
2. Broker determines delivery target from original event context
3. Out-Adapter formats response per platform rules
4. Response sent to platform
5. **Response becomes an event** in Event Ledger (closes the loop)

**See:** `specs/adapters/OUT_ADAPTERS.md` (TODO) for full specification.

### 2.6 Hooks

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

### 2.7 Broker

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

### 2.8 Index

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

## 10. Component Interfaces

This section defines the contracts between components. Each interface specifies what data flows, in what format, and who is responsible for what.

### 10.1 Interface Map

```
┌───────────────┐                           ┌──────────────────────────────────────┐
│  IN-ADAPTERS  │──── (1) NormalizedEvent ─►│           EVENT LEDGER               │
└───────────────┘                           └──────────────────┬───────────────────┘
                                                               │
                                                     (2) EventTrigger
                                                               │
                                                               ▼
                                            ┌──────────────────────────────────────┐
                                            │           EVENT HANDLER              │
                                            │                                      │
                                            │  ┌─────────────┐                     │
                                            │  │ ID LEDGER   │◄─(8)─ Index writes  │
                                            │  └──────┬──────┘                     │
                                            │         │                            │
                                            │  (3) IdentityLookup                  │
                                            │         │                            │
                                            │         ▼                            │
                                            │  ┌─────────────┐                     │
                                            │  │     ACL     │                     │
                                            │  └──────┬──────┘                     │
                                            │         │                            │
                                            │  (4) ACLResult                       │
                                            │         │ (allow/deny + permissions) │
                                            │         ▼                            │
                                            │  ┌─────────────┐                     │
                                            │  │ HOOK EVAL   │                     │
                                            │  └──────┬──────┘                     │
                                            │         │                            │
                                            └─────────┼────────────────────────────┘
                                                      │
                                            (5) BrokerDispatch
                                                      │
                                                      ▼
                                            ┌──────────────────┐
                                            │      BROKER      │
                                            └────────┬─────────┘
                                                     │
                         ┌───────────────────────────┼───────────────────────────┐
                         │                           │                           │
               (6) AgentInvoke               (7) LedgerWrite             (9) OutAdapterSend
                         │                           │                           │
                         ▼                           ▼                           ▼
                  ┌────────────┐            ┌──────────────┐            ┌──────────────┐
                  │   AGENTS   │            │ AGENT LEDGER │            │ OUT-ADAPTERS │
                  │  (MA/WAs)  │            └──────────────┘            └──────┬───────┘
                  └─────┬──────┘                                               │
                        │                                                      │
                        └──────────────────────────────────────────────────────┤
                                                                               │
                                                               (10) ResponseEvent
                                                                               │
                                                                               ▼
                                                                      EVENT LEDGER
                                                                      (closes loop)

┌───────────────────────────────────────────────────────────────────────────────────┐
│                                    INDEX                                           │
│                                                                                   │
│   Reads from: Event Ledger, Identity Ledger, Agent Ledger                         │
│   Writes to: Identity Ledger (enrichment), Index tables (episodes, facets, etc.)  │
│                                                                                   │
│   Read by: Hooks (context), Broker (smart forking), CLI (search), Agents (RAG)    │
└───────────────────────────────────────────────────────────────────────────────────┘
```

### 10.2 Interface Contracts

#### (1) In-Adapter → Event Ledger: `NormalizedEvent`

The adapter normalizes external data into a canonical event format.

```typescript
interface NormalizedEvent {
  // Identity
  id: string;                      // Deterministic: "{source}:{source_id}"
  source: AdapterSource;           // 'imessage' | 'gmail' | 'discord' | ...
  source_id: string;               // Original ID from source
  
  // Classification
  type: EventType;                 // 'message' | 'email' | 'reaction' | ...
  thread_id?: string;              // Thread grouping
  
  // Content
  content: string;                 // Normalized text content
  content_type: 'text' | 'html';
  attachments?: Attachment[];
  
  // Participants
  from: ParticipantRef;            // { channel, identifier }
  to?: ParticipantRef[];
  
  // Timing
  timestamp: number;               // Unix ms
  
  // Source-specific
  metadata?: Record<string, any>;  // Platform-specific extras
}
```

**Contract:**
- Adapter MUST generate deterministic `id` (enables idempotent sync)
- Adapter MUST normalize content to text (strip platform-specific formatting)
- Adapter MUST provide `from` participant reference

#### (2) Event Ledger → Event Handler: `EventTrigger`

New events trigger the Event Handler (via DB trigger, polling, or push).

```typescript
interface EventTrigger {
  event_id: string;
  event: NormalizedEvent;          // Full event data
  thread_context?: ThreadContext;  // Previous events in thread
}
```

**Contract:**
- Ledger MUST trigger handler for each new event
- Ledger MAY batch triggers for efficiency
- Handler MUST process each trigger exactly once (idempotent)

#### (3) Event Handler (internal): `IdentityLookup`

Handler queries Identity Ledger to resolve the sender.

```typescript
interface IdentityLookupRequest {
  channel: string;                 // 'imessage', 'discord', etc.
  identifier: string;              // '+15551234567', 'user#1234', etc.
}

interface IdentityLookupResult {
  found: boolean;
  entity?: {
    id: string;
    type: 'person' | 'persona';
    name?: string;
    is_user: boolean;
    relationship?: string;
    tags: string[];
  };
}
```

**Contract:**
- Lookup MUST return `found: false` for unknown identifiers
- Handler MUST proceed with `{ unknown: true }` principal if not found

#### (4) Event Handler (internal): `ACLResult`

ACL evaluates policies and returns access decision + permissions.

```typescript
interface ACLResult {
  decision: 'allow' | 'deny';
  
  // Only present if allowed
  principal?: Principal;
  permissions?: {
    tools: { allow: string[]; deny: string[] };
    credentials: { allow: string[]; deny: string[] };
    data: { allow: string[]; deny: string[] };
  };
  session?: {
    persona: string;
    key: string;
    label?: string;
  };
  
  // Audit
  matched_policy?: string;
  reason?: string;
}
```

**Contract:**
- ACL MUST return decision for every event
- If `deny`, handler MUST NOT proceed to hooks or broker
- If `allow`, handler MUST pass permissions to broker

#### (5) Event Handler → Broker: `BrokerDispatch`

Fired hooks dispatch to the Broker with routing and context.

```typescript
interface BrokerDispatch {
  // Routing
  persona: string;                 // Target agent persona
  session_key: string;             // Session routing key
  queue_mode: 'steer' | 'followup' | 'collect' | 'interrupt';
  
  // Original event
  event_id: string;
  event: NormalizedEvent;
  
  // Access control
  principal: Principal;
  permissions: Permissions;
  
  // Hook context
  hook_context?: {
    prompt?: string;               // System prompt injection
    extracted?: Record<string, any>;
  };
  
  // Reply target (for out-adapter)
  reply_to?: {
    channel: string;
    thread_id?: string;
    recipient?: ParticipantRef;
  };
}
```

**Contract:**
- Hook MUST provide `persona` and `session_key` for routing
- Hook MAY provide `hook_context` for prompt injection
- Broker MUST respect `permissions` during agent execution

#### (6) Broker → Agent: `AgentInvoke`

Broker invokes the agent with session context and message.

```typescript
interface AgentInvoke {
  // Session
  session_id: string;
  turn_id: string;                 // New turn being created
  parent_turn_id?: string;         // Parent in tree (for forking)
  
  // Agent config
  persona: string;
  model_config: ModelConfig;
  
  // Message
  messages: Message[];             // Conversation history
  new_message: Message;            // The incoming message
  
  // Permissions (agent must respect)
  permissions: Permissions;
  
  // Context from Index
  context?: IndexContext;
  
  // Reply target
  reply_to?: ReplyTarget;
}
```

**Contract:**
- Broker MUST provide conversation history (from Agent Ledger)
- Agent MUST respect `permissions` (tool/credential access)
- Agent MUST return structured response for ledger storage

#### (7) Broker → Agent Ledger: `LedgerWrite`

Broker writes session/turn/message data directly to Agent Ledger.

```typescript
// All writes are direct SQL inserts/updates
interface TurnWrite {
  id: string;
  session_id: string;
  parent_turn_id?: string;
  started_at: number;
  completed_at?: number;
  status: 'pending' | 'streaming' | 'completed' | 'failed';
}

interface MessageWrite {
  id: string;
  turn_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at: number;
}

interface ToolCallWrite {
  id: string;
  turn_id: string;
  tool_name: string;
  parameters: string;              // JSON
  result?: string;                 // JSON
  started_at: number;
  completed_at?: number;
  status: 'pending' | 'completed' | 'failed';
}
```

**Contract:**
- Broker MUST write turn on start (status='pending')
- Broker MUST update turn on completion
- Broker MUST update session pointer after turn completes

#### (8) Index → Identity Ledger: `IdentityEnrichment`

Index can write back learned relationships to Identity Ledger.

```typescript
interface IdentityEnrichment {
  entity_id: string;
  
  // Updates (all optional)
  relationship?: string;           // Learned from conversation patterns
  tags_add?: string[];
  tags_remove?: string[];
  
  // New identities discovered
  new_identities?: {
    channel: string;
    identifier: string;
  }[];
  
  // Confidence
  confidence: number;              // 0-1, for review thresholds
  source: 'index_analysis';
}
```

**Contract:**
- Index SHOULD only write high-confidence enrichments
- Index MUST NOT overwrite user-set values (relationship, name)
- Low-confidence enrichments SHOULD queue for human review

#### (9) Broker/Agent → Out-Adapter: `OutAdapterSend`

Agent responses are formatted and sent via out-adapters.

```typescript
interface OutAdapterSend {
  // Target
  channel: string;                 // 'discord', 'telegram', etc.
  thread_id?: string;
  recipient?: ParticipantRef;
  
  // Content
  content: string;                 // Markdown
  attachments?: Attachment[];
  
  // Platform hints
  format_hints?: {
    use_embed?: boolean;           // Discord
    use_blocks?: boolean;          // Slack
    suppress_link_previews?: boolean;
  };
  
  // Source (for event capture)
  source_turn_id: string;
  source_persona: string;
}
```

**Contract:**
- Out-Adapter MUST format content per platform rules
- Out-Adapter MUST handle platform limits (truncation, splitting)
- Out-Adapter MUST capture response as event (interface 10)

#### (10) Out-Adapter → Event Ledger: `ResponseEvent`

Sent responses become events in the ledger (closes the loop).

```typescript
interface ResponseEvent extends NormalizedEvent {
  type: 'message';
  source: 'nexus';                 // Self-generated
  
  // Link to originating turn
  metadata: {
    turn_id: string;
    persona: string;
    in_reply_to?: string;          // Original event_id
  };
}
```

**Contract:**
- Out-Adapter MUST write response event after successful send
- Response event MUST link to originating turn
- This enables "what did the agent say?" queries

### 10.3 Index Interfaces (Passive)

The Index is primarily a passive consumer that reads from ledgers and is queried by other components.

#### Index Reads From:

| Ledger | What | Trigger |
|--------|------|---------|
| Event Ledger | New events | On insert (trigger/poll) |
| Identity Ledger | Entity data | On demand (join) |
| Agent Ledger | Turns, messages | On insert (trigger/poll) |

#### Index Is Queried By:

| Component | Query Type | Purpose |
|-----------|------------|---------|
| Hooks | Semantic search | Context for hook evaluation |
| Broker | Smart forking | Find best fork point |
| Broker | Context enrichment | RAG for agent context |
| Agents | Tool calls | `index_search` tool |
| CLI | `nexus search` | User semantic search |

#### Index Query Interface:

```typescript
interface IndexQuery {
  query: string;                   // Natural language or semantic
  filters?: {
    sources?: string[];            // Limit to adapters
    time_range?: { start: number; end: number };
    entity_ids?: string[];         // Limit to participants
  };
  limit?: number;
  include_embeddings?: boolean;
}

interface IndexResult {
  hits: {
    episode_id: string;
    score: number;
    content_preview: string;
    source_event_ids: string[];
    facets: Facet[];
  }[];
  total_hits: number;
}
```

---

## 11. Specification Index

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

## 12. Open Items

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
| Hook → Broker interface | ✅ Done | See Section 10.2 (5) BrokerDispatch |

---

## 13. Summary

| Principle | Description |
|-----------|-------------|
| **Three-Ledger Model** | Event, Identity, Agent ledgers as primary data |

| **In-Adapters → Ledgers → Broker → Out-Adapters** | Clean data flow |
| **ACL before Hooks** | Declarative policies (WHO) before programmatic scripts (WHAT) |
| **Direct ledger writes** | Broker writes to Agent Ledger, no file intermediary |
| **Identity Ledger for principal resolution** | ACL queries Identity Ledger to resolve senders |
| **Index enriches Identity** | Learned relationships feed back into Identity Ledger |
| **Service as key** | Service name links credentials, skills, capabilities |
| **Status cascade** | Credential → skill → capability status flow |
| **Single database** | All state in `nexus.db` |
| **Visible state** | `state/` directory is visible, not hidden |

---

*This document is the canonical system overview. See individual spec files for implementation details.*
