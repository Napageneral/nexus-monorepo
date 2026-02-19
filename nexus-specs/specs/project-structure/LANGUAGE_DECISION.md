# Language Decision

**Status:** DECIDED  
**Date:** 2026-02-06

---

## Decision

**TypeScript primary. Go for Cortex.**

---

## Split

| Component | Language | Rationale |
|-----------|----------|-----------|
| **NEX pipeline** | TypeScript (Bun) | Core orchestrator, rapid iteration, matches OpenClaw fork |
| **Broker** | TypeScript | Agent execution wraps pi-coding-agent (TS). Context assembly, ledger writes. |
| **CLI** | TypeScript | Same codebase as core, shared types |
| **Tools** | TypeScript | Tool framework is TS (from OpenClaw) |
| **Adapters** | Any (external binaries) | CLI protocol (JSONL) is language-agnostic. `eve`, `gog` are already standalone. |
| **Cortex** | Go | Embeddings, parallel analysis pipeline, semantic search, job system. Performance-critical. Existing Go codebase. |

---

## Boundaries

> **Update (2026-02-18):** The Go cortex process has been eliminated. All logic (memory pipeline, recall, search, entity extraction) is ported to TypeScript. The long-term plan is to unify everything into a single Go runtime, but short-term we unify into TS first. See [DATABASE_ARCHITECTURE.md](../data/DATABASE_ARCHITECTURE.md).

Currently, Nexus is a **single TypeScript process** (the NEX daemon). The Go cortex code remains in the repo for the eventual Go unification but is not a runtime participant.

```
TypeScript (NEX daemon — single process)
┌──────────────────────────────────────┐
│ NEX pipeline         Memory System   │
│ Broker               (TS port)       │
│ Agent execution      Embeddings      │
│ CLI commands         Semantic search │
│ Tool framework       Entity extract  │
└──────────────────┬───────────────────┘
                   │
     6 SQLite databases under state/data/
     (events, agents, identity, memory,
      embeddings, runtime)
```

**Database access:** The single process reads/writes all 6 databases. SQLite WAL mode enables concurrent reads. Write contention is isolated by database (hot-path writes to events.db, agents.db, and identity.db don't block each other).

**Adapter communication:** Adapters are external binaries invoked via CLI protocol. Language doesn't matter — Go, TS, Python, Rust, shell scripts all work.

---

## Why TypeScript Primary

- **OpenClaw fork** — Upstream is TypeScript. Keeping TS minimizes porting effort.
- **pi-coding-agent** — The agent execution engine is TS. No choice here.
- **Rapid iteration** — Bun gives fast rebuilds without full recompilation. Critical early on when the system is fluid.
- **Shared types** — CLI, NEX, Broker, tools all share TypeScript types. One codebase.

## Why Go for Cortex

- **Existing codebase** — Cortex/mnemonic is already Go with working adapters, job system, embeddings.
- **Performance** — Parallel analysis pipeline, embedding generation, concurrent job execution benefit from Go's concurrency model.
- **Long-running process** — Cortex runs background analysis continuously. Go's low memory footprint and goroutine model suit this well.

---

*This decision can be revisited if the process boundary creates friction. The adapter protocol already proves that language-agnostic boundaries work for Nexus.*
