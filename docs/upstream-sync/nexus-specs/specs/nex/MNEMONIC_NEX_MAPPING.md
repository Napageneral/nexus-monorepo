# Mnemonic → NEX Mapping

**Status:** PLANNING  
**Last Updated:** 2026-01-30

---

## Overview

NEX (Nexus Event Exchange) is the evolution of the existing Mnemonic server. This document maps every Mnemonic package to its role in NEX and identifies what needs to be built.

**Key insight:** Mnemonic becomes NEX. The Go infrastructure, job bus, and ledgers are the foundation. We add pipeline orchestration and plugins on top.

---

## Package Mapping

### Core Infrastructure

| Mnemonic Package | NEX Role | Changes Needed |
|------------------|----------|----------------|
| `internal/bus/` | **Async event queue** | Rename to `internal/nex/bus/`. Add NexusRequest event types. |
| `internal/db/` | **Ledger storage** | Split schema into Events/Agents/Identity/Nexus ledgers. |
| `internal/config/` | **NEX config** | Add pipeline, adapter, plugin configuration. |
| `internal/state/` | **Runtime state** | Extend for pipeline state tracking. |

### Adapters (Inbound)

| Mnemonic Package | NEX Role | Changes Needed |
|------------------|----------|----------------|
| `internal/adapters/eve.go` | **iMessage adapter** | Emit AdapterEvent to NEX instead of direct processing. |
| `internal/adapters/gmail.go` | **Gmail adapter** | Same — emit to NEX. |
| `internal/adapters/aix*.go` | **IDE adapter** | Same — emit to NEX. AIX sessions flow through pipeline. |
| `internal/adapters/calendar.go` | **Calendar adapter** | Same — emit to NEX. |
| `internal/adapters/contacts.go` | **Contacts adapter** | Same — emit to NEX. |
| `internal/adapters/bird.go` | **Twitter adapter** | Same — emit to NEX. |
| `internal/adapters/nexus.go` | **Nexus CLI adapter** | Same — emit to NEX. |

### Live Watchers

| Mnemonic Package | NEX Role | Changes Needed |
|------------------|----------|----------------|
| `internal/live/manager.go` | **Adapter registry** | Becomes `nex/adapters/registry.go`. Manages adapter lifecycle. |
| `internal/live/eve.go` | **Eve watcher** | Moves to `nex/adapters/eve/`. |
| `internal/live/gmail.go` | **Gmail watcher** | Moves to `nex/adapters/gmail/`. |
| `internal/live/aix.go` | **AIX watcher** | Moves to `nex/adapters/aix/`. |
| `internal/live/heartbeat.go` | **Timer adapter** | Becomes `nex/adapters/timer/`. Emits timer events. |

### Compute / Job System

| Mnemonic Package | NEX Role | Changes Needed |
|------------------|----------|----------------|
| `internal/compute/engine.go` | **Job executor** | Powers parallel hook execution, background analysis. |
| `internal/compute/adaptive_controller.go` | **Rate control** | Used for LLM rate limiting in hooks/broker. |
| `internal/compute/adaptive_semaphore.go` | **Concurrency control** | Used for parallel hook execution. |
| `internal/compute/embeddings_batcher.go` | **Batch embeddings** | Used by Index for background processing. |
| `internal/compute/metrics.go` | **Observability** | Extend for NEX pipeline metrics. |

### Identity Resolution

| Mnemonic Package | NEX Role | Changes Needed |
|------------------|----------|----------------|
| `internal/identify/identify.go` | **ACL identity lookup** | Called by ACL stage to resolve sender. |
| `internal/identify/resolve.go` | **Entity resolution** | Maps channel+identifier to entity. |
| `internal/identify/facts.go` | **Learned facts** | Background enrichment. |
| `internal/identify/suggestions.go` | **Identity suggestions** | For review workflow. |
| `internal/identify/sync.go` | **Contact sync** | Background job. |
| `internal/contacts/contacts.go` | **Contacts storage** | Part of Identity Ledger. |

