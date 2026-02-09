# Nexus Project Structure

**Status:** REFERENCE  
**Updated:** 2026-02-09  
**Purpose:** Define the project structure for the Nexus monorepo

---

## Design Principles

1. **Ledger-centric** — Four ledgers are the system of record; all state flows through them
2. **Component isolation** — Each module maps to a clear responsibility boundary
3. **Interface-driven** — Components communicate via defined interfaces and the event bus
4. **Adapters are processes** — External CLI executables, not in-process objects
5. **Skills not plugins** — Markdown docs + binaries, not code plugins
6. **Cortex is separate** — Go process with its own lifecycle, communicates over IPC

---

## Resolved Decisions

| Decision | Resolution |
|----------|------------|
| **Language (core)** | TypeScript — NEX, Broker, CLI, adapters, IAM |
| **Language (Cortex)** | Go — separate process, IPC to core |
| **Runtime** | Bun |
| **Package manager** | Bun workspaces + Turborepo |
| **Monorepo** | Yes — single repo, workspace packages |
| **TUI** | Dropped |
| **Config file** | `nex.yaml` |
| **Upstream fork** | openclaw |

---

## Terminology

| Abbreviation | Term | Description |
|--------------|------|-------------|
| **NEX** | Nexus Event Exchange | The ingest pipeline — daemon, adapter manager, stages |
| **MA** | Manager Agent | Top-level agent that owns a session; delegates to WAs, manages context |
| **WA** | Worker Agent | Specialized agent spawned by an MA for a focused subtask |
| **IAM** | Identity & Access Management | Policy evaluation, ACL grants, session routing, audit |
| **Cortex** | Cortex | Derived intelligence layer — embeddings, episodes, facets, search |

---

## Monorepo Layout

