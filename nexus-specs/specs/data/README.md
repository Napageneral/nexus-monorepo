# Data Infrastructure

Where state lives and understanding is built.

---

## What This Is

Data infrastructure handles **persistent state**. It's the "memory" — where everything is recorded and derived understanding is built.

---

## Components

| Folder | Purpose |
|--------|---------|
| `ledgers/` | System of Record — primary data storage |
| `cortex/` | Derived understanding — episodes, facets, embeddings |

---

## The Two Layers

### System of Record (Ledgers)

The primary data layer. Four ledgers:

| Ledger | What It Stores |
|--------|----------------|
| **Events Ledger** | All inbound/outbound events |
| **Agents Ledger** | Sessions, turns, messages, tool calls |
| **Identity Graph** | Identities, relationships, aliases |
| **Nexus Ledger** | System state, configuration, triggers |

**Key property:** Immutable. Events are appended, not modified.

### Derived Layer (Cortex)

Understanding built from the ledgers:

| Concept | What It Is |
|---------|------------|
| **Episodes** | Coherent conversation segments |
| **Facets** | Entities, topics, patterns extracted |
| **Embeddings** | Vector representations for semantic search |

**Key property:** Regenerable. Can be rebuilt from ledgers.

---

## Data Flow

```
External Event
      │
      ▼
Events Ledger ──────────────► Cortex
      │                         │
      ▼                         │
Agent Execution                 │
      │                         │
      ▼                         ▼
Agents Ledger ──────────────► Cortex
      │
      ▼
Identity Graph
```

---

## See Also

- `../runtime/` — How data is created (event processing)
- `../environment/credentials/` — Secrets (special kind of data)
- `../architecture/OVERVIEW.md` — System overview

---

*This directory contains specifications for Nexus data infrastructure.*
