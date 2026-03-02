# Language and Architecture Decision

**Status:** CANONICAL
**Date:** 2026-02-23
**Supersedes:** `LANGUAGE_DECISION.md` (archived)

---

## Decision

**Current: Pure TypeScript. Single process. No separate Go process.**

Nexus runs as a single TypeScript process (the nex daemon). All subsystems -- pipeline, broker, memory, adapters, CLI, IAM, automations -- execute within one process.

**Future: Full Go port producing a single Go binary.**

When the decision is made to migrate, the entire system will be ported to Go -- including pi-coding-agent (a local Go port called "go-coding-agent" already exists). This will produce a single Go binary with no subprocess dependencies.

---

## Current Architecture

```
TypeScript (nex daemon -- single process)
+--------------------------------------+
| NEX pipeline        Memory System    |
| Broker              (TypeScript)     |
| Agent execution     Embeddings       |
| CLI commands        Semantic search  |
| Tool framework      Entity extract   |
| IAM                 Recall           |
| Automations         Consolidation    |
+------------------+-------------------+
                   |
     7 SQLite databases under state/data/
     (events, agents, identity, memory,
      embeddings, runtime, work)
```

### What Changed

The old Go memory subprocess has been eliminated. All memory pipeline, recall, search, and entity extraction logic has been ported to TypeScript and runs inside the nex process. There is no separate Go process. There is no IPC, no HTTP server on `:4317`, no subprocess supervisor.

The memory system is a unified subsystem inside nex -- not a separate component.

### Single Process, 7 Databases

The nex process reads and writes all 7 SQLite databases:

| Database | Purpose |
|----------|---------|
| **events.db** | Every inbound/outbound event, normalized and stored. FTS5 full-text index. |
| **agents.db** | Session lifecycle, turns, messages, tool calls, compactions, artifacts. |
| **identity.db** | Entities, identity resolution, contacts, auth tokens, the Identity Graph. |
| **memory.db** | Knowledge graph: elements (facts, observations, mental models), sets, jobs. |
| **embeddings.db** | Vector embeddings for semantic search (sqlite-vec). |
| **runtime.db** | Pipeline requests, automations, IAM grants/audit, adapter state, import jobs. |
| **work.db** | Task definitions, work items, workflows, sequences for planned and scheduled work. |

SQLite WAL mode enables concurrent reads. Write contention is isolated by database -- hot-path writes to events.db, agents.db, and identity.db don't block each other.

See `specs/data/DATABASE_ARCHITECTURE.md` for the canonical database specification.

---

## Future: Go Port

When the decision is made, the entire system will be ported to Go:

- **All TypeScript code** -- pipeline, broker, CLI, IAM, automations, memory system, config, daemon management -- ports to Go.
- **pi-coding-agent** -- A Go port called "go-coding-agent" already exists locally. It will replace the current TypeScript pi-coding-agent dependency, eliminating the need for Node.js entirely.
- **Single Go binary** -- The end state is one compiled binary with zero runtime dependencies (no Node.js, no npm).
- **Database compatibility** -- The Go binary will read existing SQLite databases without migration. Schemas are byte-identical.
- **Adapter compatibility** -- Existing adapter binaries continue to work. The adapter protocol is language-agnostic (stdin/stdout JSON-lines).

### Archived Reference Material

The following documents are retained as reference material for the future Go port:

- **`GO_MIGRATION_SPEC.md`** -- Detailed migration inventory, phasing plan, behavioral contracts, RPC protocol, and test coverage baseline. Written when the plan was to keep pi-coding-agent as a Node.js subprocess -- the go-coding-agent port changes this, but the migration inventory and behavioral contracts remain useful.
- **`specs/NEXUS_CONVERGENCE_ARCHITECTURE.md`** -- Design exploration for converging the nex runtime with code-cartographer into Go. Contains the ABC architecture, two-phase memory reader, shared memory with tree-scoped queries, and software factory pipeline designs.

Both are archived with banners indicating their status.

---

## Why TypeScript Now

- **OpenClaw fork** -- Upstream is TypeScript. Keeping TS minimizes porting effort.
- **Rapid iteration** -- Bun gives fast rebuilds without full recompilation. Critical while the system is fluid.
- **Shared types** -- CLI, nex, broker, tools, memory all share TypeScript types. One codebase.
- **Unified process** -- No IPC overhead, no subprocess management, no serialization boundaries. Everything is function calls.

## Why Go Eventually

- **Single binary distribution** -- `brew install nexus` and done. No Node.js, no npm, no pnpm.
- **Performance** -- Go's concurrency model (goroutines) suits the memory pipeline, embedding generation, and parallel analysis workloads.
- **go-coding-agent** -- A Go port of pi-coding-agent already exists, eliminating the largest dependency on Node.js.
- **Memory footprint** -- Go's lower memory usage matters for a long-running daemon.
- **Existing Go code** -- The original memory system codebase is Go. The adapter SDK has a Go version. go-coding-agent is Go. The ecosystem is ready.

---

*This document is the canonical architecture decision. All other language/architecture documents defer to this one.*
