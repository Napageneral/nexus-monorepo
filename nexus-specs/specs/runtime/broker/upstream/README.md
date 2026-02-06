# Upstream Agent System Reference

**Status:** REFERENCE DOCUMENTATION  
**Source:** OpenClaw (`~/nexus/home/projects/openclaw/`)  
**Last Updated:** 2026-02-04

---

## Purpose

This folder documents OpenClaw's agent execution architecture to inform Nexus Broker design. OpenClaw is the upstream system that provides:

- Agent execution via `pi-embedded-runner`
- Session management with JSONL transcripts
- Queue-based message handling during active runs
- Subagent spawning and lifecycle management
- Context compaction for long conversations

**Nexus Broker** will implement similar functionality but with key architectural differences (see [Divergences](#nexus-divergences) below).

---

## OpenClaw Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         OPENCLAW AUTO-REPLY PIPELINE                         │
│                                                                              │
│  Inbound Message                                                             │
│       ↓                                                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ dispatchInboundMessage()                                             │    │
│  │   → finalizeInboundContext()                                         │    │
│  │   → dispatchReplyFromConfig()                                        │    │
│  │       → Dedupe check                                                 │    │
│  │       → getReplyFromConfig()                                         │    │
│  └──────────────────────────────────┬──────────────────────────────────┘    │
│                                     ↓                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ Session Resolution                                                   │    │
│  │   → buildAgentPeerSessionKey()                                       │    │
│  │   → Load/create SessionEntry in sessions.json                        │    │
│  │   → Resolve transcript file path                                     │    │
│  └──────────────────────────────────┬──────────────────────────────────┘    │
│                                     ↓                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ Queue Management                                                     │    │
│  │   → Check ACTIVE_EMBEDDED_RUNS for session                           │    │
│  │   → If active: apply queue mode (steer/followup/collect/etc.)       │    │
│  │   → If idle: proceed to agent execution                             │    │
│  └──────────────────────────────────┬──────────────────────────────────┘    │
│                                     ↓                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ runEmbeddedPiAgent()                                                 │    │
│  │   → Queue via session lane (serialization)                          │    │
│  │   → Queue via global lane (rate limiting)                           │    │
│  │   → Model resolution & auth profile selection                       │    │
│  │   → runEmbeddedAttempt()                                            │    │
│  │       → Context assembly (bootstrap files, skills, system prompt)   │    │
│  │       → Tool creation & policy application                          │    │
│  │       → LLM execution with streaming                                │    │
│  │       → Response processing                                         │    │
│  └──────────────────────────────────┬──────────────────────────────────┘    │
│                                     ↓                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ Response Delivery                                                    │    │
│  │   → ReplyDispatcher serialization                                   │    │
│  │   → Human-like delays (block streaming)                             │    │
│  │   → Channel-specific delivery                                       │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Key Concepts

### Session Keys

OpenClaw uses hierarchical session keys to identify conversations:

```
agent:{agentId}:{type}:{context}

Examples:
- agent:main:main                    # Main DM session
- agent:main:dm:tyler                # Per-peer DM
- agent:main:telegram:group:123      # Group chat
- agent:main:subagent:uuid           # Spawned subagent
```

**Nexus equivalent:** Session labels in `sessions` table of Agents Ledger.

### Session Entry

`SessionEntry` tracks all session state in `sessions.json`:

| Field | Purpose |
|-------|---------|
| `sessionId` | Current transcript UUID |
| `sessionFile` | Path to JSONL transcript |
| `providerOverride` / `modelOverride` | Model selection |
| `thinkingLevel` / `verboseLevel` | Behavior overrides |
| `queueMode` | Per-session queue settings |
| `compactionCount` | Number of compactions performed |

**Nexus equivalent:** `sessions` table in Agents Ledger (SQLite).

### Queue Modes

How messages are handled when a session is busy:

| Mode | During Active Run | After Run Ends |
|------|-------------------|----------------|
| `steer` | Inject into active context | Run normally |
| `followup` | Queue message | Process FIFO |
| `collect` | Queue message | Batch all into one prompt |
| `steer-backlog` | Try steer, queue if fails | Process queue |
| `interrupt` | Abort active run | Run new message |

**Nexus:** Same modes, but durable in SQLite instead of in-memory Maps.

### Subagent Spawning

Agents can spawn background workers via `sessions_spawn` tool:

- Child session key: `agent:{agentId}:subagent:{uuid}`
- Nested spawning forbidden (subagents can't spawn subagents)
- Results announced back to parent via announce flow

**Nexus:** Uses `send_message_to_agent` with full bidirectional communication.

---

## Documents in This Folder

| Document | Description |
|----------|-------------|
| **README.md** | This file — overview and index |
| **UPSTREAM_AGENT_SYSTEM.md** | Comprehensive reference (subagents, sessions, queues, triggers, lifecycle, compaction) |
| **SESSION_MANAGEMENT.md** | Deep dive on session keys, SessionEntry, DM scoping, send policies |
| **CONTEXT_ASSEMBLY.md** | Bootstrap files, system prompt building, compaction mechanics |
| **AGENT_EXECUTION.md** | pi-embedded-runner, lanes, failover, streaming, tool execution |

---

## Nexus Divergences

The Nexus Broker diverges from OpenClaw in several key ways:

### Storage Model

| Aspect | OpenClaw | Nexus Broker |
|--------|----------|--------------|
| Session metadata | `sessions.json` (JSON file) | `sessions` table (SQLite) |
| Transcripts | `<sessionId>.jsonl` files | `turns`, `messages` tables |
| Queue state | In-memory Maps | Durable SQLite tables |
| Subagent registry | `runs.json` + in-memory | Agent-to-agent via Agents Ledger |

### Agent Communication

| Aspect | OpenClaw | Nexus Broker |
|--------|----------|--------------|
| Spawning tool | `sessions_spawn` | `send_message_to_agent` |
| Result delivery | Announce flow (completion only) | Bidirectional (anytime) |
| Nested spawning | Forbidden | Allowed (depth limit: 3) |
| Worker persistence | Ephemeral (cleanup after run) | All agents persistent |

### Context Assembly

| Aspect | OpenClaw | Nexus Broker |
|--------|----------|--------------|
| History source | JSONL transcript files | Agents Ledger (turn tree) |
| Compaction | Truncate + summary in transcript | Compaction turn in turn tree |
| Context injection | Bootstrap files + skills prompt | Cortex-derived context |

### Pipeline Integration

| Aspect | OpenClaw | Nexus Broker |
|--------|----------|--------------|
| Entry point | Channel adapters → auto-reply | NEX pipeline → Broker |
| Routing | Session key resolution | Session/Thread/Persona routing |
| Event storage | None (stateless) | Events Ledger |

---

## Patterns to Adopt

These OpenClaw patterns are well-designed and should be adopted in Nexus:

1. **Queue modes** — The steer/followup/collect/interrupt taxonomy covers all use cases
2. **Session key hierarchy** — Clear encoding of context in session identifiers
3. **Lane-based serialization** — Session lanes for ordering, global lanes for rate limiting
4. **Streaming subscription callbacks** — Clean separation of partial/block/final replies
5. **Failover and retry logic** — Auth profile rotation, thinking level fallback

## Patterns to Change

These patterns need architectural changes in Nexus:

1. **In-memory queue state** — Move to durable SQLite for crash recovery
2. **JSONL transcripts** — Replace with relational turn tree in Agents Ledger
3. **One-way subagent communication** — Enable bidirectional agent-to-agent messaging
4. **Subagent completion-only announces** — Support mid-task status updates
5. **Separate heartbeat/cron systems** — Unify under NEX hook triggers

---

## Related Nexus Specs

- `../` — Nexus Broker design docs
- `../../nex/` — NEX pipeline (triggers Broker)
- `../../ledgers/AGENTS_LEDGER.md` — Where Broker writes sessions/turns
- `../../cortex/` — Context injection source
- `../../upstream/` — Additional OpenClaw reference docs

---

## Source Code Locations

| Component | OpenClaw Path |
|-----------|---------------|
| Session key utils | `src/sessions/session-key-utils.ts` |
| Session types | `src/config/sessions/types.ts` |
| Queue management | `src/auto-reply/reply/queue/` |
| Agent runner | `src/agents/pi-embedded-runner/` |
| Subagent system | `src/agents/subagent-*.ts` |
| Compaction | `src/agents/pi-embedded-runner/compact.ts` |
| Auto-reply pipeline | `src/auto-reply/` |
| Tool creation | `src/agents/pi-tools.ts` |

---

*This folder provides upstream reference for Nexus Broker development.*
