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
| `ONTOLOGY.md` | ✅ Canonical | Data model (Message, Turn, Thread, Session, Persona, Compaction) |
| `COMPACTION.md` | ✅ New | Compaction as special turn type, context management |
| `ROUTING_HOOKS.md` | ✅ New | Routing hooks, permission system, identity-based access control |
| `EVENT_SYSTEM_DESIGN.md` | ✅ Current | Event layer, hooks, adapters |
| `SESSION_FORMAT.md` | ⚠️ Needs Revision | JSONL format — needs update for Nexus divergence from upstream |
| `TERMINOLOGY.md` | ✅ Aligned | Canonical terminology (aligned with ONTOLOGY) |
| `upstream/UPSTREAM_AGENT_SYSTEM.md` | ✅ Reference | Detailed upstream moltbot reference |
| `BROKER.md` | ⚠️ Needs Update | Routing interface — needs ONTOLOGY alignment |
| `ORCHESTRATION.md` | ⚠️ Outdated | Predates EVENT_SYSTEM_DESIGN; see UNIFIED_ARCHITECTURE |
| `UNIFIED_TRIGGERS.md` | ❌ Superseded | Now part of EVENT_SYSTEM_DESIGN hooks |
| `hook-examples/` | ✅ Done | Hook patterns (deterministic, LLM, scheduled, hybrid) |

---

