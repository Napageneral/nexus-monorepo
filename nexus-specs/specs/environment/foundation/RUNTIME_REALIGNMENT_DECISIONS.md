# Runtime Realignment Decisions (Big-Bang)

**Status:** DECISION LOCKED
**Last Updated:** 2026-02-18

> **Canonical reference:** See [DATABASE_ARCHITECTURE.md](../data/DATABASE_ARCHITECTURE.md) for the authoritative database layout.
**Scope:** `nexus-specs` + `nex` only (ignore external/legacy projects)

---

## Purpose

This document locks the architecture decisions for the next implementation pass.

These are **big-bang** decisions.

- No backward compatibility layer
- No dual-path support
- No legacy aliases preserved for old contracts

---

## Decision Summary

| Area | Decision |
|------|----------|
| State layout | Use 6 split databases under `state/data/*.db` (events, agents, identity, memory, embeddings, runtime) |
| Memory system | Memory System databases (memory.db, identity.db, embeddings.db) replace legacy cortex.db |
| Config | Use one canonical config file at `state/nexus/config.json` |
| CLI ownership | `nex` owns both runtime engine and CLI control plane |
| Runtime process model | Single long-running **NEX daemon** (control-plane included); no separate gateway service |
| Terminology | Replace `gateway` naming with `runtime` / `control-plane` |

---

## 1. Canonical State Layout

### Canonical Layout

```text
~/nexus/
├── AGENTS.md
├── skills/
├── home/
└── state/
    ├── data/
    │   ├── events.db          # Event ledger
    │   ├── agents.db          # Agent sessions
    │   ├── identity.db        # Contacts, directory, entities, auth, ACL
    │   ├── memory.db          # Facts, episodes, analysis (Memory System)
    │   ├── embeddings.db      # Semantic vector index
    │   └── runtime.db         # Request traces, adapters, automations, bus
    ├── agents/
    │   ├── BOOTSTRAP.md
    │   └── {agent-name}/
    │       ├── IDENTITY.md
    │       └── SOUL.md
    ├── user/
    │   └── IDENTITY.md
    ├── credentials/
    │   └── index.json
    └── nexus/
        └── config.json
```

### Memory System (replaces legacy cortex.db)

The legacy `state/cortex/cortex.db` has been superseded by three databases under `state/data/`:

- **memory.db** -- facts, episodes, facets, analyses, mental models (Memory System)
- **embeddings.db** -- semantic vector index (shared across subsystems)
- **identity.db** -- entities and knowledge graph (co-located with contacts, auth, ACL)

See [DATABASE_ARCHITECTURE.md](../data/DATABASE_ARCHITECTURE.md) for the full table inventories.

### Explicitly Not Canonical

The following paths are not canonical after this decision:

- `state/nexus.db` (single-file SoR model)
- `state/gateway/` config folder
- Split config files (`state/agents/config.json`, `state/credentials/config.json`, `state/gateway/config.json`)

---

## 2. Canonical Config Path + Schema

### Canonical Path

Use exactly one config file:

- `~/nexus/state/nexus/config.json`

### Schema Model

Use one document, namespaced by domain.

Example top-level domains:

- `agent`
- `credentials`
- `runtime` (renamed from `gateway`)
- `channels`
- `hooks`
- `automation`
- `acl`
- `cortex`
- `ui`
- `logging`

### Design Rationale

One canonical file is required for:

- Single validation pipeline
- Atomic config writes
- Simple UI binding/editing model
- Clear agent-managed config operations

---

## 3. CLI Ownership + Grammar Boundary

### Ownership

`nex` is the only source of truth for CLI implementation and grammar.

Runtime engine and CLI live in the same project.

### Grammar Boundary

The CLI must have two clear planes:

1. Orientation plane at root (`nexus status`, `nexus capabilities`, identity/workflow commands)
2. Runtime control plane under explicit runtime namespace (`nexus runtime ...`)

### Status Semantics

- `nexus status` = orientation summary (identity, capabilities, suggestions, readiness)
- `nexus runtime status` = runtime process/service/API health

---

## 4. Terminology Migration: Gateway -> Runtime

The product/runtime concept currently called "gateway" is renamed.

Canonical term:

- **Runtime** (or **control-plane** where context needs it)

Migration intent:

- CLI command group: `gateway` -> `runtime`
- Config namespace: `gateway.*` -> `runtime.*`
- Docs/spec language: "Gateway" -> "Runtime"

Because this is big-bang, we do not preserve old naming aliases.

---

## 5. Single Runtime Server (Gateway Removal)

Nexus has exactly one long-running runtime service:

- **NEX daemon** (`nexus daemon start`)

The control-plane (CLI + Control UI + HTTP endpoints + WS RPC) is part of the NEX daemon.

Implications:

- `src/gateway/` as a separate server concept is non-canonical and must be migrated into NEX.
- There is no "gateway daemon" to install/manage separately.
- Runtime exposure (LAN/tailnet) is controlled by `runtime.*` config and enforced by the daemon.

---

## 6. Implementation Order

1. Update specs to match this document (state layout, config, CLI contract language)
2. Align `nex` config path + schema on `state/nexus/config.json`
3. Align `nex` CLI semantics and rename `gateway` command surface to `runtime`
4. Update tests/e2e contracts to the new state/config/CLI contract
5. Remove contradictory docs and references

---

## 7. Acceptance Criteria

This decision is implemented when all are true:

- All 6 databases are read/written only from `state/data/*.db`
- Memory System data is read/written via memory.db, identity.db, and embeddings.db under `state/data/`
- Config reads/writes use only `state/nexus/config.json`
- `nexus status` is orientation-first
- Runtime service/API controls are under `nexus runtime ...`
- Only one runtime service exists: NEX daemon owns the control-plane (no separate gateway service)
- Spec docs no longer describe split config or `state/nexus.db` as canonical

---

## Related Specs

- `../../data/cortex/README.md`
- `../../runtime/nex/DAEMON.md`
- `../../runtime/nex/NEX.md`
- `./WORKSPACE_SYSTEM.md`
- `../interface/cli/COMMANDS.md`