### Memory / Analysis

| Mnemonic Package | NEX Role | Changes Needed |
|------------------|----------|----------------|
| `internal/memory/pipeline.go` | **Analysis pipeline** | Runs as background jobs after NEX writes to ledger. |
| `internal/memory/entity_extractor.go` | **Entity extraction** | Background analysis job. |
| `internal/memory/relationship_extractor.go` | **Relationship extraction** | Background analysis job. |
| `internal/memory/entity_resolver.go` | **Entity dedup** | Background analysis job. |
| `internal/memory/edge_resolver.go` | **Edge dedup** | Background analysis job. |
| `internal/memory/query_engine.go` | **Memory query** | Called by Broker for context assembly. Agent tool. |
| `internal/memory/entity_embedder.go` | **Embedding generation** | Background analysis job. |
| `internal/memory/contradiction_detector.go` | **Contradiction detection** | Background analysis job. |
| `internal/memory/auto_merger.go` | **Auto-merge** | Background analysis job. |
| `internal/memory/verify.go` | **Memory verification** | Testing/debugging. |

### Search / Embeddings

| Mnemonic Package | NEX Role | Changes Needed |
|------------------|----------|----------------|
| `internal/search/search.go` | **Semantic search** | Called by Broker for context. Agent tool. |
| `internal/search/gemini_embedder.go` | **Embedding provider** | Used by memory pipeline. |

### Other

| Mnemonic Package | NEX Role | Changes Needed |
|------------------|----------|----------------|
| `internal/gemini/client.go` | **LLM client** | Used by hooks (LLM hooks), agent execution. |
| `internal/query/query.go` | **Query interface** | Exposed as agent tool. |
| `internal/chunk/chunk.go` | **Text chunking** | Used by out-adapters for message chunking. |
| `internal/timeline/timeline.go` | **Timeline view** | Query/display. |
| `internal/tag/tag.go` | **Tagging system** | Metadata for events. |
| `internal/documents/` | **Document handling** | Attachment processing. |
| `internal/importer/mbox.go` | **Email import** | Batch import utility. |
| `internal/me/me.go` | **Self-knowledge** | Part of Index. |
| `internal/ratelimit/` | **Rate limiting** | Used by adapters, LLM calls. |
| `internal/sync/` | **Sync jobs** | Background processing. |
| `internal/testutil/` | **Testing** | Keep as-is. |

---

## What's NEW (Must Build)

### NEX Pipeline

| Component | Description | Location |
|-----------|-------------|----------|
| **Pipeline orchestrator** | Main NEX loop (Receive → ACL → Hooks → Broker → Agent → Deliver → Complete) | `internal/nex/pipeline.go` |
| **NexusRequest** | Data bus struct | `internal/nex/request.go` |
| **Stage interfaces** | Each stage's interface | `internal/nex/stages/*.go` |

### ACL System

| Component | Description | Location |
|-----------|-------------|----------|
| **Policy evaluator** | Evaluate YAML policies | `internal/nex/acl/evaluator.go` |
| **Policy loader** | Load from files/DB | `internal/nex/acl/loader.go` |
| **Grant manager** | Dynamic permissions | `internal/nex/acl/grants.go` |
| **Audit logger** | ACL decision logging | `internal/nex/acl/audit.go` |

### Hook System

| Component | Description | Location |
|-----------|-------------|----------|
| **Hook registry** | Load and manage hooks | `internal/nex/hooks/registry.go` |
| **Trigger matcher** | Match hooks to events | `internal/nex/hooks/matcher.go` |
| **Hook executor** | Run hooks (parallel) | `internal/nex/hooks/executor.go` |
| **Hook context** | Context passed to hooks | `internal/nex/hooks/context.go` |

### Broker

| Component | Description | Location |
|-----------|-------------|----------|
| **Broker** | Orchestrates agent execution | `internal/nex/broker/broker.go` |
| **Context assembler** | Builds agent context | `internal/nex/broker/context.go` |
| **Session manager** | Turn/thread/session management | `internal/nex/broker/session.go` |
| **Streaming coordinator** | Manages streaming flow | `internal/nex/broker/streaming.go` |

