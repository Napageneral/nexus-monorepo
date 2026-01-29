# Agent System Specs

**Status:** DESIGN COMPLETE, implementation needed  
**Conflict Risk:** HIGH

---

## Documents

| Spec | Status | Description |
|------|--------|-------------|
| `ONTOLOGY.md` | ✅ Done | **START HERE** — Data model (message, turn, thread, session), git-like routing |
| `UPSTREAM_AGENT_SYSTEM.md` | ✅ Done | Detailed upstream reference (subagents, queues, triggers, sessions) |
| `TERMINOLOGY.md` | ⚠️ Needs Update | Canonical terminology — needs alignment with ONTOLOGY.md |
| `ORCHESTRATION.md` | ✅ Done | MWP architecture, design decisions |
| `BROKER.md` | ⚠️ Needs Update | AgentBroker interface — needs alignment with ONTOLOGY.md routing |
| `SESSION_FORMAT.md` | ✅ Done | JSONL format, forking prep, aix compatibility |
| `UNIFIED_TRIGGERS.md` | ✅ Done | Heartbeat/cron/webhook unified abstraction, template variables |

---

## Key Decisions (Settled)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Data Model** | Message → Turn → Thread → Session | Git-like Merkle tree structure |
| **Routing Primitive** | Thread ID | All routing resolves to thread; session/persona are layers on top |
| **# Threads = # Turns** | Every turn is addressable | Enables smart forking to any point |
| **Session** | Thread with childless head | Active threads only; stable label → current thread head |
| **Persona** | Identity + Permissions | Does NOT include model config (that's per-turn) |
| Naming | Manager-Worker Pattern (MWP) | Clear roles |
| All agents persistent | Yes | No ephemeral agents, aligns with cortex |
| Nested spawning | Allowed | Remove upstream restriction, track depth |
| Mid-task communication | Via message routing | Agents communicate through broker, no special announce |
| Queue modes | Use upstream's | steer, followup, collect, interrupt |
| Durability | SQLite backing store | Survives restarts |
| Triggers | Unified abstraction | Absorbs cron + heartbeat; all triggers → broker |
| Broker as core | Everything routes through broker | Triggers, user messages, agent messages — all through broker |

---

## Architecture Summary

```
┌─────────────────────────────────────────────────────────────────────┐
│                      EXTERNAL SOURCES                                │
│         User Messages │ Webhooks │ File Watchers                    │
└────────────────────────────────────┬────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      AGENT BROKER (Core)                             │
│                                                                      │
│  Plugins:                        Routing:                            │
│  ├─ Unified Triggers             Thread ID (primitive)               │
│  ├─ External Message Adapter     → Session (label → thread head)    │
│  └─ Webhook Adapter              → Persona (main session)            │
│                                  → Smart (cortex finds thread)       │
└────────────────────────────────────┬────────────────────────────────┘
                                     │
        ┌────────────────────────────┼────────────────────────────────┐
        ▼                            ▼                                ▼
┌──────────────────┐    ┌──────────────────────────┐    ┌──────────────────┐
│  Manager Agent   │    │     Worker Agent(s)      │    │   Sub-Workers    │
│  (MA)            │◄──►│     (WA)                 │◄──►│   (nested OK)    │
└──────────────────┘    └──────────────────────────┘    └──────────────────┘
```

---

## Ontology Quick Reference

| Term | Definition | Git Analogy |
|------|------------|-------------|
| **Message** | Atomic content unit | File change |
| **Turn** | Query + response exchange; the key addressable unit | Commit |
| **Thread** | Turn + all ancestors (cumulative context) | Branch history |
| **Session** | Thread whose head has no children (active) | Branch tip |
| **Persona** | Identity + Permissions (thread decorator) | Repo permissions |

**Key insight:** Every turn creates a new thread. # threads = # turns. Routing is always to a thread ID; session/persona are abstractions on top.

See `ONTOLOGY.md` for full definitions and data model.

---

## Implementation Order

1. **Ontology implementation** — Turn, Thread, Session tables
2. **Agent Broker core** — Thread routing primitive
3. **Session Manager** — Stable label → thread head mapping
4. **Unified Triggers** — Absorb cron + heartbeat
5. **Tool family** — dispatch_to_agent, reply_to_caller
6. **Smart routing (v2)** — Cortex-powered thread selection

---

*Start with `ONTOLOGY.md`, then `UPSTREAM_AGENT_SYSTEM.md` for context.*