## Key Decisions (Settled)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Data Model** | Message → Turn → Thread → Session | Git-like Merkle tree structure |
| **Compaction** | Special turn type (`turnType: 'compaction'`) | Maintains tree structure, enables full history traversal |
| **Events vs Agents Ledger** | Separate ledgers | External events persist forever; agent sessions subject to compaction |
| **Routing Hierarchy** | Thread (bedrock) → Session → Persona | Each layer abstracts the one below |
| **Routing Hooks** | Return `{ persona, session, permissions, deliveryContext }` | Identity-based access control |
| **Smart Routing** | Boolean modifier on any routing level | Uses Mnemonic to find best target |
| **Turn Definition** | Query + all agent activity until response completes | Tool calls are part of turn, not separate |
| **Session** | Thread with childless head | Active threads only; stable label → current thread head |
| **Persona** | Identity + Permissions | Does NOT include model config (that's per-turn) |
| **Event Layer** | Event layer sits above Broker | All events normalized, hooks evaluated, then routed to Broker |
| **Timer Events** | 60s synthetic events | Timer adapter fires for cron hook evaluation |
| **Agent-to-Agent** | Direct through Broker | Not via Event Layer |
| **Naming** | Manager-Worker Pattern (MWP) | Clear roles |
| **All agents persistent** | Yes | No ephemeral agents |
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

### Recently Completed (2026-01-29)

| Item | Status | Notes |
|------|--------|-------|
| **Compaction in ONTOLOGY** | ✅ Done | Compaction is a special turn type. See `COMPACTION.md` and updated `ONTOLOGY.md`. |
| **Routing Hooks** | ✅ Done | Identity-based routing with permissions. See `ROUTING_HOOKS.md`. |

### Ready for Spec Work

| Item | Status | Notes |
|------|--------|-------|
| Hook → Broker Interface | TODO | How routing decisions become broker calls. |
| Response Formatting | TODO | See detailed notes below. |
| Routing vs Hooks | TODO | Whether to split declarative routing rules from programmatic hooks. Captured in `ROUTING_HOOKS.md`. |
| Events vs Agents Ledger Split | TODO | Broker writes directly to ledgers. Captured in discussion notes below. |

### Deferred

| Item | Status | Notes |
|------|--------|-------|
| Persona Management | DEFERRED | Storage in workspace (`~/nexus/state/agents/{personaId}/`). IDENTITY.md, SOUL.md. Session isolation per persona. How WA inherits MA persona. |
| Ledger Integration | DEFERRED | Broker writes directly to Mnemonic Agents Ledger. Schema alignment. Naming (ledgers, broker, memory system as separate components). |
| SESSION_FORMAT.md Revision | DEFERRED | Needs update for Nexus divergence — broker writes to ledger, not files. |
| Context Assembly Details | TODO | Event/session context injection spec |
| Agent-to-Agent Flow | TODO | Full MA ↔ WA details |
| Error Handling | TODO | Failures, recovery paths |
| Smart Forking | DEFERRED | Algorithm design after core is stable |
| BROKER.md Update | TODO | Align with ONTOLOGY routing model |

---

## Response Formatting TODO

**Context:** When agent responds, the delivery context (channel, thread, replyToId) determines how to format and deliver.

**Upstream approach:**
- No explicit formatter tools in upstream
- Outbound adapters handle platform-specific formatting:
  - Discord: 2000 char limit, embeds, threads
  - Telegram: 4000 chars, MarkdownV2
  - WhatsApp: Baileys API, PTT audio
- Agent knowledge via system prompt can include formatting guidance

**Options for Nexus:**
1. **Adapter-handled** — Outbound adapters format automatically based on channel
2. **Formatter tool** — Agent can explicitly request rich formatting
3. **System prompt injection** — Inject platform guidance based on delivery context

**Questions to resolve:**
- How does agent know which channel it's responding to?
- Should formatting be automatic or agent-controlled?
- How to handle message chunking for long responses?
- Thread/reply handling per platform?

**Spec needed:** Response formatting system design doc.

---

## Discussion Notes (2026-01-29)

### Compaction — RESOLVED

**Decision:** Compaction is a special turn type (`turnType: 'compaction'`).

See `COMPACTION.md` for full spec. Key points:
- Compaction turn points to previous turn as parent
- Contains summary + references to `summarizedThroughTurnId` and `firstKeptTurnId`
- Subsequent turns point to compaction as parent
- Full history preserved (compaction doesn't delete, just marks context boundary)
- Second compaction summarizes first compaction's summary (recursive)

### Routing + Permissions — RESOLVED

**Decision:** Routing hooks return `{ persona, session, permissions, deliveryContext }`.

See `ROUTING_HOOKS.md` for full spec with examples:
- Owner gets full access
- Family members get restricted permissions (no email, no credentials)
- Group chats isolated per group with group-level permissions
- Unknown senders get minimal permissions
- Can integrate with Mnemonic contacts for identity management

**Open question (deferred):** Whether to split declarative routing rules from programmatic hooks.

### Events vs Agents Ledger Split — IN PROGRESS

**Upstream model:** Channel events → Session logs → Compaction → History compressed

**Nexus model:**
- Channel events → Events Ledger (permanent, never compacted)
- Hook evaluation → Routing decision (persona + session + permissions)
- Broker → Agents Ledger (turn/thread tracking, subject to compaction)
- Compaction only affects Agents Ledger, not Events Ledger

**Key insight:** Separating these gives full history in Events while managing context in Agents.

**Still needs spec:**
- Broker writes directly to Agents Ledger (not files → AIX → ledger)
- Naming: separate concerns (ledgers, broker, memory/analysis system)
- Schema alignment between what broker writes and Mnemonic agents tables

### Upstream Session Key Investigation

**Completed:** Subagents investigated real moltbot codebase.

**Key findings:**
- Session keys: `agent:{agentId}:{context}` (e.g., `agent:main:main`, `agent:main:discord:group:123`)
- DMs collapse to main by default (`dmScope: "main"`)
- Groups always isolated per provider + group ID
- sessions.json maps sessionKey → SessionEntry (50+ fields)
- JSONL transcripts managed by `@mariozechner/pi-coding-agent`
- Two compaction mechanisms: gateway (line truncation) and pi-agent (LLM summarization)

See `upstream/UPSTREAM_AGENT_SYSTEM.md` for full reference.

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
