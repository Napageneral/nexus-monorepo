# Nexus Architecture Overview

**Status:** CANONICAL  
**Last Updated:** 2026-02-02

---

## What is Nexus?

Nexus is a personal AI workspace — an operating system for AI agents that manage your digital life. It connects to your communication channels (iMessage, email, Discord, etc.), understands context from your history, and executes tasks on your behalf.

---

## Core Concept: NEX

At the heart of Nexus is **NEX** (Nexus Event Exchange) — a central orchestrator that processes all events through a unified pipeline.

**Key insight:** Everything is an event. A text message, an email, a calendar notification, a timer tick — all flow through NEX.

---

## The Pipeline (8 Stages)

NEX processes events through 8 sequential stages. Each stage is a verb describing what happens:

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              NEX PIPELINE                                        │
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │                            ADAPTERS                                      │    │
│  │                                                                          │    │
│  │  eve (iMessage)  ·  gog (Gmail)  ·  discord  ·  telegram  ·  webhooks   │    │
│  │  slack  ·  signal  ·  timers  ·  aix (IDE)  ·  calendar  ·  contacts    │    │
│  │                                                                          │    │
│  └────────────────────────────────────┬────────────────────────────────────┘    │
│                                       │                                          │
│                                       │ AdapterEvent                             │
│                                       ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │                              PIPELINE                                    │    │
│  │                                                                          │    │
│  │   1. receiveEvent       Create NexusRequest from event                  │    │
│  │        ↓                Write event to System of Record (async)         │    │
│  │                                                                          │    │
│  │   2. resolveIdentity    WHO sent this? Query Identity Ledger            │    │
│  │        ↓                Populate: principal.identity                    │    │
│  │                                                                          │    │
│  │   3. resolveAccess      WHAT can they do? Evaluate ACL policies         │    │
│  │        ↓                Populate: permissions, session (base)           │    │
│  │                                                                          │    │
│  │   4. executeTriggers    Match and execute hooks (parallel)              │    │
│  │        ↓                Populate: hooks context, may handle event       │    │
│  │                                                                          │    │
│  │   5. assembleContext    Gather history from Cortex                      │    │
│  │        ↓                Prepare agent context                           │    │
│  │                                                                          │    │
│  │   6. runAgent           Execute agent (streaming)                       │    │
│  │        ↓                Generate response, call tools                   │    │
│  │                                                                          │    │
│  │   7. deliverResponse    Send response via out-adapter                   │    │
│  │        ↓                Handle formatting, chunking                     │    │
│  │                                                                          │    │
│  │   8. finalize           Write trace, emit for analysis                  │    │
│  │                                                                          │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Pipeline Hooks

Each stage supports hooks that run after completion:

```
afterReceiveEvent → afterResolveIdentity → afterResolveAccess → afterExecuteTriggers
→ afterAssembleContext → afterRunAgent → afterDeliverResponse → onFinalize
```

Hooks can observe, modify the NexusRequest, or skip remaining stages.

---

## Stages → Components

The 8 pipeline stages map to 6 core components:

| Stage | Component | Description |
|-------|-----------|-------------|
| `receiveEvent` | **In-Adapters** | eve, gog, discord, telegram, timers, webhooks |
| `resolveIdentity` | **IAM** | Identity resolution from Identity Ledger |
| `resolveAccess` | **IAM** | ACL policy evaluation, permissions, session routing |
| `executeTriggers` | **Hooks Engine** | Match triggers, execute hooks |
| `assembleContext` | **Broker** | Gather history, Cortex context, agent config |
| `runAgent` | **Broker** | Execute agent with assembled context |
| `deliverResponse` | **Out-Adapters** | Format and deliver to platforms |
| `finalize` | **NEX** | Trace logging, emit for Cortex analysis |

**Component view:**
```
NEX orchestrates:
  In-Adapters → IAM → Hooks Engine → Broker → Out-Adapters
                              ↓
                    System of Record + Cortex
```

---

## Data Model

### System of Record (Source of Truth)

Primary data stores:

| Ledger | Purpose | Contents |
|--------|---------|----------|
| **Events** | What happened | All inbound/outbound events (permanent) |
| **Agents** | AI conversations | Sessions, turns, messages, tool calls |
| **Identity** | Who is involved | Contacts (hard facts) → Entities → Mappings (fuzzy) |
| **Nexus** | Pipeline traces | NexusRequest lifecycle, timing, audit |

All ledgers live in `~/nexus/state/nexus.db` (SQLite).

**See:** `ledgers/`

### Cortex (Derived Layer)

Mutable analysis layer that makes raw data useful:

| Component | Purpose |
|-----------|---------|
| **Episodes** | Chunks of events grouped for analysis |
| **Facets** | Extracted metadata (entities, topics, sentiment) |
| **Embeddings** | Vector representations for semantic search |
| **Analyses** | Insights, patterns, learned relationships |

**Key insight:** System of Record is facts. Cortex is understanding.

---

## The Data Bus: NexusRequest

Every event creates a `NexusRequest` object that flows through the pipeline, accumulating context at each stage:

| Stage | Adds to NexusRequest |
|-------|---------------------|
| `receiveEvent` | `event`, `delivery` (channel, thread, etc.) |
| `resolveIdentity` | `principal.identity` (who sent this) |
| `resolveAccess` | `permissions`, `session` (routing) |
| `executeTriggers` | `hooks` (which fired, extracted context) |
| `assembleContext` | `agent` (turn_id, thread_id, context) |
| `runAgent` | `response` (content, tool calls, tokens) |
| `deliverResponse` | `delivery_result` (message IDs, success) |
| `finalize` | `pipeline` (timing, trace) |

The complete NexusRequest is persisted to Nexus Ledger for debugging and audit.

---

