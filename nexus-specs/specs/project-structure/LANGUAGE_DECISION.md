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

The TS/Go boundary is a **process boundary**, not a library boundary. No FFI, no shared memory.

```
TypeScript (NEX daemon)              Go (Cortex)
┌──────────────────────┐            ┌──────────────────────┐
│ NEX pipeline         │            │ Analysis pipeline    │
│ Broker               │◄──────────│ Embeddings           │
│ Agent execution      │  queries  │ Semantic search      │
│ CLI commands         │  writes   │ Entity extraction    │
│ Tool framework       │            │ Job system           │
└──────────┬───────────┘            └──────────┬───────────┘
           │                                   │
           └──────── nexus.db (SQLite) ────────┘
                     (shared, both read+write)
```

**Database access:** Both processes read from and write to `nexus.db`. SQLite handles concurrent reads natively. Write contention is managed via WAL mode and short transactions. Cortex also writes to `cortex/{agentId}.db` for per-agent embeddings.

**Adapter communication:** Adapters are external binaries invoked via CLI protocol. Language doesn't matter — Go, TS, Python, Rust, shell scripts all work.

**Cortex ↔ NEX communication:** Cortex exposes functionality that NEX can query (semantic search, memory retrieval). The exact interface (HTTP API, Unix socket, direct SQLite reads) is TBD but the process boundary is clean.

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
