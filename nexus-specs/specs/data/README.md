# Data Infrastructure

Where state lives and understanding is built.

> **Canonical Reference:** See [DATABASE_ARCHITECTURE.md](./DATABASE_ARCHITECTURE.md) for the
> authoritative database inventory, table ownership, and migration plan.

---

## What This Is

Data infrastructure handles **persistent state**. It's the "memory" — where everything is recorded and derived understanding is built.

---

## Components

| Folder | Purpose |
|--------|---------|
| `ledgers/` | System of Record — primary data storage |
| `cortex/` | Legacy derived-understanding docs (being superseded — see DATABASE_ARCHITECTURE.md) |

---

## The 6-Database Model

Nexus uses a multi-database SQLite architecture. Each database file has a clear, single-sentence purpose and well-defined ownership boundaries.

| # | Database | What It Stores |
|---|----------|----------------|
| 1 | **events.db** | All inbound/outbound message events — the canonical event ledger |
| 2 | **agents.db** | Sessions, turns, messages, tool calls, artifacts |
| 3 | **identity.db** | Contacts, directory, entities, auth, ACL |
| 4 | **memory.db** | Facts, episodes, mental models, analysis pipeline |
| 5 | **embeddings.db** | Semantic vector index (sqlite-vec) |
| 6 | **runtime.db** | Request tracking, adapters, automations, bus |

**Key property:** Single owner per table. No cross-database foreign keys. Write contention isolation between hot paths.

### Memory System (formerly "Cortex")

Understanding built from the primary databases:

| Concept | Database |
|---------|----------|
| **Facts & Episodes** | memory.db |
| **Entities & Knowledge Graph** | identity.db |
| **Embeddings** | embeddings.db |

**Key property:** Regenerable. Can be rebuilt from events.db + agents.db.

---

## Data Flow

```
External Event
      │
      ▼
events.db ─────────────────────────────┐
      │                                 │
      ▼                                 ▼
Agent Execution                   Memory Pipeline (TS)
      │                                 │
      ▼                                 ├──► memory.db (facts, episodes)
agents.db ──────────────────────────────┤
      │                                 ├──► identity.db (entities)
      ▼                                 │
identity.db (contacts, auth, ACL)       └──► embeddings.db (vectors)

runtime.db (request traces, adapters, automations)
```

---

## See Also

- [DATABASE_ARCHITECTURE.md](./DATABASE_ARCHITECTURE.md) — Canonical database spec (6-database inventory, migrations, ownership)
- `../runtime/` — How data is created (event processing)
- `../environment/credentials/` — Secrets (special kind of data)
- `../README.md` — System overview

---

*This directory contains specifications for Nexus data infrastructure.*