## Key Components

### In-Adapters

Connect Nexus to external platforms:
- **eve** — iMessage
- **gog** — Gmail  
- **discord**, **telegram**, **slack**, **signal** — Chat platforms
- **timers** — Scheduled events
- **webhooks** — External services (Stripe, GitHub, etc.)
- **aix** — IDE sessions (Cursor, Codex, Claude Code)

Each adapter normalizes events to a canonical `NormalizedEvent` format.

**See:** `adapters/`

### IAM (Identity & Access Management)

Determines WHO can interact and WHAT they can do:
- Resolves sender identity from Identity Ledger
- Evaluates declarative ACL policies (YAML)
- Assigns permissions and session routing
- Logs all decisions for audit

**See:** `iam/`

### Hooks Engine

Programmatic event handlers:
- **Pipeline Hooks** — Run at NEX pipeline stages
- **Event Hooks** — User/agent-created automation scripts
- Match events via declarative triggers
- Execute TypeScript handlers in parallel
- Can extract data, enrich context, or handle events entirely

**See:** `hooks/`

### Broker

Orchestrates agent execution:
- Assembles conversation context (history + Cortex)
- Manages sessions, threads, turns
- Coordinates streaming to out-adapters
- Writes directly to Agents Ledger

**See:** `broker/`

### Out-Adapters

Format and deliver responses:
- Platform-specific formatting (char limits, markdown support)
- Message chunking if needed
- Response becomes an event (closes the loop)

**See:** `adapters/`

---

## Data Flow Examples

### Example 1: Mom texts asking for 2FA code

```
1. eve receives iMessage from +1-555-MOM
2. NEX creates NexusRequest
3. IAM resolves +1-555-MOM → entity "Mom" (relationship: family)
4. IAM grants: minimal tools, no shell, route to persona "Atlas"
5. Hooks match: "mom-2fa-helper" triggers on Mom + content match
6. Hook extracts: looking for Amazon code, checks email
7. Hook handles: responds directly with code (skips agent)
8. Deliver: sends via eve
9. Complete: traces logged
```

### Example 2: Colleague asks question on Discord

```
1. discord-cli receives message in #general
2. NEX creates NexusRequest
3. IAM resolves discord:user123 → entity "Alex" (relationship: work)
4. IAM grants: web search, calendar read, route to "Atlas"
5. Hooks: none match
6. Broker prepares: fetches conversation history, relevant context from Cortex
7. Agent executes: generates response, calls web_search
8. Deliver: sends to Discord (chunks if needed)
9. Complete: traces logged
10. Cortex (background): extracts entities from conversation
```

### Example 3: Timer tick (heartbeat)

```
1. timer adapter emits 60-second tick
2. NEX creates NexusRequest (principal: system)
3. IAM: system principal, timer policies
4. Hooks match: "email-check" (cron trigger)
5. Hook executes: checks email, finds nothing urgent
6. Hook returns: no action needed
7. Pipeline exits early
8. Complete: traces logged
```

---

## Design Principles

1. **Central orchestration** — NEX coordinates everything
2. **Data bus** — NexusRequest accumulates context through pipeline
3. **Sync pipeline, async writes** — Fast critical path, durable storage
4. **Hook-friendly** — Extensible at every stage
5. **Modular** — Each component is replaceable
6. **Observable** — Full traces persisted
7. **Secure by default** — IAM before anything else

---

## Critical Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Central orchestrator** | NEX | One place owns the pipeline |
| **Data bus** | NexusRequest | Context accumulates through stages |
| **Broker writes directly** | To Agents Ledger (no JSONL) | Avoids sync loops with AIX |
| **Single database** | SQLite (`nexus.db`) | Simpler transactions, single backup |
| **IAM before Hooks** | Policies (WHO) before scripts (WHAT) | Security first |
| **All agents persistent** | No ephemeral agents | Every session can be resumed |
| **Nested spawning allowed** | WAs can spawn sub-WAs | Removed upstream restriction |

---

## Specification Index

### Core System

| Folder | Status | Description |
|--------|--------|-------------|
| **nex/** | ✅ Current | NEX orchestrator, pipeline, interfaces |
| **broker/** | ✅ Current | Agent sessions, turns, ontology |
| **iam/** | ✅ Current | Identity & Access Management (policies, grants, audit) |
| **hooks/** | ✅ Current | Hooks Engine, event automation |
| **adapters/** | ✅ Current | In/out adapters, channel specs |

### Data Layer

| Folder | Status | Description |
|--------|--------|-------------|
| **ledgers/** | ✅ Current | System of Record schemas (Events, Agents, Identity) |
| **cortex/** | ✅ Current | Derived layer (episodes, facets, embeddings) |

### Supporting Systems

| Folder | Status | Description |
|--------|--------|-------------|
| **workspace/** | ✅ Current | File structure, identity, bindings |
| **cli/** | ✅ Current | CLI commands, capabilities |
| **skills/** | ✅ Current | Skills hub, taxonomy |
| **credentials/** | ✅ Current | Credential system |

### Reference

| Folder | Status | Description |
|--------|--------|-------------|
| **project-structure/** | ✅ Current | Codebase layout, fork mapping |

### Future / Placeholder

| Folder | Status | Description |
|--------|--------|-------------|
| **cloud/** | 📋 Placeholder | Encrypted sync service |
| **collab/** | 📋 Placeholder | Multi-user collaboration |

---

## Related Documents

- `nex/NEX.md` — Full NEX specification
- `nex/NEXUS_REQUEST.md` — Data bus schema
- `nex/INTERFACES.md` — Component interface contracts
- `broker/UNIFIED_ARCHITECTURE.md` — Agent system architecture
- `project-structure/FORK_MAPPING.md` — Openclaw → Nexus mapping
