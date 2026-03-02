# Nexus Architecture Overview

**Status:** CANONICAL OVERVIEW
**Last Updated:** 2026-03-02
**Database Layout:** See `DATABASE_ARCHITECTURE.md` for the canonical 7-database layout

---

## What is Nexus?

Nexus is a personal AI workspace — an operating system for AI agents that manage your digital life. It connects to your communication channels (iMessage, email, Discord, etc.), understands context from your history, and executes tasks on your behalf.

---

## Core Concept: NEX

At the heart of Nexus is **NEX** (Nexus Event Exchange) — a central orchestrator that processes all events through a unified pipeline.

**Key insight:** Everything is an event. A text message, an email, a calendar notification, a timer tick — all flow through NEX.

The canonical pipeline and data bus specification is in `nex/NEXUS_REQUEST_TARGET.md`.

---

## The Pipeline

NEX processes all operations through a 5-stage pipeline. The canonical spec is `nex/NEXUS_REQUEST_TARGET.md`.

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
│                                       │ NexusEvent                               │
│                                       ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │                              PIPELINE                                    │    │
│  │                                                                          │    │
│  │   1. acceptRequest      Parse envelope, assign IDs, normalize,          │    │
│  │        ↓                deduplicate, write event to events.db           │    │
│  │                                                                          │    │
│  │   2. resolvePrincipals  WHO sent this / who is this for?                │    │
│  │        ↓                Resolve sender + receiver to Entities           │    │
│  │                                                                          │    │
│  │   3. resolveAccess      WHAT can they do? Evaluate ACL policies         │    │
│  │        ↓                Produce allow/deny decision with permissions    │    │
│  │                                                                          │    │
│  │   4. executeOperation   Dispatch to operation handler.                  │    │
│  │        ↓                For event.ingest: broker assembles context,     │    │
│  │                         runs agent. Agent invokes delivery tools.       │    │
│  │                                                                          │    │
│  │   5. finalizeRequest    Persist pipeline trace, set final status        │    │
│  │                                                                          │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Automation Hookpoints

Automations fire at stage boundaries — they are NOT a separate pipeline stage. Hooks can inspect the request, contribute context enrichment, override agent configuration, or fully handle a request (skipping the agent entirely).

Key hookpoints:
- `worker:pre_execution` — before every agent execution (memory injection)
- `episode-created` — when an episode clips (memory writer dispatch)
- `episode-retained` — after writer completes (consolidation dispatch)

---

## Stages → Components

The pipeline stages map to core components:

| Stage | Component | Description |
|-------|-----------|-------------|
| `acceptRequest` | **NEX** | Parse envelope, assign IDs, normalize, deduplicate, write event |
| `resolvePrincipals` | **IAM** | Resolve sender + receiver raw identifiers to Entity objects |
| `resolveAccess` | **IAM** | Evaluate ACL policies, produce allow/deny with permissions |
| `executeOperation` | **Broker** | Assemble context, run agent. Agent invokes delivery tools directly |
| `finalizeRequest` | **NEX** | Persist pipeline trace, set final status |

**Component view:**
```
NEX orchestrates:
  Adapters → NEX → IAM → Broker (agent delivers via tools) → NEX
                              ↓
                    System of Record + Memory
```

**Key:** There is no separate delivery stage. The agent decides if/when/where to respond using delivery tools during `executeOperation`. See `nex/AGENT_DELIVERY.md`.

---

## Data Model

### System of Record (Source of Truth)

Primary data stores:

| Database | Purpose | Contents |
|----------|---------|----------|
| **events.db** | What happened | All inbound/outbound events (permanent) |
| **agents.db** | AI conversations | Sessions, turns, messages, tool calls |
| **identity.db** | Who is involved | Contacts, directory, entities, auth, ACL |
| **memory.db** | What the AI remembers | Elements, sets, jobs |
| **embeddings.db** | Semantic search | Vector representations for similarity search |
| **runtime.db** | Pipeline traces | NexusRequest lifecycle, adapters, automations, bus |
| **work.db** | What should happen | Tasks, work items, workflows, sequences |

All databases are SQLite files in `{workspace}/state/data/`. See `DATABASE_ARCHITECTURE.md` for the canonical 7-database inventory and migration plan.

**See:** `ledgers/`, `DATABASE_ARCHITECTURE.md`

### Memory System (Derived Layer)

Mutable analysis layer that makes raw data useful:

| Component | Database | Purpose |
|-----------|----------|---------|
| **Elements** | memory.db | Facts, observations, mental models about entities |
| **Sets** | memory.db | Grouped collections of elements for analysis |
| **Jobs** | memory.db | Memory pipeline processing tasks |
| **Entities** | identity.db | Named entities, knowledge graph, merge candidates |
| **Embeddings** | embeddings.db | Vector representations for semantic search |

**Key insight:** System of Record is facts. Memory is understanding.

---

## The Data Bus: NexusRequest

Every event creates a `NexusRequest` object that flows through the pipeline, accumulating context at each stage:

| Stage | Adds to NexusRequest |
|-------|---------------------|
| `acceptRequest` | `routing` (platform, sender, receiver, container), `payload` (content, attachments, recipients) |
| `resolvePrincipals` | `sender` + `receiver` Entity objects |
| `resolveAccess` | `access` (decision, permissions) |
| `executeOperation` | `agent` (session, turn, response, tool_calls, usage) |
| `finalizeRequest` | `pipeline` (timing, trace), `status` |

