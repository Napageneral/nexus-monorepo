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
| `EVENT_SYSTEM_DESIGN.md` | ✅ Current | Event layer, hooks, adapters |
| `SESSION_FORMAT.md` | ⚠️ Needs Revision | JSONL format — needs update for Nexus divergence from upstream |
| `TERMINOLOGY.md` | ✅ Aligned | Canonical terminology (aligned with ONTOLOGY) |
| `upstream/UPSTREAM_AGENT_SYSTEM.md` | ✅ Reference | Detailed upstream moltbot reference |
| `BROKER.md` | ⚠️ Needs Update | Routing interface — needs ACL + ONTOLOGY alignment |
| `ORCHESTRATION.md` | ⚠️ Outdated | Predates EVENT_SYSTEM_DESIGN; see UNIFIED_ARCHITECTURE |
| `ROUTING_HOOKS.md` | ⚠️ Superseded | **Replaced by `../acl/` specs** — see note below |
| `UNIFIED_TRIGGERS.md` | ❌ Superseded | Now part of EVENT_SYSTEM_DESIGN hooks |
| `hook-examples/` | ✅ Done | Hook patterns (deterministic, LLM, scheduled, hybrid) |

### Access Control System (NEW)

The identity/permissions/routing system has been extracted to its own spec folder:

**[`../acl/`](../acl/)** — Access Control Layer specs

| Spec | Description |
|------|-------------|
| `ACCESS_CONTROL_SYSTEM.md` | Unified overview — start here |
| `POLICIES.md` | Policy schema, examples, evaluation |
| `GRANTS.md` | Dynamic permissions and approval workflows |
| `AUDIT.md` | Audit logging |

**Key decision:** ACL (declarative policies) runs BEFORE hooks (programmatic scripts). This separates WHO from WHAT/HOW.

---

## Key Decisions (Settled)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Data Model** | Message → Turn → Thread → Session | Git-like Merkle tree structure |
| **Compaction** | Special turn type (`turnType: 'compaction'`) | Maintains tree structure, enables full history traversal |
| **Events vs Agents Ledger** | Separate ledgers | External events persist forever; agent sessions subject to compaction |
| **ACL vs Hooks** | Separate layers (ACL → Hooks → Broker) | WHO (declarative) vs WHAT/HOW (programmatic) |
| **ACL Policies** | YAML, identity-based, priority-ordered | GUI-friendly, ties into ledger's people table |
| **Permission Grants** | Dynamic, approval-based, temporary | Enables privilege escalation with owner approval |
| **Routing Hierarchy** | Thread (bedrock) → Session → Persona | Each layer abstracts the one below |
| **Smart Routing** | Boolean modifier on any routing level | Uses Index to find best target |
| **Turn Definition** | Query + all agent activity until response completes | Tool calls are part of turn, not separate |
| **Session** | Thread with childless head | Active threads only; stable label → current thread head |
| **Persona** | Identity (not permissions — ACL handles that) | SOUL.md, IDENTITY.md, accounts |
| **Event Layer** | Event layer sits above Broker | All events normalized, ACL evaluated, hooks run, then routed to Broker |
| **Timer Events** | 60s synthetic events | Timer adapter fires for cron hook evaluation |
| **Agent-to-Agent** | Direct through Broker | Not via Event Layer |
| **WA Permissions** | Inherit from triggering context | Cannot exceed MA permissions |
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
| **ACL vs Hooks Split** | ✅ Done | Declarative ACL policies run before programmatic hooks. See `../acl/`. |
| **ACL System Design** | ✅ Done | Principals, policies, grants, audit. See `../acl/ACCESS_CONTROL_SYSTEM.md`. |
| **Routing Hooks → ACL** | ✅ Superseded | `ROUTING_HOOKS.md` replaced by `../acl/POLICIES.md`. |

### Ready for Spec Work

| Item | Status | Notes |
|------|--------|-------|
| ACL → Hooks → Broker Interface | TODO | See `../core/INTERFACE_WORKPLAN.md` for tracking. |
| Response Formatting | ✅ RESOLVED | Turn-start context injection. See `../adapters/` docs. |
| Events vs Agents Ledger Split | TODO | Broker writes directly to ledgers. |

### Deferred

| Item | Status | Notes |
|------|--------|-------|
| Persona Management | ✅ Resolved | Tracked in unified entities table. See `../acl/ACCESS_CONTROL_SYSTEM.md`. |
| Ledger Integration | DEFERRED | Broker writes directly to Agents Ledger. Schema alignment. |
| SESSION_FORMAT.md Revision | DEFERRED | Needs update for Nexus divergence. |
| Context Assembly Details | TODO | Event/session context injection spec |
| Agent-to-Agent Flow | TODO | Full MA ↔ WA details, permission inheritance |
| Error Handling | TODO | Failures, recovery paths |
| Smart Forking | DEFERRED | Algorithm design after core is stable |
| BROKER.md Update | TODO | Align with ACL dispatch interface |

---

## Response Formatting — RESOLVED

**Decision:** Turn-start context injection based on channel.

When a message arrives, the channel is known from the event. Before the agent turn starts, inject formatting guidance based on that channel into the turn context (via `prependContext` or equivalent).

**Key documents:**
- `../adapters/upstream-reference/TOOL_HOOK_MECHANISM.md` — Decision and rationale
- `../adapters/OUTBOUND_INTERFACE.md` — Adapter formatting responsibility
- `../adapters/channels/` — Per-channel formatting rules

**Summary:**
- Agent receives channel via `NexusRequest.delivery.channel`
- Agent receives capabilities via `NexusRequest.delivery.capabilities`
- Detailed formatting rules injected at turn start based on channel
- Adapters handle final formatting, chunking, delivery

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

### Routing + Permissions — RESOLVED (ACL System)

**Decision:** Split into declarative ACL policies (WHO) and programmatic hooks (WHAT/HOW).

See `../acl/` for full spec:
- **ACL Layer** runs first — declarative YAML policies
- **Hooks Layer** runs after — programmatic TypeScript scripts
- ACL determines: principal, permissions, session
- Hooks determine: pattern matching, actions, context enrichment

Key capabilities:
- Owner gets full access (policy: `owner-full-access`)
- Family members get restricted permissions (policy: `family-access`)
- Group chats isolated with group-level permissions (policy: `group-chat-restrictions`)
- Unknown senders blocked or minimal (policy: `block-unknown`)
- Dynamic permission grants with owner approval (see `GRANTS.md`)
- Full audit logging (see `AUDIT.md`)

**Ties into ledger:** ACL policies query `persons` table for identity resolution.

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
