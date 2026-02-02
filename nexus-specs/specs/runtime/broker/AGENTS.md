# Manager-Worker Pattern (MWP)

**Status:** DESIGN SPEC  
**Last Updated:** 2026-02-02  
**Related:** DATA_MODEL.md, OVERVIEW.md

---

## Overview

The Manager-Worker Pattern (MWP) defines how Nexus orchestrates multiple agents to handle complex tasks.

**Core insight:** A single user-facing agent (Manager) maintains conversation continuity while delegating context-heavy execution to specialized agents (Workers).

---

## Terminology

| Term | Role | Description |
|------|------|-------------|
| **Manager Agent (MA)** | Interaction | Talks to user, delegates tasks, maintains conversation |
| **Worker Agent (WA)** | Execution | Task-focused, heavy context, specialized tools |
| **Agent Broker** | Orchestration | Routes messages between agents, manages queues |

---

## Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│                         NEX Pipeline                                │
│                    (triggers broker at runAgent stage)             │
└────────────────────────────────────────┬───────────────────────────┘
                                         │
                                         ▼
┌────────────────────────────────────────────────────────────────────┐
│                        AGENT BROKER                                 │
│                                                                     │
│  • Routes messages to appropriate agent sessions                   │
│  • Manages message queues (durable, priority-based)               │
│  • Tracks agent relationships (who spawned whom)                  │
│  • Handles trigger → session routing                               │
│  • Writes sessions/turns to Agents Ledger                         │
│                                                                     │
└────────────────┬──────────────────────────────────┬────────────────┘
                 │                                   │
                 ▼                                   ▼
┌────────────────────────────┐   ┌────────────────────────────────────┐
│     Manager Agent (MA)     │   │      Worker Agent (WA)             │
│                            │   │                                    │
│  • User conversation       │   │  • Task execution                  │
│  • Intent understanding    │   │  • Heavy project context           │
│  • Delegation decisions    │   │  • Specialized tools               │
│  • Limited tools           │   │  • Can spawn sub-workers           │
│                            │   │                                    │
│  Tools:                    │   │  Can message back to MA:           │
│  - dispatch_to_agent       │   │  - Progress updates                │
│  - reply_to_caller         │   │  - Clarifying questions            │
│                            │   │  - Partial results                 │
└────────────────────────────┘   └────────────────────────────────────┘
                                             │
                                             │ nested spawn
                                             ▼
                              ┌────────────────────────────────────────┐
                              │      Sub-Worker Agent                  │
                              │      (WAs can spawn their own WAs)     │
                              │      Depth limit: 3 (configurable)     │
                              └────────────────────────────────────────┘
```

---

## Key Properties

### 1. All Agents Persistent

Every agent session is persisted to the Agents Ledger. There are no "ephemeral" agents. Any session can be resumed with its full context.

### 2. Nested Spawning Allowed

Workers can spawn their own sub-workers. Use cases:
- Complex tasks requiring specialization
- Parallel sub-task execution
- Vision/browser workers spawning analysis workers

Broker tracks spawn depth. Default maximum: 3 levels.

### 3. Bidirectional Communication

Workers can message the Manager at any time, not just at completion:
- Progress updates during long tasks
- Clarifying questions that need user input
- Early results before full completion

### 4. Persona Inheritance

Worker Agents inherit their Manager's persona (identity + permissions). They share the same behavioral constraints and access levels.

---

## Communication Patterns

### MA → WA: Task Delegation

```
MA decides to delegate: "This requires deep code analysis"
  │
  ▼
MA calls: dispatch_to_agent({ to: "code-worker", task: "..." })
  │
  ▼
Broker routes task to WA session
  │
  ▼
WA executes (may take minutes, can use tools)
  │
  ▼
WA response flows back to MA via broker
```

### WA → MA: Mid-Task Communication

```
WA encounters ambiguity during execution
  │
  ▼
WA calls: send_message_to_agent({ to: "manager", content: "Need clarification..." })
  │
  ▼
Broker routes to MA session
  │
  ▼
MA asks user for clarification
  │
  ▼
MA responds to WA with answer
  │
  ▼
WA continues execution
```

### User → MA: Status Query

```
User: "How's that code review going?"
  │
  ▼
MA receives via NEX pipeline
  │
  ▼
MA calls: send_message_to_agent({ to: "code-worker", content: "Status?" })
  │
  ▼
WA responds with current progress
  │
  ▼
MA summarizes for user
```

---

## Tool Interface

### Manager Tools

| Tool | Purpose |
|------|---------|
| `dispatch_to_agent` | Delegate task to a worker agent |
| `reply_to_caller` | Send response back to user |
| `get_agent_status` | Check if worker is busy/idle |

### Worker Tools

| Tool | Purpose |
|------|---------|
| `send_message_to_agent` | Message back to manager (or other workers) |
| Full tool access | File ops, shell, web, etc. (per permissions) |

---

## Open Questions

1. **MA tool restrictions:** How minimal should MA's toolset be? Just delegation + response? Or some read-only tools for quick answers?

2. **Spawn depth limit:** Is 3 levels sufficient? Should it be per-workspace configurable?

3. **Cross-persona workers:** Can a WA be spawned with a different persona than MA? (Permission escalation/restriction scenarios)

4. **Worker cleanup:** When should completed worker sessions be archived vs kept active?

---

## Related Documents

- `DATA_MODEL.md` — Core data model (Session, Turn, Thread)
- `OVERVIEW.md` — Broker folder overview
- `QUEUE_MANAGEMENT.md` — How messages are queued and delivered
- `INTERFACES.md` — Inter-agent communication contracts
- `../iam/` — Permissions and access control

---

*This document defines the Manager-Worker Pattern for Nexus agent orchestration.*