### Agent Execution

| Component | Description | Location |
|-----------|-------------|----------|
| **Agent runner** | Execute agent (port from upstream) | `internal/nex/agent/runner.go` |
| **Tool registry** | Available tools | `internal/nex/agent/tools.go` |
| **Permission enforcer** | Enforce tool/credential permissions | `internal/nex/agent/permissions.go` |

### Out-Adapters

| Component | Description | Location |
|-----------|-------------|----------|
| **Out-adapter interface** | Delivery interface | `internal/nex/adapters/outbound.go` |
| **Eve send** | iMessage delivery (extend existing) | `internal/adapters/eve.go` |
| **Discord send** | Discord delivery (new) | `internal/nex/adapters/discord/` |
| **Telegram send** | Telegram delivery (new) | `internal/nex/adapters/telegram/` |
| **Slack send** | Slack delivery (new) | `internal/nex/adapters/slack/` |

### Plugin System

| Component | Description | Location |
|-----------|-------------|----------|
| **Plugin loader** | Load plugins from directory | `internal/nex/plugins/loader.go` |
| **Plugin registry** | Manage plugin lifecycle | `internal/nex/plugins/registry.go` |
| **Plugin hooks** | Before/after at each stage | `internal/nex/plugins/hooks.go` |

### Ledgers

| Component | Description | Location |
|-----------|-------------|----------|
| **Events Ledger** | Inbound/outbound events | `internal/nex/ledger/events.go` |
| **Agents Ledger** | Turns, sessions, tool calls | `internal/nex/ledger/agents.go` |
| **Identity Ledger** | Entities, identities | (Use existing `identify/` + `contacts/`) |
| **Nexus Ledger** | Full NexusRequest traces | `internal/nex/ledger/nexus.go` |

---

## Migration Path

### Phase 1: Foundation

1. Create `internal/nex/` package structure
2. Define `NexusRequest` struct
3. Create pipeline orchestrator (empty stages)
4. Wire existing adapters to emit to pipeline

### Phase 2: ACL + Hooks

1. Build ACL evaluator (uses existing `identify/`)
2. Build hook registry and executor
3. Create initial hooks (port from hook-examples/)

### Phase 3: Broker + Agent

1. Build Broker with context assembly
2. Port agent execution from upstream (pi-agent patterns)
3. Wire streaming through to adapters
4. Build session management (uses existing DB schema)

### Phase 4: Out-Adapters

1. Extend eve.go with send capability
2. Port Discord/Telegram/Slack from upstream
3. Implement chunking (use existing `chunk/`)

### Phase 5: Plugins + Polish

1. Build plugin system
2. Create built-in plugins (logging, analytics)
3. Full integration testing
4. Performance optimization

---

## Proposed Directory Structure

