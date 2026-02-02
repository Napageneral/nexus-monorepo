# Nexus Specifications v2

**Status:** MIGRATION IN PROGRESS  
**Last Updated:** 2026-01-30

---

## Overview

This folder contains the consolidated, organized specifications for the Nexus system. The architecture is centered around **NEX** (Nexus Event Exchange) — the central orchestrator that coordinates all components.

---

## Reading Order

Start here and follow this path:

```
1. architecture/OVERVIEW.md        → Big picture, how everything fits
2. nex/NEX.md                      → Central orchestrator
3. nex/NEXUS_REQUEST.md            → The data bus
4. nex/stages/*.md                 → Each pipeline stage
5. (Deep dives as needed)
```

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                NEXUS SYSTEM                                      │
│                                                                                  │
│  ADAPTERS ───────────────────────────────────────────────────────────────────┐  │
│    eve (iMessage), gog (Gmail), discord, telegram, webhooks, timers, aix     │  │
│  ────────────────────────────────────────────────────────────────────────────┘  │
│                                      │                                           │
│                                      ▼                                           │
│  ┌───────────────────────────────────────────────────────────────────────────┐  │
│  │                         NEX (Event Exchange)                               │  │
│  │                                                                            │  │
│  │  Receive → ACL → Hooks → Broker → Agent → Deliver → Complete              │  │
│  │     │                      │                  │                            │  │
│  │     │                      │                  │                            │  │
│  │     ▼                      ▼                  ▼                            │  │
│  │  ┌──────┐              ┌──────┐          ┌──────┐                         │  │
│  │  │Events│              │Agents│          │Events│                         │  │
│  │  │Ledger│              │Ledger│          │Ledger│                         │  │
│  │  └──────┘              └──────┘          └──────┘                         │  │
│  │                                                                            │  │
│  │  NexusRequest ─────────────────────────────────────────────────────────►  │  │
│  │  (accumulates context through each stage)                    Nexus Ledger │  │
│  └───────────────────────────────────────────────────────────────────────────┘  │
│                                      │                                           │
│                                      ▼                                           │
│  ┌───────────────────────────────────────────────────────────────────────────┐  │
│  │                         INDEX (Background)                                 │  │
│  │                                                                            │  │
│  │  Entity Extraction → Relationship Extraction → Embeddings → Analysis      │  │
│  └───────────────────────────────────────────────────────────────────────────┘  │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Folder Structure

```
specs-v2/
├── README.md                        # This file
│
├── architecture/                    # High-level architecture
│   ├── OVERVIEW.md                  # The big picture
│   ├── DATA_FLOW.md                 # How data flows through NEX
│   └── MNEMONIC_NEX_MAPPING.md      # Evolution from Mnemonic
│
├── nex/                             # NEX - The Core Orchestrator
│   ├── README.md                    # NEX overview
│   ├── NEX.md                       # Full NEX specification
│   ├── NEXUS_REQUEST.md             # Data bus schema
│   ├── STREAMING.md                 # Streaming flow
│   ├── PLUGINS.md                   # Plugin system
│   └── stages/                      # Pipeline stages
│       ├── 1-RECEIVE.md
│       ├── 2-ACL.md
│       ├── 3-HOOKS.md
│       ├── 4-BROKER.md
│       ├── 5-AGENT.md
│       ├── 6-DELIVER.md
│       └── 7-COMPLETE.md
│
├── adapters/                        # In/Out Adapters
│   ├── README.md
│   ├── INBOUND_INTERFACE.md
│   ├── OUTBOUND_INTERFACE.md
│   └── channels/                    # Per-channel specs
│       ├── discord.md
│       ├── telegram.md
│       └── ...
│
├── acl/                             # Access Control
│   ├── README.md
│   ├── ACCESS_CONTROL_SYSTEM.md
│   ├── POLICIES.md
│   ├── GRANTS.md
│   └── AUDIT.md
│
├── broker/                          # Broker + Agent Execution
│   ├── README.md
│   ├── BROKER.md
│   ├── AGENT_EXECUTION.md
│   ├── CONTEXT_ASSEMBLY.md
│   └── ONTOLOGY.md                  # Turn, Thread, Session, Compaction
│
├── hooks/                           # Hook System
│   ├── README.md
│   ├── HOOK_SYSTEM.md
│   ├── TRIGGERS.md
│   └── examples/
│
├── ledgers/                         # Data Storage
│   ├── README.md
│   ├── EVENTS_LEDGER.md
│   ├── AGENTS_LEDGER.md
│   ├── IDENTITY_LEDGER.md
│   ├── NEXUS_LEDGER.md
│   └── SCHEMAS.md
│
├── index/                           # Background Analysis
│   ├── README.md
│   ├── MEMORY_SYSTEM.md
│   ├── ENTITY_EXTRACTION.md
│   └── QUERY_ENGINE.md
│
├── credentials/                     # Credential Management
│   ├── README.md
│   └── CREDENTIAL_SYSTEM.md
│
├── workspace/                       # User-Facing Structure
│   ├── README.md
│   ├── WORKSPACE_STRUCTURE.md
│   ├── ONBOARDING.md
│   └── PROJECT_STRUCTURE.md
│
├── cli/                             # CLI Design
│   ├── README.md
│   ├── COMMANDS.md
│   └── CAPABILITIES.md
│
├── skills/                          # Skill System
│   ├── README.md
│   └── TAXONOMY.md
│
└── upstream/                        # Upstream Reference (read-only)
    ├── README.md
    ├── OPENCLAW_AGENT_SYSTEM.md
    ├── OPENCLAW_MEMORY.md
    └── OPENCLAW_PLUGINS.md
```