```
nexus/
├── src/
│   ├── nex/                        # NEX — Event Exchange (ingest pipeline)
│   │   ├── daemon.ts               # Long-running NEX daemon process
│   │   ├── pipeline.ts             # Event pipeline orchestration
│   │   ├── stages/                 # Pipeline stages
│   │   │   ├── normalize.ts        # Raw → NormalizedEvent
│   │   │   ├── enrich.ts           # Identity resolution, metadata
│   │   │   ├── evaluate.ts         # IAM policy check (calls into iam/)
│   │   │   └── dispatch.ts         # Route to Broker or automation
│   │   ├── adapters/               # Adapter Manager
│   │   │   ├── manager.ts          # Lifecycle: discover, spawn, health-check
│   │   │   ├── protocol.ts         # Adapter ↔ NEX wire protocol (stdin/stdout)
│   │   │   └── registry.ts         # Installed adapter manifest
│   │   └── plugins/                # Pipeline plugin hooks
│   │       ├── loader.ts
│   │       └── types.ts
│   │
│   ├── broker/                     # Agent Broker (agent engine)
│   │   ├── broker.ts               # Main broker — receives dispatches from NEX
│   │   ├── router.ts               # Session routing (uses IAM ACL policies)
│   │   ├── session.ts              # Session lifecycle management
│   │   ├── queue.ts                # Queue modes (steer, followup, collect, interrupt)
│   │   ├── executor.ts             # MA/WA execution orchestration
│   │   ├── context.ts              # Context assembly (ledgers + Cortex)
│   │   ├── agents/
│   │   │   ├── manager.ts          # Manager Agent implementation
│   │   │   ├── worker.ts           # Worker Agent implementation
│   │   │   ├── llm.ts              # LLM streaming (from openclaw upstream)
│   │   │   └── compaction.ts       # Context compaction
│   │   ├── prompts/
│   │   │   ├── system.ts           # System prompt construction
│   │   │   └── templates/          # Prompt templates
│   │   └── session-pointer.ts      # Session pointer management
│   │
│   ├── iam/                        # Identity & Access Management
│   │   ├── policies.ts             # Load/parse ACL policies from nex.yaml
│   │   ├── evaluate.ts             # Policy evaluation engine
│   │   ├── grants.ts               # Dynamic grants (runtime overrides)
│   │   ├── resolve.ts              # Identity resolution (who is this participant?)
│   │   ├── routing.ts              # Session routing rules (derived from ACL)
│   │   └── audit.ts                # Audit log writes
│   │
│   ├── hooks/                      # Hooks & Automations
│   │   ├── runtime.ts              # Hook execution engine
│   │   ├── loader.ts               # Load hooks from workspace
│   │   ├── context.ts              # Hook context injection
│   │   └── types.ts                # Hook definitions
│   │
│   ├── db/                         # Ledger Access Layer
│   │   ├── connection.ts           # SQLite connection (Bun SQLite)
│   │   ├── migrations/             # Migration files
│   │   ├── schema.sql              # Unified DDL for all four ledgers
│   │   ├── events/                 # Event Ledger queries
│   │   │   ├── write.ts
│   │   │   └── read.ts
│   │   ├── agents/                 # Agent Ledger queries
│   │   │   ├── write.ts
│   │   │   └── read.ts
│   │   ├── identity/               # Identity Ledger queries (includes Identity Graph)
│   │   │   ├── write.ts
│   │   │   ├── read.ts
│   │   │   └── graph.ts            # Identity Graph traversal
│   │   └── nexus/                  # Nexus Ledger queries (config, skills, workspace)
│   │       ├── write.ts
│   │       └── read.ts
│   │
│   ├── cli/                        # Nexus CLI
│   │   ├── main.ts                 # Entry point
│   │   └── commands/
│   │       ├── status.ts
│   │       ├── capabilities.ts
│   │       ├── skill/
│   │       ├── credential/
│   │       ├── config/
│   │       ├── sync.ts
│   │       └── search.ts
│   │
│   ├── tools/                      # Tool System
│   │   ├── registry.ts             # Tool registry
│   │   ├── builtin/                # Built-in tools
│   │   └── skill/                  # Skill-based tool loader
│   │       └── loader.ts
│   │
│   ├── bus/                        # Event Bus
│   │   ├── bus.ts                  # In-process event bus
│   │   ├── events.ts               # Event type definitions
│   │   └── sse.ts                  # SSE server for external consumers
│   │
│   ├── workspace/                  # Workspace Management
│   │   ├── init.ts                 # Workspace initialization
│   │   ├── config.ts               # nex.yaml parsing
│   │   └── paths.ts                # Path resolution
│   │
│   ├── credentials/                # Credential System
│   │   ├── store.ts
│   │   ├── backends/               # Keychain, 1Password, env
│   │   └── access.ts
│   │
│   ├── skills/                     # Skill Management
│   │   ├── loader.ts
│   │   ├── hub.ts                  # Hub client
│   │   └── state.ts
│   │
│   └── aix/                        # AIX (external harness ingestion)
│       ├── sync/
│       │   ├── cursor.ts
│       │   ├── codex.ts
│       │   ├── claude.ts
│       │   └── clawdbot.ts
│       └── main.ts
│
├── cortex/                         # Cortex — SEPARATE Go PROCESS
│   ├── go.mod
│   ├── go.sum
│   ├── main.go                     # Entry point, IPC server
│   ├── episodes/                   # Episode extraction & retrieval
│   ├── facets/                     # Facet extraction & storage
│   ├── embeddings/                 # Embedding generation & vector search
│   ├── search/                     # Unified search interface
│   └── ipc/                        # IPC protocol (communicates with TS core)
│
├── adapters/                       # Adapter binaries (external CLI executables)
│   ├── imessage/                   # Each adapter is a standalone CLI
│   ├── discord/
│   ├── telegram/
│   ├── whatsapp/
│   ├── gmail/
│   ├── slack/
│   ├── webhook/
│   └── timer/
│
├── infra/                          # Infrastructure (SST)
│   ├── hub.ts                      # Skills Hub
│   ├── cloud.ts                    # Nexus Cloud
│   └── collab.ts                   # Collaboration server
│
├── scripts/                        # Build/release scripts
│   ├── build.ts
│   ├── release.ts
│   └── test.ts
│
├── specs/                          # Specifications (current nexus-specs)
│   └── ...
│
├── nex.yaml                        # Nexus configuration
├── package.json                    # Bun workspace config
├── turbo.json                      # Turborepo config
├── tsconfig.json                   # TypeScript config
└── AGENTS.md                       # Agent documentation
```

---

## Four Ledgers

All persistent state lives in four ledgers, accessed through `src/db/`.

| Ledger | Purpose | Key Tables |
|--------|---------|------------|
| **Events** | Every inbound/outbound event normalized and stored | `events`, `event_participants`, `event_metadata` |
| **Agents** | Session lifecycle, turns, messages, tool calls | `sessions`, `turns`, `messages`, `tool_calls` |
| **Identity** | Entities, identity resolution, and the **Identity Graph** | `entities`, `identities`, `identity_edges`, `identity_graph` |
| **Nexus** | Workspace config, skill state, credentials, system metadata | `config`, `skill_state`, `credential_pointers` |

