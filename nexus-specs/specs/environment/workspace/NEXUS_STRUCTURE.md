# Nexus Project Structure

**Status:** PROPOSAL  
**Date:** January 30, 2026  
**Purpose:** Define ideal project structure given our System of Record architecture

---

## Design Principles

1. **Ledger-centric** — Ledgers are the core, not file storage
2. **Component isolation** — Each component maps to a clear module
3. **Interface-driven** — Components communicate via defined interfaces (see UNIFIED_SYSTEM.md §10)
4. **Minimal runtime** — CLI-first, optional server for adapters
5. **Skills not plugins** — Markdown docs + binaries, not code plugins

---

## Proposed Structure

```
nexus/
├── packages/
│   ├── core/                    # Core engine (like opencode/packages/opencode)
│   │   ├── src/
│   │   │   ├── ledgers/         # System of Record
│   │   │   │   ├── event/       # Event Ledger
│   │   │   │   ├── identity/    # Identity Ledger
│   │   │   │   ├── agent/       # Agent Ledger
│   │   │   │   └── schema.sql   # Unified schema
│   │   │   │
│   │   │   ├── adapters/        # In/Out adapters
│   │   │   │   ├── in/          # In-Adapters
│   │   │   │   │   ├── imessage/
│   │   │   │   │   ├── gmail/
│   │   │   │   │   ├── discord/
│   │   │   │   │   ├── telegram/
│   │   │   │   │   ├── whatsapp/
│   │   │   │   │   ├── webhook/
│   │   │   │   │   └── timer/
│   │   │   │   └── out/         # Out-Adapters
│   │   │   │       ├── discord/
│   │   │   │       ├── telegram/
│   │   │   │       ├── slack/
│   │   │   │       └── email/
│   │   │   │
│   │   │   ├── event-handler/   # Event Handler (ACL + Hooks)
│   │   │   │   ├── iam/         # Policy evaluation
│   │   │   │   ├── hooks/       # Hook runtime
│   │   │   │   └── dispatch.ts  # BrokerDispatch interface
│   │   │   │
│   │   │   ├── broker/          # Agent Broker
│   │   │   │   ├── router.ts    # Session routing
│   │   │   │   ├── queue.ts     # Queue management
│   │   │   │   ├── executor.ts  # Agent execution
│   │   │   │   └── ledger-client.ts  # Direct ledger writes
│   │   │   │
│   │   │   ├── agents/          # Agent execution
│   │   │   │   ├── manager.ts   # MA implementation
│   │   │   │   ├── worker.ts    # WA implementation
│   │   │   │   └── prompts/     # Prompt templates
│   │   │   │
│   │   │   ├── tools/           # Tool system
│   │   │   │   ├── registry.ts
│   │   │   │   ├── builtin/     # Built-in tools
│   │   │   │   └── skill/       # Skill tool loader
│   │   │   │
│   │   │   ├── cortex/           # Cortex (derived layer)
│   │   │   │   ├── episodes.ts
│   │   │   │   ├── facets.ts
│   │   │   │   ├── embeddings.ts
│   │   │   │   └── search.ts
│   │   │   │
│   │   │   ├── credentials/     # Credential system
│   │   │   │   ├── store.ts
│   │   │   │   ├── backends/    # Keychain, 1Password, etc.
│   │   │   │   └── access.ts    # Consumer-centric access
│   │   │   │
│   │   │   ├── skills/          # Skill management
│   │   │   │   ├── loader.ts
│   │   │   │   ├── hub.ts       # Hub client
│   │   │   │   └── state.ts     # Skill state tracking
│   │   │   │
│   │   │   ├── workspace/       # Workspace management
│   │   │   │   ├── init.ts
│   │   │   │   ├── config.ts
│   │   │   │   └── paths.ts
│   │   │   │
│   │   │   └── bus/             # Event bus (internal)
│   │   │       ├── events.ts
│   │   │       └── bus.ts
│   │   │
│   │   └── test/
│   │
│   ├── cli/                     # CLI package
│   │   ├── src/
│   │   │   ├── commands/
│   │   │   │   ├── status.ts
│   │   │   │   ├── capabilities.ts
│   │   │   │   ├── skill/
│   │   │   │   ├── credential/
│   │   │   │   ├── sync.ts
│   │   │   │   ├── search.ts
│   │   │   │   └── config/
│   │   │   ├── tui/             # Optional TUI (from upstream)
│   │   │   └── main.ts
│   │   └── bin/
│   │
│   ├── aix/                     # AIX (external harness ingestion)
│   │   ├── src/
│   │   │   ├── sync/
│   │   │   │   ├── cursor.ts
│   │   │   │   ├── codex.ts
│   │   │   │   ├── claude.ts
│   │   │   │   └── clawdbot.ts
│   │   │   └── main.ts
│   │   └── test/
│   │
│   └── cloud/                   # Nexus Cloud client
│       ├── src/
│       │   ├── sync.ts
│       │   └── crypto.ts
│       └── test/
│
├── infra/                       # Infrastructure (SST)
│   ├── hub.ts                   # Skills Hub
│   ├── cloud.ts                 # Nexus Cloud
│   └── collab.ts                # Collaboration server
│
├── scripts/                     # Build/release scripts
│   ├── build.ts
│   ├── release.ts
│   └── test.ts
│
├── specs/                       # Specifications (current nexus-specs)
│   └── ...
│
├── package.json                 # Workspace config
├── turbo.json                   # Turborepo config
├── tsconfig.json                # TS config
└── AGENTS.md                    # Agent documentation
```