---

## Migration Workplan

### Phase 1: Core Infrastructure (Priority 1)

Migrate and consolidate the core NEX documentation.

| Source | Destination | Action |
|--------|-------------|--------|
| `specs/core/NEX.md` | `nex/NEX.md` | Copy, review |
| `specs/core/NEXUS_REQUEST.md` | `nex/NEXUS_REQUEST.md` | Copy, review |
| `specs/core/STREAMING.md` | `nex/STREAMING.md` | Copy, review |
| `specs/core/MNEMONIC_NEX_MAPPING.md` | `architecture/MNEMONIC_NEX_MAPPING.md` | Copy, review |
| `specs/UNIFIED_SYSTEM.md` | `architecture/OVERVIEW.md` | **Rewrite** — distill essential parts |

### Phase 2: Adapters (Priority 1)

| Source | Destination | Action |
|--------|-------------|--------|
| `specs/adapters/README.md` | `adapters/README.md` | Review, update |
| `specs/adapters/ADAPTER_INTERFACES.md` | Split | → `INBOUND_INTERFACE.md`, `OUTBOUND_INTERFACE.md` |
| `specs/adapters/INBOUND_INTERFACE.md` | `adapters/INBOUND_INTERFACE.md` | Copy, review |
| `specs/adapters/OUTBOUND_INTERFACE.md` | `adapters/OUTBOUND_INTERFACE.md` | Copy, review |
| `specs/adapters/channels/*.md` | `adapters/channels/*.md` | Copy all |
| `specs/adapters/upstream-reference/` | `upstream/` | Move upstream docs |

### Phase 3: ACL (Priority 1)

| Source | Destination | Action |
|--------|-------------|--------|
| `specs/acl/README.md` | `acl/README.md` | Copy, review |
| `specs/acl/ACCESS_CONTROL_SYSTEM.md` | `acl/ACCESS_CONTROL_SYSTEM.md` | Copy, review |
| `specs/acl/POLICIES.md` | `acl/POLICIES.md` | Copy, review |
| `specs/acl/GRANTS.md` | `acl/GRANTS.md` | Copy, review |
| `specs/acl/AUDIT.md` | `acl/AUDIT.md` | Copy, review |
| `specs/acl/upstream-reference/` | `upstream/` | Merge |
| `specs/acl/examples/` | `acl/examples/` | Copy |

### Phase 4: Broker + Agent System (Priority 1)

| Source | Destination | Action |
|--------|-------------|--------|
| `specs/agent-system/BROKER.md` | `broker/BROKER.md` | **Rewrite** — align with NEX |
| `specs/agent-system/ONTOLOGY.md` | `broker/ONTOLOGY.md` | Copy, review |
| `specs/agent-system/COMPACTION.md` | `broker/ONTOLOGY.md` | **Merge** into ONTOLOGY |
| `specs/agent-system/SESSION_FORMAT.md` | `broker/SESSION_FORMAT.md` | Review, update |
| NEW | `broker/AGENT_EXECUTION.md` | **Write** — port from upstream |
| NEW | `broker/CONTEXT_ASSEMBLY.md` | **Write** — detail context building |