The Identity Ledger contains the **Identity Graph** — a graph structure mapping relationships between entities, identities, and platform accounts. This is queried by IAM for identity resolution and by Cortex for relationship-aware search.

---

## Adapters

Adapters are **external CLI executables**, not in-process modules. Each adapter is a standalone binary that communicates with NEX over a defined wire protocol (stdin/stdout JSON lines).

The **Adapter Manager** (`src/nex/adapters/manager.ts`) handles:
- **Discovery** — scanning the `adapters/` directory for installed adapters
- **Lifecycle** — spawning, health-checking, and restarting adapter processes
- **Protocol** — marshalling NormalizedEvents between adapters and the pipeline

An adapter handles both ingest and delivery for its platform. There is no in/out split — a single Discord adapter both receives and sends Discord messages.

```
Adapter (CLI process)  ←stdin/stdout→  Adapter Manager  →  NEX Pipeline
```

---

## Key Architectural Decisions

### 1. Forked from openclaw

Nexus is forked from [openclaw](https://github.com/anthropics/openclaw). The core TypeScript patterns (LLM streaming, tool execution, bus) originate from openclaw and are adapted for Nexus's multi-agent, multi-platform architecture.

### 2. Ledger-Centric Storage

```
openclaw:  Storage.set(["session", projectID, sessionID], data)
nexus:     db.insert(agent_sessions).values(session)
```

All state flows through the four ledgers. No file-based session storage.

### 3. IAM Owns Routing

Session routing is determined by IAM policy evaluation, not hardcoded rules. When an event arrives:

```
Event → NEX pipeline → IAM evaluates ACL policies → routing decision → Broker
```

ACL policies in `nex.yaml` define which events reach which agents, with what permissions, and how sessions are routed (new session, existing session, queue mode).

### 4. Adapters Are External Processes

Unlike openclaw where external communication isn't structured, Nexus adapters are standalone CLI executables:
- Each adapter is a separate binary (can be any language)
- Managed by the Adapter Manager (spawn, health-check, restart)
- Communicate over stdin/stdout using a JSON-lines protocol
- A single adapter handles both directions for its platform

### 5. Cortex Is a Separate Go Process

Cortex runs as a separate Go process, not embedded in the TypeScript core. It communicates with the core over IPC. This allows:
- Independent deployment and scaling
- Go's strengths for embedding generation and vector operations
- Clean process boundary between hot path (TypeScript) and intelligence layer (Go)

### 6. MA/WA Agent Hierarchy

The Broker executes agents in a two-tier hierarchy:
- **Manager Agent (MA)** — owns the session, receives the dispatch, manages context window, delegates subtasks
- **Worker Agent (WA)** — spawned by an MA for focused subtasks, reports results back to the MA

### 7. AIX Is Separate

AIX syncs from external harnesses (Cursor, Codex, Claude Code). It feeds the Agent Ledger but is not part of the core pipeline.

---

## Component Mapping from openclaw

| openclaw | Nexus | Notes |
|----------|-------|-------|
| `src/session/` | `src/broker/` + `src/db/agents/` | Sessions become ledger entries |
| `src/tool/` | `src/tools/` | Same tool system, extended |
| `src/permission/` | `src/iam/` | Policy-based, not per-call approval |
| `src/bus/` | `src/bus/` | Similar pattern, different event types |
| `src/config/` | `src/workspace/` | Nexus workspace model, `nex.yaml` |
| `src/plugin/` | `src/skills/` | Markdown + binaries, not code plugins |
| `src/storage/` | `src/db/` | SQLite ledgers, not file storage |
| `src/server/` | `src/nex/` + `src/broker/` | NEX is ingest, Broker is execution |

### New Nexus Components (no openclaw equivalent)

| Component | Purpose |
|-----------|---------|
| `src/nex/` | Event ingest pipeline, adapter manager, daemon |
| `src/iam/` | ACL policies, identity resolution, session routing |
| `src/hooks/` | Automation hooks triggered by events |
| `src/db/identity/` | Identity Ledger with Identity Graph |
| `src/db/nexus/` | Nexus Ledger (workspace metadata) |
| `src/aix/` | External harness sync |
| `cortex/` | Go-based derived intelligence layer |
| `adapters/` | External CLI adapter binaries |

---

*This document reflects the resolved architecture as of 2026-02-09.*
