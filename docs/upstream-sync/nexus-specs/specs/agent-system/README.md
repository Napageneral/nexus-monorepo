# Agent System Specs

**Status:** DESIGN IN PROGRESS  
**Last Updated:** 2026-01-29

---

## Start Here

**[UNIFIED_ARCHITECTURE.md](./UNIFIED_ARCHITECTURE.md)** — Canonical architecture reference with unified diagram

---

## Documents

| Spec | Status | Description |
|------|--------|-------------|
| **`UNIFIED_ARCHITECTURE.md`** | ✅ Canonical | **START HERE** — Unified architecture diagram, how pieces fit together |
| `ONTOLOGY.md` | ✅ Canonical | Data model (Message, Turn, Thread, Session, Persona) |
| `EVENT_SYSTEM_DESIGN.md` | ✅ Current | Mnemonic event layer, hooks, adapters |
| `SESSION_FORMAT.md` | ✅ Done | JSONL format, AIX compatibility, rich metadata |
| `TERMINOLOGY.md` | ✅ Aligned | Canonical terminology (aligned with ONTOLOGY) |
| `UPSTREAM_AGENT_SYSTEM.md` | ✅ Reference | Detailed upstream clawdbot reference |
| `BROKER.md` | ⚠️ Needs Update | Routing interface — needs ONTOLOGY alignment |
| `ORCHESTRATION.md` | ⚠️ Outdated | Predates EVENT_SYSTEM_DESIGN; see UNIFIED_ARCHITECTURE |
| `UNIFIED_TRIGGERS.md` | ❌ Superseded | Now part of EVENT_SYSTEM_DESIGN hooks |
| `hook-examples/` | ✅ Done | Hook patterns (deterministic, LLM, scheduled, hybrid) |

---

## Key Decisions (Settled)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Data Model** | Message → Turn → Thread → Session | Git-like Merkle tree structure |
| **Routing Hierarchy** | Thread (bedrock) → Session → Persona | Each layer abstracts the one below |
| **Smart Routing** | Boolean modifier on any routing level | Uses Mnemonic to find best target |
| **Turn Definition** | Query + all agent activity until response completes | Tool calls are part of turn, not separate |
| **Session** | Thread with childless head | Active threads only; stable label → current thread head |
| **Persona** | Identity + Permissions | Does NOT include model config (that's per-turn) |
| **Event Layer** | Mnemonic sits above Broker | All events normalized, hooks evaluated, then routed to Broker |
| **Timer Events** | 60s synthetic events | Timer adapter fires for cron hook evaluation |
| **Agent-to-Agent** | Direct through Broker | Not via Event Layer; Mnemonic syncs via AIX |
| **Naming** | Manager-Worker Pattern (MWP) | Clear roles |
| **All agents persistent** | Yes | No ephemeral agents, aligns with Mnemonic |
| **Nested spawning** | Allowed | Remove upstream restriction, track depth (default: 3) |
| **Queue modes** | Use upstream's | steer, followup, collect, interrupt |
| **Durability** | SQLite backing store | Survives restarts |

---

## Architecture Overview

See **[UNIFIED_ARCHITECTURE.md](./UNIFIED_ARCHITECTURE.md)** for the full diagram.

```
External Sources → Mnemonic Event Layer → Hook Evaluation → Agent Broker → Agents → Response
                         │                                       │
                         │                                       └── MA ↔ WA (direct)
                         │
                         └── Timer Adapter (60s ticks for cron hooks)
```

---

## Open Items (TODOs)

| Item | Status | Notes |
|------|--------|-------|
| Hook → Broker Interface | TODO | How routing decisions become broker calls |
| Context Assembly Details | TODO | Event/session context injection spec |
| Response Formatting | TODO | Per-platform formatting, threading |
| Agent-to-Agent Flow | TODO | Full MA ↔ WA details |
| Persona Management | TODO | Storage, creation, inheritance |
| Error Handling | TODO | Failures, recovery paths |
| Smart Forking | DEFERRED | Algorithm design after core is stable |
| BROKER.md Update | TODO | Align with ONTOLOGY routing model |

See UNIFIED_ARCHITECTURE.md Section 10 for full TODO list with context.

---

## Related Documents

### Context Assembly Research
- `../workspace/agent-bindings-research/01-UPSTREAM_CONTEXT_INJECTION.md`
- `../workspace/agent-bindings-research/02-NEXUS_CONTEXT_INJECTION.md`
- `../workspace/agent-bindings-research/03-HARNESS_BINDING_MECHANISMS.md`

### Memory System
- `/cortex/docs/MNEMONIC_ARCHITECTURE.md` — Unified memory system
- `/aix/docs/AIX_MNEMONIC_PIPELINE.md` — AIX → Mnemonic flow

---

*Start with UNIFIED_ARCHITECTURE.md for the big picture, then ONTOLOGY.md for data model details.*