```
mnemonic/
├── cmd/
│   └── mnemonic/main.go           # Entry point (becomes NEX server)
│
├── internal/
│   ├── nex/                        # NEW: NEX orchestrator
│   │   ├── nex.go                  # Main NEX struct
│   │   ├── pipeline.go             # Pipeline execution
│   │   ├── request.go              # NexusRequest type
│   │   ├── config.go               # NEX configuration
│   │   │
│   │   ├── stages/                 # Pipeline stages
│   │   │   ├── receive.go
│   │   │   ├── acl.go
│   │   │   ├── hooks.go
│   │   │   ├── broker.go
│   │   │   ├── agent.go
│   │   │   ├── deliver.go
│   │   │   └── complete.go
│   │   │
│   │   ├── acl/                    # Access control
│   │   │   ├── evaluator.go
│   │   │   ├── policy.go
│   │   │   ├── grants.go
│   │   │   └── audit.go
│   │   │
│   │   ├── hooks/                  # Hook system
│   │   │   ├── registry.go
│   │   │   ├── matcher.go
│   │   │   ├── executor.go
│   │   │   └── types.go
│   │   │
│   │   ├── broker/                 # Broker + agent execution
│   │   │   ├── broker.go
│   │   │   ├── context.go
│   │   │   ├── session.go
│   │   │   ├── streaming.go
│   │   │   └── agent/
│   │   │       ├── runner.go
│   │   │       ├── tools.go
│   │   │       └── permissions.go
│   │   │
│   │   ├── plugins/                # Plugin system
│   │   │   ├── loader.go
│   │   │   ├── registry.go
│   │   │   └── types.go
│   │   │
│   │   └── ledger/                 # Ledger writers
│   │       ├── events.go
│   │       ├── agents.go
│   │       ├── identity.go
│   │       └── nexus.go
│   │
│   ├── adapters/                   # EXISTING: Adapters (extend for out)
│   │   ├── adapter.go
│   │   ├── eve.go                  # Add send capability
│   │   ├── gmail.go                # Add send capability
│   │   ├── aix.go
│   │   ├── discord/                # NEW: Discord adapter
│   │   ├── telegram/               # NEW: Telegram adapter
│   │   └── ...
│   │
│   ├── bus/                        # EXISTING: Event bus (enhanced)
│   ├── compute/                    # EXISTING: Job system
│   ├── config/                     # EXISTING: Config
│   ├── db/                         # EXISTING: Database
│   ├── identify/                   # EXISTING: Identity resolution
│   ├── memory/                     # EXISTING: Analysis pipeline
│   ├── search/                     # EXISTING: Semantic search
│   ├── contacts/                   # EXISTING: Contacts
│   └── ...                         # Other existing packages
│
└── prompts/                        # EXISTING: Prompt templates
```

---

## Database Schema Evolution

### Current Tables (Keep)

```sql
-- Events (rename cortex_events → events)
-- Contacts
-- Persons
-- Facts
-- Entities (memory graph)
-- Edges (memory graph)
-- Bus events
```

### New Tables

```sql
-- NEX Traces (NexusRequest storage)
CREATE TABLE nex_traces (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  completed_at INTEGER,
  status TEXT NOT NULL,  -- 'pending', 'completed', 'failed'
  request_json TEXT NOT NULL,  -- Full NexusRequest
  error TEXT
);

-- ACL Policies (if stored in DB)
CREATE TABLE acl_policies (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  priority INTEGER NOT NULL,
  policy_yaml TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- ACL Grants
CREATE TABLE acl_grants (
  id TEXT PRIMARY KEY,
  principal_id TEXT NOT NULL,
  resources TEXT NOT NULL,  -- JSON array
  expires_at INTEGER,
  granted_by TEXT,
  created_at INTEGER NOT NULL
);

-- ACL Audit
CREATE TABLE acl_audit (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  principal_id TEXT,
  decision TEXT NOT NULL,  -- 'allow', 'deny'
  policy_name TEXT,
  reason TEXT,
  created_at INTEGER NOT NULL
);

-- Agent Sessions (extend existing if needed)
-- Agent Turns (extend existing if needed)
```

---

## Summary

**Reuse from Mnemonic:**
- Bus (async queue)
- DB/schemas (extend)
- Adapters (extend with outbound)
- Live watchers (reorganize)
- Compute engine (for parallelization)
- Identity resolution (for ACL)
- Memory pipeline (background analysis)
- Search (for context)

**Build New:**
- NEX pipeline orchestrator
- ACL system
- Hook system
- Broker
- Agent execution (port from upstream)
- Out-adapters (port from upstream)
- Plugin system
- Ledger writers

**Estimated LOC:**
- New code: ~5,000-8,000 lines
- Refactored code: ~2,000 lines
- Upstream port: ~3,000-5,000 lines

---

## Related Specs

- `NEX.md` — NEX architecture
- `STREAMING.md` — Streaming flow
- `NEXUS_REQUEST.md` — Data bus schema