The complete NexusRequest is persisted to runtime.db for debugging and audit.

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

Each adapter normalizes events to a canonical `NexusEvent` format.

**See:** `delivery/`

### IAM (Identity & Access Management)

Determines WHO can interact and WHAT they can do:
- Resolves sender identity from Identity Ledger
- Evaluates declarative ACL policies (YAML)
- Assigns permissions and session routing
- Logs all decisions for audit

**See:** `iam/`

### Automations

Hookpoint-triggered handlers:
- Fire at stage boundaries (not a separate pipeline stage)
- Match events via declarative triggers
- Execute TypeScript handlers
- Can extract data, enrich context, or handle events entirely (skipping the agent)
- Memory meeseeks (writer, consolidator, injection) are automations

**See:** `nex/automations/`

### Broker

Orchestrates agent execution within `executeOperation`:
- Assembles conversation context (history + memory)
- Manages sessions, threads, turns
- Runs the agent — agent invokes delivery tools directly
- Writes directly to Agents Ledger

**See:** `agents/`, `nex/AGENT_DELIVERY.md`

### Adapters (Delivery)

Connect to platforms for inbound events and outbound delivery:
- Platform-specific formatting (char limits, markdown support)
- Message chunking and streaming
- Agent invokes a single delivery tool; adapter owns formatting/chunking

**See:** `delivery/`

---

## Data Flow Examples

### Example 1: Mom texts asking for 2FA code

```
1. eve receives iMessage from +1-555-MOM
2. acceptRequest: NEX creates NexusRequest, writes event to events.db
3. resolvePrincipals: resolves +1-555-MOM → entity "Mom" (relationship: family)
4. resolveAccess: grants minimal tools, no shell, route to persona "Atlas"
5. executeOperation: automation "mom-2fa-helper" triggers on Mom + content match
6. Automation handles: checks email, responds directly with code (skips agent)
7. finalizeRequest: traces logged
```

### Example 2: Colleague asks question on Discord

```
1. discord-cli receives message in #general
2. acceptRequest: NEX creates NexusRequest, writes event to events.db
3. resolvePrincipals: resolves discord:user123 → entity "Alex" (relationship: work)
4. resolveAccess: grants web search, calendar read, route to "Atlas"
5. executeOperation: broker assembles context, runs agent
6. Agent calls web_search, then invokes delivery tool → adapter sends to Discord
7. finalizeRequest: traces logged
8. Memory system (background): episode clips, writer extracts facts
```

### Example 3: Timer tick (heartbeat)

```
1. timer adapter emits cron event (configurable intervals)
2. acceptRequest: NEX creates NexusRequest (sender: system)
3. resolvePrincipals: system sender resolved
4. resolveAccess: system sender, timer policies
5. executeOperation: automation "email-check" triggers, checks email, finds nothing urgent
6. Automation returns: no action needed, pipeline exits early
7. finalizeRequest: traces logged
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
| **7-database layout** | SQLite (events, agents, identity, memory, embeddings, runtime, work) | Write contention isolation, single owner per table |
| **IAM before Hooks** | Policies (WHO) before scripts (WHAT) | Security first |
| **All agents persistent** | No ephemeral agents | Every session can be resumed |
| **Nested spawning allowed** | WAs (MA = Manager Agent, WA = Worker Agent) can spawn sub-WAs | Removed upstream restriction |

---

## Specification Organization

Specs are organized into domain-first folders:

### Runtime

*What happens when an event arrives.*

| Folder | Status | Description |
|--------|--------|-------------|
| **nex/** | ✅ Current | NEX orchestrator, pipeline, interfaces |
| **nex/automations/** | ✅ Current | Automation system, event-triggered agent invocations |
| **agents/** | ✅ Current | Agent sessions, turns, context assembly (Broker) |
| **iam/** | ✅ Current | Identity & Access Management (policies, grants, audit) |
| **delivery/** | ✅ Current | In/out adapters, channel specs |

### Data

*Where state lives.*

| Folder | Status | Description |
|--------|--------|-------------|
| **ledgers/** | ✅ Current | System of Record schemas (Events, Agents, Identity) |
| **memory/** | ✅ Current | Memory system (elements, sets, jobs, embeddings) |
| **DATABASE_ARCHITECTURE.md** | ✅ Current | Canonical 7-database layout and migration plan |
| **work-system/** | ✅ Current | CRM analysis, work.db schema, entity activity dashboard, workplans |

### Agent Environment (`environment/`)

*What agents see and interact with.*

| Folder | Status | Description |
|--------|--------|-------------|
| **workspace/** | ✅ Current | File structure, identity, bindings |
| **cli/** | ✅ Current | CLI commands, capabilities |
| **skills/** | ✅ Current | Skills hub, taxonomy |
| **credentials/** | ✅ Current | Credential system |

### Reference

| Folder | Status | Description |
|--------|--------|-------------|
| **architecture/** | ✅ Current | Codebase layout, fork mapping, branding |

---

## Related Documents

- `nex/NEXUS_REQUEST_TARGET.md` — Canonical NexusRequest data bus and 5-stage pipeline
- `nex/AGENT_DELIVERY.md` — Agent-driven delivery model
- `nex/DAEMON.md` — NEX daemon lifecycle (startup, signals, shutdown)
- `agents/OVERVIEW.md` — Agent system architecture (Broker)
- `memory/MEMORY_SYSTEM.md` — Memory system architecture
- `architecture/NEXUS_STRUCTURE.md` — Codebase layout
