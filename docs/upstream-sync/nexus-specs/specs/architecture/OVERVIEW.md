# Nexus Architecture Overview

**Status:** CANONICAL  
**Last Updated:** 2026-01-30

---

## What is Nexus?

Nexus is a personal AI workspace — an operating system for AI agents that manage your digital life. It connects to your communication channels (iMessage, email, Discord, etc.), understands context from your history, and executes tasks on your behalf.

---

## Core Concept: NEX

At the heart of Nexus is **NEX** (Nexus Event Exchange) — a central orchestrator that processes all events through a unified pipeline.

**Key insight:** Everything is an event. A text message, an email, a calendar notification, a timer tick — all flow through NEX.

---

## The Pipeline

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
│  │   1. RECEIVE      Create NexusRequest from event                        │    │
│  │        ↓          Write event to Events Ledger (async)                  │    │
│  │                                                                          │    │
│  │   2. ACL          Resolve identity, evaluate policies                   │    │
│  │        ↓          Populate: principal, permissions, session             │    │
│  │                                                                          │    │
│  │   3. HOOKS        Match and execute hooks (parallel)                    │    │
│  │        ↓          Populate: hooks context, may handle event             │    │
│  │                                                                          │    │
│  │   4. BROKER       Prepare agent context                                 │    │
│  │        ↓          Assemble history, fetch relevant memories             │    │
│  │                                                                          │    │
│  │   5. AGENT        Execute agent (streaming)                             │    │
│  │        ↓          Generate response, call tools                         │    │
│  │                                                                          │    │
│  │   6. DELIVER      Send response via out-adapter                         │    │
│  │        ↓          Handle formatting, chunking                           │    │
│  │                                                                          │    │
│  │   7. COMPLETE     Finalize, write trace                                 │    │
│  │                   Emit for background analysis                          │    │
│  │                                                                          │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                       │                                          │
│                                       ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │                              LEDGERS                                     │    │
│  │                                                                          │    │
│  │  Events Ledger     All inbound/outbound events (permanent)              │    │
│  │  Agents Ledger     Turns, sessions, tool calls (compactable)            │    │
│  │  Identity Ledger   Entities, identities, relationships                  │    │
│  │  Nexus Ledger      Full NexusRequest traces (debugging)                 │    │
│  │                                                                          │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                       │                                          │
│                                       ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │                          INDEX (Background)                              │    │
│  │                                                                          │    │
│  │  Entity Extraction  ·  Relationship Extraction  ·  Embeddings           │    │
│  │  Contradiction Detection  ·  Memory Query  ·  Analysis                  │    │
│  │                                                                          │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## The Data Bus: NexusRequest

Every event creates a `NexusRequest` object that flows through the pipeline, accumulating context at each stage:

| Stage | Adds to NexusRequest |
|-------|---------------------|
| **Receive** | `event`, `delivery` (channel, thread, etc.) |
| **ACL** | `principal` (who), `permissions` (what they can do), `session` (routing) |
| **Hooks** | `hooks` (which fired, extracted context) |
| **Broker** | `agent` (agent ID, turn ID, thread ID) |
| **Agent** | `response` (content, tool calls, tokens) |
| **Deliver** | `delivery_result` (message IDs, success) |
| **Complete** | `pipeline` (timing, trace) |

The complete NexusRequest is persisted to the Nexus Ledger for debugging and audit.

---

## Key Components

### Adapters

Adapters connect Nexus to external platforms. Each adapter:
- **Inbound:** Receives events, normalizes to `AdapterEvent`, sends to NEX
- **Outbound:** Receives delivery requests, formats for platform, sends

Current adapters: eve (iMessage), gog (Gmail), aix (IDE), discord, telegram, slack, signal, webhooks, timers.

### ACL (Access Control Layer)

Determines WHO can interact and WHAT they can do:
- Resolves sender identity from Identity Ledger
- Evaluates declarative YAML policies
- Assigns permissions and session routing
- Logs all decisions for audit

### Hooks

Programmatic event handlers:
- Match events via declarative triggers
- Execute TypeScript handlers
- Can extract data, enrich context, or handle events entirely
- Run in parallel for performance

### Broker

Orchestrates agent execution:
- Assembles conversation context (history + relevant memories)
- Manages sessions, threads, turns
- Coordinates streaming to out-adapters
- Writes to Agents Ledger

### Agent

The AI that generates responses:
- Receives context from Broker
- Generates tokens (streaming)
- Calls tools as needed
- Returns structured response

### Ledgers

Persistent storage:
- **Events Ledger:** All communication events (never deleted)
- **Agents Ledger:** Agent sessions, turns, tool calls (subject to compaction)
- **Identity Ledger:** People, entities, relationships
- **Nexus Ledger:** Full request traces for debugging

### Index

Background analysis system:
- Extracts entities and relationships from events
- Generates embeddings for semantic search
- Detects contradictions in learned facts
- Powers memory queries for agents

---

## Data Flow Examples

### Example 1: Mom texts asking for 2FA code

```
1. eve receives iMessage from +1-555-MOM
2. NEX creates NexusRequest
3. ACL resolves +1-555-MOM → entity "Mom" (relationship: family)
4. ACL grants: minimal tools, no shell, route to persona "Atlas"
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
3. ACL resolves discord:user123 → entity "Alex" (relationship: work)
4. ACL grants: web search, calendar read, route to "Atlas"
5. Hooks: none match
6. Broker prepares: fetches conversation history, relevant work context
7. Agent executes: generates response, calls web_search
8. Deliver: sends to Discord (chunks if needed)
9. Complete: traces logged
10. Index (background): extracts entities from conversation
```

### Example 3: Timer tick (heartbeat)

```
1. timer adapter emits 60-second tick
2. NEX creates NexusRequest (principal: system)
3. ACL: system principal, timer policies
4. Hooks match: "email-check" (cron trigger)
5. Hook executes: checks email, finds nothing urgent
6. Hook returns: no action needed
7. Pipeline exits early
8. Complete: traces logged
```

---

## Evolution from Mnemonic

NEX is built on the existing Mnemonic Go server:

| Mnemonic | NEX Role |
|----------|----------|
| Bus | Async event queue for pipeline |
| Live watchers | Adapter registry and lifecycle |
| Compute engine | Parallel hook execution |
| Identify | ACL identity resolution |
| Memory pipeline | Background Index processing |
| Search | Broker context assembly |

See `MNEMONIC_NEX_MAPPING.md` for full mapping.

---

## Design Principles

1. **Central orchestration** — NEX coordinates everything
2. **Data bus** — NexusRequest accumulates context through pipeline
3. **Sync pipeline, async writes** — Fast critical path, durable storage
4. **Plugin-friendly** — Hooks at every stage
5. **Modular** — Each stage is replaceable
6. **Observable** — Full traces persisted
7. **Secure by default** — ACL before anything else

---

## Related Specs

- `nex/NEX.md` — Full NEX specification
- `nex/NEXUS_REQUEST.md` — Data bus schema
- `nex/STREAMING.md` — Streaming flow
- `MNEMONIC_NEX_MAPPING.md` — Evolution from Mnemonic