---

## Component Mapping

### From OpenCode → Nexus

| OpenCode | Nexus | Notes |
|----------|-------|-------|
| `packages/opencode/src/session/` | `packages/core/src/broker/` + `ledgers/agent/` | Sessions become ledger entries |
| `packages/opencode/src/tool/` | `packages/core/src/tools/` | Same tool system |
| `packages/opencode/src/permission/` | `packages/core/src/event-handler/iam/` | Policy-based, not per-call |
| `packages/opencode/src/bus/` | `packages/core/src/bus/` | Similar, different events |
| `packages/opencode/src/config/` | `packages/core/src/workspace/` | Nexus workspace model |
| `packages/opencode/src/plugin/` | `packages/core/src/skills/` | Markdown + binaries |
| `packages/opencode/src/storage/` | `packages/core/src/ledgers/` | SQLite, not files |
| `packages/opencode/src/server/` | `packages/core/src/broker/` (internal) | Broker is internal, adapters are external |

### New Nexus Components

| Component | Purpose | No OpenCode Equivalent |
|-----------|---------|------------------------|
| `ledgers/event/` | Event Ledger | ✓ |
| `ledgers/identity/` | Identity Ledger | ✓ |
| `adapters/in/` | In-Adapters | ✓ |
| `adapters/out/` | Out-Adapters | ✓ |
| `event-handler/` | ACL + Hooks | ✓ |
| `cortex/` | Derived layer | ✓ (was Cortex) |
| `aix/` | External harness sync | ✓ |

---

## Core Package Details

### `ledgers/`

All three ledgers in one module with shared schema:

```
ledgers/
├── schema.sql              # Unified DDL for all tables
├── migrations/             # Migration files
├── db.ts                   # Database connection
├── event/
│   ├── types.ts            # NormalizedEvent, EventTrigger
│   ├── write.ts            # Insert events
│   └── read.ts             # Query events
├── identity/
│   ├── types.ts            # Entity, Identity
│   ├── resolve.ts          # IdentityLookup
│   └── enrich.ts           # IdentityEnrichment
└── agent/
    ├── types.ts            # Session, Turn, Message, ToolCall
    ├── write.ts            # LedgerWrite operations
    └── read.ts             # Query sessions/turns
```

### `adapters/`

Normalized in/out adapters:

```
adapters/
├── types.ts                # NormalizedEvent, ParticipantRef
├── in/
│   ├── adapter.ts          # In-Adapter interface
│   ├── imessage/
│   │   ├── sync.ts         # Poll iMessage DB
│   │   └── normalize.ts    # → NormalizedEvent
│   ├── gmail/
│   │   ├── client.ts       # Gmail API client
│   │   └── normalize.ts
│   └── discord/
│       ├── gateway.ts      # Discord WebSocket
│       └── normalize.ts
└── out/
    ├── adapter.ts          # Out-Adapter interface
    ├── formatter.ts        # Platform formatting
    ├── discord/
    │   └── send.ts         # OutAdapterSend → Discord
    └── telegram/
        └── send.ts
```

### `event-handler/`

The combined ACL + Hooks evaluation:

```
event-handler/
├── handler.ts              # Main event handler
├── iam/
│   ├── policies.ts         # Load/parse policies
│   ├── evaluate.ts         # Policy evaluation
│   ├── grants.ts           # Dynamic grants
│   └── audit.ts            # Audit logging
├── hooks/
│   ├── runtime.ts          # Hook execution (TypeScript)
│   ├── loader.ts           # Load hooks from workspace
│   └── context.ts          # Hook context injection
└── dispatch.ts             # BrokerDispatch creation
```

### `broker/`

Agent broker with ledger-direct writes:

```
broker/
├── broker.ts               # Main broker
├── router.ts               # Persona → Session → Turn routing
├── queue.ts                # Queue modes (steer, followup, collect, interrupt)
├── executor.ts             # Agent execution
├── ledger-client.ts        # Direct Agent Ledger writes
└── session-pointer.ts      # Session pointer management
```

### `agents/`

MA/WA execution:

```
agents/
├── manager.ts              # Manager Agent
├── worker.ts               # Worker Agent
├── llm.ts                  # LLM streaming (from upstream)
├── prompts/
│   ├── system.ts           # System prompt construction
│   └── templates/          # Prompt templates
└── compaction.ts           # Context compaction
```

---

## Key Architectural Decisions

### 1. Single Core Package

Unlike OpenCode's split packages (opencode, app, desktop, console), Nexus has one core package with optional CLI/TUI. This simplifies:
- Dependency management
- Interface contracts
- Testing

### 2. Ledger-Centric Storage

```
OpenCode: Storage.set(["session", projectID, sessionID], data)
Nexus:    db.insert(agent_sessions).values(session)
```

All state flows through ledgers. No file-based session storage.

### 3. Event Handler = ACL + Hooks

Unlike OpenCode's permission system (per-call approval), Nexus evaluates ACL upfront:

```
OpenCode: tool execution → permission.ask() → wait for approval
Nexus:    event arrives → ACL evaluates → permissions passed to broker → tool respects permissions
```

### 4. Adapters Are First-Class

In OpenCode, external communication isn't structured. In Nexus:
- **In-Adapters** normalize external data → Event Ledger
- **Out-Adapters** format responses → external platforms

### 5. AIX Is Separate

AIX syncs from external harnesses (Cursor, Codex, Claude Code). It's a separate package that feeds the Agent Ledger, not part of core.

---

## Migration Strategy

### Phase 1: Fork Core
1. Fork `packages/opencode/` → `packages/core/`
2. Remove: plugin system, storage (file-based)
3. Add: ledgers, adapters, event-handler
4. Adapt: session → broker, permission → ACL

### Phase 2: Add Ledgers
1. Bring mnemonic schema into `ledgers/schema.sql`
2. Implement ledger read/write modules
3. Wire broker to use ledger-client

### Phase 3: Add Event Handler
1. Implement ACL policy evaluation
2. Port hooks from specs
3. Wire event-handler to broker

### Phase 4: Add Adapters
1. Implement in-adapters (iMessage, Discord, etc.)
2. Implement out-adapters (response formatting)
3. Wire adapters to event-handler

### Phase 5: Wire Cortex
1. Bring Cortex/aix into nexus
2. Wire Cortex to read from all three ledgers
3. Wire Broker to query Cortex

---

## Open Questions

1. **Monorepo or Polyrepo?**
   - Current: Monorepo (like OpenCode)
   - Alternative: Separate repos for core, cli, cloud
   - Recommendation: Start monorepo, split later if needed

2. **TypeScript or Go for Adapters?**
   - Core: TypeScript (fork from OpenCode)
   - Adapters: TypeScript (easier integration)
   - AIX: Currently Go (could port or keep)
   - Recommendation: TypeScript for now, optimize later

3. **Bun or Node?**
   - OpenCode: Bun
   - Nexus: Could use either
   - Recommendation: Bun (faster, native TS)

4. **Package Manager?**
   - OpenCode: Bun workspaces
   - Nexus: Same
   - Recommendation: Bun workspaces + Turborepo

---

## Next Steps

1. [ ] Review this structure
2. [ ] Decide on open questions
3. [ ] Create actual package scaffolding
4. [ ] Begin fork from OpenCode core
5. [ ] Implement ledger layer

---

*This is a proposal. Review with Tyler before implementation.*