### Phase 5: Hooks (Priority 2)

| Source | Destination | Action |
|--------|-------------|--------|
| `specs/agent-system/EVENT_SYSTEM_DESIGN.md` | Split | Extract hook parts |
| `specs/agent-system/HOOK_SERVICE.md` | `hooks/HOOK_SYSTEM.md` | Rename, review |
| `specs/agent-system/hook-examples/` | `hooks/examples/` | Copy |
| NEW | `hooks/TRIGGERS.md` | **Write** — trigger matching |

### Phase 6: Ledgers (Priority 2)

| Source | Destination | Action |
|--------|-------------|--------|
| NEW | `ledgers/README.md` | **Write** — overview |
| NEW | `ledgers/EVENTS_LEDGER.md` | **Write** — events schema |
| NEW | `ledgers/AGENTS_LEDGER.md` | **Write** — from existing docs |
| NEW | `ledgers/IDENTITY_LEDGER.md` | **Write** — entities schema |
| NEW | `ledgers/NEXUS_LEDGER.md` | **Write** — trace storage |
| NEW | `ledgers/SCHEMAS.md` | **Write** — consolidated SQL |

### Phase 7: Index / Memory (Priority 2)

| Source | Destination | Action |
|--------|-------------|--------|
| `specs/memory/README.md` | `index/README.md` | Review, update |
| `specs/memory/UPSTREAM_MEMORY.md` | `upstream/OPENCLAW_MEMORY.md` | Move |
| NEW | `index/MEMORY_SYSTEM.md` | **Write** — Nexus memory approach |
| NEW | `index/ENTITY_EXTRACTION.md` | **Write** |
| NEW | `index/QUERY_ENGINE.md` | **Write** |

### Phase 8: Supporting Specs (Priority 3)

| Source | Destination | Action |
|--------|-------------|--------|
| `specs/credentials/` | `credentials/` | Copy |
| `specs/workspace/` | `workspace/` | Copy, consolidate |
| `specs/cli/` | `cli/` | Copy |
| `specs/skills/` | `skills/` | Copy |

### Phase 9: Upstream Reference (Priority 3)

| Source | Destination | Action |
|--------|-------------|--------|
| `specs/agent-system/upstream/` | `upstream/` | Merge |
| `specs/plugins/UPSTREAM_PLUGINS.md` | `upstream/OPENCLAW_PLUGINS.md` | Move |
| Various upstream-reference folders | `upstream/` | Consolidate |

### Phase 10: Cleanup (Final)

| Action |
|--------|
| Delete superseded docs from old specs/ |
| Update all cross-references |
| Final review for consistency |
| Archive old specs/ as specs-v1/ |

---

## Migration Guidelines

### When Copying

1. Read the source file completely
2. Identify what's still accurate vs outdated
3. Note what references other docs
4. Copy to new location
5. Update/correct as needed
6. Update cross-references

### When Rewriting

1. Read the source file(s)
2. Identify the core concepts to preserve
3. Write fresh with new structure
4. Ensure consistency with NEX architecture
5. Cross-reference new docs

### When Merging

1. Read all source files
2. Identify overlapping content
3. Create unified narrative
4. Preserve all important details
5. Remove redundancy

---

## Status Tracking

| Section | Status | Notes |
|---------|--------|-------|
| architecture/ | 🔴 Not started | |
| nex/ | 🟡 Partial | NEX.md exists in old location |
| adapters/ | 🟡 Partial | Docs exist, need migration |
| acl/ | 🟢 Good | Clean, migrate as-is |
| broker/ | 🔴 Not started | Needs rewrite |
| hooks/ | 🟡 Partial | Scattered, needs consolidation |
| ledgers/ | 🔴 Not started | New section |
| index/ | 🔴 Not started | New section |
| credentials/ | 🟢 Good | Migrate as-is |
| workspace/ | 🟡 Partial | Needs consolidation |
| cli/ | 🟢 Good | Migrate as-is |
| skills/ | 🟢 Good | Migrate as-is |
| upstream/ | 🟡 Partial | Scattered, needs consolidation |

---

## Related

- `../specs/` — Original specs (v1, to be archived)
- `../FORK_PLAN.md` — Original fork plan
- `../RECONCILIATION_PLAN.md` — Reconciliation with upstream
